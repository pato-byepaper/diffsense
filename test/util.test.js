import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseDotenv } from '../src/config.js';
import { renderTemplate } from '../src/prompts.js';
import { cleanModelOutput, fenceFor, stripEmojis } from '../src/util.js';

test('strips emojis without joining words', () => {
  assert.equal(stripEmojis('Done ✅ now'), 'Done now');
  assert.equal(stripEmojis('- 🚀 Launch'), '- Launch');
  assert.equal(stripEmojis('👨‍💻 dev'), 'dev');
  assert.equal(stripEmojis('a -> b, x >= 1, `code`'), 'a -> b, x >= 1, `code`');
});

test('unwraps a markdown fence around the whole response', () => {
  assert.equal(cleanModelOutput('```markdown\n# Title\n\ntext\n```'), '# Title\n\ntext\n');
  assert.equal(cleanModelOutput('```js\nx\n```'), '```js\nx\n```\n');
});

test('fence is longer than any backtick run in content', () => {
  assert.equal(fenceFor('no ticks'), '```');
  assert.equal(fenceFor('has ``` inside'), '````');
});

test('templates are rendered in a single pass', () => {
  const out = renderTemplate('Repo {{REPO_NAME}}\n{{DIFF}}\n{{UNKNOWN}}', { REPO_NAME: 'x', DIFF: 'literal {{REPO_NAME}}' });
  assert.equal(out, 'Repo x\nliteral {{REPO_NAME}}\n{{UNKNOWN}}');
});

test('parses .env files', () => {
  const env = parseDotenv('# c\nA=1\nexport B="two words"\nC=\'x#y\'\nD=val # comment\nE="line\\nbreak"\n');
  assert.deepEqual(env, { A: '1', B: 'two words', C: 'x#y', D: 'val', E: 'line\nbreak' });
});
