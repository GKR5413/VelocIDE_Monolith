import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import { GoogleGenAI } from '@google/genai';
import { WebSocketServer } from 'ws';
import pty from 'node-pty';
import {
  classifyFailure,
  compareSemver,
  extractShellBlocks,
  splitScriptToCommands,
} from './agent-utils.js';

const app = express();

const PORT = Number(process.env.PORT || 8080);
const WORKSPACE_ROOT = path.resolve(process.env.WORKSPACE_ROOT || path.join(process.cwd(), 'workspace'));
const CONTAINER_HOME = path.resolve(process.env.CONTAINER_HOME || '/root');
const MAX_OUTPUT_BYTES = Number(process.env.MAX_OUTPUT_BYTES || 200_000);
const EXEC_TIMEOUT_MS = Number(process.env.EXEC_TIMEOUT_MS || 30_000);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const MAX_AGENT_REPLANS = Number(process.env.MAX_AGENT_REPLANS || 3);

const geminiClient = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;
const terminalSessions = new Map();

app.use(express.json({ limit: '2mb' }));

const blockedCommandPatterns = [
  /\brm\s+-rf\s+\/\b/i,
  /\bmkfs(\.| )/i,
  /^\s*shutdown(\s|$)/i,
  /^\s*reboot(\s|$)/i,
  /^\s*poweroff(\s|$)/i,
  /\bdd\s+if=/i,
  /^\s*mount(\s|$)/i,
  /^\s*umount(\s|$)/i,
  /\bchmod\s+777\s+\/\b/i,
];

const ensureWorkspace = async () => {
  await fs.mkdir(WORKSPACE_ROOT, { recursive: true });
};

const VIRTUAL_WORKSPACE = '@workspace';
const VIRTUAL_HOME = '@home';

const parseVirtualPath = (inputPath = '.') => {
  const value = String(inputPath || '.').trim();
  if (!value || value === '.') return { kind: 'workspace', subPath: '.' };
  if (value === VIRTUAL_WORKSPACE) return { kind: 'workspace', subPath: '.' };
  if (value === VIRTUAL_HOME) return { kind: 'home', subPath: '.' };
  if (value.startsWith(`${VIRTUAL_WORKSPACE}/`)) {
    return { kind: 'workspace', subPath: value.slice(VIRTUAL_WORKSPACE.length + 1) || '.' };
  }
  if (value.startsWith(`${VIRTUAL_HOME}/`)) {
    return { kind: 'home', subPath: value.slice(VIRTUAL_HOME.length + 1) || '.' };
  }
  if (value === '~') return { kind: 'home', subPath: '.' };
  if (value.startsWith('~/')) return { kind: 'home', subPath: value.slice(2) || '.' };
  return { kind: 'workspace', subPath: value.replace(/^\/+/, '') || '.' };
};

const resolveSandboxPath = (inputPath = '.') => {
  const parsed = parseVirtualPath(inputPath);
  const base = parsed.kind === 'home' ? CONTAINER_HOME : WORKSPACE_ROOT;
  const prefix = parsed.kind === 'home' ? VIRTUAL_HOME : VIRTUAL_WORKSPACE;
  const resolved = path.resolve(base, parsed.subPath);
  const relative = path.relative(base, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Path escapes sandbox root');
  }
  const virtualPath = relative && relative !== '.' ? `${prefix}/${relative}` : prefix;
  return { resolved, relativePath: virtualPath, base, prefix };
};

const toFileSystemItem = async (parentResolvedPath, dirent, base, prefix) => {
  const fullPath = path.join(parentResolvedPath, dirent.name);
  const stats = await fs.stat(fullPath);
  const relative = path.relative(base, fullPath) || '.';
  const virtualPath = relative === '.' ? prefix : `${prefix}/${relative}`;
  return {
    name: dirent.name,
    type: dirent.isDirectory() ? 'folder' : 'file',
    path: virtualPath,
    fullPath,
    size: stats.size,
    modified: stats.mtime.toISOString(),
    hidden: dirent.name.startsWith('.'),
  };
};

