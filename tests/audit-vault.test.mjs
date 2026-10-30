import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { auditVault } from '../tools/audit-vault.mjs';

async function fixture() { return mkdtemp(path.join(os.tmpdir(), 'aria-audit-')); }

test('reads nested Markdown without changing it or returning note bodies', async () => {
  const root = await fixture();
  await mkdir(path.join(root, 'Topics'));
  const note = '# Distinctive secret phrase\n\nSome evidence [[Related Note]].';
  const file = path.join(root, 'Topics', 'Concept.MD');
  await writeFile(file, note);
  const report = await auditVault(root);
  assert.equal(report.markdownFiles, 1);
  assert.equal(report.approximateWikilinks, 1);
  assert.equal(report.approximateHeadingLines, 1);
  assert.equal(report.complete, true);
  assert.equal(await readFile(file, 'utf8'), note);
  assert.ok(!JSON.stringify(report).includes('Distinctive secret phrase'));
  assert.ok(!JSON.stringify(report).includes('Concept.MD'));
});

test('excludes private and hidden paths while preserving similarly named folders', async () => {
  const root = await fixture();
  for (const folder of ['98 Private', '.obsidian', '98 Private research']) {
    await mkdir(path.join(root, folder));
    await writeFile(path.join(root, folder, 'note.md'), '# Note');
  }
  const report = await auditVault(root, { excludePaths: ['98 private'] });
  assert.equal(report.markdownFiles, 1);
  assert.equal(report.skipped.excludedEntries, 1);
  assert.equal(report.skipped.hiddenEntries, 1);
});

test('reports oversized and invalid UTF-8 files as incomplete', async () => {
  const root = await fixture();
  await writeFile(path.join(root, 'large.md'), 'x'.repeat(101));
  await writeFile(path.join(root, 'bad.md'), Buffer.from([0xff, 0xfe]));
  const report = await auditVault(root, { maxFileBytes: 100 });
  assert.equal(report.complete, false);
  assert.equal(report.skipped.oversizedFiles, 1);
  assert.equal(report.readErrors, 1);
});

test('handles empty notes and ignores attachments', async () => {
  const root = await fixture();
  await writeFile(path.join(root, 'empty.md'), '');
  await writeFile(path.join(root, 'photo.png'), 'not a note');
  const report = await auditVault(root);
  assert.equal(report.markdownFiles, 1);
  assert.equal(report.roughChunkCount, 0);
  assert.equal(report.skipped.nonMarkdownFiles, 1);
});

test('rejects invalid chunk settings and traversal exclusions', async () => {
  const root = await fixture();
  await assert.rejects(auditVault(root, { estimatedChunkTokens: 10, estimatedOverlapTokens: 10 }));
  await assert.rejects(auditVault(root, { excludePaths: ['../outside'] }));
});
