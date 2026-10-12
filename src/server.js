import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { TOOL_ROOT } from './config.js';
import { buildAgentDocument } from './context.js';
import { runTask, TASKS } from './generate.js';
import { collectChanges, listRefs, resolveRepo } from './git.js';
import { listPrompts, PLACEHOLDERS, resetPrompt, savePrompt } from './prompts.js';
import { scanChanges } from './scanner.js';
import { c } from './util.js';

const WEB_DIR = path.join(TOOL_ROOT, 'web');
const STATIC = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/markdown.js': ['markdown.js', 'text/javascript; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
};
const MAX_BODY = 1024 * 1024;

const SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
};

function send(res, status, body, type = 'application/json; charset=utf-8', extra = {}) {
  res.writeHead(status, { 'Content-Type': type, ...SECURITY_HEADERS, ...extra });
  res.end(body);
}

const sendJson = (res, status, data) => send(res, status, JSON.stringify(data));

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error('Request body too large.'), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('Invalid JSON body.'), { status: 400 });
  }
}

function changeOptsFrom(source) {
  const mode = ['worktree', 'staged', 'base'].includes(source.mode) ? source.mode : 'worktree';
  return { mode, base: mode === 'base' ? String(source.base || '') : '' };
}

function openBrowser(url) {
  const [cmd, args] =
    process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : ['xdg-open', [url]];
  execFile(cmd, args, () => {});
}

export async function startServer({ repoPath, config, open = true, initial = { mode: 'worktree', base: '' } }) {
  const root = await resolveRepo(repoPath);
  let port = config.port;

  // Only accept requests addressed to this server on loopback (blocks DNS rebinding),
  // and only accept state-changing requests from our own origin (blocks CSRF from other sites).
  const allowedHosts = () => new Set([`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`]);

  async function load(opts) {
    const changes = await collectChanges(root, opts);
    return { changes, findings: scanChanges(changes.files) };
  }

  async function handle(req, res) {
    if (!allowedHosts().has(req.headers.host || '')) return send(res, 421, 'Misdirected request', 'text/plain');
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const origin = req.headers.origin;
      if (!origin || !allowedHosts().has(origin.replace(/^https?:\/\//, ''))) return sendJson(res, 403, { error: 'Cross-origin request rejected.' });
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const route = url.pathname;

    if (req.method === 'GET' && STATIC[route]) {
      const [file, type] = STATIC[route];
      return send(res, 200, await fs.readFile(path.join(WEB_DIR, file)), type);
    }

    if (req.method === 'GET' && route === '/api/state') {
      const opts = changeOptsFrom(Object.fromEntries(url.searchParams));
      const { changes, findings } = await load(opts);
      return sendJson(res, 200, {
        meta: {
          root: changes.root,
          repoName: changes.repoName,
          branch: changes.branch,
          mode: changes.mode,
          base: changes.base,
          baseLabel: changes.baseLabel,
          commits: changes.commits,
          stats: changes.stats,
          skipped: changes.skipped,
          generatedAt: changes.generatedAt,
          ai: { enabled: Boolean(config.apiKey) && !config.offline, model: config.model },
          initial,
        },
        files: changes.files,
        findings,
      });
    }

    if (req.method === 'GET' && route === '/api/refs') {
      return sendJson(res, 200, { refs: await listRefs(root) });
    }

    if (req.method === 'GET' && route === '/api/export') {
      const { changes, findings } = await load(changeOptsFrom(Object.fromEntries(url.searchParams)));
      const name = `${changes.repoName}-changes.md`.replace(/[^\w.-]/g, '_');
      const extra = url.searchParams.get('download') ? { 'Content-Disposition': `attachment; filename="${name}"` } : {};
      return send(res, 200, buildAgentDocument(changes, findings), 'text/markdown; charset=utf-8', extra);
    }

    if (req.method === 'POST' && route === '/api/generate') {
      const body = await readJson(req);
      if (!TASKS[body.kind]) return sendJson(res, 400, { error: `Unknown kind: ${body.kind}` });
      const { changes, findings } = await load(changeOptsFrom(body));
      const result = await runTask(body.kind, { changes, findings, config, file: typeof body.file === 'string' ? body.file : null });
      return sendJson(res, 200, result);
    }

    if (req.method === 'GET' && route === '/api/prompts') {
      return sendJson(res, 200, { dir: config.promptsDir, placeholders: PLACEHOLDERS, prompts: await listPrompts(config.promptsDir) });
    }

    const pm = route.match(/^\/api\/prompts\/([a-z-]+)$/);
    if (pm && req.method === 'PUT') {
      const body = await readJson(req);
      const file = await savePrompt(config.promptsDir, pm[1], body.content);
      return sendJson(res, 200, { ok: true, path: file });
    }
    if (pm && req.method === 'DELETE') {
      await resetPrompt(config.promptsDir, pm[1]);
      return sendJson(res, 200, { ok: true });
    }

    return sendJson(res, 404, { error: 'Not found' });
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      if (!res.headersSent) sendJson(res, err.status || 500, { error: err.message || String(err) });
      else res.end();
    });
  });
  server.requestTimeout = 0; // AI generations can take minutes
  server.headersTimeout = 60_000;

  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => {
          server.off('error', reject);
          resolve();
        });
      });
      break;
    } catch (err) {
      if (err.code !== 'EADDRINUSE' || attempt === 19) throw err;
      port++;
    }
  }

  const query = initial.mode === 'base' ? `?mode=base&base=${encodeURIComponent(initial.base)}` : initial.mode === 'staged' ? '?mode=staged' : '';
  const url = `http://127.0.0.1:${port}/${query}`;
  process.stdout.write(`\n  ${c.bold('work_load_understand')}  ${c.dim(root)}\n`);
  process.stdout.write(`  ${c.green('Web UI:')} ${url}\n`);
  process.stdout.write(`  ${c.dim(config.apiKey && !config.offline ? `AI: ${config.model}` : 'AI: offline mode (no GEMINI_API_KEY); every feature still works locally')}\n`);
  process.stdout.write(`  ${c.dim('Press Ctrl+C to stop.')}\n\n`);
  if (open) openBrowser(url);

  const shutdown = () => {
    server.close();
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  return { server, url, port };
}