const listDirectory = async (inputPath = '.') => {
  if (String(inputPath || '.').trim() === '.') {
    return {
      path: '.',
      fullPath: '.',
      relativePath: '.',
      files: [
        {
          name: 'workspace',
          type: 'folder',
          path: VIRTUAL_WORKSPACE,
          fullPath: WORKSPACE_ROOT,
          size: 0,
          modified: new Date().toISOString(),
          hidden: false,
        },
        {
          name: 'home',
          type: 'folder',
          path: VIRTUAL_HOME,
          fullPath: CONTAINER_HOME,
          size: 0,
          modified: new Date().toISOString(),
          hidden: false,
        },
      ],
    };
  }

  const { resolved, relativePath, base, prefix } = resolveSandboxPath(inputPath);
  const entries = await fs.readdir(resolved, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => toFileSystemItem(resolved, entry, base, prefix)));
  files.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return {
    path: relativePath,
    fullPath: resolved,
    relativePath,
    files,
  };
};

const readFileContent = async (inputPath) => {
  const { resolved, relativePath } = resolveSandboxPath(inputPath);
  const stats = await fs.stat(resolved);
  if (!stats.isFile()) throw new Error('Path is not a file');
  const content = await fs.readFile(resolved, 'utf8');
  return {
    path: relativePath,
    fullPath: resolved,
    relativePath,
    content,
    size: stats.size,
    modified: stats.mtime.toISOString(),
  };
};

const writeFileContent = async (inputPath, content = '') => {
  const { resolved, relativePath } = resolveSandboxPath(inputPath);
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, String(content), 'utf8');
  return { success: true, path: relativePath };
};

const createNode = async (inputPath, type = 'file') => {
  const { resolved, relativePath } = resolveSandboxPath(inputPath);
  if (type === 'folder') {
    await fs.mkdir(resolved, { recursive: true });
    return { success: true, type: 'folder', path: relativePath };
  }
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, '', { flag: 'a' });
  return { success: true, type: 'file', path: relativePath };
};

const renameNode = async (fromPath, toPath) => {
  const { resolved: fromResolved, relativePath: fromRelative } = resolveSandboxPath(fromPath);
  const { resolved: toResolved, relativePath: toRelative } = resolveSandboxPath(toPath);
  await fs.mkdir(path.dirname(toResolved), { recursive: true });
  await fs.rename(fromResolved, toResolved);
  return { success: true, from: fromRelative, to: toRelative };
};

const deleteNode = async (inputPath) => {
  const { resolved, relativePath } = resolveSandboxPath(inputPath);
  await fs.rm(resolved, { recursive: true, force: true });
  return { success: true, path: relativePath };
};

const validateCommand = (command) => {
  const value = String(command || '').trim();
  if (!value) throw new Error('Command is required');
  const blocked = blockedCommandPatterns.find((pattern) => pattern.test(value));
  if (blocked) throw new Error('Command blocked by sandbox policy');
  return value;
};

const extractLatestCwd = (rawOutput = '') => {
  const matches = [...rawOutput.matchAll(/__VEL_CWD__(.+)/g)];
  if (!matches.length) return null;
  return matches[matches.length - 1][1]?.trim() || null;
};

const stripCwdMarkers = (raw = '') => raw.replace(/^__VEL_CWD__.*$/gm, '').trimEnd();

