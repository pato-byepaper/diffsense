import { commitList, describeStats, DIFF_LEGEND, fileList, findingsList, renderDiff } from './context.js';
import { generateContent } from './gemini.js';
import { runOffline } from './offline.js';
import { loadPrompt, renderTemplate } from './prompts.js';
import { cleanModelOutput } from './util.js';

export const TASKS = {
  explain: { prompt: 'explain', title: 'Change explanation', temperature: 0.2 },
  'explain-file': { prompt: 'explain-file', title: 'File explanation', temperature: 0.2 },
  warnings: { prompt: 'warnings', title: 'Warnings', temperature: 0.1 },
  internal: { prompt: 'internal-pr', title: 'Internal dev description', temperature: 0.2 },
  client: { prompt: 'client-release', title: 'Client release notes', temperature: 0.3 },
  issues: { prompt: 'issues', title: 'Issues and suggestions', temperature: 0.1 },
};

export async function runTask(kind, { changes, findings, config, file = null, signal }) {
  const task = TASKS[kind];
  if (!task) throw new Error(`Unknown task: ${kind}. Valid: ${Object.keys(TASKS).join(', ')}`);
  if (!changes.files.length) throw new Error('There are no changes to analyze.');
  if (kind === 'explain-file') {
    if (!file) throw new Error('A file path is required to explain a single file.');
    if (!changes.files.some((f) => f.path === file)) throw new Error(`File is not part of the change set: ${file}`);
  }

  // No key (or --offline): fully local, deterministic output. Nothing leaves the machine.
  if (!config.apiKey || config.offline) {
    const started = Date.now();
    const markdown = runOffline(kind, { changes, findings, file });
    return { kind, title: task.title, markdown, model: 'offline', offline: true, elapsedMs: Date.now() - started, usage: null, notes: [] };
  }

  // Reserve room for the prompt template and metadata inside the context budget.
  const diffBudget = Math.max(20_000, config.maxContextChars - 40_000);
  const diff = renderDiff(changes, { maxChars: diffBudget, onlyFile: kind === 'explain-file' ? file : null });
  const relevantFindings = kind === 'explain-file' ? findings.filter((f) => f.file === file) : findings;

  const vars = {
    REPO_NAME: changes.repoName,
    BRANCH: changes.branch,
    BASE: changes.baseLabel,
    STATS: describeStats(changes),
    FILE_LIST: fileList(changes),
    COMMITS: commitList(changes),
    LOCAL_FINDINGS: findingsList(relevantFindings),
    DIFF: diff.text,
    DIFF_LEGEND,
    FILE_PATH: file || '',
    LANGUAGE: config.language,
  };

  const [systemTpl, userTpl] = await Promise.all([loadPrompt(config.promptsDir, 'system'), loadPrompt(config.promptsDir, task.prompt)]);
  const started = Date.now();
  const result = await generateContent({
    apiKey: config.apiKey,
    model: config.model,
    system: renderTemplate(systemTpl, vars),
    prompt: renderTemplate(userTpl, vars),
    temperature: task.temperature,
    signal,
  });

  let markdown = cleanModelOutput(result.text);
  const notes = [...result.notes];
  if (diff.truncated) notes.push(`${diff.omitted.length} file(s) were left out because the diff exceeded the context budget (WLU_MAX_CONTEXT_CHARS).`);
  if (notes.length) markdown += `\n---\n\n${notes.map((n) => `> Note: ${n}`).join('\n>\n')}\n`;

  return { kind, title: task.title, markdown, model: config.model, offline: false, elapsedMs: Date.now() - started, usage: result.usage, notes };
}
