# Contributing to work_load_understand

Thanks for helping. This project aims to stay small, dependency-free and easy to read, so anyone can audit what runs against their code.

## Ways to contribute

- **Report a bug**: open an issue with the command you ran, what you expected, what happened, your OS, Node.js and git versions. Redact any code or secrets.
- **Suggest a feature**: open an issue describing the problem first, before the solution.
- **Add or improve a scanner rule**: the most valuable contribution. See below.
- **Improve a prompt**: include before/after output on a real (non-confidential) diff in your pull request.
- **Improve docs**: typos, clearer explanations, examples.

Look for issues labeled `good first issue` or `help wanted` to get started.

## Development setup

```sh
git clone https://github.com/<your-fork>/work_load_understand
cd work_load_understand
npm test
node bin/wlu.js --help
node bin/wlu.js ../some-repo          # web UI
node bin/wlu.js issues ../some-repo --offline
```

Requirements: Node.js 18.17+ and git. There is no build step and no `npm install`.

## Ground rules

1. **No runtime dependencies.** Use the Node.js standard library. If you believe a dependency is unavoidable, open an issue first.
2. **Nothing leaves the machine unredacted.** Any new code path that sends data to an external service must go through `redactSecrets` / `renderDiff`.
3. **Everything works without an API key.** New AI features need an offline fallback in `src/offline.js`.
4. **No emojis** in generated output, UI text, docs or commit messages.
5. **Tests for behavior.** Parser, scanner, redaction and offline output changes need tests in `test/`. Tests must not use the network.
6. Match the existing style: ES modules, two-space indentation, single quotes, small functions, comments only where the reason is not obvious.

## Adding a scanner rule

Rules live in `src/scanner.js`:

- `SECRET_RULES`: credentials. Matches are redacted everywhere.
- `QUALITY_RULES`: bad practices, security smells, lint and typing issues.
- `FILE_RULES`: checks on the file path or status.

```js
{
  id: 'my-rule',                       // kebab-case, stable
  title: 'Short human title',
  severity: 'important',               // critical | important | minor | info
  category: 'security',
  files: /\.(ts|js)$/,                 // optional: only these paths
  skipFiles: /(^|\/)test\//,           // optional: never these paths
  re: /pattern/g,                      // must be global
  group: 1,                            // optional: capture group with the sensitive value
  validate: (value, line, path) => true, // optional: reduce false positives
  description: 'Why this matters in production.',
  fix: 'What to do instead.',
}
```

Severity guide:

- **critical**: leaked credentials, or something that will break or compromise production.
- **important**: a real bug or risk under plausible conditions.
- **minor**: quality, lint, typing.
- **info**: context worth knowing, not a problem by itself.

Every rule needs at least one test that it matches, and one that it does not match a common false positive.

## Changing prompts

Default prompts are in `prompts/`. Keep these properties:

- Output structure is explicit and stable (headings in a fixed order), so results are predictable and copy-paste ready.
- Every claim must cite `file:line`.
- No emojis.
- Placeholders use `{{UPPER_SNAKE}}` and must be listed in `src/prompts.js`.

## Pull request process

1. Fork, then create a branch from `main` (`feat/scanner-twilio-keys`, `fix/rename-parsing`).
2. Keep pull requests focused: one feature or fix each.
3. Run `npm test`.
4. Use clear commit messages in the imperative or past tense, for example `Added Twilio API key rule`.
5. Fill in the pull request template. Running `wlu pr . --base main` is a good start.
6. A maintainer will review. Expect questions; they are not a rejection.

## Community

Be kind and assume good intent. All participation is covered by the [Code of Conduct](CODE_OF_CONDUCT.md). For security issues, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.
