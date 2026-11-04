<!-- ============================== HERO ============================== -->
<p align="center">
  <img src="https://capsule-render.vercel.app/api?type=venom&color=0:0d1117,35:EF4444,65:8E75B2,100:22C55E&height=280&section=header&text=diffsense&fontSize=72&fontColor=ffffff&animation=twinkling&fontAlignY=40&desc=Make%20sense%20of%20every%20diff.&descSize=22&descAlignY=62&stroke=ffffff&strokeWidth=1" alt="diffsense" width="100%" />
</p>

<p align="center">
  <img src="https://readme-typing-svg.demolab.com?font=JetBrains+Mono&weight=700&size=22&duration=2600&pause=900&color=22C55E&center=true&vCenter=true&width=780&height=45&lines=Your+AI+wrote+300+lines.+Did+you+read+them%3F;Catch+leaked+API+keys+before+you+push.;Explain+any+change+in+seconds.;Write+your+PR+description+for+you.;100%25+local.+We+never+see+your+code." alt="Typing tagline" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/RUNS-100%25_LOCAL-22C55E?style=for-the-badge&labelColor=0d1117" alt="100% local"/>
  <img src="https://img.shields.io/badge/DEPENDENCIES-ZERO-EF4444?style=for-the-badge&labelColor=0d1117" alt="Zero dependencies"/>
  <img src="https://img.shields.io/badge/AI-GEMINI_OPTIONAL-8E75B2?style=for-the-badge&logo=googlegemini&logoColor=white&labelColor=0d1117" alt="Gemini optional"/>
  <img src="https://img.shields.io/badge/LICENSE-MIT-64748B?style=for-the-badge&labelColor=0d1117" alt="MIT"/>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js_18.17+-0d1117?style=flat-square&logo=nodedotjs&logoColor=5FA04E" alt="Node.js"/>
  <img src="https://img.shields.io/badge/git-0d1117?style=flat-square&logo=git&logoColor=F05032" alt="git"/>
  <img src="https://img.shields.io/badge/CLI_+_Web_UI-0d1117?style=flat-square&logo=gnubash&logoColor=white" alt="CLI and Web UI"/>
  <img src="https://img.shields.io/badge/Works_with_any_agent-0d1117?style=flat-square&logo=probot&logoColor=22C55E" alt="Any agent"/>
</p>

<br/>

<!-- ============================== BIG NUMBERS ============================== -->
<table align="center">
  <tr>
    <td align="center" width="200"><h1>0</h1><sub><b>DEPENDENCIES</b></sub></td>
    <td align="center" width="200"><h1>0</h1><sub><b>BYTES SENT TO US</b></sub></td>
    <td align="center" width="200"><h1>6</h1><sub><b>REPORTS FROM ONE DIFF</b></sub></td>
    <td align="center" width="200"><h1>3</h1><sub><b>COMMANDS TO INSTALL</b></sub></td>
  </tr>
</table>

<br/>

<p align="center">
  <a href="#the-problem"><b>The Problem</b></a> &nbsp;&nbsp;|&nbsp;&nbsp;
  <a href="#what-you-get"><b>Features</b></a> &nbsp;&nbsp;|&nbsp;&nbsp;
  <a href="#install-in-60-seconds"><b>Install</b></a> &nbsp;&nbsp;|&nbsp;&nbsp;
  <a href="#cli"><b>CLI</b></a> &nbsp;&nbsp;|&nbsp;&nbsp;
  <a href="#your-code-stays-yours"><b>Privacy</b></a> &nbsp;&nbsp;|&nbsp;&nbsp;
  <a href="#scanner-rules"><b>Scanner</b></a>
</p>

<img src="https://capsule-render.vercel.app/api?type=rect&color=0:EF4444,50:8E75B2,100:22C55E&height=3" width="100%" alt="" />

## The problem

Vibe coding changed the job. The agent writes 300 lines, you skim them, you commit, you push.

Did it touch a file it shouldn't have? Hardcode your API key "just for testing"? Leave a `debugger`, an `eval`, a `.only` on your tests?