const executeSingleCommand = async ({ command, cwd = '.', sessionId }) => {
  const safeCommand = validateCommand(command);
  const sessionCwd = sessionId ? terminalSessions.get(sessionId) : undefined;
  const preferredCwd = sessionCwd || cwd;
  const { resolved: safeCwd } = resolveSandboxPath(preferredCwd);

  const wrapped = `
__VEL_EXIT_CODE=0
{
${safeCommand}
} || __VEL_EXIT_CODE=$?
printf "\\n__VEL_CWD__%s\\n" "$(pwd)"
exit $__VEL_EXIT_CODE
`.trim();

  const startedAt = Date.now();

  return await new Promise((resolve, reject) => {
    const child = spawn('bash', ['-lc', wrapped], {
      cwd: safeCwd,
      env: {
        PATH: process.env.PATH || '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
        HOME: CONTAINER_HOME,
        SHELL: '/bin/bash',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let outputBytes = 0;
    let killedForLimit = false;

    const append = (target, chunk) => {
      const text = chunk.toString();
      outputBytes += Buffer.byteLength(text);
      if (outputBytes > MAX_OUTPUT_BYTES) {
        killedForLimit = true;
        child.kill('SIGKILL');
        return target;
      }
      return target + text;
    };

    child.stdout.on('data', (chunk) => {
      stdout = append(stdout, chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr = append(stderr, chunk);
    });

    const timeout = setTimeout(() => child.kill('SIGKILL'), EXEC_TIMEOUT_MS);
    child.on('error', (error) => reject(error));

    child.on('close', (exitCode) => {
      clearTimeout(timeout);

      const merged = `${stdout}${stderr}`;
      const nextCwdAbs = extractLatestCwd(merged);
      const cleanStdout = stripCwdMarkers(stdout);
      const cleanStderr = stripCwdMarkers(stderr);
      const output = stripCwdMarkers(merged);

      if (nextCwdAbs && sessionId) {
        try {
          const resolvedNext = path.resolve(nextCwdAbs);
          const workspaceRelative = path.relative(WORKSPACE_ROOT, resolvedNext);
          if (!workspaceRelative.startsWith('..') && !path.isAbsolute(workspaceRelative)) {
            terminalSessions.set(sessionId, workspaceRelative ? `${VIRTUAL_WORKSPACE}/${workspaceRelative}` : VIRTUAL_WORKSPACE);
          } else {
            const homeRelative = path.relative(CONTAINER_HOME, resolvedNext);
            if (!homeRelative.startsWith('..') && !path.isAbsolute(homeRelative)) {
              terminalSessions.set(sessionId, homeRelative ? `${VIRTUAL_HOME}/${homeRelative}` : VIRTUAL_HOME);
            }
          }
        } catch {
          // Ignore invalid cwd marker.
        }
      }

      const finalExit = killedForLimit ? 1 : (exitCode ?? 0);
      const currentCwd = sessionId ? terminalSessions.get(sessionId) || '.' : '.';

      const result = {
        command: safeCommand,
        stdout: cleanStdout,
        stderr: cleanStderr,
        output: killedForLimit ? `${output}\n[output truncated: exceeded ${MAX_OUTPUT_BYTES} bytes]` : output,
        exitCode: finalExit,
        cwd: currentCwd,
        durationMs: Date.now() - startedAt,
      };

      console.log('[sandbox.exec]', JSON.stringify({
        command: result.command,
        exitCode: result.exitCode,
        cwd: result.cwd,
        durationMs: result.durationMs,
      }));

      resolve(result);
    });
  });
};

const urlExists = async (url) => {
  try {
    const response = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    if (response.ok) return true;
    if (response.status === 405) {
      const getResponse = await fetch(url, { method: 'GET', redirect: 'follow' });
      return getResponse.ok;
    }
    return false;
  } catch {
    return false;
  }
};

const resolveLatestTomcatVersion = async (major) => {
  try {
    const listingUrl = `https://downloads.apache.org/tomcat/tomcat-${major}/`;
    const response = await fetch(listingUrl);
    if (!response.ok) return null;
    const html = await response.text();
    const matches = [...html.matchAll(/v(\d+\.\d+\.\d+)\//g)].map((m) => m[1]);
    const filtered = matches.filter((v) => v.startsWith(`${major}.`));
    if (!filtered.length) return null;
    filtered.sort(compareSemver);
    return filtered[filtered.length - 1];
  } catch {
    return null;
  }
};

const maybeFixTomcatDownloadCommand = async (command) => {
  const urlMatch = command.match(/https?:\/\/[^\s'"`]+/);
  if (!urlMatch) return command;

  const originalUrl = urlMatch[0];
  const tomcatMatch = originalUrl.match(/\/tomcat\/(tomcat-(\d+))\/v(\d+\.\d+\.\d+)\/bin\/(apache-tomcat-(\d+\.\d+\.\d+)\.tar\.gz)/);
  if (!tomcatMatch) return command;

  if (await urlExists(originalUrl)) return command;

  const major = tomcatMatch[2];
  const latest = await resolveLatestTomcatVersion(major);
  if (latest) {
    const latestFile = `apache-tomcat-${latest}.tar.gz`;
    const primary = `https://downloads.apache.org/tomcat/tomcat-${major}/v${latest}/bin/${latestFile}`;
    if (await urlExists(primary)) {
      return command.replace(originalUrl, primary);
    }
    const archive = `https://archive.apache.org/dist/tomcat/tomcat-${major}/v${latest}/bin/${latestFile}`;
    if (await urlExists(archive)) {
      return command.replace(originalUrl, archive);
    }
  }

  const requestedVersion = tomcatMatch[3];
  const requestedFile = tomcatMatch[4];
  const archiveFallback = `https://archive.apache.org/dist/tomcat/tomcat-${major}/v${requestedVersion}/bin/${requestedFile}`;
  if (await urlExists(archiveFallback)) {
    return command.replace(originalUrl, archiveFallback);
  }

  return command;
};

const executeCommandBatch = async ({ command, cwd = '.', sessionId }) => {
  const rawCommands = splitScriptToCommands(command);
  const commands = rawCommands.length ? rawCommands : [String(command || '').trim()].filter(Boolean);

  const steps = [];
  for (const rawCommand of commands) {
    const prepared = await maybeFixTomcatDownloadCommand(rawCommand);
    const result = await executeSingleCommand({ command: prepared, cwd, sessionId });
    steps.push(result);
    if (result.exitCode !== 0) break;
  }

  const final = steps[steps.length - 1] || {
    command: '', stdout: '', stderr: '', output: '', exitCode: 0, cwd: '.', durationMs: 0,
  };

  return {
    output: steps.map((s) => s.output || '').join('\n').trim(),
    exitCode: final.exitCode,
    cwd: final.cwd,
    steps,
  };
};

const mapMessagesToGeminiContents = (messages = []) =>
  messages.map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: String(message.content || '') }],
  }));

const MODEL_ALIASES = {
  'gemini-pro': 'gemini-2.5-pro',
  'gemini-flash': 'gemini-2.5-flash',
  'gemini-1.5-pro': 'gemini-2.5-pro',
  'gemini-2.0-flash': 'gemini-2.5-flash',
};

const resolveModel = (model) => MODEL_ALIASES[String(model || 'gemini-2.5-flash')] || String(model || 'gemini-2.5-flash');

const extractGeminiText = (response) => {
  if (!response) return '';
  if (typeof response.text === 'string' && response.text.trim()) return response.text.trim();
  if (typeof response.text === 'function') {
    const maybeText = response.text();
    if (typeof maybeText === 'string' && maybeText.trim()) return maybeText.trim();
  }
  return (
    response?.candidates?.[0]?.content?.parts
      ?.map((part) => part?.text)
      .filter(Boolean)
      .join('\n')
      .trim() || ''
  );
};

const callGemini = async ({ model, messages }) => {
  if (!geminiClient) throw new Error('GEMINI_API_KEY is not set');

  const systemInstruction = `
You are the VelocIDE assistant running in a container sandbox.

Rules:
1) Never fabricate execution results.
2) For sandbox/system requests, be concise and command-first.
3) Always use this order for install/setup: CHECK, INSTALL, VERIFY.
4) Runtime is Alpine container: use apk, workspace-safe paths. sudo is allowed when elevated package/system commands need it.
5) Output executable commands only inside fenced shell blocks.
6) Do not output placeholders or fake terminal logs.
7) If previous command failed, correct the plan using the exact failure.
`.trim();

  const response = await geminiClient.models.generateContent({
    model: resolveModel(model),
    contents: mapMessagesToGeminiContents(messages),
    config: { systemInstruction },
  });

  return extractGeminiText(response);
};

const formatExecutionFeedback = (steps) =>
  steps
    .map((step, idx) => {
      const type = classifyFailure(step.command, step.output, step.exitCode);
      return [
        `Step ${idx + 1}`,
        `Command: ${step.command}`,
        `Exit: ${step.exitCode}`,
        `Type: ${type}`,
        `Output:\n${step.output || '(no output)'}`,
      ].join('\n');
    })
    .join('\n\n');

const toCommandOnlyResponse = (text = '') => {
  const blocks = extractShellBlocks(text);
  if (!blocks.length) return text;
  return blocks.map((block) => `\`\`\`bash\n${block}\n\`\`\``).join('\n\n');
};

const runAgentLoop = async ({ model, messages, sessionId }) => {
  const history = [...messages];
  let latestText = '';
  let latestSteps = [];

  for (let attempt = 1; attempt <= MAX_AGENT_REPLANS + 1; attempt += 1) {
    latestText = await callGemini({ model, messages: history });
    const blocks = extractShellBlocks(latestText);

    if (!blocks.length) {
      return { content: latestText, terminalOutputs: [], attempts: attempt, status: 'no_commands' };
    }

    const attemptSteps = [];
    let failed = false;

    for (const block of blocks) {
      const batch = await executeCommandBatch({ command: block, sessionId, cwd: '.' });
      attemptSteps.push(...batch.steps);
      if (batch.exitCode !== 0) {
        failed = true;
        break;
      }
    }

    latestSteps = attemptSteps;

    const latestUserMessage = [...history].reverse().find((m) => m.role === 'user')?.content?.toLowerCase() || '';
    const asksVersion = /version/.test(latestUserMessage);
    const hasVersionOutput = latestSteps.some((s) => /version|\\d+\\.\\d+/.test((s.output || '').toLowerCase()));
    const unmetVersionGoal = asksVersion && !hasVersionOutput;

    if (!failed && !unmetVersionGoal) {
      return {
        content: toCommandOnlyResponse(latestText),
        terminalOutputs: latestSteps.map((step) => ({
          command: step.command,
          output: step.output,
          exitCode: step.exitCode,
          isRunning: false,
        })),
        attempts: attempt,
        status: 'success',
      };
    }

    const failedSteps = latestSteps.filter((s) => s.exitCode !== 0);
    if (unmetVersionGoal && !failedSteps.length) {
      failedSteps.push({
        command: '(goal-check)',
        output: 'Commands succeeded but did not return a version value.',
        exitCode: 1,
      });
    }
    console.log('[agent.replan]', JSON.stringify({ attempt, failed: failedSteps.length }));

    history.push({
      role: 'assistant',
      content: latestText,
    });
    history.push({
      role: 'user',
      content: `Execution failed. Re-plan with corrected shell commands only.\n\n${formatExecutionFeedback(failedSteps)}`,
    });
  }

  return {
    content: `${latestText}\n\nUnable to complete after retries. See command outputs above.`,
    terminalOutputs: latestSteps.map((step) => ({
      command: step.command,
      output: step.output,
      exitCode: step.exitCode,
      isRunning: false,
    })),
    attempts: MAX_AGENT_REPLANS + 1,
    status: 'failed',
  };
};

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'velocide-monolith', workspaceRoot: WORKSPACE_ROOT, containerHome: CONTAINER_HOME });
});

