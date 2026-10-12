import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const TOOL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const CONFIG_DIR =
  process.env.WLU_CONFIG_DIR ||
  path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'work-load-understand');

export const DEFAULT_MODEL = 'gemini-3.8-flash';
export const DEFAULT_PORT = 4747;
export const DEFAULT_MAX_CONTEXT_CHARS = 600_000;

/**
 * Minimal .env parser: KEY=VALUE, optional `export`, single/double quotes,
 * inline `#` comments for unquoted values, `\n` escapes inside double quotes.
 */
export function parseDotenv(text) {
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let value = m[2];
    if (value.startsWith('"')) {
      const end = value.indexOf('"', 1);
      value = (end === -1 ? value.slice(1) : value.slice(1, end)).replace(/\\n/g, '\n').replace(/\\"/g, '"');
    } else if (value.startsWith("'")) {
      const end = value.indexOf("'", 1);
      value = end === -1 ? value.slice(1) : value.slice(1, end);
    } else {
      const hash = value.search(/\s#/);
      if (hash !== -1) value = value.slice(0, hash);
      value = value.trim();
    }
    out[key] = value;
  }
  return out;
}

/** Loads .env files. Real environment variables always win, then the tool folder .env, then the config dir .env. */
export function loadEnv() {
  const files = [path.join(TOOL_ROOT, '.env'), path.join(CONFIG_DIR, '.env')];
  for (const file of files) {
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const [key, value] of Object.entries(parseDotenv(text))) {
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

function intFromEnv(name, fallback) {
  const n = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function getConfig(overrides = {}) {
  return {
    apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '',
    offline: Boolean(overrides.offline) || process.env.WLU_OFFLINE === '1',
    model: overrides.model || process.env.GEMINI_MODEL || DEFAULT_MODEL,
    language: process.env.WLU_OUTPUT_LANGUAGE || 'English',
    maxContextChars: intFromEnv('WLU_MAX_CONTEXT_CHARS', DEFAULT_MAX_CONTEXT_CHARS),
    port: overrides.port || intFromEnv('WLU_PORT', DEFAULT_PORT),
    promptsDir: process.env.WLU_PROMPTS_DIR || path.join(CONFIG_DIR, 'prompts'),
  };
}
