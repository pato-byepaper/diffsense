// Local, offline pattern scanner. Runs only on ADDED lines of the change set.
// Secret rules also drive redaction: anything they match is replaced before text leaves the machine.

export const SEVERITIES = ['critical', 'important', 'minor', 'info'];

const PLACEHOLDER_RE = /(x{5,}|\*{4,}|\.{3}|<[^>]+>|\$\{|\{\{|your[_-]?|example|placeholder|dummy|fake|changeme|replace[_-]?me|redacted|sample|insert[_-]?here|^test$|^secret$|^password$)/i;
const hasDigitAndLetter = (s) => /\d/.test(s) && /[A-Za-z]/.test(s);
const notPlaceholder = (s) => !PLACEHOLDER_RE.test(s);

const JS_TS = /\.(m?[jt]sx?|cjs|cts|mts|vue|svelte|astro)$/i;
const TS = /\.(tsx?|mts|cts)$/i;
const PY = /\.py$/i;
const CODE = /\.(m?[jt]sx?|cjs|cts|mts|vue|svelte|astro|py|rb|go|rs|java|kt|kts|scala|php|cs|swift|c|cc|cpp|h|hpp|m|mm|dart|ex|exs|sh|bash|zsh)$/i;
const TEST_FILE = /(^|\/)(__tests__|tests?|spec)\/|\.(test|spec)\.[a-z]+$|_test\.(go|py)$|(^|\/)test_[^/]+\.py$/i;
const DOC_FILE = /\.(md|mdx|rst|txt|adoc)$/i;

/**
 * Rule shape:
 *   id, title, severity, category, description, fix
 *   re        global regex tested against the added line
 *   files     optional regex the file path must match
 *   skipFiles optional regex the file path must NOT match
 *   group     capture group holding the sensitive value (for redaction/validation), default 0
 *   validate  optional (value, line, path) => boolean
 *   redact    true for secrets
 */
export const SECRET_RULES = [
  {
    id: 'anthropic-api-key',
    title: 'Anthropic (Claude) API key',
    re: /\bsk-ant-[A-Za-z0-9_-]{20,}/g,
  },
  {
    id: 'openai-api-key',
    title: 'OpenAI API key',
    re: /\bsk-(?!ant-)(?:proj-|svcacct-|admin-|None-)?[A-Za-z0-9_-]{20,}/g,
    validate: (v) => hasDigitAndLetter(v.slice(3)),
  },
  {
    id: 'google-gemini-api-key',
    title: 'Google / Gemini API key',
    re: /\bAIza[0-9A-Za-z_-]{35}(?![0-9A-Za-z_-])/g,
  },
  {
    id: 'stripe-live-secret-key',
    title: 'Stripe live secret or restricted key',
    re: /\b(?:sk|rk)_live_[0-9A-Za-z]{16,}/g,
  },
  {
    id: 'stripe-test-secret-key',
    title: 'Stripe test secret key',
    severity: 'important',
    re: /\b(?:sk|rk)_test_[0-9A-Za-z]{16,}/g,
    description: 'Test keys cannot move real money but still grant full access to your Stripe test account and data.',
  },
  {
    id: 'stripe-webhook-secret',
    title: 'Stripe webhook signing secret',
    re: /\bwhsec_[0-9A-Za-z+/=]{20,}/g,
  },
  {
    id: 'stripe-live-publishable-key',
    title: 'Stripe live publishable key',
    severity: 'minor',
    redact: false,
    re: /\bpk_live_[0-9A-Za-z]{16,}/g,
    description: 'Publishable keys are designed to be public, but should come from configuration so test and live environments are not mixed.',
    fix: 'Read it from environment configuration.',
  },
  {
    id: 'aws-access-key-id',
    title: 'AWS access key id',
    re: /\b(?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16}\b/g,
  },
  {
    id: 'github-token',
    title: 'GitHub token',
    re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b/g,
  },
  {
    id: 'slack-token',
    title: 'Slack token',
    re: /\bxox[abposr]-[A-Za-z0-9-]{10,}/g,
  },
  {
    id: 'npm-auth-token',
    title: 'npm auth token',
    re: /(?:_authToken\s*=\s*|\bnpm_)([A-Za-z0-9_-]{30,})/g,
    group: 1,
    validate: notPlaceholder,
  },
  {
    id: 'private-key-block',
    title: 'Private key material',
    re: /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/g,
  },
  {
    id: 'jwt',
    title: 'JSON Web Token',
    severity: 'important',
    re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
    description: 'A hardcoded JWT is either a live session/service credential or a test fixture that will expire and break tests.',
  },
  {
    id: 'connection-string-credentials',
    title: 'Connection string with embedded password',
    re: /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|rediss?|amqps?|mssql|sqlserver|clickhouse):\/\/[^\s:/@'"`]+:([^\s@/'"`]+)@[^\s'"`]+/g,
    group: 1,
    validate: (v) => notPlaceholder(v) && !/^\$/.test(v) && !/^(pass(word)?|pwd|secret|postgres|root|user)$/i.test(v),
  },
  {
    id: 'ai-or-payment-env-value',
    title: 'Claude / OpenAI / Gemini / Stripe env variable with a literal value',
    re: /^\s*(?:export\s+|ENV\s+|-\s+)?["']?((?:ANTHROPIC|CLAUDE|OPENAI|GEMINI|GOOGLE(?:_AI|_GENAI|_GENERATIVE_AI)?|STRIPE|VERTEX)[A-Z0-9_]*(?:KEY|SECRET|TOKEN))["']?\s*[:=]\s*["']?([^\s"'#]{6,})/g,
    group: 2,
    validate: (v) => notPlaceholder(v) && !/^\$/.test(v) && !/^(true|false|null|none|undefined)$/i.test(v) && !/^process\.env|^os\.environ/.test(v),
    description: 'A provider credential is being assigned a literal value in a tracked file.',
  },
  {
    id: 'generic-secret-assignment',
    title: 'Hardcoded credential-like value',
    severity: 'important',
    re: /\b([A-Za-z0-9_]*(?:api[_-]?key|secret|token|passw(?:or)?d|private[_-]?key|client[_-]?secret|access[_-]?key|auth[_-]?key|signing[_-]?key)[A-Za-z0-9_]*)["']?\s*(?::|=|:=|=>)\s*["'`]([^"'`\s]{8,})["'`]/gi,
    group: 2,
    validate: (v, line) => notPlaceholder(v) && hasDigitAndLetter(v) && !/^(https?:|\/|\.\/)/.test(v) && !/process\.env|import\.meta\.env|getenv|environ/.test(line),
    description: 'A variable whose name suggests a credential is assigned a string literal.',
  },
].map((r) => ({
  severity: 'critical',
  category: 'secret',
  redact: true,
  description: 'A credential appears in the change set. Anyone with repository access (and any fork, CI log or AI tool that saw it) can use it.',
  fix: 'Remove it from the code, rotate the credential immediately (deleting it in a later commit does not remove it from git history), and load it from an environment variable or secret manager.',
  ...r,
}));

export const QUALITY_RULES = [
  {
    id: 'merge-conflict-marker',
    docs: true,
    title: 'Unresolved merge conflict marker',
    severity: 'critical',
    category: 'correctness',
    re: /^(?:<{7}|>{7})(?: |$)/g,
    description: 'The file contains an unresolved merge conflict and will fail to parse or behave unpredictably.',
    fix: 'Resolve the conflict and remove the markers.',
  },
  {
    id: 'tls-verification-disabled',
    title: 'TLS certificate verification disabled',
    severity: 'critical',
    category: 'security',
    re: /rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*[=:]\s*['"]?0|\bverify\s*=\s*False\b|InsecureSkipVerify\s*:\s*true|CURLOPT_SSL_VERIFYPEER\s*,\s*(?:false|0)|--insecure\b|curl\s+-k\b/g,
    description: 'Disabling certificate verification allows man-in-the-middle attacks on every request made this way.',
    fix: 'Keep verification on. For private CAs, configure the CA bundle instead.',
  },
  {
    id: 'ts-any',
    title: 'TypeScript `any`',
    severity: 'minor',
    category: 'typing',
    files: TS,
    re: /(?::\s*any\b(?![\w$])|\bas\s+any\b|<any>|\bany\[\]|Array<any>|Record<string,\s*any>)/g,
    description: '`any` disables type checking for everything it touches and lets runtime type errors reach production.',
    fix: 'Use a precise type, a generic, or `unknown` with narrowing.',
  },
  {
    id: 'ts-ignore',
    title: 'Type checking suppressed',
    severity: 'important',
    category: 'typing',
    re: /@ts-(?:ignore|nocheck)\b|#\s*type:\s*ignore\b|\/\/\s*@flow\s+weak/g,
    description: 'Suppressing the type checker hides real errors and silently keeps hiding new ones on the same line.',
    fix: 'Fix the underlying type error, or use `@ts-expect-error` with a reason so it fails once the error is gone.',
  },
  {
    id: 'lint-disable',
    title: 'Lint rule disabled',
    severity: 'minor',
    category: 'lint',
    re: /eslint-disable(?:-next-line|-line)?|biome-ignore|#\s*noqa\b|#\s*pylint:\s*disable|\/\/\s*nolint\b|#\[allow\(/g,
    description: 'Disabling a lint rule is sometimes justified but often hides a real defect.',
    fix: 'Fix the lint error, or scope the disable to one rule with a written justification.',
  },
  {
    id: 'debugger-statement',
    title: 'Debugger / breakpoint left in code',
    severity: 'important',
    category: 'correctness',
    files: CODE,
    re: /^\s*debugger\s*;?\s*$|\bbreakpoint\(\)|\bpdb\.set_trace\(\)|\bbinding\.pry\b|\bbyebug\b|\bdbg!\(/g,
    description: 'Execution will pause (or crash in environments without a debugger) when this line runs.',
    fix: 'Remove it.',
  },
  {
    id: 'console-log',
    title: 'Console logging left in code',
    severity: 'minor',
    category: 'lint',
    files: JS_TS,
    skipFiles: /(^|\/)(scripts?|bin|cli)\//i,
    re: /\bconsole\.(?:log|debug|trace|dir|table)\(/g,
    description: 'Debug logging adds noise, can leak data to browser consoles or log aggregators, and costs money at scale.',
    fix: 'Remove it or use the project logger with an appropriate level.',
  },
  {
    id: 'focused-test',
    title: 'Focused test (.only / fit)',
    severity: 'important',
    category: 'testing',
    re: /\b(?:describe|it|test|context|suite)\.only\(|\bf(?:it|describe)\(|@pytest\.mark\.only/g,
    description: 'Focused tests make the runner skip every other test, so CI goes green while nothing else is tested.',
    fix: 'Remove `.only`.',
  },
  {
    id: 'skipped-test',
    title: 'Skipped test',
    severity: 'minor',
    category: 'testing',
    re: /\b(?:describe|it|test|context)\.skip\(|\bx(?:it|describe)\(|@pytest\.mark\.skip\b|@unittest\.skip\b|\bt\.Skip\(/g,
    description: 'Skipped tests silently reduce coverage and tend to stay skipped.',
    fix: 'Fix and re-enable the test or delete it with a tracked follow-up.',
  },
  {
    id: 'todo-comment',
    title: 'TODO / FIXME / HACK',
    severity: 'info',
    category: 'maintainability',
    skipFiles: DOC_FILE,
    re: /\b(?:TODO|FIXME|HACK|XXX)\b/g,
    description: 'Unfinished work is being merged.',
    fix: 'Finish it or link it to a tracked issue.',
  },
  {
    id: 'dynamic-code-execution',
    title: 'Dynamic code execution (eval / new Function / exec)',
    severity: 'important',
    category: 'security',
    files: CODE,
    re: /(?<![\w.$])eval\s*\(|\bnew\s+Function\s*\(|(?<![\w.])exec\s*\(\s*(?:f?["']|[a-z_]\w*\s*\))|\bpickle\.loads?\(|\byaml\.load\((?![^)]*Loader=yaml\.SafeLoader)/g,
    description: 'Executing or deserializing dynamic input enables remote code execution if any part of it is attacker-controlled.',
    fix: 'Use a parser or a safe loader instead of evaluating code.',
  },
  {
    id: 'raw-html-injection',
    title: 'Raw HTML injection sink',
    severity: 'important',
    category: 'security',
    re: /\.(?:innerHTML|outerHTML)\s*\+?=|dangerouslySetInnerHTML|insertAdjacentHTML\(|document\.write\(|\bv-html=|\{@html\s|\|\s*safe\b|mark_safe\(/g,
    description: 'Writing unsanitized strings as HTML is the main source of cross-site scripting.',
    fix: 'Render text with textContent / framework escaping, or sanitize with a vetted library such as DOMPurify.',
  },
  {
    id: 'sql-string-building',
    title: 'SQL built with string interpolation',
    severity: 'important',
    category: 'security',
    re: /`[^`]*\b(?:SELECT\s[^`]*\sFROM|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM)\b[^`]*\$\{|["'][^"']*\b(?:SELECT\s.*\sFROM|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM)\b[^"']*["']\s*(?:\+|%\s*[(\w])|\bf["'][^"']*\b(?:SELECT\s.*\sFROM|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM)\b[^"']*\{/gi,
    description: 'Interpolating values into SQL enables SQL injection unless every value is trusted and escaped.',
    fix: 'Use parameterized queries or the query builder/ORM bindings.',
  },
  {
    id: 'cors-wildcard',
    title: 'CORS allows any origin',
    severity: 'important',
    category: 'security',
    re: /Access-Control-Allow-Origin["']?\s*[:,]\s*["']\*["']|\borigin\s*:\s*(?:["']\*["']|true)\b|\bcors\(\s*\)|allow_origins\s*=\s*\[\s*["']\*["']/g,
    description: 'Any website can call this API from a user\'s browser; combined with credentials it exposes user data.',
    fix: 'Allow an explicit list of origins from configuration.',
  },
  {
    id: 'empty-catch',
    title: 'Error swallowed silently',
    severity: 'important',
    category: 'reliability',
    re: /catch\s*(?:\([^)]*\))?\s*\{\s*\}|\.catch\(\s*(?:\(\s*\w*\s*\)|\w+)\s*=>\s*(?:\{\s*\}|null|undefined|void 0)\s*\)|^\s*except\s*(?:Exception\s*)?(?:as\s+\w+\s*)?:\s*(?:pass\s*)?$|\brescue\s*=>\s*\w+\s*$|_\s*=\s*err\b/g,
    description: 'Failures disappear without a log or metric, so production incidents become invisible and hard to debug.',
    fix: 'Handle the specific error, or log it with context and rethrow.',
  },
  {
    id: 'module-level-mutable-state',
    title: 'Module-level mutable collection (unbounded cache / per-instance state)',
    severity: 'important',
    category: 'scalability',
    files: CODE,
    skipFiles: TEST_FILE,
    re: /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:new\s+(?:Map|Set|Array)\b|\{\s*\}|\[\s*\]|Object\.create\(null\))|^([A-Za-z_]\w*)\s*(?::[^=]+)?=\s*(?:\{\s*\}|\[\s*\]|dict\(\)|set\(\)|(?:collections\.)?(?:defaultdict|OrderedDict|deque)\()|^var\s+(\w+)\s*=\s*make\(map/g,
    validate: (_v, line) => /(cache|store|memo|session|registry|pending|queue|dict|seen|visited|users|clients|connections|sockets|subscribers|listeners|history|buffer|requests|jobs|tokens|map|lookup|index|state|data|items|results|counts|counter|rate|limit|attempts)/i.test(line.split(/[=:]/)[0]),
    description: 'A collection declared at module scope lives as long as the process. If entries are added per request/user/event and never evicted it grows until the process runs out of memory. It is also not shared between server instances, serverless invocations or workers, so caches, sessions, rate limits and dedup logic silently break when you scale beyond one instance or on restart.',
    fix: 'Bound it (LRU with max size and TTL), scope it to the request, or move shared state to Redis/the database.',
  },
  {
    id: 'module-level-timer',
    title: 'Module-level timer',
    severity: 'minor',
    category: 'scalability',
    files: JS_TS,
    re: /^(?:export\s+)?(?:(?:const|let|var)\s+\w+\s*=\s*)?setInterval\(/g,
    description: 'Runs once per process: duplicated across replicas, never runs in serverless, and keeps the process alive during shutdown.',
    fix: 'Use a scheduled job/queue, or start and clear the interval explicitly in the app lifecycle.',
  },
  {
    id: 'async-foreach',
    title: 'async callback inside forEach',
    severity: 'important',
    category: 'correctness',
    files: JS_TS,
    re: /\.forEach\(\s*async\b/g,
    description: 'forEach does not await async callbacks: errors become unhandled rejections and code after the loop runs before the work finishes.',
    fix: 'Use `for...of` with await, or `await Promise.all(items.map(async ...))`.',
  },
  {
    id: 'python-mutable-default',
    title: 'Mutable default argument',
    severity: 'important',
    category: 'correctness',
    files: PY,
    re: /\bdef\s+\w+\s*\([^)]*=\s*(?:\[\]|\{\}|set\(\)|dict\(\)|list\(\))/g,
    description: 'The default object is created once and shared across calls, so data leaks between calls.',
    fix: 'Default to None and create the collection inside the function.',
  },
  {
    id: 'sync-blocking-io',
    title: 'Synchronous blocking I/O',
    severity: 'minor',
    category: 'performance',
    files: JS_TS,
    skipFiles: /(^|\/)(scripts?|bin|cli|config)\/|\.config\.[cm]?[jt]s$|(^|\/)test/i,
    re: /\b(?:readFileSync|writeFileSync|appendFileSync|execSync|spawnSync|execFileSync|readdirSync|statSync|existsSync)\(/g,
    description: 'Blocks the event loop. Acceptable at startup or in CLIs; inside a request handler it stalls every concurrent request.',
    fix: 'Use the async fs/child_process APIs in request paths.',
  },
  {
    id: 'insecure-random',
    title: 'Math.random used for something security-sensitive',
    severity: 'important',
    category: 'security',
    re: /Math\.random\(\)|\brandom\.(?:random|randint|choice)\(/g,
    validate: (_v, line) => /(token|secret|password|passwd|salt|nonce|otp|session|key|code|invite|reset|uuid|\bid\b)/i.test(line),
    description: 'Non-cryptographic random values are predictable; tokens, ids and codes built from them can be guessed.',
    fix: 'Use crypto.randomUUID()/crypto.getRandomValues() or Python `secrets`.',
  },
  {
    id: 'secret-in-log',
    title: 'Possible secret written to logs',
    severity: 'important',
    category: 'security',
    re: /\b(?:console\.\w+|logger\.\w+|log\.\w+|logging\.\w+|print|println!?|fmt\.Print\w*)\s*\([^)]*(?<![A-Za-z])(?:password|passwd|secret|token|api[_-]?key|authorization|cookie|credit[_-]?card|ssn)(?![A-Za-z])/gi,
    description: 'Credentials and personal data in logs end up in log aggregators, backups and third-party tools.',
    fix: 'Log an identifier or a masked value instead.',
  },
  {
    id: 'insecure-http-url',
    title: 'Plain HTTP URL',
    severity: 'minor',
    category: 'security',
    skipFiles: DOC_FILE,
    re: /\bhttp:\/\/(?!localhost|127\.|0\.0\.0\.0|\[::1\]|[\w.-]*\.local\b|[\w.-]*\.test\b|host\.docker\.internal|www\.w3\.org|schemas\.|json-schema\.org|xmlns|java\.sun\.com|ns\.adobe\.com|purl\.org|example\.(?:com|org))/g,
    description: 'Traffic over plain HTTP can be read and modified in transit.',
    fix: 'Use https.',
  },
  {
    id: 'world-writable-permissions',
    title: 'World-writable permissions',
    severity: 'important',
    category: 'security',
    re: /chmod\s+(?:-R\s+)?(?:0?777|a\+w)\b|0o?777\b/g,
    description: 'Any user or process on the host can modify these files.',
    fix: 'Grant the minimum permissions needed.',
  },
  {
    id: 'unpinned-dependency',
    title: 'Unpinned dependency version',
    severity: 'important',
    category: 'dependencies',
    files: /(^|\/)package\.json$/,
    re: /^\s*"[@\w./-]+"\s*:\s*"(?:\*|latest|x|)"\s*,?\s*$/g,
    description: '"*" or "latest" installs whatever was published most recently, so builds are not reproducible and a compromised release is installed automatically.',
    fix: 'Pin a version range and commit the lockfile.',
  },
  {
    id: 'install-script',
    title: 'Package install script added',
    severity: 'important',
    category: 'dependencies',
    files: /(^|\/)package\.json$/,
    re: /^\s*"(?:preinstall|install|postinstall|prepare)"\s*:/g,
    description: 'Install scripts run automatically on every machine and CI runner that installs the package.',
    fix: 'Confirm the script is required and does not download or execute remote code.',
  },
  {
    id: 'hardcoded-hash',
    title: 'Hardcoded hash / hex digest',
    severity: 'minor',
    category: 'secret',
    skipFiles: /(^|\/)(\.gitmodules|go\.mod|.*\.lock|.*lock\.json|.*lock\.yaml|.*\.sum)$/i,
    re: /(?<![0-9a-fA-F])(?:[a-fA-F0-9]{128}|[a-fA-F0-9]{64}|[a-fA-F0-9]{40}|[a-fA-F0-9]{32})(?![0-9a-fA-F])/g,
    validate: (v) => /\d/.test(v) && /[a-fA-F]/.test(v),
    labelFor: (v) => ({ 32: 'MD5-length', 40: 'SHA-1-length', 64: 'SHA-256-length', 128: 'SHA-512-length' })[v.length] || 'hex',
    description: 'Could be a pinned commit/checksum (fine) or a hardcoded secret, signing key, password hash or salt (not fine).',
    fix: 'If it is a secret, move it to configuration and rotate it. If it is a checksum or commit pin, leave a comment saying so.',
  },
  {
    id: 'env-var-reference',
    title: 'Environment variable referenced',
    severity: 'info',
    category: 'configuration',
    re: /(?:process\.env\.|process\.env\[\s*["']|import\.meta\.env\.|Deno\.env\.get\(\s*["']|Bun\.env\.|os\.environ(?:\.get)?\s*(?:\(\s*|\[\s*)["']|os\.getenv\(\s*["']|os\.Getenv\(\s*"|env::var\(\s*"|System\.getenv\(\s*"|ENV\[\s*["']|ENV\.fetch\(\s*["'])([A-Z][A-Z0-9_]{2,})/g,
    group: 1,
    description: 'Every environment variable must exist in every environment, have a safe default or fail fast at startup, and be documented (for example in .env.example).',
    fix: 'Validate it at startup and document it.',
  },
].map((r) => ({ redact: false, ...r }));

const FILE_RULES = [
  {
    id: 'env-file-committed',
    title: 'Environment file added to the repository',
    severity: 'critical',
    category: 'secret',
    test: (f) => /(^|\/)\.env(\.[\w.-]+)?$/i.test(f.path) && !/\.(example|sample|template|dist|defaults?|schema)$/i.test(f.path),
    description: '.env files usually hold real credentials and should never be tracked.',
    fix: 'Remove it from git (git rm --cached), add it to .gitignore, commit a .env.example with empty values, and rotate every secret it contained.',
  },
  {
    id: 'credential-file-committed',
    title: 'Credential or key file added',
    severity: 'critical',
    category: 'secret',
    test: (f) => /\.(pem|key|p12|pfx|jks|keystore|ppk|asc|gpg|kdbx)$|(^|\/)id_(rsa|dsa|ecdsa|ed25519)$|(^|\/)\.(npmrc|pypirc|netrc|htpasswd)$|(^|\/)credentials(\.json)?$|service[-_]?account[^/]*\.json$|(^|\/)\.aws\/|(^|\/)\.ssh\//i.test(f.path),
    description: 'This file type typically contains private keys or credentials.',
    fix: 'Remove it from the repository, rotate the credential, and load it from a secret manager.',
  },
  {
    id: 'test-file-deleted',
    title: 'Test file deleted',
    severity: 'minor',
    category: 'testing',
    test: (f) => f.status === 'deleted' && TEST_FILE.test(f.path),
    description: 'Coverage is being removed. Confirm the behavior is still tested elsewhere.',
    fix: 'Move or replace the tests if the behavior still exists.',
  },
  {
    id: 'large-change',
    title: 'Very large file change',
    severity: 'info',
    category: 'maintainability',
    test: (f) => !f.generated && f.additions + f.deletions > 800,
    description: 'Large single-file changes are hard to review thoroughly.',
    fix: 'Consider splitting the change into smaller pull requests.',
  },
];

function isPlaceholderValue(v) {
  return !v || v.length < 4;
}

export function maskSecret(value) {
  if (value.length <= 8) return '*'.repeat(value.length);
  const keep = Math.min(8, Math.floor(value.length / 4));
  return `${value.slice(0, keep)}${'*'.repeat(6)}${value.slice(-2)}`;
}

function* ruleMatches(rule, text, filePath) {
  if (rule.files && !rule.files.test(filePath)) return;
  if (rule.skipFiles && rule.skipFiles.test(filePath)) return;
  // Code-quality rules describe code; prose in docs mentions the same words (e.g. "@ts-ignore").
  if (rule.category !== 'secret' && !rule.docs && DOC_FILE.test(filePath)) return;
  rule.re.lastIndex = 0;
  for (const m of text.matchAll(rule.re)) {
    const value = (rule.group ? m[rule.group] : m[0]) ?? m[0];
    if (isPlaceholderValue(value)) continue;
    if (rule.validate && !rule.validate(value, text, filePath)) continue;
    const start = rule.group && m[rule.group] !== undefined ? m.index + m[0].indexOf(m[rule.group]) : m.index;
    yield { value, start, end: start + value.length };
  }
}

/** Replaces every secret in `text` with [REDACTED:rule-id]. */
export function redactSecrets(text, filePath = '') {
  let out = text;
  for (const rule of SECRET_RULES) {
    if (!rule.redact) continue;
    const hits = [...ruleMatches(rule, out, filePath)];
    for (let i = hits.length - 1; i >= 0; i--) {
      out = `${out.slice(0, hits[i].start)}[REDACTED:${rule.id}]${out.slice(hits[i].end)}`;
    }
  }
  return out;
}

function excerptOf(content, filePath) {
  const red = redactSecrets(content, filePath).trim();
  return red.length > 180 ? `${red.slice(0, 177)}...` : red;
}

/**
 * Scans the added lines of each file.
 * Returns findings sorted by severity, then file, then line.
 */
export function scanChanges(files) {
  const findings = [];
  const perRuleFileCount = new Map();
  const MAX_PER_RULE_PER_FILE = 25;

  const push = (f) => {
    const key = `${f.ruleId}|${f.file}`;
    const n = (perRuleFileCount.get(key) || 0) + 1;
    perRuleFileCount.set(key, n);
    if (n <= MAX_PER_RULE_PER_FILE) findings.push(f);
  };

  for (const file of files) {
    for (const rule of FILE_RULES) {
      if (file.status !== 'deleted' || rule.id === 'test-file-deleted') {
        if (rule.test(file)) {
          push({ ruleId: rule.id, title: rule.title, severity: rule.severity, category: rule.category, file: file.path, line: null, excerpt: '', description: rule.description, fix: rule.fix });
        }
      }
    }
    if (file.generated || file.binary) continue;

    for (const hunk of file.hunks) {
      for (const ln of hunk.lines) {
        if (ln.type !== 'add') continue;
        const content = ln.content;
        if (content.length > 5000) continue; // minified or data blobs
        let lineHasSecret = false;

        for (const rule of SECRET_RULES) {
          if ((rule.id === 'generic-secret-assignment' || rule.id === 'ai-or-payment-env-value') && lineHasSecret) continue;
          for (const hit of ruleMatches(rule, content, file.path)) {
            lineHasSecret = lineHasSecret || rule.redact;
            push({
              ruleId: rule.id,
              title: rule.title,
              severity: rule.severity,
              category: rule.category,
              file: file.path,
              line: ln.newNo,
              match: rule.redact ? maskSecret(hit.value) : hit.value,
              excerpt: excerptOf(content, file.path),
              description: rule.description,
              fix: rule.fix,
            });
            break; // one finding per rule per line
          }
        }

        for (const rule of QUALITY_RULES) {
          if (rule.id === 'hardcoded-hash' && lineHasSecret) continue;
          for (const hit of ruleMatches(rule, content, file.path)) {
            const label = rule.labelFor ? ` (${rule.labelFor(hit.value)})` : rule.id === 'env-var-reference' ? `: ${hit.value}` : '';
            push({
              ruleId: rule.id,
              title: rule.title + label,
              severity: rule.severity,
              category: rule.category,
              file: file.path,
              line: ln.newNo,
              match: hit.value,
              excerpt: excerptOf(content, file.path),
              description: rule.description,
              fix: rule.fix,
            });
            break;
          }
        }
      }
    }
  }

  const rank = (s) => SEVERITIES.indexOf(s);
  findings.sort((a, b) => rank(a.severity) - rank(b.severity) || a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0));
  findings.forEach((f, i) => {
    f.id = `F${i + 1}`;
  });
  return findings;
}

export function countBySeverity(findings) {
  const counts = Object.fromEntries(SEVERITIES.map((s) => [s, 0]));
  for (const f of findings) counts[f.severity]++;
  return counts;
}
