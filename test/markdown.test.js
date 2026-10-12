import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderMarkdown } from '../web/markdown.js';

test('escapes raw HTML', () => {
  const html = renderMarkdown('<img src=x onerror=alert(1)> and <script>x</script>');
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('<script'));
});

test('rejects javascript: links', () => {
  const html = renderMarkdown('[click](javascript:alert(1)) [ok](https://example.com)');
  assert.ok(!html.includes('javascript:'));
  assert.ok(html.includes('href="https://example.com"'));
});

test('renders headings, tables, lists, task lists, code and mermaid', () => {
  const md = '# T\n\n| A | B |\n|---|---|\n| `x|y` | 2 |\n\n- one\n  - nested\n- [x] done\n\n```js\nconst a = "<b>";\n```\n\n```mermaid\nflowchart LR\n  a["A"] --> b["B"]\n```\n';
  const html = renderMarkdown(md);
  assert.ok(html.includes('<h1 id="t">T</h1>'));
  assert.ok(html.includes('<th>A</th>'));
  assert.ok(html.includes('<code>x|y</code>'));
  assert.ok(html.includes('<ul><li>nested</li></ul>'));
  assert.ok(html.includes('type="checkbox" disabled checked'));
  assert.ok(html.includes('&lt;b&gt;'));
  assert.ok(html.includes('class="mermaid-src"'));
});
