import { renderMarkdown } from './markdown.js';

const SEVERITIES = ['critical', 'important', 'minor', 'info'];
const STATUS = { added: 'A', modified: 'M', deleted: 'D', renamed: 'R', copied: 'C' };
const AUTO_COLLAPSE_LINES = 600;
const MERMAID_URL = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';

const PANELS = {
  explain: { title: 'Explain the change', description: 'A walkthrough of what changed, why, how data flows through it, and where to look first.', button: 'Explain entire change' },
  warnings: { title: 'Warning analysis', description: 'Reviews every scanner finding (confirmed or false positive) and looks for what regexes cannot see: auth gaps, injection, unsafe dependencies, leaked secrets in logs.', button: 'Run warning analysis' },
  internal: { title: 'Internal Dev Description', description: 'Pull request description for engineers: summary, changes by area, Mermaid architecture diagrams, files table, code analysis, testing, deployment notes and reviewer checklist. Ready to paste.', button: 'Generate PR description' },
  client: { title: 'Client Release', description: 'Short, non-technical release notes for clients: what was added, improved and fixed.', button: 'Generate release notes' },
  issues: { title: 'Issues and Suggestions', description: 'Deep production review: unbounded memory, scaling and concurrency bugs, security, lint, any types and logic errors, ranked Critical, Important, Minor and Sub-issues for future PRs.', button: 'Run deep review' },
};

const state = {
  mode: 'worktree',
  base: '',
  data: null,
  tab: 'changes',
  outputs: {},
  busy: {},
  rawView: {},
  collapsed: new Set(),
  expanded: new Set(),
  filter: '',
  prompts: null,
  activePrompt: 'issues',
  promptDraft: {},
};

/* ---------- helpers ---------- */

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v === null || v === undefined) continue;
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v; // only used with renderMarkdown output, which is escaped
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

const $ = (sel) => document.querySelector(sel);

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), 2200);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = h('textarea', { style: 'position:fixed;opacity:0' }, text);
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast('Copied to clipboard');
}

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function compareQuery() {
  const p = new URLSearchParams({ mode: state.mode });
  if (state.mode === 'base') p.set('base', state.base);
  return p;
}

async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: { 'content-type': 'application/json', ...(opts.headers || {}) } });
  const type = res.headers.get('content-type') || '';
  const body = type.includes('json') ? await res.json() : await res.text();
  if (!res.ok) throw new Error((body && body.error) || `Request failed (${res.status})`);
  return body;
}

const loc = (f) => (f.line ? `${f.file}:${f.line}` : f.file);

function worstSeverity(list) {
  for (const s of SEVERITIES) if (list.some((f) => f.severity === s)) return s;
  return null;
}

function findingsByFile() {
  const map = new Map();
  for (const f of state.data?.findings || []) {
    if (!map.has(f.file)) map.set(f.file, []);
    map.get(f.file).push(f);
  }
  return map;
}

/* ---------- data ---------- */

async function loadState() {
  $('#view').replaceChildren(h('div', { class: 'loading' }, h('span', { class: 'spinner' }), 'Reading repository...'));
  try {
    state.data = await api(`/api/state?${compareQuery()}`);
  } catch (err) {
    state.data = null;
    $('#view').replaceChildren(h('div', { class: 'error' }, err.message));
    return;
  }
  renderHeader();
  renderSidebar();
  render();
}

async function loadRefs() {
  try {
    const { refs } = await api('/api/refs');
    $('#refs').replaceChildren(...refs.map((r) => h('option', { value: r })));
  } catch {
    /* refs are optional */
  }
}

/* ---------- header and sidebar ---------- */

function renderHeader() {
  const { meta } = state.data;
  $('#repo-name').textContent = meta.repoName;
  $('#repo-meta').textContent = `${meta.branch}  |  ${meta.baseLabel}`;
  $('#repo-meta').title = meta.root;
  const ai = $('#ai-status');
  ai.textContent = meta.ai.enabled ? `Gemini: ${meta.ai.model}` : 'Offline mode';
  ai.title = meta.ai.enabled ? 'AI features use Gemini' : 'No GEMINI_API_KEY set. Every feature works locally with deterministic output.';
  ai.classList.toggle('on', meta.ai.enabled);
  const counts = countSev(state.data.findings);
  const wc = $('#warn-count');
  const serious = counts.critical + counts.important + counts.minor;
  wc.textContent = serious || '';
  wc.className = `count${counts.critical ? ' critical' : ''}`;
  wc.hidden = !serious;
  document.title = `${meta.repoName} - work_load_understand`;
}

