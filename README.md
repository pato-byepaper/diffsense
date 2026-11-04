# diffwise

Free, local code review for your git diffs. Understand any change set in seconds, from your terminal or a local web UI.

**Runs 100% on your machine.** No account, no API key, no server. ByePaper never sees your code, your diffs or your repositories. There is no telemetry and nothing is uploaded anywhere unless you choose to add your own Gemini key.

Point it at the repository you are working on and it gives you:

- **A complete diff for AI agents**: every changed file (committed, staged, unstaged and untracked) as annotated, line-numbered Markdown with secrets redacted, ready to paste into Claude, ChatGPT, Gemini, Cursor or any agent.
- **Explanations** of the whole change or of a single file.
- **Warnings**: an offline regex scanner for API keys (Claude, OpenAI, Gemini, Stripe, AWS, GitHub, Slack, npm), committed `.env` files, private keys, connection strings, SHA/MD5 hashes, `any` types, swallowed errors, unbounded module-level caches, SQL injection, focused tests and more.
- **Internal Dev Description**: a full pull request body with Mermaid diagrams, files table, code analysis, testing and deployment notes.
- **Client Release** notes: short, plain-language "Added / Improved / Fixed" bullets.
- **Issues and Suggestions**: a deep production review ranked **Critical**, **Important**, **Minor** and **Sub-issues for future PRs**.

Everything works offline with deterministic, local output. Add a Gemini API key and the explanations, warnings, descriptions and reviews are written by Gemini instead, using prompts you can edit.

Zero dependencies. Only Node.js 18.17+ and git.

---

## Why "diffwise"?

**diff + wise.** The goal is simple: get wise about your diffs before anyone else reads them. Know what changed, why it matters and what could break, before you open the pull request.

The project started as **work_load_understand**: you _work_, it _loads_ your changes, you _understand_ them. That is where the `wlu` command comes from, and it stays exactly the same. The original names (`wlu`, `work_load_understand`, `work-load-understand`, the `WLU_*` environment variables and the `~/.config/work-load-understand/` folder) are kept so existing setups, scripts and hooks keep working.

---

## Quick start

Three commands and you are done:

```sh
git clone https://github.com/pato-byepaper/diffwise.git
cd diffwise
npm link
```

Now run it from anywhere, against any repository:

```sh
wlu ~/path/to/your-project
```

The web UI opens at `http://127.0.0.1:4747`.

Already inside the project you want to review? Just run:

```sh
wlu
```

That is it. No install step, no API key, no configuration.

### Optional: enable AI output

```sh
cd diffwise
cp .env.example .env    # then add your GEMINI_API_KEY
```

Gemini has a free tier, which you can get at https://aistudio.google.com/apikey.

### Without npm link

If you prefer not to install a global command, run the launcher directly from the folder where you cloned diffwise:

```sh
./wlu ~/path/to/your-project
npm start -- ~/path/to/your-project    # same thing through npm (note the --)
```

### Path tips

- Paths can be absolute, relative or start with `~`.
- `~` already means your home folder (`/Users/<you>` on macOS), so write `~/projects/my-api`, not `~/Users/<you>/projects/my-api`.
- If you skip the path, the current directory is used.

All of these names work after `npm link`:

```sh
wlu ./my-repo
work_load_understand ./my-repo
work-load-understand ./my-repo
```

---

## What it compares

| Mode                  | Flag          | Includes                                                                                                |
| --------------------- | ------------- | ------------------------------------------------------------------------------------------------------- |
| Uncommitted (default) | none          | staged + unstaged + untracked files, compared to `HEAD`                                                 |
| Staged only           | `--staged`    | what `git commit` would commit right now                                                                |
| Branch vs base        | `--base main` | everything since the merge-base with `main`: commits on your branch plus uncommitted and untracked work |

Use `--base` to get commit messages, which improves PR descriptions and release notes:

```sh
wlu . --base main
```

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
exec wlu scan . --staged --fail-on critical
```

If you did not run `npm link`, use the full path to the launcher instead, for example `~/diffwise/wlu`.

### CI (GitHub Actions)

```yaml
- uses: actions/checkout@v4
  with: { fetch-depth: 0 }
