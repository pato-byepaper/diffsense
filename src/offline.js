// Deterministic generators used when no GEMINI_API_KEY is configured (or --offline is passed).
// They only use the parsed diff, commit messages and the local regex scanner, so they never leave the machine.
import { describeStats, statusLetter } from './context.js';
import { countBySeverity } from './scanner.js';

export const OFFLINE_BANNER = '> Offline mode: generated locally from the diff, commit messages and the regex scanner. Set GEMINI_API_KEY for a full AI analysis.';

const TEST_RE = /(^|\/)(__tests__|tests?|spec)\/|\.(test|spec)\.[a-z]+$|_test\.(go|py)$|(^|\/)test_[^/]+\.py$/i;
const MIGRATION_RE = /(^|\/)(migrations?|migrate|db\/schema|prisma\/schema\.prisma|alembic)\b/i;
const CI_RE = /(^|\/)(\.github\/workflows|\.gitlab-ci|\.circleci|Jenkinsfile|azure-pipelines)/i;
const DEP_RE = /(^|\/)(package\.json|requirements[^/]*\.txt|pyproject\.toml|Cargo\.toml|go\.mod|Gemfile|composer\.json|pom\.xml|build\.gradle(\.kts)?)$/;
const DOC_RE = /\.(md|mdx|rst|txt|adoc)$/i;

function areaOf(path) {
  const parts = path.split('/');
  if (parts.length === 1) return '(root)';
  if (['src', 'lib', 'app', 'packages', 'apps', 'services'].includes(parts[0]) && parts.length > 2) return `${parts[0]}/${parts[1]}`;
  return parts[0];
}

function groupByArea(files) {
  const map = new Map();
  for (const f of files) {
    const a = areaOf(f.path);
    if (!map.has(a)) map.set(a, []);
    map.get(a).push(f);
  }
  return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
}

function loc(f) {
  return f.line ? `${f.file}:${f.line}` : f.file;
}

function verb(status) {
  return { added: 'Added', deleted: 'Deleted', renamed: 'Renamed', copied: 'Copied' }[status] || 'Modified';
}

function envVars(findings) {
  const map = new Map();
  for (const f of findings) {
    if (f.ruleId !== 'env-var-reference') continue;
    if (!map.has(f.match)) map.set(f.match, []);
    map.get(f.match).push(loc(f));
  }
  return map;
}

function classify(files) {
  return {
    tests: files.filter((f) => TEST_RE.test(f.path)),
    migrations: files.filter((f) => MIGRATION_RE.test(f.path)),
    ci: files.filter((f) => CI_RE.test(f.path)),
    deps: files.filter((f) => DEP_RE.test(f.path)),
    docs: files.filter((f) => DOC_RE.test(f.path)),
    generated: files.filter((f) => f.generated),
  };
}

const CC_RE = /^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/;

function parseCommit(subject) {
  const m = subject.match(CC_RE);
  if (!m) return { type: null, scope: null, breaking: false, text: subject };
  return { type: m[1].toLowerCase(), scope: m[2] || null, breaking: Boolean(m[3]), text: m[4] };
}

const PAST = { add: 'Added', fix: 'Fixed', implement: 'Implemented', improve: 'Improved', update: 'Updated', remove: 'Removed', change: 'Changed', support: 'Added support for', introduce: 'Introduced', create: 'Created', allow: 'Allowed', enable: 'Enabled', disable: 'Disabled', patch: 'Fixed', resolve: 'Resolved', optimize: 'Optimized', optimise: 'Optimised', speed: 'Sped', rename: 'Renamed', drop: 'Removed', delete: 'Removed', deprecate: 'Deprecated', show: 'Showed', hide: 'Hid', prevent: 'Prevented', handle: 'Handled', correct: 'Corrected', upgrade: 'Upgraded', make: 'Made', use: 'Used' };

function sentence(text) {
  let t = text.trim().replace(/\.$/, '');
  const m = t.match(/^(\w+)(\b.*)$/s);
  if (m && PAST[m[1].toLowerCase()]) t = PAST[m[1].toLowerCase()] + m[2];
  return t.charAt(0).toUpperCase() + t.slice(1) + '.';
}

