import fs from 'node:fs/promises';
import path from 'node:path';
import { getConfig, loadEnv, TOOL_ROOT } from './config.js';
import { buildAgentDocument } from './context.js';
import { runTask, TASKS } from './generate.js';
import { collectChanges } from './git.js';
import { PROMPTS, customPromptPath, defaultPromptPath } from './prompts.js';
import { countBySeverity, scanChanges, SEVERITIES } from './scanner.js';
import { c } from './util.js';

const COMMANDS = new Set(['serve', 'web', 'diff', 'scan', 'explain', 'warnings', 'pr', 'release', 'issues', 'prompts', 'help']);

const HELP = `work_load_understand - understand any git change set

Usage
  wlu [repo]                      Open the web UI for a repository (default: current directory)
  wlu <command> [repo] [options]

Commands
  serve      Start the local web UI (default)
  diff       Print the agent-ready Markdown diff (redacted)       no API key needed
  scan       Run the local secret / bad-practice scanner          no API key needed
  explain    Explain the change set (use --file to explain one file)
  warnings   Scanner findings plus warning analysis
  pr         Internal dev description (pull request body)
  release    Client release notes
  issues     Issues and suggestions (Critical / Important / Minor / Future PRs)
  prompts    Show where prompts live and which ones are customized

  explain, warnings, pr, release and issues use Gemini when GEMINI_API_KEY is set,
  and fall back to a local, deterministic report when it is not (or with --offline).

Options
  --base <ref>       Compare against the merge-base with <ref> (e.g. main), including uncommitted work
  --staged           Only staged changes
  --file <path>      With explain: explain a single file
  --out <file>       Write the result to a file instead of stdout
  --json             JSON output (diff, scan)
  --offline          Never call Gemini, even if a key is set
  --model <id>       Gemini model (default: GEMINI_MODEL or gemini-3.8-flash)
  --port <n>         Web UI port (default: WLU_PORT or 4747)
  --no-open          Do not open the browser
  --fail-on <level>  scan: exit 1 if a finding at or above level exists (critical|important|minor|none, default critical)
  -h, --help         Show help
  -v, --version      Show version

Examples
  wlu ../my-app
  wlu diff ../my-app --base main --out changes.md
  wlu issues ../my-app --base main > issues.md
  wlu scan . --staged --fail-on important     (pre-commit hook)
`;

export function parseArgs(argv) {
  const opts = { _: [] };
  const valueFlags = new Set(['base', 'file', 'out', 'model', 'port', 'fail-on']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') opts.help = true;
    else if (a === '-v' || a === '--version') opts.version = true;
    else if (a.startsWith('--')) {
      const [k, inline] = a.slice(2).split(/=(.*)/s, 2);
      if (k.startsWith('no-')) opts[k.slice(3)] = false;
      else if (valueFlags.has(k)) {
        const v = inline ?? argv[++i];
        if (v === undefined || (inline === undefined && v.startsWith('--'))) throw new Error(`--${k} needs a value`);
        opts[k] = v;
      } else opts[k] = true;
    } else opts._.push(a);
  }
  let command = 'serve';
  if (opts._.length && COMMANDS.has(opts._[0])) command = opts._.shift();
  if (command === 'web') command = 'serve';
  opts.repo = opts._[0] || '.';
  return { command, opts };
}

function changeOptions(opts) {
  if (opts.base && opts.staged) throw new Error('Use either --base or --staged, not both.');
  return opts.base ? { mode: 'base', base: opts.base } : opts.staged ? { mode: 'staged' } : { mode: 'worktree' };
}

async function emit(text, opts) {
  if (opts.out) {
    await fs.writeFile(path.resolve(opts.out), text, 'utf8');
    process.stderr.write(`${c.green('Wrote')} ${path.resolve(opts.out)}\n`);
  } else {
    process.stdout.write(text.endsWith('\n') ? text : `${text}\n`);
  }
}

const SEV_COLOR = { critical: c.red, important: c.yellow, minor: c.cyan, info: c.dim };

