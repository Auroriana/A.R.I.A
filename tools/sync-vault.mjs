import { readdir, lstat, readFile, writeFile, mkdir, realpath, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanPath, normalize, MAX_NOTE_CHARS, chunkMarkdown } from '../web/lib/notes.js';
import { planSync } from './sync-plan.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const sha = s => createHash('sha256').update(s, 'utf8').digest('hex');
const DENY_DIR = /^(98 private|80 templates)$/i;
const DEFAULT_VAULT_ID = 'a81a0000-0000-4000-8000-0000000000f1'; // the "Aria Knowledge" vault

function parseArgs(argv) {
  const o = { apply: false, watch: 0, resolve: {}, massDelete: false, vault: path.join(root, 'vault', 'Aria Knowledge'), cloudVault: 'Aria Knowledge', vaultGiven: false, cloudGiven: false, createVault: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') o.apply = true;
    else if (a === '--allow-mass-delete') o.massDelete = true;
    else if (a === '--watch') o.watch = Math.max(30, Number(argv[i + 1]?.match(/^\d+$/) ? argv[++i] : 60));
    else if (a === '--create-vault') o.createVault = true;
    else if (a === '--cloud-vault' && argv[i + 1]) { o.cloudVault = argv[++i]; o.cloudGiven = true; }
    else if (a === '--vault' && argv[i + 1]) { o.vault = path.resolve(argv[++i]); o.vaultGiven = true; }
    else if (a === '--resolve' && argv[i + 1]) {
      const v = argv[++i], k = v.lastIndexOf('=');
      const choice = v.slice(k + 1);
      if (k < 1 || !['local', 'web'].includes(choice)) throw new Error('--resolve "Folder/Note.md=local|web"');
      o.resolve[v.slice(0, k)] = choice;
    } else throw new Error('Usage: node tools/sync-vault.mjs [--vault PATH] [--cloud-vault NAME [--create-vault]] [--apply] [--resolve "path.md=local|web"] [--allow-mass-delete]');
  }
  if (o.cloudGiven && !o.vaultGiven) throw new Error('--cloud-vault needs --vault PATH too, so another folder cannot be synced into it by mistake.');
  return o;
}

async function scan(vault) {
  const canonical = await realpath(vault);
  const files = new Map(), skipped = { invalidOrDenied: 0, links: 0, oversized: 0, unreadable: 0 };
  async function walk(dir, rel) {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name), r = rel ? `${rel}/${e.name}` : e.name;
      try {
        const info = await lstat(full);
        if (info.isSymbolicLink()) { skipped.links++; continue; }
        if (info.isDirectory()) { if (DENY_DIR.test(r)) { skipped.invalidOrDenied++; continue; } await walk(full, r); continue; }
        if (!info.isFile() || !/\.md$/i.test(e.name)) continue;
        try { cleanPath(r); } catch { skipped.invalidOrDenied++; continue; }
        if (info.size > MAX_NOTE_CHARS * 4) { skipped.oversized++; continue; }
        const text = normalize(new TextDecoder('utf-8', { fatal: true }).decode(await readFile(full)));
        if (text.length > MAX_NOTE_CHARS || text.includes('\u0000')) { skipped.oversized++; continue; }
        files.set(r, { hash: sha(text), text });
      } catch { skipped.unreadable++; }
    }
  }
  await walk(vault, '');
  // Only unreadable/oversized entries make the scan "incomplete" (they could hide files from the delete logic).
  return { canonical, files, skipped, complete: skipped.unreadable === 0 && skipped.oversized === 0 };
}

async function sb(route, { token, body, headers } = {}) {
  const r = await fetch(process.env.SUPABASE_URL + route, {
    method: body ? 'POST' : 'GET',
    headers: { apikey: process.env.SUPABASE_PUBLISHABLE_KEY, ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000)
  });
  if (!r.ok) throw new Error(`Supabase request failed (${r.status}) ${route.split('?')[0]}`);
  return r.status === 204 ? null : r.json();
}