```diff
  export const client = new OpenAI({
-   apiKey: process.env.OPENAI_API_KEY,
+   apiKey: "sk-proj-4f9a...",          ← CRITICAL  caught by diffsense
  });
+ console.log("WHY DOES THIS WORK");    ← MINOR     caught by diffsense
```

**diffsense reads your diff before anyone else does.** It explains what changed, catches what shouldn't be there and writes the documentation you were going to skip.

<img src="https://capsule-render.vercel.app/api?type=rect&color=0:EF4444,50:8E75B2,100:22C55E&height=3" width="100%" alt="" />

## What you get

Point it at any repository. It reads **everything** you changed (committed, staged, unstaged and untracked) and gives you six things:

<table>
  <tr>
    <td width="33%" valign="top" align="center">
      <img src="https://img.shields.io/badge/AGENT_DIFF-0EA5E9?style=for-the-badge" alt="Agent Diff"/><br/><br/>
      Every changed file as annotated, line-numbered Markdown with <b>secrets redacted</b>. Paste it into Claude, ChatGPT, Gemini or Cursor.
    </td>
    <td width="33%" valign="top" align="center">
      <img src="https://img.shields.io/badge/EXPLAIN-8E75B2?style=for-the-badge" alt="Explain"/><br/><br/>
      A clear explanation of the whole change, or of a single file. Finally understand what your agent did.
    </td>
    <td width="33%" valign="top" align="center">
      <img src="https://img.shields.io/badge/WARNINGS-EF4444?style=for-the-badge" alt="Warnings"/><br/><br/>
      An offline scanner for API keys, <code>.env</code> files, private keys, SQL injection, swallowed errors and much more.
    </td>
  </tr>
  <tr>
    <td width="33%" valign="top" align="center">
      <img src="https://img.shields.io/badge/PR_DESCRIPTION-4285F4?style=for-the-badge" alt="PR Description"/><br/><br/>
      A full pull request body with Mermaid diagrams, files table, code analysis, testing and deployment notes.
    </td>
    <td width="33%" valign="top" align="center">
      <img src="https://img.shields.io/badge/CLIENT_RELEASE-22C55E?style=for-the-badge" alt="Client Release"/><br/><br/>
      Plain-language release notes your clients understand: <b>Added</b>, <b>Improved</b>, <b>Fixed</b>.
    </td>
    <td width="33%" valign="top" align="center">
      <img src="https://img.shields.io/badge/DEEP_REVIEW-F97316?style=for-the-badge" alt="Deep Review"/><br/><br/>
      A production review ranked <b>Critical</b>, <b>Important</b>, <b>Minor</b> and sub-issues for future PRs.
    </td>
  </tr>
</table>

<p align="center">
  <b>No API key required.</b> Everything works offline with deterministic, local output.<br/>
  Add a Gemini key and every report is written by AI instead, using prompts you can edit.
</p>

<img src="https://capsule-render.vercel.app/api?type=rect&color=0:EF4444,50:8E75B2,100:22C55E&height=3" width="100%" alt="" />

## Install in 60 seconds

**1. Clone and link**

```sh
git clone https://github.com/pato-byepaper/diffsense.git
cd diffsense
npm link
```

**2. Run it on any project**

```sh
wlu ~/path/to/your-project
```

**3. That's it.** A web UI opens at `http://127.0.0.1:4747`.

Already inside the project you want to review? Just type:

```sh
wlu
```

<details>
<summary><b>Optional: turn on AI output with Gemini</b></summary>
<br/>

```sh
cd diffsense
cp .env.example .env    # then add your GEMINI_API_KEY
```

Gemini has a free tier: https://aistudio.google.com/apikey

</details>

<details>
<summary><b>Prefer not to install a global command?</b></summary>
<br/>

Run the launcher directly from the folder where you cloned diffsense:

```sh
./wlu ~/path/to/your-project
npm start -- ~/path/to/your-project    # same thing through npm (note the --)
```

</details>

<details>
<summary><b>Path tips</b></summary>
<br/>

- Paths can be absolute, relative or start with `~`.
- `~` already means your home folder (`/Users/<you>` on macOS), so write `~/projects/my-api`, not `~/Users/<you>/projects/my-api`.
- If you skip the path, the current directory is used.