- run: npx --yes github:pato-byepaper/diffwise scan . --base origin/${{ github.base_ref }} --fail-on critical
```

---

## Web UI

| Tab                      | What it does                                                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Changes                  | Every changed file with line numbers. Scanner hits are marked inline. "Explain entire change" and per-file "Explain file" buttons. |
| Changes: binary files    | Images (PNG, JPG, GIF, WebP, AVIF, BMP, ICO), SVG and PDF show **Before** on the left and **After** on the right, with sizes and image dimensions. Word `.docx` files show a side-by-side text diff with changed words highlighted. SVG can toggle to its source diff. |
| Warnings                 | Scanner findings grouped by severity (click a location to jump to the line), plus a "Run warning analysis" button.                 |
| Internal Dev Description | Generates the PR description. Preview with rendered Mermaid diagrams, or switch to raw Markdown, edit, copy or download.           |
| Client Release           | Generates short release notes.                                                                                                     |
| Issues and Suggestions   | Generates the deep review.                                                                                                         |
| Prompts                  | Edit every prompt, insert placeholders, save, or reset to default.                                                                 |

The header lets you switch between comparison modes, copy the agent diff to your clipboard, or download it as `.md`.

---

## Offline mode vs Gemini

|                                | Offline (no key)                                                                                      | With `GEMINI_API_KEY`                                                       |
| ------------------------------ | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Agent diff, file view, scanner | Yes                                                                                                   | Yes                                                                         |
| Explain                        | Areas, stats, hunks, notable files                                                                    | Full explanation with data flow                                             |
| Warnings                       | Scanner findings and verdict                                                                          | Scanner findings verified, plus auth, injection, dependency and CI analysis |
| Internal Dev Description       | Title from commits, changes by area, Mermaid area diagram, files table, findings, env vars, checklist | Full PR description with architecture diagrams and code analysis            |
| Client Release                 | Built from conventional commit messages                                                               | Written from the actual code changes                                        |
| Issues and Suggestions         | Scanner findings grouped by rule and ranked                                                           | Full production review including logic and concurrency errors               |

Offline output is clearly labeled, so nobody mistakes it for an AI review.

### Configuration

Put these in the `.env` file inside the folder where you cloned diffwise (or in `~/.config/work-load-understand/.env`). Real environment variables take precedence.

| Variable                | Default                                  | Description                                                                                             |
| ----------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `GEMINI_API_KEY`        | none                                     | Enables AI output. Get one at https://aistudio.google.com/apikey. `GOOGLE_API_KEY` also works.          |
| `GEMINI_MODEL`          | `gemini-3.8-flash`                       | Any Gemini model that supports `generateContent`.                                                       |
| `WLU_OUTPUT_LANGUAGE`   | `English`                                | Language of the generated text.                                                                         |
| `WLU_MAX_CONTEXT_CHARS` | `600000`                                 | Max diff characters sent per request. Larger diffs drop generated files first, then list omitted files. |
| `WLU_PORT`              | `4747`                                   | Web UI port. The next free port is used if it is taken.                                                 |
| `WLU_PROMPTS_DIR`       | `~/.config/work-load-understand/prompts` | Where customized prompts are saved.                                                                     |
| `WLU_OFFLINE`           | unset                                    | Set to `1` to never call Gemini.                                                                        |
| `NO_COLOR`              | unset                                    | Disable colored terminal output.                                                                        |

---

## Prompts

Default prompts live in [`prompts/`](prompts). Customized prompts are saved in your config directory and override the defaults; reset any prompt to go back.

| Prompt                           | Used for                                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `system.md`                      | Sent with every request: no emojis, every claim grounded and cited as `file:line`, valid Mermaid syntax, output language. |
| `explain.md` / `explain-file.md` | Explanations.                                                                                                             |
| `warnings.md`                    | Security and release gate.                                                                                                |
| `internal-pr.md`                 | Internal Dev Description.                                                                                                 |
| `client-release.md`              | Client Release notes.                                                                                                     |
| `issues.md`                      | Issues and Suggestions.                                                                                                   |

Placeholders: `{{REPO_NAME}}`, `{{BRANCH}}`, `{{BASE}}`, `{{STATS}}`, `{{FILE_LIST}}`, `{{COMMITS}}`, `{{LOCAL_FINDINGS}}`, `{{DIFF}}`, `{{DIFF_LEGEND}}`, `{{FILE_PATH}}`, `{{LANGUAGE}}`.

Generated text never contains emojis: the system prompt forbids them, and any that slip through are stripped before you see the result.

---

## Privacy and security

**Your code stays yours.** diffwise is a local tool, not a service.

- **ByePaper never sees your code.** There is no ByePaper server, no account, no telemetry and no analytics. diffwise runs entirely on your machine and reads your repository with your local git.
- **Offline by default.** Without an API key, nothing is sent anywhere.
- **Gemini is opt-in and direct.** If you add your own key, requests go straight from your machine to the Google Gemini API, never through ByePaper. Only the redacted diff, file list, commit subjects and scanner findings are sent. Review your organization's policy before using it on proprietary code, or set `WLU_OFFLINE=1` to guarantee nothing leaves your machine.
- **Secrets are redacted before anything is shown or sent.** Every value matched by a secret rule is replaced with `[REDACTED:rule-id]` in the agent diff, in the web UI excerpts, and in everything sent to Gemini.
- **Locked-down local server.** The web UI only listens on `127.0.0.1`, rejects requests with a foreign `Host` header (DNS rebinding) and cross-origin writes (CSRF), and serves a strict Content Security Policy. The only external resource is the Mermaid library, loaded from jsDelivr to render diagrams (no code or data is sent with it); without it, diagram source is shown instead.
- **The scanner is a safety net, not a guarantee.** If it finds a real credential, **rotate it**: deleting it in a later commit does not remove it from git history.

---

## Scanner rules

Scanned on **added lines only**. Lockfiles, minified files and binaries are skipped.

| Severity  | Rules                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Critical  | Anthropic `sk-ant-`, OpenAI `sk-` / `sk-proj-`, Google/Gemini `AIza`, Stripe `sk_live_` / `rk_live_` / `whsec_`, AWS `AKIA`, GitHub `ghp_` / `github_pat_`, Slack `xox*-`, npm tokens, private key blocks, connection strings with passwords, `*_API_KEY` / `*_SECRET` variables for Claude, OpenAI, Gemini and Stripe with literal values, committed `.env` and key files, merge conflict markers, disabled TLS verification |
| Important | Stripe test keys, JWTs, hardcoded credential-like assignments, `@ts-ignore`, `debugger`, `.only` tests, `eval`, raw HTML sinks, SQL string building, CORS wildcards, swallowed errors, module-level caches/maps/dicts, async `forEach`, Python mutable defaults, insecure random tokens, secrets in logs, world-writable permissions, unpinned dependencies, install scripts                                                  |
| Minor     | TypeScript `any`, lint disables, `console.log`, skipped tests, sync blocking I/O, plain `http://` URLs, SHA-1/SHA-256/SHA-512/MD5-length hashes, Stripe publishable live keys, deleted test files                                                                                                                                                                                                                             |
| Info      | TODO/FIXME, environment variable references, very large file changes                                                                                                                                                                                                                                                                                                                                                          |

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