async function login() {
  for (const k of ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'OWNER_USER_ID', 'ARIA_EMAIL', 'ARIA_PASSWORD']) if (!process.env[k]) throw new Error(`Missing environment variable ${k}`);
  const s = await sb('/auth/v1/token?grant_type=password', { body: { email: process.env.ARIA_EMAIL, password: process.env.ARIA_PASSWORD } });
  if (s.user?.id !== process.env.OWNER_USER_ID) throw new Error('Signed-in account is not the Aria owner.');
  return s.access_token;
}

async function resolveVault(token, name, create) {
  const rows = await sb('/rest/v1/aria_vaults?select=id,name&order=created_at.asc', { token });
  const hit = rows.find(v => v.name.trim().toLowerCase() === name.trim().toLowerCase());
  if (hit) return hit.id;
  if (!create) throw new Error(`Cloud vault "${name}" does not exist. Existing: ${rows.map(v => v.name).join(', ') || '(none)'}. Add --create-vault to create it.`);
  const r = await sb('/rest/v1/rpc/aria_create_vault', { token, body: { p_name: name.trim() } });
  if (!r.ok) throw new Error(`Could not create vault (${r.reason}).`);
  return r.id;
}

async function listRemote(token, vaultId) {
  const out = new Map();
  for (let from = 0; ; from += 1000) {
    const rows = await sb('/rest/v1/aria_notes?select=path,content_hash,version,deleted&vault_id=eq.' + vaultId + '&order=path.asc', { token, headers: { 'Range-Unit': 'items', Range: `${from}-${from + 999}` } });
    for (const n of rows) out.set(n.path, { hash: n.content_hash, version: n.version, deleted: n.deleted });
    if (rows.length < 1000) return out;
  }
}