All of these names work after `npm link`:

```sh
wlu ./my-repo
work_load_understand ./my-repo
work-load-understand ./my-repo
```

</details>

<img src="https://capsule-render.vercel.app/api?type=rect&color=0:EF4444,50:8E75B2,100:22C55E&height=3" width="100%" alt="" />

## Why "diffsense"? And why `wlu`?

<table>
  <tr>
    <td width="50%" valign="top" align="center">
      <h3>diff + sense</h3>
      Make sense of your diffs before anyone else reads them. Know what changed, why it matters and what could break, before you open the pull request.
    </td>
    <td width="50%" valign="top" align="center">
      <h3>work · load · understand</h3>
      The project was born as <b>work_load_understand</b>: you work, it loads your changes, you understand them. The name changed. The command didn't.
    </td>
  </tr>
</table>

The original names (`wlu`, `work_load_understand`, `work-load-understand`, the `WLU_*` environment variables and the `~/.config/work-load-understand/` folder) are kept, so existing setups, scripts and hooks keep working.

<img src="https://capsule-render.vercel.app/api?type=rect&color=0:EF4444,50:8E75B2,100:22C55E&height=3" width="100%" alt="" />

## My favorite commands

```sh
# Your whole branch vs main, commit messages included
wlu . --base main

# A paste-ready PR description, straight to your clipboard
wlu pr . --base main | pbcopy

# Give an AI agent the full context of your branch
wlu diff . --base main --out changes.md

# Release notes for clients since your last tag
wlu release . --base v1.4.0

# Deep review before merging
wlu issues . --base main --out review.md

# Block any commit that contains a secret
wlu scan . --staged --fail-on critical
```

Status messages go to stderr and results go to stdout, so piping and redirecting work as expected.

### What it compares

| Mode | Flag | Includes |
|:---|:---|:---|
| **Uncommitted** (default) | none | Staged + unstaged + untracked files, compared to `HEAD` |
| **Staged only** | `--staged` | Exactly what `git commit` would commit right now |
| **Branch vs base** | `--base main` | Everything since the merge-base with `main`: your commits plus uncommitted and untracked work |

Use `--base` to include commit messages, which makes PR descriptions and release notes much better.

<img src="https://capsule-render.vercel.app/api?type=rect&color=0:EF4444,50:8E75B2,100:22C55E&height=3" width="100%" alt="" />

## Never commit a secret again

<table>
  <tr>
    <td width="50%" valign="top">
      <h4>Pre-commit hook</h4>

```sh
# .git/hooks/pre-commit
#!/bin/sh
exec wlu scan . --staged --fail-on critical
```

Without `npm link`, use the full launcher path, for example `~/diffsense/wlu`.
    </td>
    <td width="50%" valign="top">
      <h4>GitHub Actions</h4>

```yaml
- uses: actions/checkout@v4
  with: { fetch-depth: 0 }
- run: npx --yes github:pato-byepaper/diffsense scan . --base origin/${{ github.base_ref }} --fail-on critical
```

Fails the build if a critical finding shows up in the PR.
    </td>
  </tr>
</table>

<img src="https://capsule-render.vercel.app/api?type=rect&color=0:EF4444,50:8E75B2,100:22C55E&height=3" width="100%" alt="" />

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

## Web UI

| Tab | What it does |
|:---|:---|
| **Changes** | Every changed file with line numbers. Scanner hits marked inline. "Explain entire change" and per-file "Explain file" buttons. |
| **Warnings** | Findings grouped by severity. Click a location to jump to the line. Plus a "Run warning analysis" button. |
| **Internal Dev Description** | Generates the PR description. Preview with rendered Mermaid diagrams, or edit, copy or download the raw Markdown. |
| **Client Release** | Generates short release notes. |
| **Issues and Suggestions** | Generates the deep review. |
| **Prompts** | Edit every prompt, insert placeholders, save, or reset to default. |

The header lets you switch comparison modes, copy the agent diff to your clipboard, or download it as `.md`.