function countSev(findings) {
  const c = { critical: 0, important: 0, minor: 0, info: 0 };
  for (const f of findings) c[f.severity]++;
  return c;
}

function renderSidebar() {
  const { meta, files, findings } = state.data;
  const counts = countSev(findings);
  $('#summary').replaceChildren(
    h('div', {}, `${meta.stats.files} file${meta.stats.files === 1 ? '' : 's'} changed`),
    h('div', { class: 'stats' }, h('span', { class: 'add' }, `+${meta.stats.additions}`), h('span', { class: 'del' }, `-${meta.stats.deletions}`), meta.commits.length ? h('span', { class: 'muted' }, `${meta.commits.length} commit${meta.commits.length === 1 ? '' : 's'}`) : null),
    h('div', { class: 'sev' }, SEVERITIES.filter((s) => counts[s]).map((s) => h('span', { class: `chip ${s}` }, `${counts[s]} ${s}`))),
  );
  const byFile = findingsByFile();
  const q = state.filter.toLowerCase();
  const list = files.filter((f) => !q || f.path.toLowerCase().includes(q));
  $('#file-list').replaceChildren(
    ...list.map((f) => {
      const sev = worstSeverity((byFile.get(f.path) || []).filter((x) => x.severity !== 'info'));
      const st = STATUS[f.status] || 'M';
      return h(
        'li',
        { title: f.path, onclick: () => goToFile(f.path) },
        h('span', { class: `st st-${st}` }, st),
        h('span', { class: 'path' }, h('bdi', {}, f.path)),
        h('span', { class: 'nums' }, sev ? h('span', { class: `dot ${sev}`, title: `${sev} findings` }) : null, h('span', { class: 'add' }, `+${f.additions}`), h('span', { class: 'del' }, `-${f.deletions}`)),
      );
    }),
  );
}

function goToFile(path, line = null) {
  state.collapsed.delete(path);
  state.expanded.add(path);
  if (state.tab !== 'changes') setTab('changes');
  else render();
  requestAnimationFrame(() => {
    const card = document.querySelector(`.file-card[data-path="${CSS.escape(path)}"]`);
    if (!card) return;
    let target = card;
    if (line) {
      const row = card.querySelector(`tr[data-new="${line}"]`);
      if (row) {
        row.classList.add('highlight');
        setTimeout(() => row.classList.remove('highlight'), 2500);
        target = row;
      }
    }
    target.scrollIntoView({ block: line ? 'center' : 'start' });
  });
}

/* ---------- tabs ---------- */

function setTab(tab) {
  state.tab = tab;
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  render();
  $('#view').scrollTop = 0;
}

function render() {
  if (!state.data) return;
  const view = $('#view');
  const renderers = { changes: renderChanges, warnings: renderWarnings, internal: () => renderGeneratorTab('internal'), client: () => renderGeneratorTab('client'), issues: () => renderGeneratorTab('issues'), prompts: renderPrompts };
  view.replaceChildren(...[].concat(renderers[state.tab]()));
  hydrateMermaid(view);
}

function offlineNotice() {
  if (state.data.meta.ai.enabled) return null;
  return h('div', { class: 'notice' }, 'Offline mode: no GEMINI_API_KEY is set, so reports are generated locally from the diff, commit messages and the regex scanner. Add a key to the .env file in the work_load_understand folder for full AI analysis.');
}

/* ---------- output panel (shared by every generator) ---------- */

function outputKey(kind, file) {
  return file ? `${kind}:${file}` : kind;
}

async function generate(kind, file = null) {
  const key = outputKey(kind, file);
  state.busy[key] = Date.now();
  render();
  const tick = setInterval(() => {
    const el = document.querySelector(`[data-elapsed="${CSS.escape(key)}"]`);
    if (el) el.textContent = `${Math.round((Date.now() - state.busy[key]) / 1000)}s`;
  }, 1000);
  try {
    const body = { kind, file, mode: state.mode, base: state.base };
    state.outputs[key] = { ...(await api('/api/generate', { method: 'POST', body: JSON.stringify(body) })), at: new Date() };
  } catch (err) {
    state.outputs[key] = { error: err.message, at: new Date() };
  } finally {
    clearInterval(tick);
    delete state.busy[key];
    render();
  }
}

