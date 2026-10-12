// Fake credentials are split with string concatenation so this file never contains a
// scannable secret (keeps GitHub push protection and other scanners quiet).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { redactSecrets, scanChanges } from '../src/scanner.js';

function fileWith(path, lines, extra = {}) {
  return {
    path,
    status: 'modified',
    generated: false,
    binary: false,
    additions: lines.length,
    deletions: 0,
    hunks: [{ lines: lines.map((content, i) => ({ type: 'add', content, newNo: i + 1 })) }],
    ...extra,
  };
}

const ids = (findings) => findings.map((f) => f.ruleId);

test('detects provider API keys by prefix', () => {
  const f = scanChanges([
    fileWith('src/keys.ts', [
      'const a = "sk-' + 'ant-api03-abcdefghijklmnopqrstuvwxyz0123456789ABCD";',
      'const b = "sk-' + 'proj-abc123def456ghi789jkl012mno345";',
      'const c = "AI' + 'zaSyA1234567890abcdefghijklmnopqrstuv";',
      'const d = "sk_' + 'live_51Habcdefghijklmnop1234";',
      'const e = "sk_' + 'test_51Habcdefghijklmnop1234";',
      'const w = "wh' + 'sec_abcdefghijklmnopqrstuvwxyz1234";',
    ]),
  ]);
  const got = ids(f);
  for (const id of ['anthropic-api-key', 'openai-api-key', 'google-gemini-api-key', 'stripe-live-secret-key', 'stripe-test-secret-key', 'stripe-webhook-secret']) {
    assert.ok(got.includes(id), `expected ${id} in ${got}`);
  }
  assert.equal(f.find((x) => x.ruleId === 'anthropic-api-key').severity, 'critical');
});

test('anthropic keys are not also reported as openai keys', () => {
  const f = scanChanges([fileWith('a.js', ['k = "sk-' + 'ant-api03-abcdefghijklmnopqrstuvwxyz0123456789ABCD"'])]);
  assert.ok(!ids(f).includes('openai-api-key'));
});

test('env assignments with literal values are flagged, placeholders are not', () => {
  const f = scanChanges([fileWith('config/app.env.example', ['GEMINI_API_KEY=your-key-here', 'STRIPE_SECRET_KEY=', 'OPENAI_API_KEY=${OPENAI_API_KEY}'])]);
  assert.equal(f.filter((x) => x.category === 'secret').length, 0);
  const g = scanChanges([fileWith('docker-compose.yml', ['      ANTHROPIC_API_KEY: abc123realvalue456'])]);
  assert.ok(ids(g).includes('ai-or-payment-env-value'));
});

test('committed .env file is critical, .env.example is not', () => {
  const env = scanChanges([fileWith('.env', [], { status: 'added' })]);
  assert.ok(ids(env).includes('env-file-committed'));
  const example = scanChanges([fileWith('.env.example', [], { status: 'added' })]);
  assert.ok(!ids(example).includes('env-file-committed'));
});

test('detects hashes, any, swallowed errors and module-level caches', () => {
  const f = scanChanges([
    fileWith('src/server.ts', [
      'const sessionCache = new Map();',
      'export function h(req: any) {',
      '  try { run() } catch (e) {}',
      '  return "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";',
      '}',
    ]),
  ]);
  const got = ids(f);
  for (const id of ['module-level-mutable-state', 'ts-any', 'empty-catch', 'hardcoded-hash']) assert.ok(got.includes(id), `expected ${id} in ${got}`);
});

test('only added lines are scanned and lockfiles are skipped', () => {
  const file = fileWith('src/a.js', []);
  file.hunks[0].lines.push({ type: 'del', content: 'const k = "sk_' + 'live_51Habcdefghijklmnop1234";', oldNo: 1 });
  assert.equal(scanChanges([file]).length, 0);
  const lock = fileWith('package-lock.json', ['"integrity": "sha512-e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"'], { generated: true });
  assert.equal(scanChanges([lock]).length, 0);
});

test('redaction removes secret values before text leaves the machine', () => {
  const out = redactSecrets('key = "sk-' + 'ant-api03-abcdefghijklmnopqrstuvwxyz0123456789ABCD" and postgres://app:' + 'hunter2secret@db:5432/x');
  assert.ok(!out.includes('abcdefghijklmnop'));
  assert.ok(!out.includes('hunter2secret'));
  assert.ok(out.includes('[REDACTED:anthropic-api-key]'));
  assert.ok(out.includes('[REDACTED:connection-string-credentials]'));
});

test('excerpts never contain the raw secret', () => {
  const [f] = scanChanges([fileWith('a.py', ['STRIPE = "sk_' + 'live_51Habcdefghijklmnop1234"'])]);
  assert.ok(!f.excerpt.includes('51Habcdefghijklmnop1234'));
  assert.ok(!f.match.includes('51Habcdefghijklmnop1234'));
});
