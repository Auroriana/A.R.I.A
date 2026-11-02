import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanPath, cleanContent, chunkMarkdown } from '../lib/notes.js';
import { planSync } from '../../tools/sync-plan.mjs';

test('cleanPath accepts normal vault paths', () => {
  for (const p of ['Note.md', 'Topics/Concept.md', '10 Sources/Café – 日本.MD', '00 Inbox/a b.md']) assert.equal(cleanPath(p), p);
});

test('cleanPath rejects traversal, hidden, private, reserved and non-markdown paths', () => {
  for (const p of ['../x.md', 'a/../x.md', '/x.md', 'C:/x.md', 'a\\b.md', '.obsidian/x.md', 'a/.hidden.md', '98 Private/x.md', '98 private/sub/x.md', '80 Templates/t.md',
    'CON.md', 'a/nul.md', 'x.txt', 'a//b.md', 'a /b.md', 'dir./b.md', 'a\u0000.md', 'a*.md', '', null, 'x'.repeat(301) + '.md'])
    assert.throws(() => cleanPath(p), /Invalid note path|not available/, String(p));
});

test('cleanContent normalizes CRLF and enforces limits', () => {
  assert.equal(cleanContent('a\r\nb\rc'), 'a\nb\nc');
  assert.throws(() => cleanContent('x'.repeat(200001)));
  assert.throws(() => cleanContent('a\u0000b'));
  assert.throws(() => cleanContent(5));
});

test('chunker splits on headings, strips frontmatter, ignores # in code fences', () => {
  const md = '---\nai_enabled: true\n---\n\nintro\n\n# One\nalpha\n\n```\n# not a heading\n```\n\n## Two\nbeta\n';
  const c = chunkMarkdown(md);
  assert.deepEqual(c.map(x => x.heading), ['', 'One', 'One › Two']);
  assert.ok(!c.some(x => x.content.includes('ai_enabled')));
  assert.ok(c[1].content.includes('# not a heading'));
});

test('chunker respects the size cap and never splits surrogate pairs', () => {
  const c = chunkMarkdown('😀'.repeat(6000), 2500);
  assert.equal(c.length, 3);
  for (const x of c) { assert.ok(x.content.length <= 5000); assert.doesNotThrow(() => JSON.parse(JSON.stringify(x))); assert.ok(!/[\ud800-\udbff]$/.test(x.content)); }
  const many = chunkMarkdown(Array.from({ length: 40 }, (_, i) => `para ${i} ${'w '.repeat(300)}`).join('\n\n'));
  assert.ok(many.every(x => [...x.content].length <= 2500) && many.length > 1);
  assert.deepEqual(chunkMarkdown('\n\n'), []);
});

const m = o => new Map(Object.entries(o));
const plan = (local, remote, base, resolve) => Object.fromEntries(planSync({ local: m(local), remote: m(remote), base: m(base), resolve }).map(a => [a.path, a.type]));

test('planner: first sync and ordinary edits', () => {
  assert.deepEqual(plan({ 'a.md': 'h1' }, {}, {}), { 'a.md': 'push' });
  assert.deepEqual(plan({}, { 'a.md': { hash: 'h1', version: 1 } }, {}), { 'a.md': 'pull' });
  assert.deepEqual(plan({ 'a.md': 'h1' }, { 'a.md': { hash: 'h1', version: 3 } }, {}), { 'a.md': 'adopt' });
  assert.deepEqual(plan({ 'a.md': 'h1' }, { 'a.md': { hash: 'h1', version: 3 } }, { 'a.md': { hash: 'h1', version: 3 } }), { 'a.md': 'adopt' });
  assert.deepEqual(plan({ 'a.md': 'h2' }, { 'a.md': { hash: 'h1', version: 3 } }, { 'a.md': { hash: 'h1', version: 3 } }), { 'a.md': 'push' });
  assert.deepEqual(plan({ 'a.md': 'h1' }, { 'a.md': { hash: 'h2', version: 4 } }, { 'a.md': { hash: 'h1', version: 3 } }), { 'a.md': 'pull' });
});

test('planner: conflicts never overwrite either side without a decision', () => {
  const remote = { 'a.md': { hash: 'hw', version: 4 } }, base = { 'a.md': { hash: 'h0', version: 3 } };
  assert.deepEqual(plan({ 'a.md': 'hl' }, remote, base), { 'a.md': 'conflict' });
  assert.deepEqual(plan({ 'a.md': 'hl' }, remote, {}), { 'a.md': 'conflict' });
  assert.deepEqual(plan({ 'a.md': 'hl' }, remote, base, { 'a.md': 'local' }), { 'a.md': 'push' });
  assert.deepEqual(plan({ 'a.md': 'hl' }, remote, base, { 'a.md': 'web' }), { 'a.md': 'pull' });
  const push = planSync({ local: m({ 'a.md': 'hl' }), remote: m(remote), base: m(base), resolve: { 'a.md': 'local' } })[0];
  assert.equal(push.baseVersion, 4);
});

test('planner: deletions are conservative', () => {
  const base = { 'a.md': { hash: 'h1', version: 3 } };
  assert.deepEqual(plan({}, { 'a.md': { hash: 'h1', version: 3 } }, base), { 'a.md': 'delete-remote' });
  assert.deepEqual(plan({}, { 'a.md': { hash: 'h2', version: 4 } }, base), { 'a.md': 'pull' }, 'web edit beats local delete');
  assert.deepEqual(plan({}, { 'a.md': { hash: '', version: 5, deleted: true } }, base), { 'a.md': 'forget' });
  assert.deepEqual(plan({ 'a.md': 'h1' }, { 'a.md': { hash: '', version: 5, deleted: true } }, base), { 'a.md': 'push' });
});
