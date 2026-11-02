import { cleanPath, cleanContent, chunkMarkdown, isUuid } from './notes.js';
import { aliasesOf, extractLinks } from '../public/note-model.js';

const vaultOf = (v, fail) => { if (!isUuid(v)) throw fail('Choose a vault.', 400); return v.toLowerCase(); };

const LIMIT = 420000; // 200k chars of note text, with JSON/UTF-8 headroom

async function readJson(req) {
  if (req.body) {
    if (Buffer.byteLength(JSON.stringify(req.body)) > LIMIT) throw Object.assign(new Error('Request too large.'), { status: 413 });
    return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  }
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > LIMIT) throw Object.assign(new Error('Request too large.'), { status: 413 }); }
  return raw ? JSON.parse(raw) : {};
}

// Called by api/index.js after the owner session has been verified. Returns true if handled.
export async function noteRoutes({ req, route, url, token, sb, fail, send }) {
  if (req.method === 'GET' && route === '/api/vaults') {
    send(200, { vaults: await sb('/rest/v1/aria_vaults?select=id,name,description,allow_auto_file,is_unsorted&order=created_at.asc,name.asc', token) });
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
  if (req.method === 'GET' && route === '/api/notes') {
    const vault = vaultOf(url.searchParams.get('vault'), fail);
    const notes = [];
    for(let offset=0;;offset+=500){
      const rows=await sb(`/rest/v1/aria_notes?select=path,title,content,version,updated_at,ai_enabled,origin&deleted=eq.false&vault_id=eq.${vault}&order=path.asc&limit=500&offset=${offset}`,token);
      for(const {content,...n} of rows)notes.push({...n,aliases:aliasesOf(content??''),references:extractLinks(content??'')});
      if(rows.length<500)break;
    }
    send(200, { notes });
    return true;
  }
  if (req.method === 'POST' && route === '/api/note-read') {
    const b = await readJson(req);
    const vault = vaultOf(b.vault, fail);
    const path = cleanPath(b.path);
    const rows = await sb(`/rest/v1/aria_notes?select=path,content,version,ai_enabled&deleted=eq.false&vault_id=eq.${vault}&path=eq.${encodeURIComponent(path)}`, token);
    if (!rows.length) throw fail('Note not found.', 404);
    send(200, rows[0]);
    return true;
  }
  if (req.method === 'POST' && route === '/api/note') {
    const b = await readJson(req);
    const vault = vaultOf(b.vault, fail);
    const path = cleanPath(b.path);
    const content = cleanContent(b.content);
    if (!Number.isInteger(b.baseVersion) || b.baseVersion < 0) throw fail('baseVersion required.');
    const save = v => sb('/rest/v1/rpc/aria_save_note', token, { p_vault: vault, p_path: path, p_content: content, p_base_version: v, p_origin: 'web', p_chunks: chunkMarkdown(content) });
    let r = await save(b.baseVersion);
    if (!r.ok && r.reason === 'conflict' && b.baseVersion === 0) {
      const old = await sb(`/rest/v1/aria_notes?select=version,deleted&vault_id=eq.${vault}&path=eq.${encodeURIComponent(path)}`, token);
      if (old[0]?.deleted) r = await save(old[0].version);
    }
    if (!r.ok) {
      if (r.reason === 'conflict') return send(409, { error: 'This note changed elsewhere (Obsidian sync or another tab). Your text is still in the editor; copy it, reload the note, and merge.', version: r.version }), true;
      throw fail(r.reason === 'invalid_vault' ? 'Unknown vault.' : 'Note could not be saved.', r.reason === 'denied' ? 403 : 400);
    }
    send(200, { version: r.version, ai_enabled: r.ai_enabled });
    return true;
  }
    if (req.method === 'POST' && route === '/api/vault-update') {
    const b = await readJson(req), vault = vaultOf(b.vault, fail);
    const description = typeof b.description === 'string' ? b.description.trim() : '';
    if (description.length > 500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(description)) throw fail('Description must be under 500 characters.');
    const r = await sb('/rest/v1/rpc/aria_set_vault_description', token, { p_vault: vault, p_description: description });
    if (!r.ok) throw fail('Vault not found.', 404);
    send(200, { ok: true, description });
    return true;
  }
  if (req.method === 'POST' && route === '/api/note-move') {
    const b=await readJson(req),vault=vaultOf(b.vault,fail),toVault=vaultOf(b.toVault,fail),path=cleanPath(b.path),toPath=cleanPath(b.toPath);
    if(!Number.isInteger(b.baseVersion)||b.baseVersion<1)throw fail('baseVersion required.');
    const rows=await sb(`/rest/v1/aria_notes?select=content,version&deleted=eq.false&vault_id=eq.${vault}&path=eq.${encodeURIComponent(path)}`,token);
    if(!rows.length)throw fail('Note was moved or deleted. Refresh and try again.',404);
    if(rows[0].version!==b.baseVersion)throw fail('Note changed elsewhere. Save or reload it before moving.',409);
    const r=await sb('/rest/v1/rpc/aria_move_note',token,{p_vault:vault,p_path:path,p_base_version:b.baseVersion,p_to_vault:toVault,p_to_path:toPath,p_chunks:chunkMarkdown(rows[0].content)});
    if(!r.ok)throw fail(r.reason==='exists'?'That destination already has this filename. Choose another folder.':r.reason==='conflict'?'Note changed elsewhere. Reload before moving.':r.reason==='invalid_vault'?'Destination vault not found.':'Note could not be moved.',['exists','conflict'].includes(r.reason)?409:400);
    send(200,r);return true;
  }
  if (req.method === 'POST' && route === '/api/vault-reindex') {
    // Rebuilds search chunks (heading paths, order) from the stored text. Text is not changed.
    const b = await readJson(req), vault = vaultOf(b.vault, fail), offset = Number.isInteger(b.offset) && b.offset >= 0 ? b.offset : 0;
    const rows = await sb('/rest/v1/aria_notes?select=path,content,version&deleted=eq.false&ai_enabled=eq.true&vault_id=eq.' + vault + '&order=path.asc&limit=25&offset=' + offset, token);
    let failed = 0;
    for (const n of rows) {
      const r = await sb('/rest/v1/rpc/aria_save_note', token, { p_vault: vault, p_path: n.path, p_content: n.content, p_base_version: n.version, p_origin: 'web', p_chunks: chunkMarkdown(n.content) });
      if (!r.ok) failed++;
    }
    send(200, { processed: rows.length, failed, next: rows.length === 25 ? offset + 25 : null });
    return true;
  }
  if (req.method === 'POST' && route === '/api/note-delete') {
    const b = await readJson(req), vault = vaultOf(b.vault, fail), path = cleanPath(b.path);
    if (!Number.isInteger(b.baseVersion) || b.baseVersion < 1) throw fail('baseVersion required.');
    const r = await sb('/rest/v1/rpc/aria_delete_note', token, { p_vault: vault, p_path: path, p_base_version: b.baseVersion });
    if (!r.ok) {
      if (r.reason === 'conflict') return send(409, { error: 'This note changed elsewhere. Reload it before deleting.', version: r.version }), true;
      if (r.reason === 'missing') throw fail('Note not found.', 404);
      throw fail('Note could not be deleted.', r.reason === 'denied' ? 403 : 400);
    }
    send(200, { ok: true });
    return true;
  }
  return false;
}