function outputPanel(kind, file = null) {
  const key = outputKey(kind, file);
  const out = state.outputs[key];
  const busy = state.busy[key];
  const label = file ? 'Explain this file' : PANELS[kind].button;

  if (busy) {
    return h('div', { class: 'output' }, h('div', { class: 'loading' }, h('span', { class: 'spinner' }), `Generating with ${state.data.meta.ai.enabled ? state.data.meta.ai.model : 'offline mode'}`, h('span', { class: 'mono', dataset: { elapsed: key } }, '0s')));
  }
  if (!out) {
    return h('div', {}, h('button', { class: 'btn primary', onclick: () => generate(kind, file), disabled: !state.data.files.length }, label));
  }
  if (out.error) {
    return h('div', {}, h('div', { class: 'error' }, out.error), h('p', {}, h('button', { class: 'btn', onclick: () => generate(kind, file) }, 'Try again')));
  }

  const raw = Boolean(state.rawView[key]);
  const name = `${state.data.meta.repoName}-${file ? file.replace(/[^\w.-]+/g, '_') : kind}.md`;
  const bar = h(
    'div',
    { class: 'output-bar' },
    h('span', { class: 'meta' }, `${out.offline ? 'Offline' : out.model} | ${(out.elapsedMs / 1000).toFixed(1)}s | ${out.at.toLocaleTimeString()}`),
    h('button', { class: `btn small${raw ? '' : ' active'}`, onclick: () => ((state.rawView[key] = false), render()) }, 'Preview'),
    h('button', { class: `btn small${raw ? ' active' : ''}`, onclick: () => ((state.rawView[key] = true), render()) }, 'Markdown'),
    h('button', { class: 'btn small', onclick: () => copyText(currentMarkdown(key)) }, 'Copy markdown'),
    h('button', { class: 'btn small', onclick: () => download(name, currentMarkdown(key)) }, 'Download'),
    h('button', { class: 'btn small', onclick: () => generate(kind, file) }, 'Regenerate'),
  );
  const body = raw
    ? h('textarea', { class: 'output-raw', spellcheck: 'false', oninput: (e) => (out.markdown = e.target.value) }, out.markdown)
    : h('div', { class: 'output-body md', html: renderMarkdown(out.markdown) });
  return h('div', { class: 'output' }, bar, body);
}

function currentMarkdown(key) {
  return state.outputs[key]?.markdown || '';
}

function renderGeneratorTab(kind) {
  const p = PANELS[kind];
  return [h('div', { class: 'view-head' }, h('div', {}, h('h2', {}, p.title), h('p', {}, p.description))), offlineNotice(), outputPanel(kind)];
}

/* ---------- changes tab ---------- */

function renderChanges() {
  const { files } = state.data;
  if (!files.length) return h('div', { class: 'empty' }, `No changes found (${state.data.meta.baseLabel}).`);
  const byFile = findingsByFile();
  const head = h('div', { class: 'view-head' }, h('div', {}, h('h2', {}, 'Changes'), h('p', {}, 'Every changed file. Lines flagged by the scanner are marked; click a file name to collapse it.')), h('div', {}, h('button', { class: 'btn', onclick: () => toggleAll(true) }, 'Collapse all'), ' ', h('button', { class: 'btn', onclick: () => toggleAll(false) }, 'Expand all')));
  const explain = h('div', { class: 'file-card' }, h('div', { class: 'file-head' }, h('span', { class: 'path', style: 'font-family:var(--sans)' }, PANELS.explain.title)), h('div', { class: 'file-explain', style: 'padding-top:12px' }, outputPanel('explain')));
  return [head, offlineNotice(), explain, ...files.map((f) => fileCard(f, byFile.get(f.path) || []))];
}

function toggleAll(collapse) {
  for (const f of state.data.files) {
    if (collapse) {
      state.collapsed.add(f.path);
      state.expanded.delete(f.path);
    } else {
      state.collapsed.delete(f.path);
      state.expanded.add(f.path);
    }
  }
  render();
}

function isCollapsed(f) {
  if (state.collapsed.has(f.path)) return true;
  if (state.expanded.has(f.path)) return false;
  return f.generated || f.additions + f.deletions > AUTO_COLLAPSE_LINES;
}

