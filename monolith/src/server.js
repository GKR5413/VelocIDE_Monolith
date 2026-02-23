import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';
import pty from 'node-pty';
import { v4 as uuidv4 } from 'uuid';
import { GoogleGenerativeAI } from '@google/generative-ai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/terminal' });

// --- Configuration ---
const PORT = process.env.PORT || 3000;
const WORKSPACE_PATH = process.env.WORKSPACE_PATH || path.join(__dirname, '../workspace');
fs.ensureDirSync(WORKSPACE_PATH);

// --- AI Setup ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || ' ');

const WORKSPACE_SYSTEM_PROMPT = `You are an assistant inside VelocIDE.
ENVIRONMENT:
- Root is /workspace.
- You operate inside an isolated Linux container.
- Use tools to interact with files and run commands.`;

// --- Middleware ---
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

// --- File Operations API ---
app.post('/api/files', async (req, res) => {
  const { action, path: userPath, content } = req.body;
  const safePath = path.join(WORKSPACE_PATH, userPath || '');
  
  if (!safePath.startsWith(WORKSPACE_PATH)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    switch (action) {
      case 'list':
        const entries = await fs.readdir(safePath, { withFileTypes: true });
        return res.json({
          success: true,
          files: entries.map(e => ({
            name: e.name,
            type: e.isDirectory() ? 'directory' : 'file',
            path: path.relative(WORKSPACE_PATH, path.join(safePath, e.name))
          }))
        });
      case 'read':
        const data = await fs.readFile(safePath, 'utf-8');
        return res.json({ success: true, content: data });
      case 'write':
        await fs.ensureDir(path.dirname(safePath));
        await fs.writeFile(safePath, content);
        return res.json({ success: true });
      case 'delete':
        await fs.remove(safePath);
        return res.json({ success: true });
      case 'execute':
        const { command } = req.body;
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execPromise = promisify(exec);
        try {
          const { stdout, stderr } = await execPromise(command, { cwd: safePath });
          return res.json({ success: true, output: stdout, error: stderr, exitCode: 0 });
        } catch (e) {
          return res.json({ success: false, output: e.stdout, error: e.stderr || e.message, exitCode: e.code || 1 });
        }
      default:
        return res.status(400).json({ error: 'Unknown action' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- AI Agent API ---
app.post('/api/agent', async (req, res) => {
  const { provider, model, messages } = req.body;
  
  try {
    if (provider === 'gemini') {
      const geminiModel = genAI.getGenerativeModel({ model: model || 'gemini-1.5-pro' });
      const chat = geminiModel.startChat({
        history: messages.slice(0, -1).map(m => ({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: m.content }]
        }))
      });
      const result = await chat.sendMessage(messages[messages.length - 1].content);
      const response = await result.response;
      return res.json({ response: response.text() });
    }
    // Add Groq/Anthropic handlers here similar to agent-service
    res.status(400).json({ error: 'Provider not implemented in monolith yet' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Terminal PTY Management ---
const ptySessions = new Map();

wss.on('connection', (ws) => {
  const sessionId = uuidv4();
  const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';
  
  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-color',
    cols: 80,
    rows: 30,
    cwd: WORKSPACE_PATH,
    env: process.env
  });

  ptySessions.set(sessionId, ptyProcess);

  ptyProcess.onData(data => {
    if (ws.readyState === WebSocket.OPEN) ws.send(data);
  });

  ws.on('message', data => {
    ptyProcess.write(data.toString());
  });

  ws.on('close', () => {
    ptyProcess.kill();
    ptySessions.delete(sessionId);
  });
});

// --- Serve Frontend ---
const staticPath = path.join(__dirname, '../public');
if (fs.existsSync(staticPath)) {
  app.use(express.static(staticPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(staticPath, 'index.html'));
  });
}

server.listen(PORT, () => {
  console.log(`🚀 Monolith Server running at http://localhost:${PORT}`);
  console.log(`📂 Workspace: ${WORKSPACE_PATH}`);
});
