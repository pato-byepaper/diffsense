import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseUnifiedDiff } from './diffParser.js';
import { previewKind } from './preview.js';
import { mapLimit } from './util.js';

const MAX_UNTRACKED_FILES = 1000;
const MAX_UNTRACKED_BYTES = 2 * 1024 * 1024;
export const MAX_PREVIEW_BYTES = 50 * 1024 * 1024;

function git(cwd, args, okCodes = [0]) {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      {
        cwd,
        maxBuffer: 512 * 1024 * 1024,
        env: { ...process.env, GIT_PAGER: 'cat', GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' },
      },
      (err, stdout, stderr) => {
        if (!err) return resolve(stdout);
        if (err.code === 'ENOENT') return reject(new Error('git was not found on your PATH.'));
        if (typeof err.code === 'number' && okCodes.includes(err.code)) return resolve(stdout);
        reject(new Error(`git ${args.join(' ')} failed: ${(stderr || err.message).trim()}`));
      },
    );
  });
}

function gitBuffer(cwd, args) {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      { cwd, encoding: 'buffer', maxBuffer: MAX_PREVIEW_BYTES + 1024, env: { ...process.env, GIT_PAGER: 'cat', GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' } },
      (err, stdout, stderr) => (err ? reject(new Error(`git ${args.join(' ')} failed: ${String(stderr || err.message).trim()}`)) : resolve(stdout)),
    );
  });
}

const DIFF_FLAGS = ['-c', 'core.quotepath=false', 'diff', '--no-color', '--no-ext-diff', '--find-renames', '--unified=3'];

async function tryGit(cwd, args) {
  try {
    return (await git(cwd, args)).trim();
  } catch {
    return null;
  }
}

export async function resolveRepo(repoPath) {
  const abs = path.resolve(repoPath || '.');
  try {
    const st = await fs.stat(abs);
    if (!st.isDirectory()) throw new Error();
  } catch {
    throw new Error(`Not a directory: ${abs}`);
  }
  const root = await tryGit(abs, ['rev-parse', '--show-toplevel']);
  if (!root) throw new Error(`Not inside a git repository: ${abs}`);
  return root;
}

