// Parser for `git diff` unified output (including --no-index output for untracked files).

const GENERATED_PATTERNS = [
  /(^|\/)package-lock\.json$/,
  /(^|\/)npm-shrinkwrap\.json$/,
  /(^|\/)yarn\.lock$/,
  /(^|\/)pnpm-lock\.yaml$/,
  /(^|\/)bun\.lockb?$/,
  /(^|\/)Cargo\.lock$/,
  /(^|\/)poetry\.lock$/,
  /(^|\/)uv\.lock$/,
  /(^|\/)Pipfile\.lock$/,
  /(^|\/)Gemfile\.lock$/,
  /(^|\/)composer\.lock$/,
  /(^|\/)go\.sum$/,
  /(^|\/)flake\.lock$/,
  /(^|\/)Podfile\.lock$/,
  /\.min\.(js|css)$/,
  /\.map$/,
  /\.snap$/,
  /(^|\/)(dist|build|vendor)\//,
];

export function isGeneratedPath(p) {
  return GENERATED_PATTERNS.some((re) => re.test(p));
}

/** Decodes git's C-style quoted paths, e.g. "caf\303\251.txt". */
export function unquotePath(p) {
  if (!p.startsWith('"') || !p.endsWith('"')) return p;
  const inner = p.slice(1, -1);
  const bytes = [];
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch !== '\\') {
      bytes.push(...Buffer.from(ch, 'utf8'));
      continue;
    }
    const next = inner[++i];
    if (/[0-7]/.test(next)) {
      const oct = inner.slice(i, i + 3);
      bytes.push(Number.parseInt(oct, 8));
      i += 2;
    } else {
      const map = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', a: '\x07', b: '\b', f: '\f', v: '\v' };
      bytes.push(...Buffer.from(map[next] ?? next, 'utf8'));
    }
  }
  return Buffer.from(bytes).toString('utf8');
}

function stripPrefix(p) {
  const u = unquotePath(p.trim());
  if (u === '/dev/null') return null;
  return u.replace(/^[ab]\//, '');
}

function pathsFromDiffGitLine(line) {
  const rest = line.slice('diff --git '.length);
  // Common case: identical paths "a/P b/P" (works even when P contains spaces).
  if ((rest.length - 1) % 2 === 0) {
    const half = (rest.length - 1) / 2;
    const a = rest.slice(0, half);
    const b = rest.slice(half + 1);
    if (a.startsWith('a/') && b.startsWith('b/') && a.slice(2) === b.slice(2)) {
      return [a.slice(2), b.slice(2)];
    }
  }
  const quoted = rest.match(/^("(?:[^"\\]|\\.)*"|\S+) ("(?:[^"\\]|\\.)*"|\S+)$/);
  if (quoted) return [stripPrefix(quoted[1]), stripPrefix(quoted[2])];
  const m = rest.match(/^a\/(.+) b\/(.+)$/);
  return m ? [m[1], m[2]] : [rest, rest];
}

function newFile(line) {
  const [oldPath, newPath] = pathsFromDiffGitLine(line);
  return {
    path: newPath || oldPath,
    oldPath,
    newPath,
    status: 'modified',
    binary: false,
    modeChange: null,
    hunks: [],
    additions: 0,
    deletions: 0,
    generated: false,
  };
}

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;

export function parseUnifiedDiff(text) {
  const files = [];
  let file = null;
  let hunk = null;
  let oldNo = 0;
  let newNo = 0;
  let oldLeft = 0;
  let newLeft = 0;
  let pendingOldMode = null;

  const lines = text.split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();

  for (const line of lines) {
    if (hunk && (oldLeft > 0 || newLeft > 0 || line.startsWith('\\'))) {
      const tag = line[0];
      if (tag === '\\') {
        hunk.lines.push({ type: 'meta', content: line.slice(2) });
        continue;
      }
      if (tag === '+') {
        hunk.lines.push({ type: 'add', content: line.slice(1), newNo: newNo++ });
        file.additions++;
        newLeft--;
        continue;
      }
      if (tag === '-') {
        hunk.lines.push({ type: 'del', content: line.slice(1), oldNo: oldNo++ });
        file.deletions++;
        oldLeft--;
        continue;
      }
      if (tag === ' ' || line === '') {
        hunk.lines.push({ type: 'ctx', content: line.slice(1), oldNo: oldNo++, newNo: newNo++ });
        oldLeft--;
        newLeft--;
        continue;
      }
      // Malformed or truncated hunk: fall through to header handling.
      hunk = null;
    }

    if (line.startsWith('diff --git ')) {
      file = newFile(line);
      files.push(file);
      hunk = null;
      pendingOldMode = null;
      continue;
    }
    if (!file) continue;

    const h = line.match(HUNK_RE);
    if (h) {
      oldNo = Number(h[1]);
      newNo = Number(h[3]);
      oldLeft = h[2] === undefined ? 1 : Number(h[2]);
      newLeft = h[4] === undefined ? 1 : Number(h[4]);
      hunk = {
        header: line,
        oldStart: oldNo,
        oldLines: oldLeft,
        newStart: newNo,
        newLines: newLeft,
        section: h[5].trim(),
        lines: [],
      };
      file.hunks.push(hunk);
      continue;
    }

    if (line.startsWith('new file mode')) file.status = 'added';
    else if (line.startsWith('deleted file mode')) file.status = 'deleted';
    else if (line.startsWith('rename from ')) {
      file.oldPath = unquotePath(line.slice('rename from '.length));
      file.status = 'renamed';
    } else if (line.startsWith('rename to ')) {
      file.newPath = unquotePath(line.slice('rename to '.length));
      file.status = 'renamed';
    } else if (line.startsWith('copy from ')) {
      file.oldPath = unquotePath(line.slice('copy from '.length));
      file.status = 'copied';
    } else if (line.startsWith('copy to ')) {
      file.newPath = unquotePath(line.slice('copy to '.length));
      file.status = 'copied';
    } else if (line.startsWith('old mode ')) pendingOldMode = line.slice(9).trim();
    else if (line.startsWith('new mode ')) file.modeChange = `${pendingOldMode ?? '?'} -> ${line.slice(9).trim()}`;
    else if (line.startsWith('Binary files ') || line.startsWith('GIT binary patch')) file.binary = true;
    else if (line.startsWith('--- ')) {
      const p = stripPrefix(line.slice(4));
      if (p === null) file.status = 'added';
      else file.oldPath = p;
    } else if (line.startsWith('+++ ')) {
      const p = stripPrefix(line.slice(4));
      if (p === null) file.status = 'deleted';
      else file.newPath = p;
    }
  }

  for (const f of files) {
    if (f.status === 'added') f.oldPath = null;
    if (f.status === 'deleted') f.newPath = null;
    f.path = f.newPath || f.oldPath;
    f.generated = isGeneratedPath(f.path);
  }
  return files;
}