function mermaidId(s, i) {
  return `n${i}_${s.replace(/[^A-Za-z0-9]/g, '_').slice(0, 24)}`;
}

function mermaidLabel(s) {
  return s.replace(/["`<>{}[\]()|#;]/g, ' ').replace(/\s+/g, ' ').trim() || 'root';
}

function areaDiagram(changes) {
  const areas = groupByArea(changes.files).slice(0, 12);
  const lines = ['```mermaid', 'flowchart LR', `  repo["${mermaidLabel(changes.repoName)}"]`];
  areas.forEach(([area, files], i) => {
    const added = files.filter((f) => f.status === 'added').length;
    const deleted = files.filter((f) => f.status === 'deleted').length;
    const suffix = added === files.length ? ' - new' : deleted === files.length ? ' - removed' : ' - changed';
    const id = mermaidId(area, i);
    lines.push(`  ${id}["${mermaidLabel(area)}: ${files.length} file${files.length === 1 ? '' : 's'}${suffix}"]`);
    lines.push(`  repo --> ${id}`);
  });
  const rest = groupByArea(changes.files).length - areas.length;
  if (rest > 0) lines.push(`  more["${rest} more areas"]`, '  repo --> more');
  lines.push('```');
  return lines.join('\n');
}

function filesTable(changes) {
  const rows = ['| File | Status | +/- |', '|------|--------|-----|'];
  const generated = changes.files.filter((f) => f.generated);
  for (const f of changes.files) {
    if (f.generated) continue;
    const from = f.status === 'renamed' ? ` (from \`${f.oldPath}\`)` : '';
    rows.push(`| \`${f.path}\`${from} | ${f.status} | +${f.additions} -${f.deletions} |`);
  }
  if (generated.length) {
    const a = generated.reduce((n, f) => n + f.additions, 0);
    const d = generated.reduce((n, f) => n + f.deletions, 0);
    rows.push(`| ${generated.map((f) => `\`${f.path}\``).join(', ')} | generated / lockfiles | +${a} -${d} |`);
  }
  return rows.join('\n');
}

function findingsTable(findings, severities) {
  const list = findings.filter((f) => severities.includes(f.severity));
  if (!list.length) return 'None found.';
  const rows = ['| ID | Severity | Finding | Location |', '|----|----------|---------|----------|'];
  for (const f of list) rows.push(`| ${f.id} | ${f.severity} | ${f.title} | \`${loc(f)}\` |`);
  return rows.join('\n');
}

/** Groups findings with the same rule into a single issue entry listing every location. */
function groupedIssues(findings, prefix) {
  const groups = new Map();
  for (const f of findings) {
    if (!groups.has(f.ruleId)) groups.set(f.ruleId, []);
    groups.get(f.ruleId).push(f);
  }
  const out = [];
  let n = 0;
  for (const list of groups.values()) {
    const first = list[0];
    n++;
    const locations = list.slice(0, 15).map((f) => `\`${loc(f)}\``).join(', ') + (list.length > 15 ? `, and ${list.length - 15} more` : '');
    const evidence = list.find((f) => f.excerpt)?.excerpt;
    out.push(
      [
        `### ${prefix}${n}. ${first.title.replace(/: [A-Z0-9_]+$/, '')}`,
        `- Location: ${locations}`,
        `- Category: ${first.category}`,
        '- Confidence: Medium (regex match, confirm manually)',
        evidence ? `- Evidence: \`${evidence.replace(/`/g, "'")}\`` : null,
        `- What goes wrong: ${first.description}`,
        `- Fix: ${first.fix || 'Review and correct.'}`,
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }
  return out;
}

export function explainOffline(changes, findings, file = null) {
  if (file) {
    const f = changes.files.find((x) => x.path === file);
    const hunks = f.hunks.map((h) => `- Lines ${h.newStart}-${h.newStart + Math.max(0, h.newLines - 1)}${h.section ? ` in \`${h.section}\`` : ''}: +${h.lines.filter((l) => l.type === 'add').length} -${h.lines.filter((l) => l.type === 'del').length}`);
    const own = findings.filter((x) => x.file === file && x.severity !== 'info');
    return [
      OFFLINE_BANNER,
      '',
      `## ${file}`,
      '',
      `${verb(f.status)} file, +${f.additions} -${f.deletions}${f.status === 'renamed' ? `, renamed from \`${f.oldPath}\`` : ''}.`,
      '',
      '### Hunks',
      hunks.length ? hunks.join('\n') : 'No content hunks (binary, generated, or mode change only).',
      '',
      '### Scanner findings in this file',
      findingsTable(own, ['critical', 'important', 'minor']),
      '',
    ].join('\n');
  }

  const k = classify(changes.files);
  const areas = groupByArea(changes.files)
    .map(([area, files]) => `- **${area}**: ${files.length} file${files.length === 1 ? '' : 's'} (+${files.reduce((n, f) => n + f.additions, 0)} -${files.reduce((n, f) => n + f.deletions, 0)}). ${files.slice(0, 6).map((f) => `${statusLetter(f.status)} \`${f.path}\``).join(', ')}${files.length > 6 ? ', ...' : ''}`)
    .join('\n');
  const counts = countBySeverity(findings);
  const notes = [
    k.tests.length ? `${k.tests.length} test file(s) changed.` : 'No test files changed.',
    k.migrations.length ? `Database migration or schema files changed: ${k.migrations.map((f) => `\`${f.path}\``).join(', ')}.` : null,
    k.deps.length ? `Dependency manifests changed: ${k.deps.map((f) => `\`${f.path}\``).join(', ')}.` : null,
    k.ci.length ? `CI configuration changed: ${k.ci.map((f) => `\`${f.path}\``).join(', ')}.` : null,
  ].filter(Boolean);

  return [
    OFFLINE_BANNER,
    '',
    '## Summary',
    `${describeStats(changes)} on \`${changes.branch}\`, compared against ${changes.baseLabel}.`,
    '',
    changes.commits.length ? `## Commits\n${changes.commits.map((c) => `- ${c.hash} ${c.subject}`).join('\n')}\n` : null,
    '## What changed, by area',
    areas,
    '',
    '## Notable',
    notes.map((n) => `- ${n}`).join('\n'),
    '',
    '## Scanner overview',
    `Critical ${counts.critical}, Important ${counts.important}, Minor ${counts.minor}, Info ${counts.info}. See the Warnings tab or \`wlu scan\` for details.`,
    '',
  ]
    .filter((x) => x !== null)
    .join('\n');
}