function assertSafeRef(ref) {
  // execFile never uses a shell; this blocks option injection and git revision-range syntax.
  if (!ref || ref.startsWith('-') || /[\s\x00-\x1f\x7f:?*[\\]|\.\.|@\{/.test(ref)) {
    throw Object.assign(new Error(`Invalid git ref: ${ref}`), { status: 400 });
  }
}

export async function listRefs(root) {
  const out = await tryGit(root, ['for-each-ref', '--format=%(refname:short)', '--sort=-committerdate', 'refs/heads', 'refs/remotes']);
  return out ? out.split('\n').filter((r) => r && !r.endsWith('/HEAD')).slice(0, 200) : [];
}

/**
 * Collects the change set.
 * mode "worktree": everything not committed (staged + unstaged + untracked) vs HEAD.
 * mode "staged":   only staged changes vs HEAD.
 * mode "base":     everything since the merge-base with `base` (commits + uncommitted + untracked).
 */
export async function collectChanges(repoPath, { mode = 'worktree', base = '' } = {}) {
  const root = await resolveRepo(repoPath);
  const hasHead = (await tryGit(root, ['rev-parse', '--verify', '--quiet', 'HEAD'])) !== null;
  const branch = (await tryGit(root, ['rev-parse', '--abbrev-ref', 'HEAD'])) || (await tryGit(root, ['symbolic-ref', '--short', 'HEAD'])) || 'HEAD';

  let diffArgs;
  let baseLabel;
  let oldRev = hasHead ? 'HEAD' : null; // revision holding the "before" side of every file
  let commits = [];
  let includeUntracked = true;

  if (mode === 'staged') {
    diffArgs = [...DIFF_FLAGS, '--cached'];
    baseLabel = 'HEAD (staged changes only)';
    includeUntracked = false;
  } else if (mode === 'base') {
    if (!base) throw Object.assign(new Error('A base ref is required for mode "base" (for example --base main).'), { status: 400 });
    assertSafeRef(base);
    if ((await tryGit(root, ['rev-parse', '--verify', '--quiet', `${base}^{commit}`])) === null) {
      throw Object.assign(new Error(`Base ref not found: ${base}`), { status: 400 });
    }
    const mergeBase = (hasHead && (await tryGit(root, ['merge-base', base, 'HEAD']))) || base;
    diffArgs = [...DIFF_FLAGS, mergeBase];
    oldRev = mergeBase;
    baseLabel = `${base} (merge-base ${mergeBase.slice(0, 10)}, including uncommitted work)`;
    const log = hasHead ? await tryGit(root, ['log', '--no-merges', '--max-count=200', '--format=%h%x09%an%x09%s', `${mergeBase}..HEAD`]) : '';
    commits = (log || '')
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        const [hash, author, ...subject] = l.split('\t');
        return { hash, author, subject: subject.join('\t') };
      });
  } else {
    const emptyTree = hasHead ? null : await git(root, ['hash-object', '-t', 'tree', '/dev/null']).then((s) => s.trim());
    diffArgs = [...DIFF_FLAGS, hasHead ? 'HEAD' : emptyTree];
    baseLabel = hasHead ? 'HEAD (uncommitted changes)' : 'empty repository (no commits yet)';
  }

  const tracked = parseUnifiedDiff(await git(root, diffArgs));
  const files = [...tracked];
  const skipped = [];

  if (includeUntracked) {
    const raw = await git(root, ['-c', 'core.quotepath=false', 'ls-files', '--others', '--exclude-standard', '-z']);
    const known = new Set(tracked.map((f) => f.path));
    const untracked = raw.split('\0').filter((p) => p && !known.has(p));
    const take = untracked.slice(0, MAX_UNTRACKED_FILES);
    skipped.push(...untracked.slice(MAX_UNTRACKED_FILES).map((p) => ({ path: p, reason: 'untracked file limit reached' })));

    const parsed = await mapLimit(take, 8, async (rel) => {
      let size = 0;
      try {
        const st = await fs.lstat(path.join(root, rel));
        if (!st.isFile()) return null;
        size = st.size;
      } catch {
        return null;
      }
      if (size > MAX_UNTRACKED_BYTES) {
        return [{ path: rel, oldPath: null, newPath: rel, status: 'added', binary: true, tooLarge: true, modeChange: null, hunks: [], additions: 0, deletions: 0, generated: false }];
      }
      const out = await git(root, [...DIFF_FLAGS, '--no-index', '--', '/dev/null', rel], [0, 1]);
      return parseUnifiedDiff(out);
    });
    for (const list of parsed) {
      if (!list) continue;
      for (const f of list) {
        f.untracked = true;
        f.status = 'added';
        files.push(f);
      }
    }
  }

  files.sort((a, b) => a.path.localeCompare(b.path));
  await mapLimit(files, 8, async (f) => {
    f.preview = previewKind(f.path);
    if (!f.preview) return;
    f.oldSize = f.status === 'added' || !oldRev ? null : await blobSize(root, `${oldRev}:${f.oldPath || f.path}`);
    f.newSize = f.status === 'deleted' ? null : mode === 'staged' ? await blobSize(root, `:${f.path}`) : await fileSize(path.join(root, f.path));
  });
  const stats = {
    files: files.length,
    additions: files.reduce((n, f) => n + f.additions, 0),
    deletions: files.reduce((n, f) => n + f.deletions, 0),
  };

  return {
    root,
    repoName: path.basename(root),
    branch,
    mode,
    oldRev,
    base: mode === 'base' ? base : '',
    baseLabel,
    commits,
    files,
    skipped,
    stats,
    generatedAt: new Date().toISOString(),
  };
}

async function blobSize(root, spec) {
  const out = await tryGit(root, ['cat-file', '-s', spec]);
  return out === null ? null : Number(out);
}

async function fileSize(abs) {
  try {
    const st = await fs.lstat(abs);
    return st.isFile() ? st.size : null;
  } catch {
    return null;
  }
}

/**
 * Reads the raw bytes of one side of a changed file.
 * side "old": the version in the comparison base (HEAD or the merge-base).
 * side "new": the working tree (or the index in staged mode).
 * Returns null when that side does not exist (added or deleted files).
 */
export async function readFileVersion(changes, file, side) {
  const { root } = changes;
  const tooLarge = () => Object.assign(new Error('File is too large to preview (over 50 MB).'), { status: 413 });
  if (side === 'old') {
    if (file.status === 'added' || !changes.oldRev) return null;
    const spec = `${changes.oldRev}:${file.oldPath || file.path}`;
    const size = await blobSize(root, spec);
    if (size === null) return null;
    if (size > MAX_PREVIEW_BYTES) throw tooLarge();
    return gitBuffer(root, ['cat-file', 'blob', spec]);
  }
  if (file.status === 'deleted') return null;
  if (changes.mode === 'staged') {
    const size = await blobSize(root, `:${file.path}`);
    if (size === null) return null;
    if (size > MAX_PREVIEW_BYTES) throw tooLarge();
    return gitBuffer(root, ['cat-file', 'blob', `:${file.path}`]);
  }
  const abs = path.resolve(root, file.path);
  if (!abs.startsWith(root + path.sep)) return null;
  const size = await fileSize(abs); // lstat: symlinks are never followed out of the repository
  if (size === null) return null;
  if (size > MAX_PREVIEW_BYTES) throw tooLarge();
  return fs.readFile(abs);
}
