import { readdir, lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));

export async function auditVault(vaultPath, options = {}) {
  const root = path.resolve(vaultPath);
  const rootInfo = await lstat(root);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new Error('Vault must be a real directory, not a symlink or junction.');
  const canonicalRoot = await realpath(root);
  const exclusions = options.excludePaths ?? [];
  const maxFileBytes = options.maxFileBytes ?? 10 * 1024 * 1024;
  const chunkSize = options.estimatedChunkTokens ?? 700;
  const overlap = options.estimatedOverlapTokens ?? 100;
  const dimensions = options.embeddingDimensionsForEstimate ?? 768;
  if (!Array.isArray(exclusions) || exclusions.some(x => typeof x !== 'string' || !x.trim())) throw new Error('excludePaths must contain nonempty relative paths.');
  if (![maxFileBytes, chunkSize, dimensions].every(x => Number.isInteger(x) && x > 0) || !Number.isInteger(overlap) || overlap < 0 || overlap >= chunkSize) throw new Error('Invalid size, overlap, or embedding dimension settings.');
  const normalized = exclusions.map(x => x.replaceAll('\\', '/').replace(/\/$/, '').toLowerCase());
  if (normalized.some(x => x.startsWith('/') || x.includes(':') || x.split('/').includes('..'))) throw new Error('Exclusions must be vault-relative paths without parent traversal.');
  const result = {
    complete: true, markdownFiles: 0, markdownBytes: 0, whitespaceSeparatedWords: 0,
    unicodeCharacters: 0, approximateHeadingLines: 0, approximateWikilinks: 0,
    skipped: { excludedEntries: 0, hiddenEntries: 0, links: 0, nonMarkdownFiles: 0, oversizedFiles: 0 },
    readErrors: 0, roughChunkCount: 0
  };
  async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(directory, entry.name);
      const relative = path.relative(root, full).split(path.sep).join('/').toLowerCase();
      if (entry.name.startsWith('.')) { result.skipped.hiddenEntries++; continue; }
      if (normalized.some(x => relative === x || relative.startsWith(`${x}/`))) { result.skipped.excludedEntries++; continue; }
      try {
        const info = await lstat(full);
        if (info.isSymbolicLink()) { result.skipped.links++; continue; }
        const resolved = await realpath(full);
        const inside = path.relative(canonicalRoot, resolved);
        if (inside === '..' || inside.startsWith(`..${path.sep}`) || path.isAbsolute(inside)) { result.skipped.links++; continue; }
        if (info.isDirectory()) { await walk(full); continue; }
        if (!info.isFile() || path.extname(entry.name).toLowerCase() !== '.md') { result.skipped.nonMarkdownFiles++; continue; }
        if (info.size > maxFileBytes) { result.skipped.oversizedFiles++; result.complete = false; continue; }
        const buffer = await readFile(full);
        if (buffer.length > maxFileBytes) { result.skipped.oversizedFiles++; result.complete = false; continue; }
        const body = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
        const chars = [...body].length;
        result.markdownFiles++;
        result.markdownBytes += buffer.length;
        result.unicodeCharacters += chars;
        result.whitespaceSeparatedWords += body.match(/\S+/gu)?.length ?? 0;
        result.approximateHeadingLines += body.match(/^#{1,6}\s+.+$/gm)?.length ?? 0;
        result.approximateWikilinks += body.match(/\[\[[^\]\n]+\]\]/g)?.length ?? 0;
        const tokens = Math.ceil(chars / 4);
        result.roughChunkCount += tokens === 0 ? 0 : Math.max(1, Math.ceil((tokens - overlap) / (chunkSize - overlap)));
      } catch { result.readErrors++; result.complete = false; }
    }
  }
  await walk(root);
  result.roughTokensAtFourCharactersPerToken = Math.ceil(result.unicodeCharacters / 4);
  result.roughRawFloat32EmbeddingMiB = Number((result.roughChunkCount * dimensions * 4 / 1024 ** 2).toFixed(2));
  result.notes = [
    'No notes were uploaded or changed. Only aggregate counts are reported.',
    'Four characters per token is an English-text heuristic, not a tokenizer or a bound; it is unreliable for many languages.',
    'Chunk counts ignore heading boundaries. Counts of headings and wikilinks are lexical estimates, including examples in code blocks.',
    'Embedding bytes exclude text, metadata, database overhead, indexes, backups and attachments.',
    'Exclusions apply before reading. ai_enabled frontmatter is not interpreted by this local sizing tool.',
    'This tool does not implement cloud sync, retrieval, privacy classification, or spending limits.'
  ];
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('Usage: node tools/audit-vault.mjs [--vault PATH] [--config PATH]');
    return;
  }
  const flags = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--vault', '--config'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Use --help for valid arguments.');
    flags[args[i]] = args[i + 1];
  }
  const configPath = flags['--config'] ? path.resolve(flags['--config']) : path.join(projectRoot, 'config/project.example.json');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  if (!config.audit || typeof config.audit.vaultPath !== 'string') throw new Error('Configuration needs audit.vaultPath.');
  const vaultPath = flags['--vault'] ? path.resolve(flags['--vault']) : path.resolve(projectRoot, config.audit.vaultPath);
  const report = await auditVault(vaultPath, config.audit);
  console.log(JSON.stringify(report, null, 2));
  if (!report.complete) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error('Audit failed. Check the vault path, permissions, UTF-8 JSON configuration, and command arguments (--help).');
    process.exitCode = 1;
  });
}