app.post('/api/files', async (req, res) => {
  try {
    const { action } = req.body || {};
    switch (action) {
      case 'list':
        res.json(await listDirectory(req.body.path || '.'));
        return;
      case 'read':
        res.json(await readFileContent(req.body.path));
        return;
      case 'write':
        res.json(await writeFileContent(req.body.path, req.body.content ?? ''));
        return;
      case 'create':
        res.json(await createNode(req.body.path, req.body.type || 'file'));
        return;
      case 'rename':
        res.json(await renameNode(req.body.path, req.body.newPath));
        return;
      case 'delete':
        res.json(await deleteNode(req.body.path));
        return;
      case 'execute':
        res.json(await executeCommandBatch({
          command: req.body.command,
          cwd: req.body.cwd || '.',
          sessionId: req.body.sessionId,
        }));
        return;
      default:
        res.status(400).json({ error: `Unsupported action: ${String(action)}` });
    }
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Request failed' });
  }
});

app.post('/api/agent', async (req, res) => {
  try {
    const { model, messages, sessionId } = req.body || {};
    if (!geminiClient) {
      res.json({
        content: 'Gemini is not configured yet. Set GEMINI_API_KEY and restart container.',
        terminalOutputs: [],
        attempts: 0,
        status: 'not_configured',
      });
      return;
    }

    const result = await runAgentLoop({
      model,
      messages: Array.isArray(messages) ? messages : [],
      sessionId: sessionId || `agent-${Date.now()}`,
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Agent request failed' });
  }
});

const httpServer = http.createServer(app);
const terminalWss = new WebSocketServer({ server: httpServer, path: '/terminal' });

terminalWss.on('connection', (ws) => {
  let shell = null;
  let wsSessionId = `ws-${Date.now()}`;

  const send = (payload) => {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(payload));
    }
  };

  const closeShell = () => {
    if (shell) {
      try {
        shell.kill();
      } catch {
        // Ignore cleanup errors.
      }
      shell = null;
    }
  };

  ws.on('message', (rawMessage) => {
    try {
      const message = JSON.parse(String(rawMessage || '{}'));
      const type = message?.type;

      if (type === 'create') {
        closeShell();
        wsSessionId = String(message?.sessionId || wsSessionId);
        const desiredCwd = String(message?.cwd || terminalSessions.get(wsSessionId) || VIRTUAL_WORKSPACE);
        const { resolved: startCwd, relativePath } = resolveSandboxPath(desiredCwd);
        terminalSessions.set(wsSessionId, relativePath);

        shell = pty.spawn('/bin/bash', ['-l'], {
          name: 'xterm-256color',
          cols: Number(message?.cols || 120),
          rows: Number(message?.rows || 28),
          cwd: startCwd,
          env: {
            ...process.env,
            PATH: process.env.PATH || '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
            HOME: CONTAINER_HOME,
            TERM: 'xterm-256color',
          },
        });

        shell.onData((data) => {
          send({ type: 'output', data });
        });

        shell.onExit(({ exitCode }) => {
          send({ type: 'exit', exitCode });
          shell = null;
        });

        send({ type: 'ready', cwd: relativePath, sessionId: wsSessionId });
        return;
      }

      if (!shell) {
        send({ type: 'error', message: 'Terminal session is not initialized' });
        return;
      }

      if (type === 'input') {
        shell.write(String(message?.data || ''));
        return;
      }

      if (type === 'resize') {
        const cols = Math.max(20, Number(message?.cols || 120));
        const rows = Math.max(5, Number(message?.rows || 28));
        shell.resize(cols, rows);
        return;
      }

      if (type === 'kill') {
        closeShell();
      }
    } catch (error) {
      send({ type: 'error', message: error instanceof Error ? error.message : 'Terminal error' });
    }
  });

  ws.on('close', () => {
    closeShell();
  });
});

const staticRoot = path.resolve(process.cwd(), 'dist');
app.use(express.static(staticRoot));
app.get(/.*/, async (_req, res) => {
  const indexPath = path.join(staticRoot, 'index.html');
  try {
    await fs.access(indexPath);
    res.sendFile(indexPath);
  } catch {
    res.status(503).send('Frontend build not found. Run `npm run build` first.');
  }
});

await ensureWorkspace();
httpServer.listen(PORT, () => {
  console.log(`VelocIDE monolith listening on port ${PORT}`);
  console.log(`Workspace root: ${WORKSPACE_ROOT}`);
});
