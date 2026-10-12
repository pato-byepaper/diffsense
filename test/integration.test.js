// Fake credentials are split with string concatenation so this file never contains a
// scannable secret (keeps GitHub push protection and other scanners quiet).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { buildAgentDocument } from '../src/context.js';
import { runTask } from '../src/generate.js';
import { collectChanges } from '../src/git.js';
import { scanChanges } from '../src/scanner.js';

let dir;
const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' }).toString();
const config = (extra = {}) => ({ apiKey: '', model: 'test-model', language: 'English', maxContextChars: 600000, promptsDir: path.join(dir, '.prompts'), offline: false, ...extra });

before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wlu-test-'));
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 't@example.com');
  git('config', 'user.name', 'Test');
  fs.writeFileSync(path.join(dir, 'app.js'), 'export const a = 1;\n');
  git('add', '.');
  git('commit', '-qm', 'init');
  git('checkout', '-qb', 'feature');
  fs.writeFileSync(path.join(dir, 'app.js'), 'export const a = 2;\nconst cache = {};\n');
  git('commit', '-qam', 'fix: correct the value of a');
  fs.writeFileSync(path.join(dir, 'new.js'), 'const key = "sk_' + 'live_51Habcdefghijklmnop1234";\n');
});

after(() => fs.rmSync(dir, { recursive: true, force: true }));

test('collects committed, uncommitted and untracked changes against a base', async () => {
  const changes = await collectChanges(dir, { mode: 'base', base: 'main' });
  assert.deepEqual(changes.files.map((f) => f.path), ['app.js', 'new.js']);
  assert.equal(changes.commits.length, 1);
  assert.equal(changes.files.find((f) => f.path === 'new.js').untracked, true);
});

test('agent document is redacted', async () => {
  const changes = await collectChanges(dir, { mode: 'base', base: 'main' });
  const doc = buildAgentDocument(changes, scanChanges(changes.files));
  assert.ok(doc.includes('[REDACTED:stripe-live-secret-key]'));
  assert.ok(!doc.includes('51Habcdefghijklmnop1234'));
});

test('every task works without an API key', async () => {
  const changes = await collectChanges(dir, { mode: 'base', base: 'main' });
  const findings = scanChanges(changes.files);
  for (const kind of ['explain', 'warnings', 'internal', 'client', 'issues']) {
    const r = await runTask(kind, { changes, findings, config: config() });
    assert.equal(r.offline, true);
    assert.ok(r.markdown.length > 50, kind);
  }
  const release = await runTask('client', { changes, findings, config: config() });
  assert.ok(release.markdown.includes('### Fixes\n- Corrected the value of a.'));
  const issues = await runTask('issues', { changes, findings, config: config() });
  assert.ok(issues.markdown.includes('### C1.'));
});

test('sends a redacted prompt to Gemini and cleans the output', async () => {
  const changes = await collectChanges(dir, { mode: 'base', base: 'main' });
  const findings = scanChanges(changes.files);
  const realFetch = globalThis.fetch;
  let sent;
  globalThis.fetch = async (url, init) => {
    sent = { url, init, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '```markdown\n## Summary ✅\nok\n```' }] } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const r = await runTask('issues', { changes, findings, config: config({ apiKey: 'test-key' }) });
    assert.equal(r.markdown, '## Summary\nok\n');
    assert.ok(sent.url.includes('/models/test-model:generateContent'));
    assert.equal(sent.init.headers['x-goog-api-key'], 'test-key');
    const prompt = sent.body.contents[0].parts[0].text;
    assert.ok(prompt.includes('[REDACTED:stripe-live-secret-key]'));
    assert.ok(!prompt.includes('51Habcdefghijklmnop1234'));
    assert.ok(sent.body.systemInstruction.parts[0].text.includes('Never use emojis'));
  } finally {
    globalThis.fetch = realFetch;
  }
});
