export const MAX_NOTE_CHARS = 200000;
const DENY = /^(98 private|80 templates)(\/|$)/i;
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const bad = (m = 'Invalid note path.') => Object.assign(new Error(m), { status: 400 });

export const normalize = s => s.replace(/\r\n?/g, '\n');
export const isUuid = v => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

// Vault-relative, forward-slash, .md only. Used by the API AND the local sync agent
// (the agent writes cloud-supplied paths to disk, so this is the traversal defense).
export function cleanPath(p) {
  if (typeof p !== 'string' || p.length < 4 || p.length > 300) throw bad();
  if (!/\.md$/i.test(p) || p.startsWith('/') || /[\u0000-\u001f\\:*?"<>|]/.test(p)) throw bad();
  const parts = p.split('/');
  for (const s of parts) {
    if (!s || s === '.' || s === '..' || s.startsWith('.') || /[ .]$/.test(s)) throw bad();
  }
  if (RESERVED.test(parts.at(-1).replace(/\.md$/i, '').split('.')[0])) throw bad();
  if (parts.slice(0, -1).some(s => RESERVED.test(s))) throw bad();
  if (DENY.test(p)) throw bad('That folder is not available in the web app.');
  return p;
}

export function cleanContent(c) {
  if (typeof c !== 'string') throw bad('Note content required.');
  const v = normalize(c);
  if (v.length > MAX_NOTE_CHARS) throw bad('Note is too large (200,000 character limit).');
  if (v.includes('\u0000')) throw bad('Note contains invalid characters.');
  return v;
}

function split(body, max) {
  const parts = [];
  let cur = '';
  for (const para of body.split(/\n{2,}/)) {
    if (para.length > max) {
      if (cur) { parts.push(cur); cur = ''; }
      const cps = [...para]; // code points: never split a surrogate pair
      for (let i = 0; i < cps.length; i += max) parts.push(cps.slice(i, i + max).join(''));
    } else if (cur && cur.length + para.length + 2 > max) { parts.push(cur); cur = para; }
    else cur = cur ? `${cur}\n\n${para}` : para;
  }
  if (cur) parts.push(cur);
  return parts;
}

// Heading-aware chunks of at most `max` characters (DB limit is 3,000). No overlap, no embeddings.
export function chunkMarkdown(md, max = 2500) {
  let text = normalize(md);
  const fm = text.match(/^---\n[\s\S]*?\n---(\n|$)/);
  if (fm) text = text.slice(fm[0].length);
  const out = [];
  let heading = '', buf = [], fence = false;
  const flush = () => {
    const body = buf.join('\n').trim();
    buf = [];
    if (body) for (const part of split(body, max)) out.push({ heading, content: part });
  };
  for (const line of text.split('\n')) {
    if (/^(```|~~~)/.test(line)) fence = !fence;
    const h = !fence && line.match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
    if (h) { flush(); heading = h[1].slice(0, 200); }
    buf.push(line);
  }
  flush();
  return out;
}
