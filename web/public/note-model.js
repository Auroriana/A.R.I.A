// Shared by the editor, source cards, import, and retrieval. No DOM required.
export const noteName = path => path.split('/').at(-1).replace(/\.md$/i, '');
export const parentPath = path => path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
export function splitNote(text) {
  const m = text.match(/^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/);
  return { front: m?.[0] ?? '', properties: m?.[1] ?? '', body: text.slice(m?.[0].length ?? 0) };
}
export function setProperty(text, key, value) {
  const { front, properties, body } = splitNote(text);
  const lines = properties ? properties.split('\n') : [];
  const index = lines.findIndex(l => l.startsWith(key + ':'));
  if (index >= 0) { let end=index+1;while(end<lines.length&&/^(?:[ \t]+|-[ \t])/.test(lines[end]))end++;lines.splice(index,end-index); }
  if (value !== undefined) lines.push(`${key}: ${JSON.stringify(value)}`);
  return lines.length ? `---\n${lines.join('\n')}\n---\n${body}` : body;
}
export function aliasesOf(text) {
  const fm = splitNote(text).properties;
  const m = fm.match(/^aliases:\s*(.*)$/m);
  if (!m) return [];
  try { const a = JSON.parse(m[1]); return Array.isArray(a) ? a.filter(x => typeof x === 'string') : [String(a)]; } catch {}
  if (m[1].trim()) return m[1].replace(/^\[|\]$/g, '').split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  return (fm.slice(m.index + m[0].length).match(/^(?:\n[ \t]*- .*)+/)?.[0] ?? '').split('\n').map(s => s.replace(/^\s*-\s*/, '').trim()).filter(Boolean);
}
export const LINK_PATTERN = /!?\[\[([^\]\n]+)\]\]|(?<!!)\[([^\]\n]+)\]\((<[^>\n]+>|[^\s)]+)(?:\s+"[^"]*")?\)/g;
export function parseTarget(value, label, wiki = true) {
  const [raw, alias] = wiki ? value.split('|') : [value];
  let target;
  try { target = decodeURIComponent(raw.replace(/^<|>$/g, '')); } catch { target = raw; }
  const hash = target.indexOf('#');
  const path = (hash < 0 ? target : target.slice(0, hash)).replace(/\.md$/i, '');
  return { target, path, anchor: hash < 0 ? '' : target.slice(hash + 1), label: label ?? alias ?? (path ? noteName(path) : target.slice(1)), wiki };
}
export function extractLinks(text) {
  let fence = false;
  const body = splitNote(text).body.split('\n').filter(l => {
    if (/^\s*(```|~~~)/.test(l)) { fence = !fence; return false; }
    return !fence;
  }).join('\n').replace(/`[^`\n]*`/g, '').replace(/\\\[/g, '');
  const seen = new Set(), out = [];
  for (const m of body.matchAll(LINK_PATTERN)) {
    const ref = m[1] ? parseTarget(m[1]) : parseTarget(m[3], m[2], false);
    if (/^[a-z][\w+.-]*:/i.test(ref.target) || ref.target.startsWith('//')) continue;
    const key = ref.target.toLowerCase();
    if (!seen.has(key)) { seen.add(key); out.push(ref); }
  }
  return out;
}
function normalizePath(path) {
  const out = [];
  for (const p of path.split('/')) { if (p === '..') { if (!out.length) return null; out.pop(); } else if (p && p !== '.') out.push(p); }
  return out.join('/');
}
export function resolveLink(ref, from, notes) {
  if (typeof ref === 'string') ref = parseTarget(ref);
  if (!ref.path) return { ...ref, resolved: from };
  const root = normalizePath(ref.path), relative = normalizePath([parentPath(from), ref.path].filter(Boolean).join('/'));
  const candidates = ref.wiki ? [root, relative] : [relative, root];
  for (const p of candidates) {
    const n = notes.find(n => n.path.replace(/\.md$/i, '').toLowerCase() === p?.toLowerCase());
    if (n) return { ...ref, resolved: n.path };
  }
  const matches = notes.filter(n => noteName(n.path).toLowerCase() === ref.path.toLowerCase() || n.aliases?.some(a => a.toLowerCase() === ref.path.toLowerCase()));
  const local = matches.filter(n => parentPath(n.path) === parentPath(from));
  const found = local.length === 1 ? local : matches;
  return { ...ref, resolved: found.length === 1 ? found[0].path : null, ambiguous: found.length > 1, createPath: (ref.wiki ? root : relative) + '.md' };
}
export function buildTree(notes, folders = []) {
  const root = { path: '', folders: new Map(), notes: [] };
  function folder(path) { let node = root, full = ''; for (const p of path.split('/').filter(Boolean)) { full = full ? `${full}/${p}` : p; if (!node.folders.has(p)) node.folders.set(p, { name: p, path: full, folders: new Map(), notes: [] }); node = node.folders.get(p); } return node; }
  folders.forEach(folder);
  notes.forEach(n => folder(parentPath(n.path)).notes.push(n));
  return root;
}
export function fingerprint(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return `${s.length}:${h >>> 0}`; }
export function validateLayout(body, layout) {
  if (!layout || !Array.isArray(layout.spans ?? []) || !Array.isArray(layout.blocks ?? [])) throw new Error('Invalid formatting plan.');
  if (Object.keys(layout).some(k => !['spans','blocks','hash'].includes(k))) throw new Error('Formatting may contain only positions and styles.');
  const lines = body.split('\n');
  const spans = (layout.spans ?? []).map(s => {
    if (!s || Object.keys(s).some(k => !['start','end','kind','color'].includes(k)) || !Number.isInteger(s.start) || !Number.isInteger(s.end) || s.start < 0 || s.end <= s.start || s.end > body.length || !['strong','em','color'].includes(s.kind) || (s.kind === 'color' && !/^(red|purple|#[0-9a-f]{3,8}|rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\))$/i.test(s.color))) throw new Error('Invalid text style range.');
    return s;
  });
  const blocks = (layout.blocks ?? []).map(b => {
    if (!b || Object.keys(b).some(k => !['line','kind','level','endLine'].includes(k)) || !Number.isInteger(b.line) || b.line < 1 || b.line > lines.length || !['heading','branch','indent'].includes(b.kind) || (b.kind === 'heading' && ![1,2,3,4,5,6].includes(b.level)) || (b.kind === 'indent' && (!Number.isInteger(b.level) || b.level < 0 || b.level > 20)) || (b.kind === 'branch' && (!Number.isInteger(b.endLine) || b.endLine <= b.line || b.endLine > lines.length))) throw new Error('Invalid paragraph range.');
    return b;
  });
  return { hash: fingerprint(body), spans, blocks };
}
export function readLayout(text) {
  const { properties, body } = splitNote(text);
  try { const layout = JSON.parse(properties.match(/^aria_format: (.+)$/m)?.[1] ?? 'null'); return layout?.hash === fingerprint(body) ? validateLayout(body, layout) : null; } catch { return null; }
}
export function withLayout(text, layout) {
  const body = splitNote(text).body;
  const result = setProperty(text, 'aria_format', validateLayout(body, layout));
  if (splitNote(result).body !== body) throw new Error('Formatting changed the original text.');
  return result;
}

// Keep pasted styling attached to its text when an ordinary editor change shifts offsets.
export function rebaseLayout(previous, next) {
  const layout=readLayout(previous),old=splitNote(previous),now=splitNote(next);
  if(!layout||old.body===now.body||old.front!==now.front)return next;
  let start=0,end=old.body.length,newEnd=now.body.length;
  while(start<end&&start<newEnd&&old.body[start]===now.body[start])start++;
  while(end>start&&newEnd>start&&old.body[end-1]===now.body[newEnd-1]){end--;newEnd--;}
  const delta=newEnd-end,first=old.body.slice(0,start).split('\n').length,last=old.body.slice(0,end).split('\n').length;
  const lineDelta=now.body.split('\n').length-old.body.split('\n').length,total=now.body.split('\n').length;
  const spans=layout.spans.map(s=>({...s,start:s.start<=start?s.start:s.start>=end?s.start+delta:start,end:s.end<=start?s.end:s.end>=end?s.end+delta:newEnd})).filter(s=>s.end>s.start);
  const blocks=layout.blocks.filter(b=>!(b.line>first&&b.line<=last)).map(b=>({...b,line:b.line>last?b.line+lineDelta:b.line,...(b.endLine?{endLine:Math.min(total,b.endLine>=last?b.endLine+lineDelta:b.endLine)}:{})})).filter(b=>b.line<=total&&(!b.endLine||b.endLine>b.line));
  try{return withLayout(next,{spans,blocks});}catch{return next;}
}
