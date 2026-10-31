import { validateLayout } from './note-model.js';

// The clipboard's plain text is authoritative; HTML supplies styles only.
export function captureRichPaste(clipboard) {
  const text=clipboard?.getData('text/plain'), html=clipboard?.getData('text/html');
  if(!text||!html)return null;
  const doc=new DOMParser().parseFromString(html,'text/html'),walker=doc.createTreeWalker(doc.body,4),spans=[],blocks=[];
  let cursor=0;
  while(walker.nextNode()){
    const n=walker.currentNode;if(n.parentElement.closest('script,style,iframe,object,svg'))continue;
    const value=n.textContent.trim();if(!value)continue;
    const pattern=value.split(/\s+/).map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('\\s+');
    const match=new RegExp(pattern,'u').exec(text.slice(cursor));if(!match)continue;
    const start=cursor+match.index,end=start+match[0].length;cursor=end;
    let node=n.parentElement,bold=false,italic=false,color=null,depth=0,heading=null;
    while(node&&node!==doc.body){
      bold ||= ['B','STRONG'].includes(node.tagName)||/^(bold|[6-9]00)$/.test(node.style.fontWeight);
      italic ||= ['I','EM'].includes(node.tagName)||node.style.fontStyle==='italic';
      color ||= node.style.color||node.getAttribute('color');
      if(node.tagName==='LI')depth++;
      if(/^H[1-6]$/.test(node.tagName))heading=Number(node.tagName[1]);
      node=node.parentElement;
    }
    if(bold)spans.push({start,end,kind:'strong'});if(italic)spans.push({start,end,kind:'em'});
    if(color&&/^(red|purple|#[0-9a-f]{3,8}|rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\))$/i.test(color)&&!['rgb(0, 0, 0)','rgb(255, 255, 255)'].includes(color))spans.push({start,end,kind:'color',color});
    const line=text.slice(0,start).split('\n').length;
    if(heading)blocks.push({line,kind:'heading',level:heading});
    else if(depth>1&&!/^[\t ]/.test(text.split('\n')[line-1]))blocks.push({line,kind:'indent',level:Math.min(20,depth-1)});
  }
  return {text,layout:validateLayout(text,{spans,blocks:[...new Map(blocks.map(b=>[b.line,b])).values()]})};
}
