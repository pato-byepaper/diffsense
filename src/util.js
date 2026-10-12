// Emoji and pictograph stripping. Generated text must never contain emojis.
const PICTO = '(?:\\p{Extended_Pictographic}|\\p{Regional_Indicator})(?:\\u{FE0F}|\\u{20E3}|\\u{200D}\\p{Extended_Pictographic}|[\\u{1F3FB}-\\u{1F3FF}])*';
const TRAILING_EMOJI_RE = new RegExp(`[ \\t]*(?:${PICTO}[ \\t]*)+$`, 'gmu');
const STANDALONE_EMOJI_RE = new RegExp(`(^|[ \\t])${PICTO}[ \\t]?`, 'gmu');
const ANY_EMOJI_RE = new RegExp(PICTO, 'gu');
const LEFTOVER_RE = /[\u{FE0F}\u{200D}\u{20E3}]/gu;

export function stripEmojis(text) {
  return text.replace(TRAILING_EMOJI_RE, '').replace(STANDALONE_EMOJI_RE, '$1').replace(ANY_EMOJI_RE, '').replace(LEFTOVER_RE, '');
}

/** Removes a single ```markdown fence wrapping the entire response, which models sometimes add. */
export function unwrapMarkdownFence(text) {
  const m = text.trim().match(/^```(?:markdown|md)[ \t]*\n([\s\S]*?)\n```\s*$/i);
  return m ? m[1] : text;
}

export function cleanModelOutput(text) {
  return stripEmojis(unwrapMarkdownFence(text)).replace(/\n{4,}/g, '\n\n\n').trim() + '\n';
}

/** Returns a fence (``` or longer) that does not collide with any backtick run in `content`. */
export function fenceFor(content) {
  let longest = 2;
  for (const m of content.matchAll(/`{3,}/g)) longest = Math.max(longest, m[0].length);
  return '`'.repeat(longest + 1);
}

const useColor = () => process.stdout.isTTY && !process.env.NO_COLOR;
const wrap = (code) => (s) => (useColor() ? `\x1b[${code}m${s}\x1b[0m` : String(s));
export const c = {
  bold: wrap('1'),
  dim: wrap('2'),
  red: wrap('31'),
  green: wrap('32'),
  yellow: wrap('33'),
  blue: wrap('34'),
  magenta: wrap('35'),
  cyan: wrap('36'),
};

export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}
