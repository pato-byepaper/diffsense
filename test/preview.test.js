import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { deflateRawSync } from 'node:zlib';
import { collectChanges, readFileVersion } from '../src/git.js';
import { docxToText, previewKind } from '../src/preview.js';

/** Builds a minimal ZIP archive. CRCs are zero: the reader does not verify them. */
function zip(entries, { deflate = true } = {}) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const [name, content] of Object.entries(entries)) {
    const raw = Buffer.from(content);
    const data = deflate ? deflateRawSync(raw) : raw;
    const nameBuf = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(deflate ? 8 : 0, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(deflate ? 8 : 0, 10);
    cd.writeUInt32LE(data.length, 20);
    cd.writeUInt32LE(raw.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, data);
    central.push(cd, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const cdBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(entries).length, 8);
  eocd.writeUInt16LE(Object.keys(entries).length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cdBuf, eocd]);
}

const docx = (paragraphs, opts) =>
  zip(
    {
      '[Content_Types].xml': '<Types/>',
      'word/document.xml': `<?xml version="1.0"?><w:document><w:body>${paragraphs.map((p) => `<w:p><w:r><w:t xml:space="preserve">${p}</w:t></w:r></w:p>`).join('')}</w:body></w:document>`,
    },
    opts,
  );

test('detects previewable file kinds', () => {
  assert.equal(previewKind('assets/Logo.PNG'), 'image');
  assert.equal(previewKind('a/b.jpeg'), 'image');
  assert.equal(previewKind('icon.svg'), 'svg');
  assert.equal(previewKind('docs/contract.pdf'), 'pdf');
  assert.equal(previewKind('docs/spec.docx'), 'docx');
  assert.equal(previewKind('src/app.js'), null);
  assert.equal(previewKind('Makefile'), null);
});

test('extracts docx text with entities, tabs and breaks', () => {
  const buf = docx(['Hello &amp; welcome', 'Line</w:t><w:tab/><w:t>two', 'A &#x263A; B'], { deflate: true });
  assert.equal(docxToText(buf), 'Hello & welcome\nLine\ttwo\nA ☺ B\n');
  assert.equal(docxToText(docx(['stored'], { deflate: false })), 'stored\n');
});

test('rejects files that are not Word documents', () => {
  assert.throws(() => docxToText(Buffer.from('not a zip at all, just some text padding padding')), /ZIP/);
  assert.throws(() => docxToText(zip({ 'other.xml': '<x/>' })), /word\/document.xml/);
});

let dir;
const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' }).toString();
const png = (n) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(n)]);

before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wlu-preview-'));
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 't@example.com');
  git('config', 'user.name', 'Test');
  fs.writeFileSync(path.join(dir, 'logo.png'), png(10));
  fs.writeFileSync(path.join(dir, 'spec.docx'), docx(['Intro', 'Old terms']));
  fs.writeFileSync(path.join(dir, 'gone.pdf'), '%PDF-1.4 old');
  git('add', '.');
  git('commit', '-qm', 'init');
  fs.writeFileSync(path.join(dir, 'logo.png'), png(40));
  fs.writeFileSync(path.join(dir, 'spec.docx'), docx(['Intro', 'New terms']));
  fs.rmSync(path.join(dir, 'gone.pdf'));
  fs.writeFileSync(path.join(dir, 'new.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>\n');
});

after(() => fs.rmSync(dir, { recursive: true, force: true }));

test('reads before and after versions of binary files', async () => {
  const changes = await collectChanges(dir);
  const byPath = Object.fromEntries(changes.files.map((f) => [f.path, f]));

  const logo = byPath['logo.png'];
  assert.equal(logo.preview, 'image');
  assert.equal(logo.binary, true);
  assert.deepEqual([logo.oldSize, logo.newSize], [18, 48]);
  assert.equal((await readFileVersion(changes, logo, 'old')).length, 18);
  assert.equal((await readFileVersion(changes, logo, 'new')).length, 48);

  const spec = byPath['spec.docx'];
  assert.equal(docxToText(await readFileVersion(changes, spec, 'old')), 'Intro\nOld terms\n');
  assert.equal(docxToText(await readFileVersion(changes, spec, 'new')), 'Intro\nNew terms\n');

  const gone = byPath['gone.pdf'];
  assert.equal(gone.status, 'deleted');
  assert.equal(await readFileVersion(changes, gone, 'new'), null);
  assert.equal((await readFileVersion(changes, gone, 'old')).toString(), '%PDF-1.4 old');

  const svg = byPath['new.svg'];
  assert.equal(svg.preview, 'svg');
  assert.equal(await readFileVersion(changes, svg, 'old'), null);
  assert.ok((await readFileVersion(changes, svg, 'new')).toString().startsWith('<svg'));
});

test('staged mode reads the new side from the index', async () => {
  git('add', 'logo.png');
  fs.writeFileSync(path.join(dir, 'logo.png'), png(99)); // unstaged edit on top must be ignored
  const changes = await collectChanges(dir, { mode: 'staged' });
  const logo = changes.files.find((f) => f.path === 'logo.png');
  assert.equal(logo.newSize, 48);
  assert.equal((await readFileVersion(changes, logo, 'new')).length, 48);
});
