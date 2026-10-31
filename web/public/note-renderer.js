import { splitNote, readLayout, parseTarget, resolveLink } from './note-model.js';

// One DOM-only renderer for notes and source excerpts. Never injects raw HTML.
export function renderMarkdown(root, text, options = {}) {
  const doc = root.ownerDocument, layout = options.layout ?? readLayout(text);
  const el = (tag, text) => { const n = doc.createElement(tag); if (text !== undefined) n.textContent = text; return n; };
  const body = options.frontmatter === false ? text : splitNote(text).body;
  root.replaceChildren(); root.classList.add('note-markdown');
  const lines = body.replace(/\r\n?/g, '\n').split('\n'), offsets = []; let pos = 0;
  lines.forEach(l => { offsets.push(pos); pos += l.length + 1; });
  const blockAt = new Map((layout?.blocks ?? []).map(b => [b.line - 1, b]));
  const spans = layout?.spans ?? [];
  function plain(parent, value, offset) {
    const edges = new Set([0, value.length]);
    const relevant = spans.filter(s => s.start < offset + value.length && s.end > offset);
    relevant.forEach(s => { edges.add(Math.max(0, s.start - offset)); edges.add(Math.min(value.length, s.end - offset)); });
    const points = [...edges].sort((a,b) => a-b);
    for (let i = 0; i < points.length - 1; i++) {
      let node = doc.createTextNode(value.slice(points[i], points[i+1]));
      for (const s of relevant.filter(s => s.start <= offset + points[i] && s.end >= offset + points[i+1])) {
        const wrap = el(s.kind === 'color' ? 'span' : s.kind); if (s.kind === 'color') wrap.style.color = s.color;
        wrap.append(node); node = wrap;
      }
      parent.append(node);
    }
  }
  const tokens = /\\[\\`*_[\]{}()#+.!>~-]|`[^`\n]+`|!?\[\[[^\]\n]+\]\]|\[S\d+\]|\[[^\]\n]+\]\((?:<[^>\n]+>|[^\s)]+)(?:\s+"[^"]*")?\)|<(?:span|font)\b[^>]*>[\s\S]*?<\/(?:span|font)>|<(?:b|strong|em|i|u|s|mark)>[\s\S]*?<\/(?:b|strong|em|i|u|s|mark)>|\*\*\*[^*\n]+\*\*\*|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_|~~[^~\n]+~~|==[^=\n]+==|"[^"\n]+"|“[^”\n]+”/g;
  function inline(parent, value, offset = 0, depth = 0) {
    if (depth > 12) { plain(parent, value, offset); return; }
    let at = 0;
    for (const m of value.matchAll(tokens)) {
      plain(parent, value.slice(at, m.index), offset + at);
      const t = m[0]; let n;
      if (t[0] === '\\') n = doc.createTextNode(t.slice(1));
      else if (t[0] === '`') n = el('code', t.slice(1,-1));
      else if (/^\[S\d+\]$/.test(t) && options.citations) {
        n = el('button', t); n.type = 'button'; n.className = 'c'; n.dataset.s = t.slice(1,-1); n.dataset.claim = value.replace(/\[S\d+\]/g,'');
      } else if (/^!?\[\[/.test(t) || /^\[[^\]]+\]\(/.test(t)) {
        const wiki = /^!?\[\[/.test(t), parts = wiki ? null : /^\[([^\]]+)\]\((<[^>]+>|[^\s)]+)/.exec(t);
        const ref = wiki ? parseTarget(t.replace(/^!?\[\[|\]\]$/g,'')) : parseTarget(parts[2], parts[1], false);
        if (/^https?:\/\//i.test(ref.target)) { n = el('a',ref.label); n.href = ref.target; n.target = '_blank'; n.rel = 'noopener noreferrer'; }
        else if (/^[a-z][\w+.-]*:|^\/\//i.test(ref.target)) n = doc.createTextNode(t);
        else {
          const link = resolveLink(ref, options.path ?? '', options.notes ?? []);
          n = el('a',ref.label); n.className = 'internal-link' + (!link.resolved ? ' unresolved' : ''); n.href = '#'; n.title = ref.target;
          n.onclick = e => { e.preventDefault(); options.onLink?.(link, e); };
        }
      } else if (t.startsWith('<')) {
        const html = /^<(\w+)([^>]*)>([\s\S]*)<\/\w+>$/.exec(t), name = html[1].toLowerCase();
        const color = html[2].match(/(?:color\s*:\s*|color\s*=\s*["']?)(red|purple|#[0-9a-f]{3,8}|rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\))/i)?.[1];
        n = el(['span','font'].includes(name) ? 'span' : name); if (color) n.style.color = color;
        inline(n,html[3],offset+m.index+t.indexOf('>')+1,depth+1);
      } else {
        const quote = t[0] === '"' || t[0] === '“', triple = t.startsWith('***'), double = /^(\*\*|__|~~|==)/.test(t);
        const cut = quote ? 0 : triple ? 3 : double ? 2 : 1;
        n = el(quote ? 'em' : triple || /^\*\*|^__/.test(t) ? 'strong' : t.startsWith('~~') ? 's' : t.startsWith('==') ? 'mark' : 'em');
        if (quote) { n.className = 'chat-example'; plain(n,t,offset+m.index); }
        else { if (triple) n.style.fontStyle = 'italic'; inline(n,t.slice(cut,-cut),offset+m.index+cut,depth+1); }
      }
      parent.append(n); at = m.index + t.length;
    }
    plain(parent,value.slice(at),offset+at);
  }
  const indent = i => (lines[i].match(/^\s*/)?.[0].replace(/\t/g,'    ').length ?? 0) + (blockAt.get(i)?.kind === 'indent' ? blockAt.get(i).level * 4 : 0);
  const listItem = i => /^(\s*)([-+*]|\d+[.)])\s+(.*)$/.exec(lines[i]);
  const nextText = (i, end) => { while (i < end && !lines[i].trim()) i++; return i; };
  function fold(parent, value, offset, from, to, open, depth) {
    const d = el('details'); d.className = 'note-fold'; d.open = open; d.dataset.line = String(from);
    const s = el('summary'); inline(s,value,offset); d.append(s); const children = el('div'); children.className = 'fold-body'; d.append(children); parent.append(d);
    render(children,from,to,depth+1); return d;
  }
  function render(parent, start, end, depth = 0) {
    if (depth > 80) { parent.append(el('pre', lines.slice(start,end).join('\n'))); return; }
    let list = null, listTag = '';
    for (let i = start; i < end;) {
      const line = lines[i], trimmed = line.trim();
      if (!trimmed) { i++; continue; }
      const fence = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
      if (fence) { list = null; const code = []; i++; while (i < end && !lines[i].trim().startsWith(fence[1])) code.push(lines[i++]); i++; const pre = el('pre'); pre.append(el('code',code.join('\n'))); parent.append(pre); continue; }
      const item = listItem(i), block = blockAt.get(i), heading = /^(#{1,6})\s+(.+?)(?:\s+#+)?$/.exec(trimmed);
      let value = item ? item[3] : heading ? heading[2] : trimmed;
      const blockId = value.match(/\s+\^([\w-]+)$/); if (blockId) value = value.slice(0,blockId.index);
      const offset = offsets[i] + line.indexOf(value);
      let holder = parent;
      if (item) {
        const tag = /^\d/.test(item[2]) ? 'ol' : 'ul';
        if (!list || listTag !== tag) { list = el(tag); listTag = tag; if (tag === 'ol') list.start = parseInt(item[2]); parent.append(list); }
        holder = el('li'); if (tag === 'ol') holder.value = parseInt(item[2]); list.append(holder);
      } else list = null;
      if (blockId && item) holder.id = '^'+blockId[1];
      let childEnd = nextText(i+1,end), childStart = childEnd;
      if (childEnd < end && indent(childEnd) > indent(i)) { childEnd++; while (childEnd < end && (!lines[childEnd].trim() || indent(childEnd) > indent(i))) childEnd++; } else childEnd = childStart;
      if (block?.kind === 'branch') { childStart = i+1; childEnd = Math.min(end,block.endLine); }
      if (!item && !heading && !block && value.length < 100 && childStart < end && listItem(childStart)) {
        childEnd=childStart+1;
        while(childEnd<end&&(!lines[childEnd].trim()||listItem(childEnd)||indent(childEnd)>indent(i)))childEnd++;
      }
      if (heading || block?.kind === 'heading') {
        const h = el('h'+(heading ? heading[1].length : block.level)); h.id = blockId ? '^'+blockId[1] : value; inline(h,value,offset); holder.append(h);
      } else if (childEnd > childStart) {
        const folded=fold(holder,value,offset,childStart,childEnd,!/^if\s+(yes|no)\b/i.test(value),depth);if(blockId)folded.id='^'+blockId[1]; i = childEnd; continue;
      } else if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) holder.append(el('hr'));
      else if (/^>\s?/.test(trimmed)) { const q = el('blockquote'); inline(q,trimmed.replace(/^>\s?/,''),offset+2); holder.append(q); }
      else if (line.includes('|') && i+1 < end && /^\s*\|?\s*:?-{3,}/.test(lines[i+1])) {
        const cells = l => l.trim().replace(/^\||\|$/g,'').split('|'), wrap = el('div'), table = el('table'); wrap.className = 'table-scroll';
        const row = el('tr'); for (const c of cells(line)) { const th = el('th'); inline(th,c.trim()); row.append(th); } table.append(row); i+=2;
        while (i < end && lines[i].trim() && lines[i].includes('|')) { const tr = el('tr'); for (const c of cells(lines[i++])) { const td=el('td'); inline(td,c.trim()); tr.append(td); } table.append(tr); }
        wrap.append(table); holder.append(wrap); continue;
      } else {
        const n = item ? el('span') : el('p');if(blockId&&!item)n.id='^'+blockId[1];
        if (item && /^\[[ xX]\]\s/.test(value)) { const cb = el('input'); cb.type='checkbox'; cb.checked=/^\[[xX]\]/.test(value); cb.disabled=true; n.append(cb); value=value.slice(4); inline(n,value,offset+4); }
        else inline(n,value,offset);
        holder.append(n);
      }
      i++;
    }
  }
  render(root,0,lines.length);
}

export function highlightClaim(root, claim) {
  root.querySelectorAll('mark.citation-highlight').forEach(n => n.replaceWith(...n.childNodes));
  const terms = new Set((claim.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? []));
  const walker = root.ownerDocument.createTreeWalker(root,4), nodes=[]; while (walker.nextNode()) nodes.push(walker.currentNode);
  let first = null;
  for (const node of nodes) {
    if (!node.parentElement || node.parentElement.closest('pre,code,button')) continue;
    const frag= root.ownerDocument.createDocumentFragment(); let end=0, hit=false;
    for (const m of node.textContent.matchAll(/[\p{L}\p{N}]{4,}/gu)) if (terms.has(m[0].toLowerCase())) { hit=true; frag.append(node.textContent.slice(end,m.index)); const mark=root.ownerDocument.createElement('mark'); mark.className='citation-highlight'; mark.textContent=m[0]; frag.append(mark); first??=mark; end=m.index+m[0].length; }
    if (hit) { frag.append(node.textContent.slice(end)); node.replaceWith(frag); }
  }
  if (first) { let p=first.parentElement; while(p&&p!==root){if(p.tagName==='DETAILS')p.open=true;p=p.parentElement;} }
  return first;
}
