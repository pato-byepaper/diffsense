// Small, safe Markdown renderer. All text is HTML-escaped first; only a fixed set of tags is produced.
// Mermaid fences become <pre class="mermaid-src"> blocks that app.js renders lazily.

export function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function safeUrl(u) {
  return /^(https?:\/\/|#|\/(?!\/)|\.\.?\/)/i.test(u) ? u : null;
}

export function inline(text) {
  const codes = [];
  let s = text.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (_, _t, code) => {
    codes.push(code.trim());
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = esc(s);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (whole, label, url) => {
    const u = safeUrl(url.replace(/&amp;/g, '&'));
    return u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${label}</a>` : label;
  });
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/__(.+?)__/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*\w])\*(?!\s)(.+?)(?<!\s)\*(?!\*)/g, '$1<em>$2</em>');
  s = s.replace(/(^|[^_\w])_(?!\s)(.+?)(?<!\s)_(?![_\w])/g, '$1<em>$2</em>');
  s = s.replace(/~~(.+?)~~/g, '<del>$1</del>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[Number(i)])}</code>`);
}

function slug(text) {
  return text.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
}

function splitRow(line) {
  let l = line.trim();
  if (l.startsWith('|')) l = l.slice(1);
  if (l.endsWith('|') && !l.endsWith('\\|')) l = l.slice(0, -1);
  const cells = [];
  let cur = '';
  let inCode = false;
  for (let i = 0; i < l.length; i++) {
    const ch = l[i];
    if (ch === '`') inCode = !inCode;
    if (ch === '\\' && l[i + 1] === '|') {
      cur += '|';
      i++;
    } else if (ch === '|' && !inCode) {
      cells.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})\s*([\w+#.-]*)/;
const HEADING_RE = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const HR_RE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;

function isBlockStart(line, next) {
  return FENCE_RE.test(line) || HEADING_RE.test(line) || HR_RE.test(line) || LIST_RE.test(line) || /^\s*>/.test(line) || (line.includes('|') && next !== undefined && TABLE_SEP.test(next));
}

function renderList(lines, start) {
  const first = lines[start].match(LIST_RE);
  const baseIndent = first[1].length;
  const ordered = /\d/.test(first[2]);
  const items = [];
  let i = start;
  while (i < lines.length) {
    const m = lines[i].match(LIST_RE);
    if (!m || m[1].length !== baseIndent || /\d/.test(m[2]) !== ordered) {
      if (m && m[1].length > baseIndent && items.length) {
        const sub = renderList(lines, i);
        items[items.length - 1].children += sub.html;
        i = sub.next;
        continue;
      }
      if (!m && lines[i].trim() && /^\s+/.test(lines[i]) && items.length) {
        items[items.length - 1].text += ` ${lines[i].trim()}`;
        i++;
        continue;
      }
      break;
    }
    items.push({ text: m[3], children: '' });
    i++;
  }
  const html = items
    .map(({ text, children }) => {
      const task = text.match(/^\[([ xX])\]\s+(.*)$/);
      const body = task ? `<input type="checkbox" disabled${task[1] !== ' ' ? ' checked' : ''}> ${inline(task[2])}` : inline(text);
      return `<li${task ? ' class="task"' : ''}>${body}${children}</li>`;
    })
    .join('');
  const startAttr = ordered && Number.parseInt(first[2], 10) !== 1 ? ` start="${Number.parseInt(first[2], 10)}"` : '';
  return { html: ordered ? `<ol${startAttr}>${html}</ol>` : `<ul>${html}</ul>`, next: i };
}

export function renderMarkdown(src) {
  const lines = String(src).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    const fence = line.match(FENCE_RE);
    if (fence) {
      const marker = fence[1];
      const lang = (fence[2] || '').toLowerCase();
      const buf = [];
      i++;
      while (i < lines.length && !new RegExp(`^\\s{0,3}${marker[0] === '`' ? '`' : '~'}{${marker.length},}\\s*$`).test(lines[i])) buf.push(lines[i++]);
      i++;
      const code = buf.join('\n');
      if (lang === 'mermaid') out.push(`<div class="mermaid-block"><pre class="mermaid-src">${esc(code)}</pre></div>`);
      else out.push(`<pre class="code"><code${lang ? ` data-lang="${esc(lang)}"` : ''}>${esc(code)}</code></pre>`);
      continue;
    }

    if (!line.trim()) {
      i++;
      continue;
    }

    if (HR_RE.test(line)) {
      out.push('<hr>');
      i++;
      continue;
    }

    const h = line.match(HEADING_RE);
    if (h) {
      const level = h[1].length;
      const content = inline(h[2]);
      out.push(`<h${level} id="${esc(slug(content))}">${content}</h${level}>`);
      i++;
      continue;
    }

    if (line.includes('|') && lines[i + 1] !== undefined && TABLE_SEP.test(lines[i + 1])) {
      const head = splitRow(line);
      const aligns = splitRow(lines[i + 1]).map((c) => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : ''));
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(splitRow(lines[i++]));
      const cell = (tag, c, idx) => `<${tag}${aligns[idx] ? ` style="text-align:${aligns[idx]}"` : ''}>${inline(c)}</${tag}>`;
      out.push(
        `<div class="table-wrap"><table><thead><tr>${head.map((c, idx) => cell('th', c, idx)).join('')}</tr></thead><tbody>${rows
          .map((r) => `<tr>${head.map((_, idx) => cell('td', r[idx] ?? '', idx)).join('')}</tr>`)
          .join('')}</tbody></table></div>`,
      );
      continue;
    }

    if (/^\s*>/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''));
      out.push(`<blockquote>${renderMarkdown(buf.join('\n'))}</blockquote>`);
      continue;
    }

    if (LIST_RE.test(line)) {
      const { html, next } = renderList(lines, i);
      out.push(html);
      i = next;
      continue;
    }

    const para = [line.trim()];
    i++;
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i], lines[i + 1])) para.push(lines[i++].trim());
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }
  return out.join('\n');
}