<img src="https://capsule-render.vercel.app/api?type=rect&color=0:EF4444,50:8E75B2,100:22C55E&height=3" width="100%" alt="" />

## Offline vs Gemini

| | <img src="https://img.shields.io/badge/OFFLINE-NO_KEY-22C55E?style=flat-square&labelColor=0d1117" alt="Offline"/> | <img src="https://img.shields.io/badge/WITH-GEMINI-8E75B2?style=flat-square&logo=googlegemini&logoColor=white&labelColor=0d1117" alt="Gemini"/> |
|:---|:---|:---|
| **Agent diff, file view, scanner** | Yes | Yes |
| **Explain** | Areas, stats, hunks, notable files | Full explanation with data flow |
| **Warnings** | Scanner findings and verdict | Findings verified, plus auth, injection, dependency and CI analysis |
| **Internal Dev Description** | Title from commits, changes by area, Mermaid area diagram, files table, findings, env vars, checklist | Full PR description with architecture diagrams and code analysis |
| **Client Release** | Built from conventional commit messages | Written from the actual code changes |
| **Issues and Suggestions** | Scanner findings grouped by rule and ranked | Full production review including logic and concurrency errors |

Offline output is clearly labeled, so nobody mistakes it for an AI review.

<details>
<summary><b>Configuration</b></summary>
<br/>

Put these in the `.env` file inside the folder where you cloned diffsense (or in `~/.config/work-load-understand/.env`). Real environment variables take precedence.

| Variable | Default | Description |
|:---|:---|:---|
| `GEMINI_API_KEY` | none | Enables AI output. Get one at https://aistudio.google.com/apikey. `GOOGLE_API_KEY` also works. |
| `GEMINI_MODEL` | `gemini-3.8-flash` | Any Gemini model that supports `generateContent`. |
| `WLU_OUTPUT_LANGUAGE` | `English` | Language of the generated text. |
| `WLU_MAX_CONTEXT_CHARS` | `600000` | Max diff characters sent per request. Larger diffs drop generated files first, then list omitted files. |
| `WLU_PORT` | `4747` | Web UI port. The next free port is used if it is taken. |
| `WLU_PROMPTS_DIR` | `~/.config/work-load-understand/prompts` | Where customized prompts are saved. |
| `WLU_OFFLINE` | unset | Set to `1` to never call Gemini. |
| `NO_COLOR` | unset | Disable colored terminal output. |

</details>

<details>
<summary><b>Prompts</b></summary>
<br/>

Default prompts live in [`prompts/`](prompts). Customized prompts are saved in your config directory and override the defaults; reset any prompt to go back.

| Prompt | Used for |
|:---|:---|
| `system.md` | Sent with every request: no emojis, every claim grounded and cited as `file:line`, valid Mermaid syntax, output language. |
| `explain.md` / `explain-file.md` | Explanations. |
| `warnings.md` | Security and release gate. |
| `internal-pr.md` | Internal Dev Description. |
| `client-release.md` | Client Release notes. |
| `issues.md` | Issues and Suggestions. |

Placeholders: `{{REPO_NAME}}`, `{{BRANCH}}`, `{{BASE}}`, `{{STATS}}`, `{{FILE_LIST}}`, `{{COMMITS}}`, `{{LOCAL_FINDINGS}}`, `{{DIFF}}`, `{{DIFF_LEGEND}}`, `{{FILE_PATH}}`, `{{LANGUAGE}}`.

Generated text never contains emojis: the system prompt forbids them, and any that slip through are stripped before you see the result.

</details>

<img src="https://capsule-render.vercel.app/api?type=rect&color=0:EF4444,50:8E75B2,100:22C55E&height=3" width="100%" alt="" />

## Your code stays yours

<p align="center">
  <img src="https://readme-typing-svg.demolab.com?font=JetBrains+Mono&weight=800&size=30&duration=3000&pause=2000&color=22C55E&center=true&vCenter=true&width=800&height=60&lines=ByePaper+never+sees+your+code.;No+server.+No+account.+No+telemetry." alt="ByePaper never sees your code" />
</p>

