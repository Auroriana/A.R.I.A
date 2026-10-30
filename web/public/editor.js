const $ = id => document.getElementById(id);
let notes = [], open = null, baseline = '', busy = false; // open = {path, version}

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

async function loadList() { notes = (await api('notes')).notes; renderList(); }

async function openNote(path) {
  if (busy || (dirty() && !confirm('Discard unsaved changes?'))) return;
  status('');
  try {
    const n = await api(`note?path=${encodeURIComponent(path)}`);
    open = { path: n.path, version: n.version };
    $('editor').disabled = false;
    $('editor').value = n.content;
    baseline = $('editor').value; // textarea-normalized text, so an untouched note is never "dirty"
    $('current').textContent = n.path;
    $('meta').textContent = `Version ${n.version}`;
    setAi(n.ai_enabled);
    renderList(); updateButtons();
  } catch (e) { status(e.message, true); }
}

async function save() {
  if (busy || !open || !dirty()) return;
  busy = true; updateButtons(); status('');
  try {
    const content = $('editor').value;
    const r = await api('note', { path: open.path, content, baseVersion: open.version });
    open.version = r.version; baseline = content;
    $('meta').textContent = `Saved · version ${r.version}`;
    setAi(r.ai_enabled);
    await loadList();
  } catch (e) { status(e.message, true); }
  finally { busy = false; updateButtons(); }
}

$('editor').oninput = updateButtons;
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
    const r = await api('note', { path, content, baseVersion: 0 });
    busy = false;
    await loadList();
    await openNote(path);
    $('meta').textContent = `Created · version ${r.version}`;
  } catch (e) { status(e.message, true); }
  finally { busy = false; updateButtons(); }
};

try { await loadList(); } catch (e) { status(e.message, true); }
