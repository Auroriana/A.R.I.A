import { planImport, checkText, LIMITS } from '/importer.js';
import { mountVaults } from '/vaults.js';
const $ = id => document.getElementById(id);
const num = n => n.toLocaleString('en-US');
let plan = null, planned = '', vault = '', busy = false;

async function api(route, body) {
  const r = await fetch(`/api/${route}`, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : {}, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401) { location.href = '/'; throw new Error('Sign in required.'); }
  if (!r.ok) throw Object.assign(new Error(data.error ?? 'Request failed.'), { status: r.status });
  return data;
}
function status(msg, error = false) { $('status').textContent = msg; $('status').hidden = !msg; $('status').classList.toggle('error', error); }
function vaultName() { return $('vault').selectedOptions[0]?.text ?? ''; }
function refresh() {
  const text = $('paste').value;
  $('preview').disabled = busy || !text.trim();
  $('import').disabled = busy || !plan || planned !== text || !vault;
  $('import').textContent = vault ? `Import into “${vaultName()}”` : 'Import';
  $('count').textContent = text ? `${num(text.length)} characters · limit ${num(LIMITS.maxBytes)} bytes` : '';
}
function setBusy(b) { busy = b; $('paste').readOnly = b; refresh(); }
const KINDS = { markdown: 'Markdown with headings (your headings are the sections)', table: 'Delimited rows (CSV or similar)', text: 'Plain text' };

function row(dl, label, value) { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = label; dd.textContent = value; dl.append(dt, dd); }
function render(p) {
  const dl = $('facts'); dl.replaceChildren();
  row(dl, 'Detected', KINDS[p.kind]);
  row(dl, 'Your text', `${num(p.chars)} characters, ${num(p.lineCount)} lines`);
  row(dl, 'Notes to create', String(p.parts.length));
  row(dl, 'Section labels added', num(p.labels));
  row(dl, 'Original text check', `Identical. Removing everything highlighted gives back your text exactly (SHA-256 ${p.sha256.slice(0, 16)}…).`);
  const w = $('warnings'); w.replaceChildren();
  for (const m of p.warnings) { const li = document.createElement('li'); li.textContent = m; w.append(li); }
  const sample = $('sample'); sample.replaceChildren();
  let used = 0;
  for (const piece of p.parts[0].pieces) {
    if (used >= 6000) break;
    const t = piece.text.slice(0, 6000 - used); used += t.length;
    if (piece.added) { const s = document.createElement('span'); s.className = 'added'; s.textContent = t; sample.append(s); } else sample.append(document.createTextNode(t));
  }
  if (p.parts[0].doc.length > used) sample.append(document.createTextNode('\n… (preview shortened; the full text is saved)'));
  const ol = $('paths'); ol.replaceChildren();
  for (const part of p.parts) { const li = document.createElement('li'); li.textContent = part.path; ol.append(li); }
  $('result').hidden = false;
}

$('paste').oninput = () => { $('done').hidden = true; refresh(); };
$('preview').onclick = async () => {
  const text = $('paste').value;
  $('done').hidden = true;
  const err = checkText(text);
  if (err) { status(err, true); return; }
  setBusy(true); status('Formatting…');
  try {
    plan = await planImport(text, { title: $('title').value, folder: $('folder').value, ai: $('ai').checked });
    planned = text; render(plan); status('');
  } catch (e) { plan = null; $('result').hidden = true; status(e.message, true); }
  finally { setBusy(false); }
};
// Changing title, folder or the AI switch changes what would be saved, so the preview must be redone.
for (const id of ['title', 'folder', 'ai']) $(id).oninput = $(id).onchange = () => { plan = null; $('result').hidden = true; refresh(); };

$('import').onclick = async () => {
  if (busy || !plan || planned !== $('paste').value || !vault) return;
  const p = plan; let done = 0;
  setBusy(true);
  try {
    const existing = new Set((await api(`notes?vault=${vault}`)).notes.map(n => n.path.toLowerCase()));
    const clash = p.parts.find(x => existing.has(x.path.toLowerCase()));
    if (clash) throw new Error(`“${clash.path}” already exists in this vault. Change the title or folder, then preview again.`);
    for (const part of p.parts) {
      status(`Saving note ${done + 1} of ${p.parts.length}…`);
      await api('note', { vault, path: part.path, content: part.doc, baseVersion: 0 });
      const back = await api('note-read', { vault, path: part.path });
      if (back.content !== part.doc) throw new Error(`Read-back check failed for “${part.path}”: the saved text differs from what was sent. Delete that note and try again.`);
      done++;
    }
    status(`Saved ${done} note${done > 1 ? 's' : ''} in “${vaultName()}”. Each was read back and compared character by character with what was sent.`);
    $('done').hidden = false; plan = null; $('result').hidden = true;
  } catch (e) {
    status(done ? `Stopped after saving ${done} of ${p.parts.length} notes: ${e.message} The saved notes are complete.` : e.message, true);
  } finally { setBusy(false); }
};

try {
  vault = (await mountVaults({ select: $('vault'), api, createButton: $('new-vault'), canChange: () => !busy, onChange: v => { vault = v; refresh(); } })).value;
} catch (e) { status(e.message, true); }
refresh();
