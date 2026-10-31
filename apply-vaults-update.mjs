// Run from the repository root:  node apply-vaults-update.mjs
// Applies the vault-switcher edits to existing files. All-or-nothing: if any expected text is not found
// exactly once, nothing is written. Safe to run twice (already-applied edits are skipped).
import { readFile, writeFile } from 'node:fs/promises';

const E = (file, old, now) => ({ file, old, now });
const edits = [
  // ---- web/lib/notes.js
  E('web/lib/notes.js', "export const normalize = s => s.replace(/\\r\\n?/g, '\\n');",
    "export const normalize = s => s.replace(/\\r\\n?/g, '\\n');\nexport const isUuid = v => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);"),

  // ---- web/lib/models.js
  E('web/lib/models.js', 'export const models = [', "import {isUuid} from './notes.js';\nexport const models = ["),
  E('web/lib/models.js', '  const history=body.history??[];',
    "  const vault=body.vault===undefined||body.vault==='all'?null:body.vault;\n  if(vault!==null&&!isUuid(vault)) throw new Error('Choose a valid vault.');\n  const history=body.history??[];"),
  E('web/lib/models.js', 'mode:body.mode,history};', 'mode:body.mode,history,vault};'),

  // ---- web/lib/notes-api.js
  E('web/lib/notes-api.js', "import { cleanPath, cleanContent, chunkMarkdown } from './notes.js';",
    "import { cleanPath, cleanContent, chunkMarkdown, isUuid } from './notes.js';\n\nconst vaultOf = (v, fail) => { if (!isUuid(v)) throw fail('Choose a vault.', 400); return v.toLowerCase(); };"),
  E('web/lib/notes-api.js', "export async function noteRoutes({ req, route, url, token, sb, fail, send }) {\n",
    `export async function noteRoutes({ req, route, url, token, sb, fail, send }) {
  if (req.method === 'GET' && route === '/api/vaults') {
    send(200, { vaults: await sb('/rest/v1/aria_vaults?select=id,name&order=created_at.asc,name.asc', token) });
    return true;
  }
  if (req.method === 'POST' && route === '/api/vault-create') {
    const b = await readJson(req);
    if (typeof b.name !== 'string') throw fail('Vault name required.');
    const r = await sb('/rest/v1/rpc/aria_create_vault', token, { p_name: b.name });
    if (!r.ok) {
      if (r.reason === 'exists') throw fail('A vault with that name already exists.', 409);
      if (r.reason === 'limit') throw fail('Vault limit reached (20).');
      throw fail('Vault names must be 1–80 characters with no control characters.');
    }
    send(200, { id: r.id, name: r.name });
    return true;
  }
`),
  E('web/lib/notes-api.js', "  if (req.method === 'GET' && route === '/api/notes') {\n    const notes = await sb('/rest/v1/aria_notes?select=path,title,version,updated_at,ai_enabled,origin&deleted=eq.false&order=path.asc&limit=1000', token);",
    "  if (req.method === 'GET' && route === '/api/notes') {\n    const vault = vaultOf(url.searchParams.get('vault'), fail);\n    const notes = await sb(`/rest/v1/aria_notes?select=path,title,version,updated_at,ai_enabled,origin&deleted=eq.false&vault_id=eq.${vault}&order=path.asc&limit=1000`, token);"),
  E('web/lib/notes-api.js', "    const path = cleanPath((await readJson(req)).path);\n    const rows = await sb(`/rest/v1/aria_notes?select=path,content,version,ai_enabled&deleted=eq.false&path=eq.${encodeURIComponent(path)}`, token);",
    "    const b = await readJson(req);\n    const vault = vaultOf(b.vault, fail);\n    const path = cleanPath(b.path);\n    const rows = await sb(`/rest/v1/aria_notes?select=path,content,version,ai_enabled&deleted=eq.false&vault_id=eq.${vault}&path=eq.${encodeURIComponent(path)}`, token);"),
  E('web/lib/notes-api.js', '    const path = cleanPath(b.path);\n    const content = cleanContent(b.content);',
    '    const vault = vaultOf(b.vault, fail);\n    const path = cleanPath(b.path);\n    const content = cleanContent(b.content);'),
  E('web/lib/notes-api.js', '{ p_path: path, p_content: content,', '{ p_vault: vault, p_path: path, p_content: content,'),
  E('web/lib/notes-api.js', "throw fail('Note could not be saved.', r.reason === 'denied' ? 403 : 400);",
    "throw fail(r.reason === 'invalid_vault' ? 'Unknown vault.' : 'Note could not be saved.', r.reason === 'denied' ? 403 : 400);"),

  // ---- web/api/index.js
  E('web/api/index.js', 'const {model,message,mode,history}=validateChat(', 'const {model,message,mode,history,vault}=validateChat('),
  E('web/api/index.js', "{p_query:message,p_embedding:vector}", "{p_query:message,p_embedding:vector,p_vault:vault}"),
  E('web/api/index.js', 'path:s.source_path,excerpt:s.content}', 'path:s.source_path,vault:s.vault_name,excerpt:s.content}'),

  // ---- web/public/app.js (chat page)
  E('web/public/app.js', "const $=id=>document.getElementById(id);let history=[],signedIn=false,busy=false,config;",
    "import {mountVaults} from '/vaults.js';\nconst $=id=>document.getElementById(id);let history=[],signedIn=false,busy=false,config,vaults;"),
  E('web/public/app.js', 'function account(email){signedIn=true;',
    "function syncVaultUi(){const on=$('mode').value==='vault';$('vault-wrap').hidden=!on;$('new-vault').hidden=!on;}\nasync function loadVaults(){if(vaults)return;try{vaults=await mountVaults({select:$('vault'),api,includeAll:true,createButton:$('new-vault')});}catch{vaults=undefined;}syncVaultUi();}\nfunction account(email){signedIn=true;loadVaults();"),
  E('web/public/app.js', "$('mode').onchange=()=>{reset();", "$('mode').onchange=()=>{reset();syncVaultUi();"),
  E('web/public/app.js', "mode:$('mode').value,history:history.slice(-6)}", "mode:$('mode').value,vault:$('vault').value||'all',history:history.slice(-6)}"),
  E('web/public/app.js', 'path.textContent=source.path;', "path.textContent=source.vault?source.vault+' · '+source.path:source.path;"),

  // ---- web/public/editor.js (notes page)
  E('web/public/editor.js', "const $ = id => document.getElementById(id);\n", "import { mountVaults } from '/vaults.js';\nconst $ = id => document.getElementById(id);\n"),
  E('web/public/editor.js', "busy = false; // open = {path, version}", "busy = false, vault = ''; // open = {path, version}"),
  E('web/public/editor.js', "notes = (await api('notes')).notes;", "notes = (await api(`notes?vault=${vault}`)).notes;"),
  E('web/public/editor.js', "api('note-read', { path })", "api('note-read', { vault, path })"),
  E('web/public/editor.js', "api('note', { path: open.path,", "api('note', { vault, path: open.path,"),
  E('web/public/editor.js', "api('note', { path, content, baseVersion: 0 })", "api('note', { vault, path, content, baseVersion: 0 })"),
  E('web/public/editor.js', "try { await loadList(); } catch (e) { status(e.message, true); }",
    `function resetEditor() {
  open = null; baseline = '';
  $('editor').value = ''; $('editor').disabled = true; $('props').hidden = true;
  $('current').textContent = 'No note open'; $('meta').textContent = 'Select a note, or create one.';
  setAi(null); status(''); updateButtons();
}
try {
  vault = (await mountVaults({
    select: $('vault'), api, createButton: $('new-vault'),
    canChange: () => !busy && (!dirty() || confirm('Discard unsaved changes?')),
    onChange: v => { vault = v; resetEditor(); loadList().catch(e => status(e.message, true)); }
  })).value;
  await loadList();
} catch (e) { status(e.message, true); }`),

  // ---- web/public/index.html
  E('web/public/index.html', 'View & edit vault</small></a>',
    'View & edit vault</small></a><a class="nav" href="/import.html">⇪ &nbsp; Import <small>Paste &amp; format data</small></a>'),
  E('web/public/index.html', '</select></label></div><button id="send"',
    '</select></label><label id="vault-wrap" hidden><span class="sr-only">Vault to search</span><select id="vault"></select></label><button type="button" id="new-vault" class="mini" title="Create a vault" hidden>＋</button></div><button id="send"'),

  // ---- web/public/notes.html
  E('web/public/notes.html', 'Conversations</a><button id="new-note" class="new">',
    'Conversations</a><a class="nav" href="/import.html">⇪ &nbsp; Import</a><button id="new-note" class="new">'),
  E('web/public/notes.html', '<div class="section-label">VAULT</div><nav id="list"',
    '<div class="section-label">VAULT</div><div class="vault-pick"><select id="vault" aria-label="Vault"></select><button type="button" id="new-vault" class="mini" title="Create a vault">＋</button></div><nav id="list"'),

  // ---- tools/sync-vault.mjs
  E('tools/sync-vault.mjs', "const DENY_DIR = /^(98 private|80 templates)$/i;",
    "const DENY_DIR = /^(98 private|80 templates)$/i;\nconst DEFAULT_VAULT_ID = 'a81a0000-0000-4000-8000-0000000000f1'; // the \"Aria Knowledge\" vault"),
  E('tools/sync-vault.mjs', "massDelete: false, vault: path.join(root, 'vault', 'Aria Knowledge') };",
    "massDelete: false, vault: path.join(root, 'vault', 'Aria Knowledge'), cloudVault: 'Aria Knowledge', vaultGiven: false, cloudGiven: false, createVault: false };"),
  E('tools/sync-vault.mjs', "    else if (a === '--vault' && argv[i + 1]) o.vault = path.resolve(argv[++i]);",
    "    else if (a === '--create-vault') o.createVault = true;\n    else if (a === '--cloud-vault' && argv[i + 1]) { o.cloudVault = argv[++i]; o.cloudGiven = true; }\n    else if (a === '--vault' && argv[i + 1]) { o.vault = path.resolve(argv[++i]); o.vaultGiven = true; }"),
  E('tools/sync-vault.mjs', "[--vault PATH] [--apply]", "[--vault PATH] [--cloud-vault NAME [--create-vault]] [--apply]"),
  E('tools/sync-vault.mjs', "  return o;\n}\n\nasync function scan",
    "  if (o.cloudGiven && !o.vaultGiven) throw new Error('--cloud-vault needs --vault PATH too, so another folder cannot be synced into it by mistake.');\n  return o;\n}\n\nasync function scan"),
  E('tools/sync-vault.mjs', "async function listRemote(token) {",
    `async function resolveVault(token, name, create) {
  const rows = await sb('/rest/v1/aria_vaults?select=id,name&order=created_at.asc', { token });
  const hit = rows.find(v => v.name.trim().toLowerCase() === name.trim().toLowerCase());
  if (hit) return hit.id;
  if (!create) throw new Error(\`Cloud vault "\${name}" does not exist. Existing: \${rows.map(v => v.name).join(', ') || '(none)'}. Add --create-vault to create it.\`);
  const r = await sb('/rest/v1/rpc/aria_create_vault', { token, body: { p_name: name.trim() } });
  if (!r.ok) throw new Error(\`Could not create vault (\${r.reason}).\`);
  return r.id;
}

async function listRemote(token, vaultId) {`),
  E('tools/sync-vault.mjs', "aria_notes?select=path,content_hash,version,deleted&order=path.asc'", "aria_notes?select=path,content_hash,version,deleted&vault_id=eq.' + vaultId + '&order=path.asc'"),
  E('tools/sync-vault.mjs',
    "  const statePath = path.join(root, '.local', 'aria-sync-state.json');\n",
    "  const token = await login();\n  const vaultId = await resolveVault(token, o.cloudVault, o.createVault);\n  const statePath = path.join(root, '.local', vaultId === DEFAULT_VAULT_ID ? 'aria-sync-state.json' : `aria-sync-${vaultId}.json`);\n"),
  E('tools/sync-vault.mjs', "\n  const token = await login();\n  const remote = await listRemote(token);", "\n  const remote = await listRemote(token, vaultId);"),
  E('tools/sync-vault.mjs', "console.log(`Local ${local.size} notes,", "console.log(`Cloud vault: ${o.cloudVault}.`);\n  console.log(`Local ${local.size} notes,"),
  E('tools/sync-vault.mjs', "body: { p_path: p, p_content: text,", "body: { p_vault: vaultId, p_path: p, p_content: text,"),
  E('tools/sync-vault.mjs', "body: { p_path: p, p_base_version: a.baseVersion } }", "body: { p_vault: vaultId, p_path: p, p_base_version: a.baseVersion } }"),
  E('tools/sync-vault.mjs', "&deleted=eq.false&path=eq.${encodeURIComponent(p)}`", "&deleted=eq.false&vault_id=eq.${vaultId}&path=eq.${encodeURIComponent(p)}`"),
];

