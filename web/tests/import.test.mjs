import test from 'node:test';
import assert from 'node:assert/strict';
import { planImport, verifyPlan, checkText, LIMITS } from '../public/importer.js';
import { chunkMarkdown } from '../lib/notes.js';

// Small deterministic PRNG so failures are reproducible.
const rng = seed => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
const POOL = ['', '', '   ', '# Heading one', '## Sub heading', '### Deep', '```', '~~~', '---', '| a | b |', 'id,name,email', '1,Ann,a@x.io',
  'Plain sentence with several words in it.', 'Ünïcödé 日本語のテキスト 😀', '\ttabbed line', 'trailing spaces   ', '- list item', '#hashtag', '> quote'];
function randomText(r, lines) {
  const out = [];
  for (let i = 0; i < lines; i++) {
    const roll = r();
    out.push(roll < 0.12 ? 'long '.repeat(Math.floor(r() * 120)) + 'end' : POOL[Math.floor(r() * POOL.length)]);
  }
  let t = out.join('\n');
  if (r() < 0.5) t += '\n';
  return t.trim() ? t : 'x';
}
const tokens = s => s.split(/\s+/).filter(Boolean);

test('never changes the text: 300 random documents round-trip exactly', async () => {
  const r = rng(42);
  for (let n = 0; n < 300; n++) {
    const text = randomText(r, 1 + Math.floor(r() * 400));
    const plan = await planImport(text, { title: 'T', now: new Date('2026-10-31T00:00:00Z') });
    assert.ok(verifyPlan(text, plan));
    assert.equal(plan.parts.flatMap(p => p.pieces).filter(x => !x.added).map(x => x.text).join(''), text);
    for (const p of plan.parts) {
      assert.ok(p.doc.length <= 200000 && p.doc.length <= LIMITS.partChars);
      assert.ok(p.doc.startsWith('---\nai_enabled: true\n'));
      p.pieces.forEach((piece, i) => {
        if (i === 0 || !piece.added) return;
        assert.match(piece.text, /^\n?#{1,6} [^\n]+\n\n$/);          // an added label is one heading line
        assert.ok(i === 1 || p.pieces[i - 1].text.endsWith('\n'));    // and only ever starts on a fresh line
      });
    }
  }
});

test('search index sees every original word, within chunk limits', async () => {
  const r = rng(7);
  for (let n = 0; n < 60; n++) {
    const text = randomText(r, 20 + Math.floor(r() * 300)).replace(/long (long )+/g, 'long ');
    const plan = await planImport(text);
    const seen = new Map();
    for (const p of plan.parts) {
      const chunks = chunkMarkdown(p.doc);
      assert.ok(chunks.length <= p.chunks && chunks.length <= 500, `${chunks.length} chunks > estimate ${p.chunks}`);
      assert.ok(chunks.every(c => c.content.length <= 2500));
      assert.ok(!chunks.some(c => c.content.includes('ai_enabled')));
      for (const t of tokens(chunks.map(c => c.content).join('\n'))) seen.set(t, (seen.get(t) ?? 0) + 1);
    }
    const want = new Map();
    for (const t of tokens(text)) want.set(t, (want.get(t) ?? 0) + 1);
    for (const [t, c] of want) assert.ok((seen.get(t) ?? 0) >= c, `word lost from search index: ${t}`);
  }
});

test('headings in the paste become the sections; short sections get no labels', async () => {
  const text = '# One\nalpha\n\n## Two\nbeta\n';
  const plan = await planImport(text, { title: 'Doc' });
  assert.equal(plan.kind, 'markdown');
  assert.equal(plan.labels, 0);
  assert.equal(plan.parts.length, 1);
  assert.equal(plan.parts[0].path, '00 Inbox/Doc.md');
  assert.ok(plan.parts[0].doc.endsWith(`---\n\n${text}`));
});

test('wall of lines is cut at line breaks, not mid-word', async () => {
  const text = Array.from({ length: 800 }, (_, i) => `2026-01-01 12:00 user${i}: message number ${i} about topic ${i % 9}`).join('\n');
  const plan = await planImport(text);
  assert.equal(plan.kind, 'text');
  assert.ok(plan.labels > 10);
  const body = plan.parts[0].pieces.filter(x => !x.added).map(x => x.text);
  assert.ok(body.slice(0, -1).every(b => b.endsWith('\n')));
  assert.ok(body.every(b => b.length <= LIMITS.unitChars));
  assert.match(plan.parts[0].pieces[1].text, /^## Lines 1–\d+\n\n$/);
});

test('csv gets row labels with the first row', async () => {
  const text = 'id,name,email\n' + Array.from({ length: 300 }, (_, i) => `${i},Person ${i},p${i}@example.com`).join('\n');
  const plan = await planImport(text);
  assert.equal(plan.kind, 'table');
  assert.match(plan.parts[0].pieces[1].text, /## Rows 1–\d+ · first row: id, name, email/);
});

test('large paste splits into numbered notes, each within limits', async () => {
  const text = Array.from({ length: 40000 }, (_, i) => `row ${i} ${'data '.repeat(8)}`).join('\n');
  const plan = await planImport(text, { title: 'Big', folder: 'Imports/2026' });
  assert.ok(plan.parts.length > 3);
  plan.parts.forEach((p, i) => {
    assert.equal(p.path, `Imports/2026/Big (part ${i + 1} of ${plan.parts.length}).md`);
    assert.ok(p.doc.length <= LIMITS.partChars);
    assert.ok(JSON.stringify(p.doc).length <= LIMITS.partJsonBytes);
    assert.ok(p.doc.includes(`import_part: ${i + 1} of ${plan.parts.length}`));
  });
  assert.ok(verifyPlan(text, plan));
});

test('code fences are never cut or labelled inside', async () => {
  const fence = '```\n' + Array.from({ length: 200 }, (_, i) => `code line ${i} ${'x'.repeat(30)}`).join('\n') + '\n```\n';
  const text = 'intro line\n\n' + fence + '\nafter\n';
  const plan = await planImport(text);
  const body = plan.parts[0].pieces.filter(x => !x.added).map(x => x.text);
  assert.ok(body.some(b => b.includes(fence)), 'the fenced block stays in one piece');
  assert.equal(plan.longBlocks, 1);
});

test('an unclosed fence is reported and still lossless', async () => {
  const text = 'a\n\n```\nnever closed\n' + 'line\n'.repeat(1000);
  const plan = await planImport(text);
  assert.ok(plan.warnings.some(w => /never closed/.test(w)));
  assert.ok(verifyPlan(text, plan));
});

test('text that cannot be stored unchanged is refused, not repaired', async () => {
  for (const bad of ['', '   \n', 'a\u0000b', 'a\r\nb', 'a\r', 'x\ud800y', 'x'.repeat(LIMITS.maxBytes + 1)])
    assert.ok(checkText(bad), JSON.stringify(bad.slice(0, 10)));
  await assert.rejects(planImport('a\r\nb'), /carriage/);
  await assert.rejects(planImport('x', { folder: '98 Private' }), /not available/);
});

test('one unbreakable block larger than a note is refused with an explanation', async () => {
  await assert.rejects(planImport('x'.repeat(160000)), /unbroken block/);
});

test('titles and folders are made path-safe without touching the text', async () => {
  const plan = await planImport('hello', { title: 'a/b:c*"d"?', folder: ' ../Inbox/ ' });
  assert.equal(plan.parts[0].path, 'Inbox/a b c d.md');
  const dflt = await planImport('hello', { now: new Date('2026-10-31T14:05:09Z') });
  assert.equal(dflt.parts[0].path, '00 Inbox/Pasted import 2026-10-31 14.05.md');
});

test('ai flag is written to frontmatter', async () => {
  assert.match((await planImport('hi', { ai: false })).parts[0].doc, /^---\nai_enabled: false\n/);
});