| | Guarantee | Details |
|:---:|:---|:---|
| **01** | **Local by design** | diffsense runs entirely on your machine and reads your repository with your local git. There is no ByePaper server. |
| **02** | **Offline by default** | Without an API key, nothing is sent anywhere. |
| **03** | **Gemini is opt-in and direct** | With your own key, requests go straight from your machine to Google, never through ByePaper. Only the redacted diff, file list, commit subjects and scanner findings are sent. Set `WLU_OFFLINE=1` to guarantee nothing leaves your machine. |
| **04** | **Secrets redacted first** | Every matched secret becomes `[REDACTED:rule-id]` in the agent diff, the web UI and everything sent to Gemini. |
| **05** | **Locked-down local server** | Listens only on `127.0.0.1`, rejects foreign `Host` headers (DNS rebinding) and cross-origin writes (CSRF), and serves a strict Content Security Policy. The only external resource is the Mermaid library from jsDelivr; no code or data is sent with it. |

> **The scanner is a safety net, not a guarantee.** If it finds a real credential, **rotate it**. Deleting it in a later commit does not remove it from git history.

Using it on proprietary code with Gemini? Check your organization's policy first.

<img src="https://capsule-render.vercel.app/api?type=rect&color=0:EF4444,50:8E75B2,100:22C55E&height=3" width="100%" alt="" />

## Scanner rules

Scans **added lines only**. Lockfiles, minified files and binaries are skipped.

| Severity | Rules |
|:---|:---|
| <img src="https://img.shields.io/badge/CRITICAL-EF4444?style=flat-square" alt="Critical"/> | Anthropic `sk-ant-`, OpenAI `sk-` / `sk-proj-`, Google/Gemini `AIza`, Stripe `sk_live_` / `rk_live_` / `whsec_`, AWS `AKIA`, GitHub `ghp_` / `github_pat_`, Slack `xox*-`, npm tokens, private key blocks, connection strings with passwords, `*_API_KEY` / `*_SECRET` variables for Claude, OpenAI, Gemini and Stripe with literal values, committed `.env` and key files, merge conflict markers, disabled TLS verification |
| <img src="https://img.shields.io/badge/IMPORTANT-F97316?style=flat-square" alt="Important"/> | Stripe test keys, JWTs, hardcoded credential-like assignments, `@ts-ignore`, `debugger`, `.only` tests, `eval`, raw HTML sinks, SQL string building, CORS wildcards, swallowed errors, module-level caches/maps/dicts, async `forEach`, Python mutable defaults, insecure random tokens, secrets in logs, world-writable permissions, unpinned dependencies, install scripts |
| <img src="https://img.shields.io/badge/MINOR-EAB308?style=flat-square" alt="Minor"/> | TypeScript `any`, lint disables, `console.log`, skipped tests, sync blocking I/O, plain `http://` URLs, SHA-1/SHA-256/SHA-512/MD5-length hashes, Stripe publishable live keys, deleted test files |
| <img src="https://img.shields.io/badge/INFO-64748B?style=flat-square" alt="Info"/> | TODO/FIXME, environment variable references, very large file changes |

Rules live in [`src/scanner.js`](src/scanner.js). Adding one takes a few lines; see [CONTRIBUTING.md](CONTRIBUTING.md).

<img src="https://capsule-render.vercel.app/api?type=rect&color=0:EF4444,50:8E75B2,100:22C55E&height=3" width="100%" alt="" />

## Under the hood

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

```sh
npm test               # run the test suite (no network)
node bin/wlu.js --help
```

## Contributing

Wrote a scanner rule that would have saved you once? Send it. Read [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md), and report vulnerabilities as described in [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)

<p align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&color=0:22C55E,50:8E75B2,100:EF4444&height=140&section=footer&text=Read%20your%20diff.%20Ship%20with%20sense.&fontSize=22&fontColor=ffffff&fontAlignY=70" alt="Footer" width="100%" />
</p>

<p align="center">
  <sub>Built by <a href="https://github.com/pato-byepaper"><b>Pato</b></a> at <a href="https://github.com/ByePaper"><b>ByePaper</b></a></sub>
</p>