async function writeSafely(vaultCanonical, rel, text) {
  cleanPath(rel); // cloud-supplied path: validate before touching disk
  const target = path.resolve(vaultCanonical, ...rel.split('/'));
  const inside = p => { const x = path.relative(vaultCanonical, p); return x && !x.startsWith('..') && !path.isAbsolute(x); };
  if (!inside(target)) throw new Error('Path escapes the vault.');
  await mkdir(path.dirname(target), { recursive: true });
  if (!inside(await realpath(path.dirname(target)))) throw new Error('Directory resolves outside the vault.');
  try { if ((await lstat(target)).isSymbolicLink()) throw new Error('Target is a symlink.'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const tmp = path.join(path.dirname(target), `.aria-${process.pid}-${Date.now()}.tmp`);
  await writeFile(tmp, text, 'utf8');
  await rename(tmp, target);
}

async function run(o) {
  const vault = await scan(o.vault);
  const token = await login();
  const vaultId = await resolveVault(token, o.cloudVault, o.createVault);
  const statePath = path.join(root, '.local', vaultId === DEFAULT_VAULT_ID ? 'aria-sync-state.json' : `aria-sync-${vaultId}.json`);
  let state = { vault: vault.canonical, notes: {} };
  try { state = JSON.parse(await readFile(statePath, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (state.vault !== vault.canonical) throw new Error(`Sync state belongs to a different vault (${state.vault}). Refusing to continue; delete .local/aria-sync-state.json only if you are sure.`);

  const remote = await listRemote(token, vaultId);
  const local = new Map([...vault.files].map(([p, f]) => [p, f.hash]));
  let actions = planSync({ local, remote, base: new Map(Object.entries(state.notes)), resolve: o.resolve });

  if (!vault.complete) {
    const n = actions.filter(a => a.type === 'delete-remote').length;
    if (n) console.warn(`Scan incomplete (unreadable/oversized files): skipping ${n} remote deletion(s).`);
    actions = actions.filter(a => a.type !== 'delete-remote');
  }
  const deletes = actions.filter(a => a.type === 'delete-remote').length;
  if (deletes > Math.max(3, Object.keys(state.notes).length * 0.2) && !o.massDelete) throw new Error(`Refusing to delete ${deletes} cloud notes (wrong vault path?). Re-run with --allow-mass-delete if intended.`);

  const count = {};
  for (const a of actions) if (a.type !== 'adopt' && a.type !== 'forget') count[a.type] = (count[a.type] ?? 0) + 1;
  console.log(`Cloud vault: ${o.cloudVault}.`);
  console.log(`Local ${local.size} notes, cloud ${[...remote.values()].filter(r => !r.deleted).length}. Skipped:`, vault.skipped);
  console.log('Plan:', Object.keys(count).length ? count : 'nothing to do');
  for (const a of actions) if (!['adopt', 'forget'].includes(a.type)) console.log(`  ${a.type.padEnd(13)} ${a.path}`);
  if (!o.apply) { console.log('Dry run. Re-run with --apply to execute.'); return; }

  const conflictsDir = path.join(root, '.local', 'aria-conflicts');
  let failures = 0;
  for (const a of actions) {
    const p = a.path;
    try {
      if (a.type === 'adopt') state.notes[p] = { hash: local.get(p), version: a.remoteVersion };
      else if (a.type === 'forget') delete state.notes[p];
      else if (a.type === 'push') {
        const text = vault.files.get(p).text;
        const r = await sb('/rest/v1/rpc/aria_save_note', { token, body: { p_vault: vaultId, p_path: p, p_content: text, p_base_version: a.baseVersion, p_origin: 'local', p_chunks: chunkMarkdown(text) } });
        if (!r.ok) { console.warn(`  push failed (${r.reason}): ${p}`); failures++; continue; }
        if (r.hash !== local.get(p)) { console.warn(`  hash mismatch after push, state not updated: ${p}`); failures++; continue; }
        state.notes[p] = { hash: r.hash, version: r.version };
      } else if (a.type === 'delete-remote') {
        const r = await sb('/rest/v1/rpc/aria_delete_note', { token, body: { p_vault: vaultId, p_path: p, p_base_version: a.baseVersion } });
        if (!r.ok) { console.warn(`  delete failed (${r.reason}): ${p}`); failures++; continue; }
        delete state.notes[p];
      } else if (a.type === 'pull' || a.type === 'conflict') {
        const rows = await sb(`/rest/v1/aria_notes?select=content,content_hash,version&deleted=eq.false&vault_id=eq.${vaultId}&path=eq.${encodeURIComponent(p)}`, { token });
        if (!rows.length) { console.warn(`  vanished from cloud: ${p}`); failures++; continue; }
        const { content, content_hash, version } = rows[0];
        if (sha(content) !== content_hash) { console.warn(`  cloud content failed integrity check: ${p}`); failures++; continue; }
        if (a.type === 'conflict') {
          const copy = path.join(conflictsDir, `${p.replaceAll('/', '__')}.web.md`);
          await mkdir(conflictsDir, { recursive: true });
          await writeFile(copy, content, 'utf8');
          console.warn(`  CONFLICT ${p}\n    web copy: ${copy}\n    decide: --resolve "${p}=local" (overwrite web) or "${p}=web" (overwrite local)`);
          failures++;
          continue;
        }
        const now = vault.files.get(p);
        // Re-check right before overwriting: Obsidian may have changed the file since the scan.
        if (now) { const cur = sha(normalize(new TextDecoder('utf-8', { fatal: true }).decode(await readFile(path.join(vault.canonical, ...p.split('/')))))); if (cur !== now.hash) { console.warn(`  changed locally during sync, skipped: ${p}`); failures++; continue; } }
        await writeSafely(vault.canonical, p, content);
        state.notes[p] = { hash: content_hash, version };
      }
    } catch (e) { console.warn(`  error on ${p}: ${e.message}`); failures++; }
  }
  await mkdir(path.dirname(statePath), { recursive: true });
  await writeFile(statePath, JSON.stringify(state, null, 1));
  console.log(failures ? `Done with ${failures} item(s) needing attention.` : 'Sync complete.');
  if (failures) process.exitCode = 1;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (!o.watch) return run(o);
  o.apply = true;
  console.log(`Watching: syncing every ${o.watch}s. Ctrl+C to stop.`);
  for (;;) {
    try { await run(o); } catch (e) { console.error(e.message); }
    process.exitCode = 0;
    await new Promise(r => setTimeout(r, o.watch * 1000));
  }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
