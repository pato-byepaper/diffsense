// Builds the "agent-ready" Markdown representation of a change set.
// This exact text is what gets exported for AI agents and what Gemini receives.
import { redactSecrets } from './scanner.js';
import { fenceFor } from './util.js';

const STATUS_LETTER = { added: 'A', modified: 'M', deleted: 'D', renamed: 'R', copied: 'C' };
const MAX_FILE_CHARS = 120_000;

export function statusLetter(status) {
  return STATUS_LETTER[status] || 'M';
}

export function describeStats(changes) {
  const { files, additions, deletions } = changes.stats;
  return `${files} file${files === 1 ? '' : 's'} changed, ${additions} insertion${additions === 1 ? '' : 's'}(+), ${deletions} deletion${deletions === 1 ? '' : 's'}(-)`;
}

export function fileList(changes) {
  if (!changes.files.length) return '(no files changed)';
  return changes.files
    .map((f) => {
      const rename = f.status === 'renamed' || f.status === 'copied' ? ` (from \`${f.oldPath}\`)` : '';
      const flags = [f.binary && 'binary', f.generated && 'generated/lockfile', f.untracked && 'untracked'].filter(Boolean);
      return `- ${statusLetter(f.status)} \`${f.path}\`${rename} +${f.additions} -${f.deletions}${flags.length ? ` [${flags.join(', ')}]` : ''}`;
    })
    .join('\n');
}

export function commitList(changes) {
  if (!changes.commits.length) return '(no commits in range; uncommitted changes only)';
  return changes.commits.map((c) => `- ${c.hash} ${c.subject}`).join('\n');
}

export function findingsList(findings, limit = 300) {
  if (!findings.length) return '(the local scanner found nothing)';
  const lines = findings.slice(0, limit).map((f) => {
    const loc = f.line ? `${f.file}:${f.line}` : f.file;
    const excerpt = f.excerpt ? ` | code: ${f.excerpt.replace(/`/g, "'")}` : '';
    return `- [${f.severity}] ${f.id} ${f.ruleId} at \`${loc}\` - ${f.title}${excerpt}`;
  });
  if (findings.length > limit) lines.push(`- ... ${findings.length - limit} more findings not shown`);
  return lines.join('\n');
}

const kb = (n) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`);
function binarySizeNote(file) {
  if (file.oldSize == null && file.newSize == null) return '';
  if (file.oldSize == null) return `Added (${kb(file.newSize)}).`;
  if (file.newSize == null) return `Deleted (was ${kb(file.oldSize)}).`;
  return `Size ${kb(file.oldSize)} -> ${kb(file.newSize)}.`;
}

function renderFileBody(file) {
  if (file.binary && file.preview) return `_${file.preview.toUpperCase()} file, content not shown. ${binarySizeNote(file)}_`;
  if (file.tooLarge) return '_Untracked file larger than 2 MB: content omitted._';
  if (file.binary) return '_Binary file: content not shown._';
  if (file.generated) return `_Generated or lock file: content omitted (+${file.additions} -${file.deletions})._`;
  if (!file.hunks.length) return file.modeChange ? `_File mode changed ${file.modeChange}._` : '_No content changes (rename or mode change only)._';

  const width = Math.max(4, String(Math.max(...file.hunks.map((h) => h.newStart + h.newLines))).length);
  const out = [];
  let size = 0;
  let truncatedLines = 0;
  for (const hunk of file.hunks) {
    const rows = [hunk.header];
    for (const ln of hunk.lines) {
      let row;
      const content = redactSecrets(ln.content, file.path);
      if (ln.type === 'add') row = `${String(ln.newNo).padStart(width)} + ${content}`;
      else if (ln.type === 'del') row = `${' '.repeat(width)} - ${content}`;
      else if (ln.type === 'ctx') row = `${String(ln.newNo).padStart(width)}   ${content}`;
      else row = `${' '.repeat(width)} \\ ${content}`;
      rows.push(row);
    }
    for (const row of rows) {
      if (size + row.length > MAX_FILE_CHARS) {
        truncatedLines++;
        continue;
      }
      out.push(row);
      size += row.length + 1;
    }
  }
  const body = out.join('\n');
  const fence = fenceFor(body);
  let text = `${fence}diff\n${body}\n${fence}`;
  if (truncatedLines) text += `\n_Truncated: ${truncatedLines} more diff lines in this file were omitted._`;
  return text;
}

export function renderFile(file) {
  const rename = file.status === 'renamed' || file.status === 'copied' ? `\nRenamed from \`${file.oldPath}\`.` : '';
  const mode = file.modeChange ? `\nMode change: ${file.modeChange}.` : '';
  return `### \`${file.path}\` (${file.status}, +${file.additions} -${file.deletions})${rename}${mode}\n\n${renderFileBody(file)}\n`;
}

export const DIFF_LEGEND =
  'Diff format: each hunk starts with a standard `@@` header. The left column is the line number in the NEW version of the file (blank for removed lines). ' +
  'The marker after it is `+` for an added line, `-` for a removed line, and blank for unchanged context. ' +
  'Values shown as [REDACTED:rule] were secrets removed by a local scanner.';

/**
 * Renders the diff section only (no header), honoring a total character budget.
 * Files that do not fit are listed as omitted.
 */
export function renderDiff(changes, { maxChars = Infinity, onlyFile = null } = {}) {
  const files = onlyFile ? changes.files.filter((f) => f.path === onlyFile) : changes.files;
  // Source first, generated/binary last so the budget goes to code that matters.
  const ordered = [...files].sort((a, b) => Number(a.generated || a.binary) - Number(b.generated || b.binary));
  const parts = [];
  const omitted = [];
  let used = 0;
  for (const f of ordered) {
    const block = renderFile(f);
    if (used + block.length > maxChars && parts.length) {
      omitted.push(f);
      continue;
    }
    parts.push(block);
    used += block.length;
  }
  let text = parts.join('\n');
  if (omitted.length) {
    text += `\n\n### Omitted files (context budget reached)\n\n${omitted.map((f) => `- \`${f.path}\` (+${f.additions} -${f.deletions})`).join('\n')}\n`;
  }
  return { text, omitted, truncated: omitted.length > 0 };
}

/** Full standalone Markdown document for pasting into an AI agent. */
export function buildAgentDocument(changes, findings, { maxChars = Infinity } = {}) {
  const { text } = renderDiff(changes, { maxChars });
  const sections = [
    `# Change set: ${changes.repoName}`,
    '',
    `- Branch: \`${changes.branch}\``,
    `- Compared against: ${changes.baseLabel}`,
    `- Stats: ${describeStats(changes)}`,
    `- Generated: ${changes.generatedAt}`,
    '',
    `> ${DIFF_LEGEND}`,
    '',
    '## Files',
    '',
    fileList(changes),
    '',
  ];
  if (changes.commits.length) sections.push('## Commits', '', commitList(changes), '');
  if (findings && findings.length) sections.push('## Local scanner findings', '', findingsList(findings), '');
  sections.push('## Diff', '', text || '_No changes._', '');
  return sections.join('\n');
}
