export const SHELL_LANGS = new Set(['bash', 'sh', 'shell', 'zsh']);

export const extractShellBlocks = (text = '') => {
  const blocks = [];
  const regex = /```([a-zA-Z]*)\n?([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const lang = (match[1] || '').trim().toLowerCase();
    if (!SHELL_LANGS.has(lang)) continue;
    const body = String(match[2] || '').trim();
    if (body) blocks.push(body);
  }
  return blocks;
};

export const splitScriptToCommands = (script = '') =>
  String(script)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

export const compareSemver = (a, b) => {
  const pa = String(a).split('.').map((n) => Number(n));
  const pb = String(b).split('.').map((n) => Number(n));
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
};

export const classifyFailure = (command, output = '', exitCode = 1) => {
  const text = `${command}\n${output}`.toLowerCase();
  if (text.includes('command blocked by sandbox policy')) return 'policy_blocked';
  if (text.includes('command not found')) return 'missing_dependency';
  if (text.includes('404 not found')) return 'artifact_not_found';
  if (text.includes('permission denied')) return 'permission';
  if (text.includes('no such file or directory')) return 'path_or_artifact';
  if (exitCode === 0) return 'none';
  return 'generic';
};