export function warningsOffline(changes, findings) {
  const counts = countBySeverity(findings);
  const verdict = counts.critical ? 'Block merge: the regex scanner found critical findings.' : counts.important ? 'Merge after fixes: the regex scanner found important findings.' : 'Safe to merge as far as the regex scanner can tell.';
  const env = envVars(findings);
  return [
    OFFLINE_BANNER,
    '',
    '## Verdict',
    verdict,
    '',
    '## Critical',
    findingsTable(findings, ['critical']),
    '',
    '## Important',
    findingsTable(findings, ['important']),
    '',
    '## Minor',
    findingsTable(findings, ['minor']),
    '',
    '## Environment variables',
    env.size ? ['| Name | Read at |', '|------|---------|', ...[...env].map(([name, locs]) => `| \`${name}\` | ${locs.slice(0, 5).map((l) => `\`${l}\``).join(', ')} |`)].join('\n') : 'No new environment variable references.',
    '',
  ].join('\n');
}

export function internalPrOffline(changes, findings) {
  const parsed = changes.commits.map((c) => parseCommit(c.subject));
  const typeCounts = new Map();
  for (const p of parsed) if (p.type) typeCounts.set(p.type, (typeCounts.get(p.type) || 0) + 1);
  const topType = [...typeCounts].sort((a, b) => b[1] - a[1])[0]?.[0] || 'chore';
  const firstText = parsed.find((p) => p.type === topType)?.text || parsed[0]?.text;
  const areas = groupByArea(changes.files);
  const title = firstText ? `${topType}: ${firstText}` : `${topType}: update ${areas.slice(0, 2).map(([a]) => a).join(' and ')}`;
  const k = classify(changes.files);
  const env = envVars(findings);
  const serious = findings.filter((f) => f.severity === 'critical' || f.severity === 'important');

  const changesSection = areas
    .map(([area, files]) => `### ${area}\n${files.map((f) => `- ${verb(f.status)} \`${f.path}\` (+${f.additions} -${f.deletions})`).join('\n')}`)
    .join('\n\n');

  const checklist = [
    ...serious.slice(0, 6).map((f) => `- [ ] Resolve ${f.id}: ${f.title} at \`${loc(f)}\``),
    env.size ? `- [ ] Confirm these environment variables exist in every environment: ${[...env.keys()].map((n) => `\`${n}\``).join(', ')}` : null,
    k.migrations.length ? '- [ ] Review migrations for locking, backward compatibility and rollback' : null,
    k.deps.length ? '- [ ] Review added or changed dependencies and the lockfile' : null,
    !k.tests.length ? '- [ ] Decide whether this change needs tests (none were changed)' : null,
  ].filter(Boolean);

  return [
    `# ${title.slice(0, 72)}`,
    '',
    OFFLINE_BANNER,
    '',
    '## Summary',
    `${describeStats(changes)} across ${areas.length} area${areas.length === 1 ? '' : 's'}: ${areas.map(([a]) => a).join(', ')}.`,
    '',
    changes.commits.length ? `## Commits\n${changes.commits.map((c) => `- ${c.hash} ${c.subject}`).join('\n')}\n` : null,
    '## Changes',
    changesSection,
    '',
    '## Architecture',
    areaDiagram(changes),
    '',
    'Areas of the repository touched by this change and how many files changed in each.',
    '',
    '## Files changed',
    filesTable(changes),
    '',
    '## Code analysis',
    '### Security and quality findings (regex scanner)',
    findingsTable(findings, ['critical', 'important', 'minor']),
    '',
    '## Testing',
    k.tests.length ? k.tests.map((f) => `- ${verb(f.status)} \`${f.path}\``).join('\n') : 'No tests were added or changed.',
    '',
    '## Deployment notes',
    [
      env.size ? `- Environment variables referenced: ${[...env.keys()].map((n) => `\`${n}\``).join(', ')}` : null,
      k.migrations.length ? `- Migrations / schema: ${k.migrations.map((f) => `\`${f.path}\``).join(', ')}` : null,
      k.deps.length ? `- Dependency manifests changed: ${k.deps.map((f) => `\`${f.path}\``).join(', ')}` : null,
      k.ci.length ? `- CI changed: ${k.ci.map((f) => `\`${f.path}\``).join(', ')}` : null,
    ]
      .filter(Boolean)
      .join('\n') || 'No special deployment steps detected.',
    '',
    '## Reviewer checklist',
    checklist.length ? checklist.join('\n') : '- [ ] Read through the changes in each area listed above',
    '',
  ]
    .filter((x) => x !== null)
    .join('\n');
}

export function clientReleaseOffline(changes) {
  const buckets = { New: [], Improvements: [], Fixes: [], 'Changes and removals': [] };
  for (const c of changes.commits) {
    const p = parseCommit(c.subject);
    if (['test', 'ci', 'build', 'chore', 'docs', 'style', 'refactor'].includes(p.type)) continue;
    if (/^merge\b/i.test(c.subject)) continue;
    const text = sentence(p.text);
    if (p.breaking || p.type === 'revert') buckets['Changes and removals'].push(text);
    else if (p.type === 'feat') buckets.New.push(text);
    else if (p.type === 'fix' || /^(fix|fixed|patch|resolve|correct)/i.test(p.text)) buckets.Fixes.push(text);
    else if (p.type === 'perf' || /^(improve|optimi[sz]e|speed|faster|update)/i.test(p.text)) buckets.Improvements.push(text);
    else if (/^(add|added|implement|introduce|create|new)/i.test(p.text)) buckets.New.push(text);
    else if (/^(remove|drop|delete|deprecate)/i.test(p.text)) buckets['Changes and removals'].push(text);
    else buckets.Improvements.push(text);
  }
  const sections = Object.entries(buckets).filter(([, v]) => v.length);
  if (!sections.length) {
    return [
      '## Release notes',
      '',
      'Maintenance release with internal improvements. No user-facing changes.',
      '',
      OFFLINE_BANNER,
      changes.commits.length ? '' : '> Release notes are built from commit messages. Compare against a base branch (for example `--base main`) so commits are available.',
      '',
    ].join('\n');
  }
  const all = sections.flatMap(([, v]) => v);
  const short = all.slice(0, 2).map((s) => s.replace(/\.$/, '')).join('; ');
  return [
    '## Release notes',
    '',
    ...sections.flatMap(([name, items]) => [`### ${name}`, ...items.map((i) => `- ${i}`), '']),
    '---',
    '',
    `**Short version:** ${short.length > 140 ? `${short.slice(0, 137)}...` : short}`,
    '',
    OFFLINE_BANNER,
    '',
  ].join('\n');
}