// Appended to the end of a file (skipped if the marker is already there).
const appends = [
  { file: 'web/public/style.css', marker: '.mini{', text: '\n.mini{border:1px solid #e7ebdf;border-radius:6px;background:#fafbf7;color:#697d60;font-size:13px;padding:5px 9px;line-height:1}\n' },
  { file: 'web/public/notes.css', marker: '.vault-pick{', text: '\n.vault-pick{display:flex;gap:6px;margin:0 0 10px}\n.vault-pick select{flex:1;max-width:none;min-width:0}\n' },
  { file: 'web/README.md', marker: '## Vaults and paste import', text: `
## Vaults and paste import

Run \`supabase/004_vaults.sql\` after the earlier scripts (001, 002_notes, 002_search_questions, 003). It is safe to rerun. Existing notes move into a vault called "Aria Knowledge".

- **Switching vaults.** Chat: choose "Search my notes", then pick a vault (or "All vaults"). Notes and Import have their own picker. The ＋ button creates a vault.
- **Syncing your own Obsidian vault into a cloud vault:** \`node tools/sync-vault.mjs --vault "D:\\path\\to\\vault" --cloud-vault "My Vault" --create-vault\` (dry run; add \`--apply\` to execute). \`--vault\` is required with \`--cloud-vault\`. Each cloud vault keeps its own sync state in \`.local/\`.
- **Paste import** (\`/import.html\`). Your text is cut only at existing line breaks, never edited. Aria adds a small frontmatter header and \`##\` section labels between lines (shown highlighted in the preview). The text is checked before saving and each saved note is read back and compared with what was sent. Large pastes become numbered notes. Text that cannot be stored unchanged (NUL characters, \\r, broken Unicode, or one unbroken block over about 150,000 characters) is refused rather than altered.
` },
];

const cache = new Map();
const read = async f => cache.get(f) ?? (cache.set(f, await readFile(f, 'utf8')), cache.get(f));
const problems = [];
let applied = 0, skipped = 0;
for (const e of edits) {
  let text;
  try { text = await read(e.file); } catch { problems.push(`${e.file}: file not found`); continue; }
  const n = text.split(e.old).length - 1;
  if (text.includes(e.now)) skipped++;   // already applied (checked first: the new text contains the old text)
  else if (n === 1) { cache.set(e.file, text.replace(e.old, () => e.now)); applied++; }
  else problems.push(`${e.file}: expected text found ${n} times: ${JSON.stringify(e.old.slice(0, 70))}`);
}
for (const a of appends) {
  let text;
  try { text = await read(a.file); } catch { problems.push(`${a.file}: file not found`); continue; }
  if (text.includes(a.marker)) skipped++; else { cache.set(a.file, text.replace(/\s*$/, '\n') + a.text); applied++; }
}
if (problems.length) { console.error('Nothing was changed. Problems:\n- ' + problems.join('\n- ')); process.exit(1); }
for (const [f, t] of cache) await writeFile(f, t, 'utf8');
console.log(`Done: ${applied} edits applied, ${skipped} already present.`);