function fileCard(f, findings) {
  const collapsed = isCollapsed(f);
  const st = STATUS[f.status] || 'M';
  const visible = findings.filter((x) => x.severity !== 'info');
  const sev = worstSeverity(visible);
  const toggle = () => {
    if (collapsed) {
      state.collapsed.delete(f.path);
      state.expanded.add(f.path);
    } else {
      state.collapsed.add(f.path);
      state.expanded.delete(f.path);
    }
    render();
  };
  const head = h(
    'div',
    { class: 'file-head' },
    h('span', { class: `st st-${st}` }, st),
    h('span', { class: 'path', onclick: toggle, title: f.status === 'renamed' ? `${f.oldPath} -> ${f.path}` : f.path }, f.status === 'renamed' ? `${f.oldPath} -> ${f.path}` : f.path),
    sev ? h('span', { class: `chip ${sev}` }, `${visible.length} finding${visible.length === 1 ? '' : 's'}`) : null,
    f.generated ? h('span', { class: 'chip info' }, 'generated') : null,
    f.untracked ? h('span', { class: 'chip info' }, 'untracked') : null,
    h('span', { class: 'nums' }, h('span', { class: 'add' }, `+${f.additions}`), ' ', h('span', { class: 'del' }, `-${f.deletions}`)),
    f.hunks.length ? h('button', { class: 'btn small', onclick: () => (state.collapsed.delete(f.path), state.expanded.add(f.path), generate('explain-file', f.path)) }, 'Explain file') : null,
    h('button', { class: 'btn small', onclick: toggle }, collapsed ? 'Show' : 'Hide'),
  );
  const card = h('div', { class: `file-card${collapsed ? ' collapsed' : ''}`, dataset: { path: f.path } }, head);
  if (collapsed) return card;

  const key = outputKey('explain-file', f.path);
  if (state.outputs[key] || state.busy[key]) card.append(h('div', { class: 'file-explain' }, outputPanel('explain-file', f.path)));

  if (f.tooLarge) card.append(h('div', { class: 'file-msg' }, 'Untracked file larger than 2 MB. Content not shown.'));
  else if (f.binary) card.append(h('div', { class: 'file-msg' }, 'Binary file.'));
  else if (!f.hunks.length) card.append(h('div', { class: 'file-msg' }, f.modeChange ? `Mode changed ${f.modeChange}.` : 'No content changes.'));
  else card.append(diffTable(f, findings));
  return card;
}

function diffTable(f, findings) {
  const byLine = new Map();
  for (const x of findings) {
    if (!x.line || x.severity === 'info') continue;
    if (!byLine.has(x.line)) byLine.set(x.line, []);
    byLine.get(x.line).push(x);
  }
  const tbody = document.createElement('tbody');
  for (const hunk of f.hunks) {
    tbody.append(h('tr', { class: 'hunk' }, h('td', { colspan: 4 }, hunk.header)));
    for (const ln of hunk.lines) {
      if (ln.type === 'meta') {
        tbody.append(h('tr', { class: 'meta' }, h('td', { class: 'ln' }), h('td', { class: 'ln' }), h('td', { class: 'sign' }), h('td', { class: 'code' }, ln.content)));
        continue;
      }
      const flags = ln.type === 'add' ? byLine.get(ln.newNo) : null;
      const sev = flags ? worstSeverity(flags) : null;
      const sign = ln.type === 'add' ? '+' : ln.type === 'del' ? '-' : ' ';
      tbody.append(
        h(
          'tr',
          { class: `${ln.type}${sev ? ` flag ${sev}` : ''}`, dataset: ln.newNo ? { new: ln.newNo } : {} },
          h('td', { class: 'ln' }, ln.oldNo ?? ''),
          h('td', { class: 'ln' }, ln.newNo ?? ''),
          h('td', { class: 'sign' }, sign),
          h('td', { class: 'code' }, ln.content),
        ),
      );
      if (flags) {
        tbody.append(
          h('tr', { class: 'note' }, h('td', { colspan: 4 }, flags.map((x) => h('div', {}, h('span', { class: `chip ${x.severity}` }, x.severity), ' ', h('strong', {}, x.title), h('span', { class: 'muted' }, ` - ${x.fix || x.description}`))))),
        );
      }
    }
  }
  return h('table', { class: 'diff' }, tbody);
}

/* ---------- warnings tab ---------- */