export function issuesOffline(changes, findings) {
  const by = (sev) => findings.filter((f) => f.severity === sev && f.ruleId !== 'env-var-reference');
  const critical = groupedIssues(by('critical'), 'C');
  const important = groupedIssues(by('important'), 'I');
  const minor = groupedIssues(by('minor'), 'M');
  const k = classify(changes.files);
  const future = groupedIssues(by('info'), 'F');
  if (!k.tests.length && changes.files.some((f) => !f.generated && !DOC_RE.test(f.path))) {
    future.push(`### F${future.length + 1}. Add tests for the changes in this change set\n- Location: ${changes.files.filter((f) => !f.generated).slice(0, 5).map((f) => `\`${f.path}\``).join(', ')}\n- Type: Testing\n- Problem: Code changed but no test files were added or modified.\n- Proposed approach: Cover the new or changed behavior with unit tests, plus an integration test for any new endpoint or job.\n- Acceptance criteria:\n  - [ ] New behavior has at least one test\n  - [ ] Tests run in CI`);
  }
  const rec = critical.length ? 'Block' : important.length ? 'Merge after fixing Critical and Important issues' : 'Merge';
  const ids = [...critical, ...important].map((s) => s.match(/^### (\w+)\./)[1]);
  const block = (list) => (list.length ? list.join('\n\n') : 'None found.');
  return [
    OFFLINE_BANNER,
    '> The offline report only contains what regular expressions can detect. Logic errors, race conditions and production-scale risks need the AI review.',
    '',
    '## Overview',
    '| Severity | Count |',
    '|----------|-------|',
    `| Critical | ${critical.length} |`,
    `| Important | ${important.length} |`,
    `| Minor | ${minor.length} |`,
    `| Sub-issues for future PRs | ${future.length} |`,
    '',
    `**Merge recommendation:** ${rec}.`,
    '',
    `**Fix order:** ${ids.length ? ids.join(', ') : 'Nothing blocking.'}`,
    '',
    '## Critical',
    block(critical),
    '',
    '## Important',
    block(important),
    '',
    '## Minor',
    block(minor),
    '',
    '## Sub-issues for future PRs',
    block(future),
    '',
  ].join('\n');
}

export function runOffline(kind, { changes, findings, file }) {
  switch (kind) {
    case 'explain':
      return explainOffline(changes, findings);
    case 'explain-file':
      return explainOffline(changes, findings, file);
    case 'warnings':
      return warningsOffline(changes, findings);
    case 'internal':
      return internalPrOffline(changes, findings);
    case 'client':
      return clientReleaseOffline(changes);
    case 'issues':
      return issuesOffline(changes, findings);
    default:
      throw new Error(`Unknown task: ${kind}`);
  }
}
