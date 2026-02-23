import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractShellBlocks,
  splitScriptToCommands,
  classifyFailure,
  compareSemver,
} from './agent-utils.js';

test('extractShellBlocks only returns shell fenced blocks', () => {
  const text = [
    '```bash\necho one\n```',
    '```ts\nconst a=1\n```',
    '```sh\necho two\n```',
  ].join('\n');
  assert.deepEqual(extractShellBlocks(text), ['echo one', 'echo two']);
});

test('splitScriptToCommands removes comments and blanks', () => {
  const script = '\n# heading\nmkdir -p a\n\ncd a\n# tail\nls\n';
  assert.deepEqual(splitScriptToCommands(script), ['mkdir -p a', 'cd a', 'ls']);
});

test('classifyFailure detects known categories', () => {
  assert.equal(classifyFailure('java -version', 'java: command not found', 127), 'missing_dependency');
  assert.equal(classifyFailure('wget x', '404 Not Found', 1), 'artifact_not_found');
  assert.equal(classifyFailure('rm -rf /', 'Command blocked by sandbox policy', 1), 'policy_blocked');
});

test('compareSemver sorts semantic versions', () => {
  const versions = ['10.1.20', '10.1.9', '10.1.35'];
  versions.sort(compareSemver);
  assert.deepEqual(versions, ['10.1.9', '10.1.20', '10.1.35']);
});
