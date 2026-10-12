# work_load_understand

Understand any git change set in seconds, from your terminal or a local web UI.

Point it at the repository you are working on and it gives you:

- **A complete diff for AI agents**: every changed file (committed, staged, unstaged and untracked) as annotated, line-numbered Markdown with secrets redacted, ready to paste into Claude, ChatGPT, Gemini, Cursor or any agent.
- **Explanations** of the whole change or of a single file.
- **Warnings**: an offline regex scanner for API keys (Claude, OpenAI, Gemini, Stripe, AWS, GitHub, Slack, npm), committed `.env` files, private keys, connection strings, SHA/MD5 hashes, `any` types, swallowed errors, unbounded module-level caches, SQL injection, focused tests and more.
- **Internal Dev Description**: a full pull request body with Mermaid diagrams, files table, code analysis, testing and deployment notes.
- **Client Release** notes: short, plain-language "Added / Improved / Fixed" bullets.
- **Issues and Suggestions**: a deep production review ranked **Critical**, **Important**, **Minor** and **Sub-issues for future PRs**.

**No API key required.** Everything works offline with deterministic, local output. Add a Gemini API key and the explanations, warnings, descriptions and reviews are written by Gemini instead, using prompts you can edit.

Zero dependencies. Only Node.js 18.17+ and git.

---

## Quick start

```sh
git clone https://github.com/<your-org>/work_load_understand ~/work_load_understand
cd ~/work_load_understand
cp .env.example .env          # optional: add GEMINI_API_KEY for AI output

# Run it against any repository
~/work_load_understand/wlu ./repo_im_working_on
```

The web UI opens at `http://127.0.0.1:4747`.

### Install as a global command (optional)

```sh
cd ~/work_load_understand
npm link
```

You can now use any of these names from anywhere:

```sh
work_load_understand ./my-repo
work-load-understand ./my-repo
wlu ./my-repo
```

---

## What it compares

| Mode | Flag | Includes |
|------|------|----------|
| Uncommitted (default) | none | staged + unstaged + untracked files, compared to `HEAD` |
| Staged only | `--staged` | what `git commit` would commit right now |
| Branch vs base | `--base main` | everything since the merge-base with `main`: commits on your branch plus uncommitted and untracked work |

Use `--base` to get commit messages, which improves PR descriptions and release notes.

---

## CLI

```text
wlu [repo]                      Open the web UI (default: current directory)
wlu <command> [repo] [options]

Commands
  serve      Start the local web UI (default)
  diff       Print the agent-ready Markdown diff (redacted)
  scan       Run the local secret / bad-practice scanner
  explain    Explain the change set (use --file to explain one file)
  warnings   Scanner findings plus warning analysis
  pr         Internal dev description (pull request body)
  release    Client release notes
  issues     Issues and suggestions
  prompts    Show where prompts live and which ones are customized

Options
  --base <ref>       Compare against the merge-base with <ref>
  --staged           Only staged changes
  --file <path>      With explain: explain a single file
  --out <file>       Write the result to a file instead of stdout
  --json             JSON output (diff, scan)
  --offline          Never call Gemini, even if a key is set
  --model <id>       Gemini model
  --port <n>         Web UI port
  --no-open          Do not open the browser
  --fail-on <level>  scan: exit 1 at or above critical|important|minor (default critical), or none
```

### Examples

```sh
# Give an AI agent the full context of your branch
wlu diff ../my-app --base main --out changes.md

# Paste-ready PR description
wlu pr ../my-app --base main | pbcopy

# Release notes for clients
wlu release ../my-app --base v1.4.0

# Deep review before merging
wlu issues ../my-app --base main --out review.md

# Block commits that contain secrets (pre-commit hook)
wlu scan . --staged --fail-on critical
```

Status messages go to stderr and results go to stdout, so piping and redirecting work as expected.

### Pre-commit hook

```sh
# .git/hooks/pre-commit
#!/bin/sh
exec ~/work_load_understand/wlu scan . --staged --fail-on critical
```

### CI (GitHub Actions)

```yaml
- uses: actions/checkout@v4
  with: { fetch-depth: 0 }
- run: npx --yes github:<your-org>/work_load_understand scan . --base origin/${{ github.base_ref }} --fail-on critical
```

---

## Web UI

| Tab | What it does |
|-----|--------------|
| Changes | Every changed file with line numbers. Scanner hits are marked inline. "Explain entire change" and per-file "Explain file" buttons. |
| Warnings | Scanner findings grouped by severity (click a location to jump to the line), plus a "Run warning analysis" button. |
| Internal Dev Description | Generates the PR description. Preview with rendered Mermaid diagrams, or switch to raw Markdown, edit, copy or download. |
| Client Release | Generates short release notes. |
| Issues and Suggestions | Generates the deep review. |
| Prompts | Edit every prompt, insert placeholders, save, or reset to default. |

The header lets you switch between comparison modes, copy the agent diff to your clipboard, or download it as `.md`.

---

## Offline mode vs Gemini

| | Offline (no key) | With `GEMINI_API_KEY` |
|---|---|---|
| Agent diff, file view, scanner | Yes | Yes |
| Explain | Areas, stats, hunks, notable files | Full explanation with data flow |
| Warnings | Scanner findings and verdict | Scanner findings verified, plus auth, injection, dependency and CI analysis |
| Internal Dev Description | Title from commits, changes by area, Mermaid area diagram, files table, findings, env vars, checklist | Full PR description with architecture diagrams and code analysis |
| Client Release | Built from conventional commit messages | Written from the actual code changes |
| Issues and Suggestions | Scanner findings grouped by rule and ranked | Full production review including logic and concurrency errors |

