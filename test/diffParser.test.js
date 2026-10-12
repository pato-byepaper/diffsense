import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseUnifiedDiff, unquotePath } from '../src/diffParser.js';

const SAMPLE = `diff --git a/src/a.js b/src/a.js
index 111..222 100644
--- a/src/a.js
+++ b/src/a.js
@@ -1,3 +1,4 @@ function top
 const a = 1;
-const b = 2;
+const b = 3;
+--- not a header
 const c = 4;
diff --git a/old name.txt b/new name.txt
similarity index 90%
rename from old name.txt
rename to new name.txt
diff --git a/img.png b/img.png
new file mode 100644
Binary files /dev/null and b/img.png differ
diff --git a/gone.js b/gone.js
deleted file mode 100644
--- a/gone.js
+++ /dev/null
@@ -1 +0,0 @@
-bye
\\ No newline at end of file
`;

test('parses modified, renamed, binary and deleted files', () => {
  const files = parseUnifiedDiff(SAMPLE);
  assert.equal(files.length, 4);
  const [a, ren, img, gone] = files;

  assert.equal(a.path, 'src/a.js');
  assert.equal(a.status, 'modified');
  assert.equal(a.additions, 2);
  assert.equal(a.deletions, 1);
  assert.equal(a.hunks[0].section, 'function top');
  const added = a.hunks[0].lines.filter((l) => l.type === 'add');
  assert.deepEqual(added.map((l) => [l.newNo, l.content]), [[2, 'const b = 3;'], [3, '--- not a header']]);

  assert.equal(ren.status, 'renamed');
  assert.equal(ren.oldPath, 'old name.txt');
  assert.equal(ren.path, 'new name.txt');

  assert.equal(img.status, 'added');
  assert.equal(img.binary, true);

  assert.equal(gone.status, 'deleted');
  assert.equal(gone.path, 'gone.js');
  assert.equal(gone.hunks[0].lines.at(-1).type, 'meta');
});

test('flags lockfiles as generated', () => {
  const files = parseUnifiedDiff('diff --git a/package-lock.json b/package-lock.json\n--- a/package-lock.json\n+++ b/package-lock.json\n@@ -1 +1 @@\n-a\n+b\n');
  assert.equal(files[0].generated, true);
});

test('decodes git quoted paths', () => {
  assert.equal(unquotePath('"caf\\303\\251 \\"x\\".txt"'), 'café "x".txt');
  assert.equal(unquotePath('plain.txt'), 'plain.txt');
});
