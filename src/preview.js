// Before/after previews for common non-text files: images, SVG, PDF and Word documents.
// Zero dependencies: DOCX text is read with a minimal ZIP reader built on node:zlib.

import { inflateRawSync } from 'node:zlib';

const KINDS = {
  image: { exts: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'ico'], types: { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp', ico: 'image/x-icon' } },
  svg: { exts: ['svg'], types: { svg: 'image/svg+xml' } },
  pdf: { exts: ['pdf'], types: { pdf: 'application/pdf' } },
  docx: { exts: ['docx'], types: { docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' } },
};

const extOf = (p) => (p.match(/\.([^./]+)$/)?.[1] || '').toLowerCase();

/** Returns 'image' | 'svg' | 'pdf' | 'docx' | null for a file path. */
export function previewKind(filePath) {
  const ext = extOf(filePath || '');
  for (const [kind, def] of Object.entries(KINDS)) if (def.exts.includes(ext)) return kind;
  return null;
}

export function contentTypeFor(filePath) {
  const ext = extOf(filePath);
  for (const def of Object.values(KINDS)) if (def.types[ext]) return def.types[ext];
  return 'application/octet-stream';
}

/* ---------- minimal ZIP reader ---------- */

const MAX_ENTRY_BYTES = 64 * 1024 * 1024; // guards against zip bombs

function readZipEntry(buf, name) {
  // End of central directory: last 22 bytes plus an optional comment of up to 65535 bytes.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not a valid ZIP archive.');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  if (p === 0xffffffff) throw new Error('ZIP64 archives are not supported.');

  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Corrupt ZIP central directory.');
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const entryName = buf.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (entryName !== name) continue;

    if (size > MAX_ENTRY_BYTES) throw new Error('Document is too large to preview.');
    if (local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) throw new Error('Corrupt ZIP local header.');
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + compSize);
    if (method === 0) return data;
    if (method === 8) return inflateRawSync(data, { maxOutputLength: MAX_ENTRY_BYTES });
    throw new Error(`Unsupported ZIP compression method ${method}.`);
  }
  return null;
}

/* ---------- DOCX text ---------- */

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decodeXml = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) => {
    if (e[0] !== '#') return ENTITIES[e.toLowerCase()] ?? m;
    const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : m;
  });

/**
 * Extracts the readable text of a .docx file, one paragraph per line.
 * Tables become one line per cell paragraph. Deleted tracked-change text is skipped.
 */
export function docxToText(buf) {
  const xml = readZipEntry(buf, 'word/document.xml');
  if (!xml) throw new Error('Not a Word document (word/document.xml is missing).');
  const body = xml.toString('utf8');
  let out = '';
  const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:(?:br|cr)(?:\s[^>]*)?\/>|<\/w:p>/g;
  for (const m of body.matchAll(re)) {
    if (m[1] !== undefined) out += decodeXml(m[1]);
    else if (m[0] === '<w:tab/>') out += '\t';
    else out += '\n';
  }
  return out.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
