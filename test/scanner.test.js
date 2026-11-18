// Fake credentials are split with string concatenation so this file never contains a
// scannable secret (keeps GitHub push protection and other scanners quiet).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { globToRegExp, redactSecrets, scanChanges } from '../src/scanner.js';

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

test('@diffsense-ignore mutes the line it is on, in any comment style', () => {
  const lines = [
    'el.inner' + 'HTML = html; // @diffsense-ignore',
    'el.inner' + 'HTML = html; /* @diffsense-ignore reviewed */',
    'el.inner' + 'HTML = html;',
  ];
  const f = scanChanges([fileWith('web/a.js', lines)]);
  assert.deepEqual(f.filter((x) => x.ruleId === 'raw-html-injection').map((x) => x.line), [3]);
  assert.equal(f.suppressed, 2);

  const py = scanChanges([fileWith('app.py', ['requests.get(url, verify=' + 'False)  # @diffsense-ignore', 'requests.get(url, verify=' + 'False)'])]);
  assert.deepEqual(py.filter((x) => x.severity === 'critical').map((x) => x.line), [2]);
});

test('@diffsense-ignore-next-line mutes only the following line', () => {
  const f = scanChanges([
    fileWith('src/tls.js', ['// @diffsense-ignore-next-line', 'const agent = { rejectUnauth' + 'orized: false };', 'const b = { rejectUnauth' + 'orized: false };']),
  ]);
  assert.deepEqual(f.filter((x) => x.severity === 'critical').map((x) => x.line), [3]);
});

test('a mention of the marker outside a comment does not mute the line', () => {
  const f = scanChanges([fileWith('src/a.js', ['el.inner' + 'HTML = "@diffsense-ignore";'])]);
  assert.ok(ids(f).includes('raw-html-injection'));
});

test('secrets cannot be muted by comment or by --ignore', () => {
  const key = '"sk-' + 'ant-api03-abcdefghijklmnopqrstuvwxyz0123456789ABCD"';
  const byComment = scanChanges([fileWith('src/k.ts', [`const k = ${key}; // @diffsense-ignore`])]);
  assert.ok(ids(byComment).includes('anthropic-api-key'));
  const byPath = scanChanges([fileWith('src/k.ts', [`const k = ${key};`]), fileWith('.env', ['A=1'])], { ignore: ['src/**', '.env'] });
  assert.ok(ids(byPath).includes('anthropic-api-key'));
  assert.ok(ids(byPath).includes('env-file-committed'));
});

test('--ignore globs mute non-secret findings in matching files', () => {
  const files = [
    fileWith('src/scanner.js', ['const r = { rejectUnauth' + 'orized: false };']),
    fileWith('vendor/lib/x.js', ['el.inner' + 'HTML = v;']),
    fileWith('web/app.js', ['el.inner' + 'HTML = v;']),
  ];
  const f = scanChanges(files, { ignore: ['src/scanner.js', 'vendor'] });
  assert.deepEqual([...new Set(f.filter((x) => x.severity !== 'info').map((x) => x.file))], ['web/app.js']);
  assert.ok(f.suppressed >= 2);
  const csv = scanChanges(files, { ignore: ['src/scanner.js,vendor/**,web/*.js'] });
  assert.equal(csv.filter((x) => x.severity !== 'info').length, 0);
});

test('globToRegExp follows gitignore-style matching', () => {
  const m = (glob, p) => globToRegExp(glob).test(p);
  assert.ok(m('*.snap', 'a/b/c.snap'));
  assert.ok(!m('*.snap', 'a/b/c.snapx'));
  assert.ok(m('test/fixtures/', 'test/fixtures/a/b.js'));
  assert.ok(m('fixtures', 'test/fixtures/b.js'));
  assert.ok(m('src/*.js', 'src/a.js'));
  assert.ok(!m('src/*.js', 'src/deep/a.js'));
  assert.ok(m('src/**/*.js', 'src/a.js'));
  assert.ok(m('src/**/*.js', 'src/deep/er/a.js'));
  assert.ok(m('./docs/**', 'docs/x.md'));
  assert.ok(!m('src/a.js', 'other/src/a.js'));
});
