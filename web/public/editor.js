import { mountVaults } from '/vaults.js';
const $ = id => document.getElementById(id);
let notes = [], open = null, baseline = '', busy = false, vault = ''; // open = {path, version}

async function api(route, body) {
  const r = await fetch(`/api/${route}`, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : {}, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401) { location.href = '/'; throw new Error('Sign in required.'); }
  if (!r.ok) throw Object.assign(new Error(data.error ?? 'Request failed.'), { status: r.status, data });
  return data;
}
const dirty = () => open && $('editor').value !== baseline;
function status(msg, error = false) { $('status').textContent = msg; $('status').hidden = !msg; $('status').classList.toggle('error', error); }
function updateButtons() { $('save').disabled = busy || !open || !dirty(); }
function setAi(on) { $('ai-state').hidden = on === null; $('ai-state').textContent = on ? 'AI search: on' : 'AI search: off'; }

function renderList() {
  const list = $('list');
  list.replaceChildren();
  let lastFolder = null;
  for (const n of notes) {
    const i = n.path.lastIndexOf('/'), folder = i < 0 ? '' : n.path.slice(0, i), name = n.path.slice(i + 1);
    if (folder !== lastFolder) { lastFolder = folder; if (folder) { const f = document.createElement('div'); f.className = 'folder'; f.textContent = folder.toUpperCase(); list.append(f); } }
    const b = document.createElement('button');
    b.textContent = name.replace(/\.md$/i, '');
    b.title = n.path;
    if (open?.path === n.path) b.setAttribute('aria-current', 'true');
    b.onclick = () => openNote(n.path);
    list.append(b);
  }
  if (!notes.length) { const p = document.createElement('p'); p.className = 'folder'; p.textContent = 'No notes yet. Create one, or run the sync command.'; list.append(p); }
}

async function loadList() { notes = (await api(`notes?vault=${vault}`)).notes; renderList(); }

async function openNote(path) {
  if (busy || (dirty() && !confirm('Discard unsaved changes?'))) return;
  status('');
  try {
    const n = await api('note-read', { vault, path });
    open = { path: n.path, version: n.version };
    $('editor').disabled = false;
    $('editor').value = n.content;
    baseline = $('editor').value; // textarea-normalized text, so an untouched note is never "dirty"
    $('current').textContent = n.path;
    $('meta').textContent = `Version ${n.version}`;
    setAi(n.ai_enabled);
    $('props').hidden = false; syncProps();
    renderList(); updateButtons();
  } catch (e) { status(e.message, true); }
}

async function save() {
  if (busy || !open || !dirty()) return;
  busy = true; updateButtons(); status('');
  try {
    const content = $('editor').value;
    const r = await api('note', { vault, path: open.path, content, baseVersion: open.version });
    open.version = r.version; baseline = content;
    $('meta').textContent = `Saved · version ${r.version}`;
    setAi(r.ai_enabled);
    await loadList();
  } catch (e) { status(e.message, true); }
  finally { busy = false; updateButtons(); }
}


// ---- frontmatter helpers (line-based; leaves keys we don't manage untouched)
function splitFm(text) {
  const m = text.match(/^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/);
  return m ? { lines: m[1].split('\n'), rest: text.slice(m[0].length) } : { lines: [], rest: text };
}
function keyRange(lines, key) {
  const i = lines.findIndex(l => new RegExp(`^${key}[ \\t]*:`, 'i').test(l));
  if (i < 0) return null;
  let j = i + 1;
  while (j < lines.length && /^([ \t]+|-[ \t])/.test(lines[j])) j++;
  return { i, j };
}
function readList(lines, key) {
  const r = keyRange(lines, key);
  if (!r) return [];
  const first = lines[r.i].replace(/^[^:]*:/, '').trim();
  const raw = first ? first.replace(/^\[|\]$/g, '').split(',') : lines.slice(r.i + 1, r.j).map(l => l.replace(/^[ \t]*-[ \t]*/, ''));
  return raw.map(s => s.trim().replace(/^["']|["']$/g, '').replace(/^#/, '')).filter(Boolean);
}
const quote = s => (/^[\w\u00C0-\uFFFF][\w\u00C0-\uFFFF .\/-]*$/.test(s) ? s : JSON.stringify(s));
function setKey(text, key, value) { // value: string, array, or null/[] to remove
  const { lines, rest } = splitFm(text);
  const r = keyRange(lines, key);
  if (r) lines.splice(r.i, r.j - r.i);
  const list = Array.isArray(value);
  if (value !== null && !(list && !value.length)) lines.push(`${key}: ${list ? `[${value.map(quote).join(', ')}]` : value}`);
  if (!lines.length) return rest.replace(/^\n+/, '');
  return `---\n${lines.join('\n')}\n---\n${splitFm(text).lines.length || /^---/.test(text) ? rest : `\n${rest}`}`;
}
const csv = v => v.split(',').map(s => s.trim().replace(/^#/, '')).filter(Boolean);
function syncProps() {
  const { lines } = splitFm($('editor').value);
  $('ai-toggle').checked = lines.some(l => /^ai_enabled[ \t]*:[ \t]*true[ \t]*$/i.test(l));
  if (document.activeElement !== $('aliases')) $('aliases').value = readList(lines, 'aliases').join(', ');
  if (document.activeElement !== $('tags')) $('tags').value = readList(lines, 'tags').join(', ');
}
function edit(key, value) { $('editor').value = setKey($('editor').value, key, value); updateButtons(); syncProps(); }
$('ai-toggle').onchange = () => edit('ai_enabled', $('ai-toggle').checked ? 'true' : 'false');
$('aliases').onchange = () => edit('aliases', csv($('aliases').value));
$('tags').onchange = () => edit('tags', csv($('tags').value));

$('editor').oninput = () => { updateButtons(); syncProps(); };
$('save').onclick = save;
document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); } });
window.addEventListener('beforeunload', e => { if (dirty()) { e.preventDefault(); e.returnValue = ''; } });

$('new-note').onclick = async () => {
  if (busy || (dirty() && !confirm('Discard unsaved changes?'))) return;
  const path = prompt('Path for the new note (folder/Name.md):', '00 Inbox/Untitled.md');
  if (!path) return;
  if (notes.some(n => n.path.toLowerCase() === path.toLowerCase())) { status('A note with that path already exists.', true); return; }
  busy = true; status('');
  try {
    const title = path.split('/').pop().replace(/\.md$/i, '');
    const content = `---\nai_enabled: false\n---\n\n# ${title}\n`;
    const r = await api('note', { vault, path, content, baseVersion: 0 });
    busy = false;
    await loadList();
    await openNote(path);
    $('meta').textContent = `Created · version ${r.version}`;
  } catch (e) { status(e.message, true); }
  finally { busy = false; updateButtons(); }
};

function resetEditor() {
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
} catch (e) { status(e.message, true); }