Offline output is clearly labeled, so nobody mistakes it for an AI review.

### Configuration

Put these in `~/work_load_understand/.env` (or `~/.config/work-load-understand/.env`). Real environment variables take precedence.

| Variable | Default | Description |
|----------|---------|-------------|
| `GEMINI_API_KEY` | none | Enables AI output. Get one at https://aistudio.google.com/apikey. `GOOGLE_API_KEY` also works. |
| `GEMINI_MODEL` | `gemini-3.8-flash` | Any Gemini model that supports `generateContent`. |
| `WLU_OUTPUT_LANGUAGE` | `English` | Language of the generated text. |
| `WLU_MAX_CONTEXT_CHARS` | `600000` | Max diff characters sent per request. Larger diffs drop generated files first, then list omitted files. |
| `WLU_PORT` | `4747` | Web UI port. The next free port is used if it is taken. |
| `WLU_PROMPTS_DIR` | `~/.config/work-load-understand/prompts` | Where customized prompts are saved. |
| `WLU_OFFLINE` | unset | Set to `1` to never call Gemini. |
| `NO_COLOR` | unset | Disable colored terminal output. |

---

## Prompts

Default prompts live in [`prompts/`](prompts). Customized prompts are saved in your config directory and override the defaults; reset any prompt to go back.

| Prompt | Used for |
|--------|----------|
| `system.md` | Sent with every request: no emojis, every claim grounded and cited as `file:line`, valid Mermaid syntax, output language. |
| `explain.md` / `explain-file.md` | Explanations. |
| `warnings.md` | Security and release gate. |
| `internal-pr.md` | Internal Dev Description. |
| `client-release.md` | Client Release notes. |
| `issues.md` | Issues and Suggestions. |

Placeholders: `{{REPO_NAME}}`, `{{BRANCH}}`, `{{BASE}}`, `{{STATS}}`, `{{FILE_LIST}}`, `{{COMMITS}}`, `{{LOCAL_FINDINGS}}`, `{{DIFF}}`, `{{DIFF_LEGEND}}`, `{{FILE_PATH}}`, `{{LANGUAGE}}`.

Generated text never contains emojis: the system prompt forbids them, and any that slip through are stripped before you see the result.

---

## Privacy and security

- **Secrets are redacted before anything leaves your machine.** Every value matched by a secret rule is replaced with `[REDACTED:rule-id]` in the agent diff, in the web UI excerpts, and in everything sent to Gemini.
- Without an API key, nothing is sent anywhere.
- With a key, the redacted diff, file list, commit subjects and scanner findings are sent to the Google Gemini API. Review your organization's policy before using it on proprietary code.
- The web server only listens on `127.0.0.1`, rejects requests with a foreign `Host` header (DNS rebinding) and cross-origin writes (CSRF), and serves a strict Content Security Policy. The only external resource is Mermaid, loaded from jsDelivr to render diagrams; without it, diagram source is shown instead.
- The scanner is a safety net, not a guarantee. If it finds a real credential, **rotate it**: deleting it in a later commit does not remove it from git history.

---

## Scanner rules

Scanned on **added lines only**. Lockfiles, minified files and binaries are skipped.

| Severity | Rules |
|----------|-------|
| Critical | Anthropic `sk-ant-`, OpenAI `sk-` / `sk-proj-`, Google/Gemini `AIza`, Stripe `sk_live_` / `rk_live_` / `whsec_`, AWS `AKIA`, GitHub `ghp_` / `github_pat_`, Slack `xox*-`, npm tokens, private key blocks, connection strings with passwords, `*_API_KEY` / `*_SECRET` variables for Claude, OpenAI, Gemini and Stripe with literal values, committed `.env` and key files, merge conflict markers, disabled TLS verification |
| Important | Stripe test keys, JWTs, hardcoded credential-like assignments, `@ts-ignore`, `debugger`, `.only` tests, `eval`, raw HTML sinks, SQL string building, CORS wildcards, swallowed errors, module-level caches/maps/dicts, async `forEach`, Python mutable defaults, insecure random tokens, secrets in logs, world-writable permissions, unpinned dependencies, install scripts |
| Minor | TypeScript `any`, lint disables, `console.log`, skipped tests, sync blocking I/O, plain `http://` URLs, SHA-1/SHA-256/SHA-512/MD5-length hashes, Stripe publishable live keys, deleted test files |
| Info | TODO/FIXME, environment variable references, very large file changes |

Rules live in [`src/scanner.js`](src/scanner.js). Adding one is a few lines; see [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Project layout

```text
bin/wlu.js         CLI entry point
wlu                No-install launcher
src/cli.js         Argument parsing and commands
src/git.js         Collects the change set from git
src/diffParser.js  Unified diff parser
src/scanner.js     Secret and bad-practice rules, redaction
src/context.js     Agent-ready Markdown builder
src/offline.js     Deterministic reports used without an API key
src/gemini.js      Gemini REST client
src/generate.js    Prompt rendering and task runner
src/prompts.js     Default and customized prompt storage
src/server.js      Local web server and JSON API
web/               Web UI (no build step)
prompts/           Default prompt templates
test/              node:test suites
```

## Development

```sh
npm test               # run the test suite (no network)
node bin/wlu.js --help
```

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md). Report vulnerabilities as described in [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
