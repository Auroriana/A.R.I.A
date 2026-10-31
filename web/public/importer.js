// Lossless "paste -> searchable notes" formatter. Pure functions: no DOM, no network, no AI.
//
// THE RULE: your pasted text is never edited. It is only cut at line starts that already exist, and the
// pieces are kept in order, character for character. Aria ADDS exactly two things, both outside your text:
//   1. a small frontmatter header at the top of each saved note, and
//   2. a "## label" line between two of your lines (never inside a line or a ``` code block).
// verifyPlan() proves it: dropping every added piece gives back the original, exactly.

export const LIMITS = Object.freeze({
  maxBytes: 3_000_000,      // UTF-8 size of the paste (Vercel rejects request bodies above ~4.5 MB)
  unitChars: 2400,          // target size of one labelled section (the search chunker caps chunks at 2500)
  partChars: 150_000,       // per saved note (the database cap is 200,000)
  partJsonBytes: 300_000,   // per saved note as JSON (the API cap is 420,000)
  partChunks: 400           // per saved note (the database keeps at most 500 chunks per note)
});

const HEAD = /^(#{1,6})\s+(.+?)\s*#*\s*$/;   // same rules as lib/notes.js chunkMarkdown
const FENCE = /^(```|~~~)/;
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const DENY = /^(98 private|80 templates)(\/|$)/i;
const FM_RESERVE = 500;
const enc = new TextEncoder();
const jsonBytes = s => enc.encode(JSON.stringify(s)).length;
const num = n => n.toLocaleString('en-US');

export async function sha256Hex(text) {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// Returns a message if the text cannot be saved without changing it, else null.
export function checkText(text) {
  if (typeof text !== 'string' || !text.trim()) return 'Paste some text first.';
  if (text.includes('\u0000')) return 'The text contains NUL (zero) characters, which cannot be stored. Nothing was changed.';
  if (text.includes('\r')) return 'The text contains carriage-return characters (\\r). Aria stores line breaks as \\n only and will not rewrite your text, so nothing was changed.';
  if (typeof text.isWellFormed === 'function' && !text.isWellFormed()) return 'The text contains a broken Unicode character (a lone surrogate) that cannot be stored. Nothing was changed.';
  const bytes = enc.encode(text).length;
  if (bytes > LIMITS.maxBytes) return `That is ${num(bytes)} bytes; the limit per import is ${num(LIMITS.maxBytes)}. Import it in several pastes.`;
  return null;
}

function analyse(text, useFences = true) {
  const lines = [];
  for (let i = 0; i < text.length;) {
    const j = text.indexOf('\n', i);
    if (j < 0) { lines.push(text.slice(i)); break; }
    lines.push(text.slice(i, j + 1)); i = j + 1;
  }
  const n = lines.length, ok = Array(n), blank = Array(n), head = Array(n).fill(null), para = Array(n).fill(false);
  let fence = false;
  for (let i = 0; i < n; i++) {
    const s = lines[i].endsWith('\n') ? lines[i].slice(0, -1) : lines[i];
    ok[i] = !fence;                       // a label may be inserted before line i only if it is outside a code fence
    blank[i] = /^\s*$/.test(s);
    if (useFences && FENCE.test(s)) fence = !fence;
    else if (!fence) { const m = s.match(HEAD); if (m) head[i] = { level: m[1].length, text: m[2] }; }
  }
  for (let i = 1; i < n; i++) para[i] = ok[i] && blank[i - 1] && !blank[i];
  return { lines, ok, blank, head, para, openFence: fence };
}

function detectKind(a) {
  if (a.head.some(Boolean)) return { kind: 'markdown' };
  const sample = a.lines.filter((_, i) => !a.blank[i]).slice(0, 60).map(l => l.replace(/\n$/, ''));
  if (sample.length >= 3) for (const d of ['\t', ',', '|', ';']) {
    const counts = sample.map(l => l.split(d).length - 1), c = counts[0];
    if (c >= 1 && counts.filter(x => x === c).length >= sample.length * 0.9)
      return { kind: 'table', header: sample[0].split(d).map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean).slice(0, 12).join(', ').slice(0, 120) };
  }
  return { kind: 'text' };
}

function sections(a) {
  const n = a.lines.length, heads = [];
  a.head.forEach((h, i) => { if (h) heads.push(i); });
  const out = [];
  if (!heads.length || heads[0] > 0) out.push({ from: 0, to: heads[0] ?? n, head: null });
  heads.forEach((h, i) => out.push({ from: h, to: heads[i + 1] ?? n, head: a.head[h] }));
  return out;
}

// Cut [from,to) into units of about `max` characters, only at existing line starts outside code fences.
// Prefers a paragraph start, then any line start. A single line/fence longer than `max` is left whole.
function splitRange(a, pre, from, to, max) {
  const starts = [from];
  let cursor = from, bestPara = -1, bestLine = -1;
  for (let i = from; i < to; i++) {
    if (i > cursor) { if (a.para[i]) bestPara = i; if (a.ok[i]) bestLine = i; }
    while (i > cursor && pre[i + 1] - pre[cursor] > max) {
      let c = -1;
      if (bestPara > cursor && pre[bestPara] - pre[cursor] >= max * 0.4) c = bestPara;
      else if (bestLine > cursor) c = bestLine;
      if (c < 0) break;
      starts.push(c); cursor = c; bestPara = -1; bestLine = -1;
      for (let j = cursor + 1; j <= i; j++) { if (a.para[j]) bestPara = j; if (a.ok[j]) bestLine = j; }
    }
  }
  return starts;
}

function labelFor(u, k) {
  if (u.count <= 1) return null;
  if (u.sec.head) return u.idx === 0 ? null : { level: u.sec.head.level, text: `${u.sec.head.text} (part ${u.idx + 1} of ${u.count})`.slice(0, 200) };
  const range = `${u.from + 1}–${u.to}`;
  if (k.kind === 'table') return { level: 2, text: `Rows ${range}${k.header ? ` · first row: ${k.header}` : ''}` };
  return { level: 2, text: `Lines ${range}` };
}

const safeName = (s, max = 100) => {
  let v = String(s ?? '').replace(/[\u0000-\u001f\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').slice(0, max).replace(/[. ]+$/, '');
  if (RESERVED.test(v.split('.')[0])) v += ' notes';
  return v;
};

function cleanFolder(f) {
  const dir = String(f ?? '').split(/[\\/]+/).map(s => safeName(s)).filter(Boolean).join('/');
  if (DENY.test(dir)) throw new Error('That folder is not available in the web app.');
  return dir;
}

const header = ({ ai, sha256, part, total, now }) =>
  `---\nai_enabled: ${ai ? 'true' : 'false'}\nimported_from: paste\nimported_on: ${now.toISOString().slice(0, 10)}\nimport_sha256: ${sha256}\nimport_part: ${part} of ${total}\n---\n\n`;

// True only if removing every added piece reproduces `original` exactly and each doc is the join of its pieces.
export function verifyPlan(original, plan) {
  const kept = plan.parts.flatMap(p => p.pieces).filter(x => !x.added).map(x => x.text).join('');
  return kept === original && plan.parts.every(p => p.pieces.map(x => x.text).join('') === p.doc);
}

export async function planImport(text, { title = '', folder = '00 Inbox', ai = true, now = new Date() } = {}) {
  const problem = checkText(text);
  if (problem) throw new Error(problem);
  const warnings = [];
  let a = analyse(text);
  if (a.openFence) { a = analyse(text, false); warnings.push('A ``` or ~~~ code fence is opened but never closed, so it was treated as ordinary text.'); }
  const pre = [0];
  for (const l of a.lines) pre.push(pre[pre.length - 1] + l.length);
  const k = detectKind(a);

  const units = [];
  for (const sec of sections(a)) {
    const starts = splitRange(a, pre, sec.from, sec.to, LIMITS.unitChars);
    starts.forEach((from, idx) => units.push({ sec, idx, count: starts.length, from, to: starts[idx + 1] ?? sec.to }));
  }
  let labels = 0, longBlocks = 0;
  for (const u of units) {
    u.body = a.lines.slice(u.from, u.to).join('');
    u.label = labelFor(u, k);
    u.labelText = u.label ? `${'#'.repeat(u.label.level)} ${u.label.text}\n\n` : '';
    if (u.label) labels++;
    if (u.body.length > LIMITS.unitChars) longBlocks++;
    u.chars = u.body.length + u.labelText.length + 2;
    u.bytes = jsonBytes(u.body) + jsonBytes(u.labelText) + 4;
    u.chunks = 1 + Math.floor(u.body.length / 1250);   // upper bound on chunks the search indexer makes from this unit
    if (u.chars > LIMITS.partChars - FM_RESERVE || u.bytes > LIMITS.partJsonBytes - FM_RESERVE)
      throw new Error(`Lines ${num(u.from + 1)}–${num(u.to)} are one unbroken block of ${num(u.body.length)} characters, too big for a single note. Aria never cuts inside a line or a code block because that would change your text. Split that block yourself before pasting.`);
  }

  const groups = [];
  let cur = null;
  for (const u of units) {
    if (cur && (cur.chars + u.chars > LIMITS.partChars || cur.bytes + u.bytes > LIMITS.partJsonBytes || cur.chunks + u.chunks > LIMITS.partChunks)) { groups.push(cur); cur = null; }
    cur ??= { units: [], chars: FM_RESERVE, bytes: FM_RESERVE, chunks: 0 };
    cur.units.push(u); cur.chars += u.chars; cur.bytes += u.bytes; cur.chunks += u.chunks;
  }
  groups.push(cur);

  const sha256 = await sha256Hex(text);
  const stamp = now.toISOString().slice(0, 16).replace('T', ' ').replace(':', '.');
  const base = safeName(title) || `Pasted import ${stamp}`;
  const dir = cleanFolder(folder);
  const total = groups.length;
  const parts = groups.map((g, i) => {
    const pieces = [{ added: true, text: header({ ai, sha256, part: i + 1, total, now }) }];
    g.units.forEach((u, j) => {
      if (u.labelText) pieces.push({ added: true, text: (j ? '\n' : '') + u.labelText });
      pieces.push({ added: false, text: u.body });
    });
    const name = total > 1 ? `${base} (part ${i + 1} of ${total})` : base;
    return { index: i + 1, total, path: [dir, `${name}.md`].filter(Boolean).join('/'), pieces, doc: pieces.map(p => p.text).join(''), chunks: g.chunks };
  });

  if (longBlocks) warnings.push(`${num(longBlocks)} block${longBlocks > 1 ? 's are' : ' is'} longer than ${num(LIMITS.unitChars)} characters and cannot be cut at a line break (a very long line or a code block). ${longBlocks > 1 ? 'They are' : 'It is'} saved intact; search may split ${longBlocks > 1 ? 'them' : 'it'} mid-sentence in its index.`);
  const plan = { kind: k.kind, sha256, chars: text.length, bytes: enc.encode(text).length, lineCount: a.lines.length, labels, longBlocks, warnings, parts };
  if (!verifyPlan(text, plan)) throw new Error('Internal check failed: the formatted result does not reproduce your text exactly. Nothing was saved.');
  return plan;
}
