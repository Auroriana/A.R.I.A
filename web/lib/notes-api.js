import { cleanPath, cleanContent, chunkMarkdown } from './notes.js';

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
  if (req.method === 'GET' && route === '/api/notes') {
    const notes = await sb('/rest/v1/aria_notes?select=path,title,version,updated_at,ai_enabled,origin&deleted=eq.false&order=path.asc&limit=1000', token);
    send(200, { notes });
    return true;
  }
  if (req.method === 'GET' && route === '/api/note') {
    const path = cleanPath(url.searchParams.get('path'));
    const rows = await sb(`/rest/v1/aria_notes?select=path,content,version,ai_enabled&deleted=eq.false&path=eq.${encodeURIComponent(path)}`, token);
    if (!rows.length) throw fail('Note not found.', 404);
    send(200, rows[0]);
    return true;
  }
  if (req.method === 'POST' && route === '/api/note') {
    const b = await readJson(req);
    const path = cleanPath(b.path);
    const content = cleanContent(b.content);
    if (!Number.isInteger(b.baseVersion) || b.baseVersion < 0) throw fail('baseVersion required.');
    const r = await sb('/rest/v1/rpc/aria_save_note', token, { p_path: path, p_content: content, p_base_version: b.baseVersion, p_origin: 'web', p_chunks: chunkMarkdown(content) });
    if (!r.ok) {
      if (r.reason === 'conflict') return send(409, { error: 'This note changed elsewhere (Obsidian sync or another tab). Your text is still in the editor; copy it, reload the note, and merge.', version: r.version }), true;
      throw fail('Note could not be saved.', r.reason === 'denied' ? 403 : 400);
    }
    send(200, { version: r.version, ai_enabled: r.ai_enabled });
    return true;
  }
  return false;
}