function formatFindings(findings) {
  if (!findings.length) return `${c.green('No findings.')}\n`;
  const out = [];
  for (const sev of SEVERITIES) {
    const list = findings.filter((f) => f.severity === sev);
    if (!list.length) continue;
    out.push(SEV_COLOR[sev](c.bold(`\n${sev.toUpperCase()} (${list.length})`)));
    for (const f of list) {
      out.push(`  ${c.dim(f.id.padEnd(5))} ${f.title}`);
      out.push(`        ${c.blue(f.line ? `${f.file}:${f.line}` : f.file)}${f.excerpt ? c.dim(`  ${f.excerpt}`) : ''}`);
    }
  }
  const counts = countBySeverity(findings);
  out.push(`\n${SEVERITIES.map((s) => SEV_COLOR[s](`${counts[s]} ${s}`)).join('  ')}\n`);
  return out.join('\n');
}

async function readVersion() {
  const pkg = JSON.parse(await fs.readFile(path.join(TOOL_ROOT, 'package.json'), 'utf8'));
  return pkg.version;
}

export async function main(argv) {
  loadEnv();
  const { command, opts } = parseArgs(argv);
  if (opts.help || command === 'help') {
    process.stdout.write(HELP);
    return 0;
  }
  if (opts.version) {
    process.stdout.write(`${await readVersion()}\n`);
    return 0;
  }

  const config = getConfig({ model: opts.model, port: opts.port ? Number(opts.port) : undefined, offline: opts.offline });

  if (command === 'prompts') {
    process.stdout.write(`Custom prompts directory: ${config.promptsDir}\n\n`);
    for (const p of PROMPTS) {
      const custom = customPromptPath(config.promptsDir, p.name);
      const isCustom = await fs.access(custom).then(() => true, () => false);
      process.stdout.write(`${p.name.padEnd(15)} ${isCustom ? c.yellow('custom ') : c.dim('default')} ${isCustom ? custom : defaultPromptPath(p.name)}\n`);
    }
    process.stdout.write(`\nTo customize a prompt, copy the default file into the custom directory and edit it, or use the Prompts tab in the web UI.\n`);
    return 0;
  }

  if (command === 'serve') {
    const { startServer } = await import('./server.js');
    await startServer({ repoPath: opts.repo, config, open: opts.open !== false, initial: changeOptions(opts) });
    return new Promise(() => {}); // keep running until Ctrl+C
  }

  const changes = await collectChanges(opts.repo, changeOptions(opts));
  const findings = scanChanges(changes.files);

  if (command === 'diff') {
    const text = opts.json ? JSON.stringify({ ...changes, findings }, null, 2) : buildAgentDocument(changes, findings);
    await emit(text, opts);
    return 0;
  }

  if (command === 'scan') {
    if (opts.json) await emit(JSON.stringify(findings, null, 2), opts);
    else if (opts.out) await emit(formatFindings(findings).replace(/\x1b\[[0-9;]*m/g, ''), opts);
    else process.stdout.write(formatFindings(findings));
    const level = opts['fail-on'] || 'critical';
    if (level === 'none') return 0;
    if (!SEVERITIES.includes(level)) throw new Error(`--fail-on must be one of ${SEVERITIES.join(', ')}, none`);
    const limit = SEVERITIES.indexOf(level);
    return findings.some((f) => SEVERITIES.indexOf(f.severity) <= limit) ? 1 : 0;
  }

  const kind = { explain: opts.file ? 'explain-file' : 'explain', warnings: 'warnings', pr: 'internal', release: 'client', issues: 'issues' }[command];
  if (!kind || !TASKS[kind]) throw new Error(`Unknown command: ${command}`);
  if (!changes.files.length) {
    process.stderr.write(`No changes found in ${changes.root} (${changes.baseLabel}).\n`);
    return 0;
  }
  const offline = !config.apiKey || config.offline;
  process.stderr.write(c.dim(`${TASKS[kind].title} for ${changes.repoName} (${changes.stats.files} files) using ${offline ? 'offline mode' : config.model}...\n`));
  if (command === 'warnings' && !opts.out) process.stderr.write(formatFindings(findings.filter((f) => f.severity !== 'info')));
  const result = await runTask(kind, { changes, findings, config, file: opts.file ? opts.file.replace(/^\.\//, '') : null });
  await emit(result.markdown, opts);
  process.stderr.write(c.dim(`Done in ${(result.elapsedMs / 1000).toFixed(1)}s.\n`));
  return 0;
}