function renderWarnings() {
  const { findings } = state.data;
  const head = h('div', { class: 'view-head' }, h('div', {}, h('h2', {}, 'Warnings'), h('p', {}, 'Local regex scanner over the added lines: API keys (Claude, OpenAI, Gemini, Stripe, AWS, GitHub and more), committed .env files, hashes, any types, swallowed errors, unbounded module-level caches, SQL injection, focused tests and more. Runs offline; secrets are masked before anything is displayed or sent.')));
  const groups = SEVERITIES.map((sev) => {
    const list = findings.filter((f) => f.severity === sev);
    if (!list.length) return null;
    return h(
      'div',
      { class: 'sev-group' },
      h('h3', {}, h('span', { class: `chip ${sev}` }, sev), `${list.length} finding${list.length === 1 ? '' : 's'}`),
      list.map((f) =>
        h(
          'div',
          { class: 'finding' },
          h('span', { class: 'fid' }, f.id),
          h('span', { class: 'title' }, f.title),
          h('span', { class: 'loc', onclick: () => goToFile(f.file, f.line) }, loc(f)),
          f.excerpt ? h('pre', {}, f.excerpt) : null,
          h('span', { class: 'desc' }, f.description),
          f.fix ? h('span', { class: 'fix' }, h('strong', {}, 'Fix: '), f.fix) : null,
        ),
      ),
    );
  });
  const local = findings.length ? groups : h('div', { class: 'empty' }, 'The local scanner found nothing in the added lines.');
  return [head, local, h('div', { class: 'view-head', style: 'margin-top:26px' }, h('div', {}, h('h2', {}, PANELS.warnings.title), h('p', {}, PANELS.warnings.description))), offlineNotice(), outputPanel('warnings')];
}

/* ---------- prompts tab ---------- */

async function loadPrompts() {
  state.prompts = await api('/api/prompts');
}

function renderPrompts() {
  if (!state.prompts) {
    loadPrompts().then(render, (err) => $('#view').replaceChildren(h('div', { class: 'error' }, err.message)));
    return h('div', { class: 'loading' }, h('span', { class: 'spinner' }), 'Loading prompts...');
  }
  const { prompts, placeholders, dir } = state.prompts;
  const active = prompts.find((p) => p.name === state.activePrompt) || prompts[0];
  const draft = state.promptDraft[active.name] ?? active.content;
  const dirty = draft !== active.content;

  const list = h(
    'ul',
    { class: 'prompt-list' },
    prompts.map((p) =>
      h(
        'li',
        { class: p.name === active.name ? 'active' : '', onclick: () => ((state.activePrompt = p.name), render()) },
        h('div', { class: 'name' }, p.title, p.isCustom ? h('span', { class: 'badge' }, 'CUSTOM') : null, state.promptDraft[p.name] !== undefined && state.promptDraft[p.name] !== p.content ? h('span', { class: 'badge' }, 'UNSAVED') : null),
        h('div', { class: 'desc' }, p.description),
      ),
    ),
  );

  const textarea = h('textarea', {
    spellcheck: 'false',
    oninput: (e) => {
      state.promptDraft[active.name] = e.target.value;
      status.textContent = e.target.value !== active.content ? 'Unsaved changes' : '';
    },
    onkeydown: (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        save();
      }
    },
  });
  textarea.value = draft;
  const status = h('span', { class: 'status' }, dirty ? 'Unsaved changes' : active.isCustom ? `Custom prompt: ${active.path}` : `Default prompt (saving creates a copy in ${dir})`);

  async function save() {
    try {
      await api(`/api/prompts/${active.name}`, { method: 'PUT', body: JSON.stringify({ content: textarea.value }) });
      delete state.promptDraft[active.name];
      await loadPrompts();
      toast('Prompt saved');
      render();
    } catch (err) {
      toast(err.message);
    }
  }
  async function reset() {
    if (!confirm(`Reset "${active.title}" to the default prompt? Your customized version will be deleted.`)) return;
    await api(`/api/prompts/${active.name}`, { method: 'DELETE' });
    delete state.promptDraft[active.name];
    await loadPrompts();
    toast('Prompt reset to default');
    render();
  }
  const insert = (key) => {
    const token = `{{${key}}}`;
    const { selectionStart: s, selectionEnd: e } = textarea;
    textarea.setRangeText(token, s, e, 'end');
    textarea.focus();
    textarea.dispatchEvent(new Event('input'));
  };

  const editor = h(
    'div',
    { class: 'prompt-editor' },
    h('div', { class: 'view-head' }, h('div', {}, h('h2', {}, active.title), h('p', {}, active.description))),
    h('div', { class: 'placeholders' }, h('span', { class: 'muted', style: 'font-size:12px;align-self:center' }, 'Insert:'), placeholders.map((p) => h('button', { title: p.description, onclick: () => insert(p.key) }, `{{${p.key}}}`))),
    textarea,
    h(
      'div',
      { class: 'editor-bar' },
      h('button', { class: 'btn primary', onclick: save }, 'Save'),
      h('button', { class: 'btn', onclick: () => ((textarea.value = active.content), delete state.promptDraft[active.name], render()) }, 'Discard changes'),
      h('button', { class: 'btn', onclick: reset, disabled: !active.isCustom }, 'Reset to default'),
      status,
    ),
  );
  return [
    h('div', { class: 'notice' }, 'Prompts are templates. Placeholders such as {{DIFF}} are filled in before sending. The System rules prompt is sent with every request and enforces no emojis, grounded citations and valid Mermaid. Prompts only apply when a GEMINI_API_KEY is configured.'),
    h('div', { class: 'prompts' }, list, editor),
  ];
}

