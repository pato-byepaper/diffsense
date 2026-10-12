import fs from 'node:fs/promises';
import path from 'node:path';
import { TOOL_ROOT } from './config.js';

const DEFAULTS_DIR = path.join(TOOL_ROOT, 'prompts');

export const PROMPTS = [
  { name: 'system', title: 'System rules', description: 'Shared rules sent as the system instruction with every request (no emojis, grounding, citations, Mermaid syntax).' },
  { name: 'explain', title: 'Explain change', description: 'Explains the whole change set.' },
  { name: 'explain-file', title: 'Explain file', description: 'Explains the changes to one file.' },
  { name: 'warnings', title: 'Detect warnings', description: 'Security and release gate. Reviews local scanner findings and finds what regexes cannot.' },
  { name: 'internal-pr', title: 'Internal dev description', description: 'Pull request description for engineers, with Mermaid diagrams and full analysis.' },
  { name: 'client-release', title: 'Client release notes', description: 'Short, non-technical release notes.' },
  { name: 'issues', title: 'Issues and suggestions', description: 'Deep review: Critical, Important, Minor and Sub-issues for future PRs.' },
];

export const PLACEHOLDERS = [
  { key: 'REPO_NAME', description: 'Repository folder name' },
  { key: 'BRANCH', description: 'Current branch' },
  { key: 'BASE', description: 'What the changes are compared against' },
  { key: 'STATS', description: 'Files changed, insertions, deletions' },
  { key: 'FILE_LIST', description: 'One line per changed file with status and counts' },
  { key: 'COMMITS', description: 'Commits in range (base mode only)' },
  { key: 'LOCAL_FINDINGS', description: 'Local scanner findings, secrets masked' },
  { key: 'DIFF', description: 'The annotated, redacted diff' },
  { key: 'DIFF_LEGEND', description: 'Explanation of the diff format' },
  { key: 'FILE_PATH', description: 'Selected file (explain-file only)' },
  { key: 'LANGUAGE', description: 'Output language (WLU_OUTPUT_LANGUAGE)' },
];

const NAMES = new Set(PROMPTS.map((p) => p.name));

function assertName(name) {
  if (!NAMES.has(name)) throw new Error(`Unknown prompt: ${name}`);
}

async function readOrNull(file) {
  try {
    return await fs.readFile(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

export function customPromptPath(promptsDir, name) {
  assertName(name);
  return path.join(promptsDir, `${name}.md`);
}

export function defaultPromptPath(name) {
  assertName(name);
  return path.join(DEFAULTS_DIR, `${name}.md`);
}

export async function loadPrompt(promptsDir, name) {
  const custom = await readOrNull(customPromptPath(promptsDir, name));
  if (custom !== null) return custom;
  const def = await readOrNull(defaultPromptPath(name));
  if (def === null) throw new Error(`Default prompt file missing: ${defaultPromptPath(name)}`);
  return def;
}

export async function listPrompts(promptsDir) {
  return Promise.all(
    PROMPTS.map(async (p) => {
      const def = (await readOrNull(defaultPromptPath(p.name))) ?? '';
      const custom = await readOrNull(customPromptPath(promptsDir, p.name));
      return { ...p, content: custom ?? def, defaultContent: def, isCustom: custom !== null, path: custom !== null ? customPromptPath(promptsDir, p.name) : defaultPromptPath(p.name) };
    }),
  );
}

export async function savePrompt(promptsDir, name, content) {
  if (typeof content !== 'string' || !content.trim()) throw new Error('Prompt content cannot be empty.');
  if (content.length > 200_000) throw new Error('Prompt is too long.');
  const file = customPromptPath(promptsDir, name);
  await fs.mkdir(promptsDir, { recursive: true });
  await fs.writeFile(file, content, 'utf8');
  return file;
}

export async function resetPrompt(promptsDir, name) {
  await fs.rm(customPromptPath(promptsDir, name), { force: true });
}

/** Single-pass {{KEY}} substitution, so placeholder-like text inside the diff is never expanded. */
export function renderTemplate(template, vars) {
  return template.replace(/\{\{\s*([A-Z_]+)\s*\}\}/g, (whole, key) => (Object.hasOwn(vars, key) ? String(vars[key]) : whole));
}
