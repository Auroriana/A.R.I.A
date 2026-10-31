import {splitNote,readLayout} from '../public/note-model.js';

// Search stores a presentation copy. The canonical note body is never rewritten.
// This carries imported styles into the same renderer used for source excerpts.
export function noteIndexText(note){
  const {body}=splitNote(note),layout=readLayout(note);if(!layout)return body;
  const lines=body.split('\n');let offset=0;
  return lines.map((line,index)=>{
    const lineNumber=index+1,spans=layout.spans.filter(s=>s.start<offset+line.length&&s.end>offset);
    const edges=[...new Set([0,line.length,...spans.flatMap(s=>[Math.max(0,s.start-offset),Math.min(line.length,s.end-offset)])])].sort((a,b)=>a-b);
    let formatted='';
    for(let i=0;i<edges.length-1;i++){
      const active=spans.filter(s=>s.start<=offset+edges[i]&&s.end>=offset+edges[i+1]);
      const tags=active.map(s=>s.kind==='color'?['<span style="color: '+s.color+'">','</span>']:s.kind==='strong'?['<strong>','</strong>']:['<em>','</em>']);
      formatted+=tags.map(t=>t[0]).join('')+line.slice(edges[i],edges[i+1])+tags.reverse().map(t=>t[1]).join('');
    }
    offset+=line.length+1;
    const blocks=layout.blocks.filter(b=>b.line===lineNumber),heading=blocks.find(b=>b.kind==='heading');
    const depth=layout.blocks.filter(b=>b.kind==='branch'&&lineNumber>b.line&&lineNumber<=b.endLine).length+(blocks.find(b=>b.kind==='indent')?.level??0);
    return '    '.repeat(depth)+(heading?'#'.repeat(heading.level)+' ':'')+formatted;
  }).join('\n');
}