/* ---------- mermaid ---------- */

let mermaidPromise = null;
let mermaidSeq = 0;

function loadMermaid() {
  mermaidPromise ??= import(MERMAID_URL).then((m) => {
    m.default.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'dark', fontFamily: 'ui-sans-serif, system-ui, sans-serif' });
    return m.default;
  });
  return mermaidPromise;
}

async function hydrateMermaid(root) {
  const blocks = [...root.querySelectorAll('.mermaid-block:not([data-done])')];
  if (!blocks.length) return;
  let mermaid;
  try {
    mermaid = await loadMermaid();
  } catch {
    mermaidPromise = null;
    blocks.forEach((b) => b.prepend(h('div', { class: 'mermaid-error' }, 'Mermaid could not be loaded (offline?). Showing diagram source.')));
    return;
  }
  for (const block of blocks) {
    block.dataset.done = '1';
    const src = block.querySelector('.mermaid-src').textContent;
    try {
      const { svg } = await mermaid.render(`mmd-${++mermaidSeq}`, src);
      const holder = h('div', {});
      holder.innerHTML = svg; // produced by mermaid with securityLevel strict
      block.replaceChildren(holder, h('details', {}, h('summary', { class: 'muted', style: 'font-size:12px;cursor:pointer' }, 'Source'), h('pre', { class: 'mermaid-src' }, src)));
    } catch (err) {
      block.prepend(h('div', { class: 'mermaid-error' }, `Diagram has a syntax error: ${String(err.message || err).split('\n')[0]}`));
      document.getElementById(`dmmd-${mermaidSeq}`)?.remove();
    }
  }
}

/* ---------- boot ---------- */

function boot() {
  const params = new URLSearchParams(location.search);
  state.mode = ['worktree', 'staged', 'base'].includes(params.get('mode')) ? params.get('mode') : 'worktree';
  state.base = params.get('base') || '';
  const modeSel = $('#mode');
  const baseInput = $('#base');
  modeSel.value = state.mode;
  baseInput.value = state.base;
  baseInput.hidden = state.mode !== 'base';

  const applyCompare = () => {
    state.mode = modeSel.value;
    state.base = baseInput.value.trim();
    baseInput.hidden = state.mode !== 'base';
    if (state.mode === 'base' && !state.base) {
      baseInput.focus();
      return;
    }
    history.replaceState(null, '', `?${compareQuery()}`);
    state.outputs = {};
    state.collapsed.clear();
    state.expanded.clear();
    loadState();
  };
  modeSel.addEventListener('change', applyCompare);
  baseInput.addEventListener('keydown', (e) => e.key === 'Enter' && applyCompare());
  baseInput.addEventListener('change', applyCompare);
  $('#refresh').addEventListener('click', () => loadState());
  $('#filter').addEventListener('input', (e) => {
    state.filter = e.target.value;
    if (state.data) renderSidebar();
  });
  $('#tabs').addEventListener('click', (e) => {
    const b = e.target.closest('.tab');
    if (b) setTab(b.dataset.tab);
  });
  $('#copy-agent').addEventListener('click', async () => {
    try {
      copyText(await api(`/api/export?${compareQuery()}`));
    } catch (err) {
      toast(err.message);
    }
  });
  $('#download-agent').addEventListener('click', async () => {
    try {
      download(`${state.data?.meta.repoName || 'changes'}-changes.md`, await api(`/api/export?${compareQuery()}`));
    } catch (err) {
      toast(err.message);
    }
  });
  window.addEventListener('beforeunload', (e) => {
    if (Object.keys(state.busy).length) e.preventDefault();
  });

  loadRefs();
  loadState();
}

boot();
