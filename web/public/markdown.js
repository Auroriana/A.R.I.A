// A deliberately small Markdown renderer. Raw HTML is always text; no innerHTML.
export function renderMarkdown(root,text){
  const doc=root.ownerDocument;
  const el=(tag,text)=>{const node=doc.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
  function inline(parent,text,depth=0){
    if(depth>8){parent.append(doc.createTextNode(text));return;}
    const pattern=/(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|\[[^\]\n]+\]\([^\s)]+\))/g;
    let offset=0;
    for(const match of text.matchAll(pattern)){
      parent.append(doc.createTextNode(text.slice(offset,match.index)));const token=match[0];let node;
      if(token.startsWith('`'))node=el('code',token.slice(1,-1));
      else if(token.startsWith('**')||token.startsWith('__')){node=el('strong');inline(node,token.slice(2,-2),depth+1);}
      else if(token.startsWith('*')){node=el('em');inline(node,token.slice(1,-1),depth+1);}
      else {
        const parts=/^\[([^\]]+)\]\((.+)\)$/.exec(token);
        if(/^https?:\/\//i.test(parts[2])){node=el('a',parts[1]);node.href=parts[2];node.target='_blank';node.rel='noopener noreferrer';}
        else node=doc.createTextNode(token);
      }
      parent.append(node);offset=match.index+token.length;
    }
    parent.append(doc.createTextNode(text.slice(offset)));
  }
  const lines=text.replace(/\r\n?/g,'\n').split('\n');root.replaceChildren();
  const cells=line=>line.trim().replace(/^\||\|$/g,'').split('|').map(s=>s.trim());
  const listMatch=line=>/^(\s*)([-+*]|\d+[.)])\s+(.+)$/.exec(line);
  let lists=[];
  for(let i=0;i<lines.length;){
    const line=lines[i];
    if(!line.trim()){i++;continue;}
    const item=listMatch(line);
    if(item){
      const indent=item[1].replace(/\t/g,'    ').length,tag=/\d/.test(item[2])?'ol':'ul';
      while(lists.length&&lists.at(-1).indent>indent)lists.pop();
      if(lists.length&&lists.at(-1).indent===indent&&lists.at(-1).tag!==tag)lists.pop();
      if(!lists.length||lists.at(-1).indent<indent){const node=el(tag);if(tag==='ol')node.start=parseInt(item[2],10);(lists.at(-1)?.last??root).append(node);lists.push({node,indent,tag});}
      const li=el('li');inline(li,item[3]);lists.at(-1).node.append(li);lists.at(-1).last=li;i++;continue;
    }
    lists=[];
    if(/^\s*```/.test(line)){
      const code=[];i++;while(i<lines.length&&!/^\s*```/.test(lines[i]))code.push(lines[i++]);i++;
      const pre=el('pre');pre.append(el('code',code.join('\n')));root.append(pre);continue;
    }
    const heading=/^\s{0,3}(#{1,6})\s+(.+)$/.exec(line);
    if(heading){const node=el('h'+heading[1].length);inline(node,heading[2]);root.append(node);i++;continue;}
    if(/^\s*(?:---+|\*\*\*+)\s*$/.test(line)){root.append(el('hr'));i++;continue;}
    if(line.includes('|')&&i+1<lines.length&&cells(lines[i+1]).every(c=>/^:?-{3,}:?$/.test(c))){
      const wrap=el('div');wrap.className='table-scroll';const table=el('table'),head=el('thead'),row=el('tr');
      for(const cell of cells(line)){const th=el('th');inline(th,cell);row.append(th);}head.append(row);table.append(head);i+=2;
      const body=el('tbody');while(i<lines.length&&lines[i].includes('|')&&lines[i].trim()){const tr=el('tr');for(const cell of cells(lines[i++])){const td=el('td');inline(td,cell);tr.append(td);}body.append(tr);}
      table.append(body);wrap.append(table);root.append(wrap);continue;
    }
    if(/^>\s?/.test(line)){const quote=el('blockquote');inline(quote,line.replace(/^>\s?/,''));root.append(quote);i++;continue;}
    const paragraph=el('p');inline(paragraph,line);root.append(paragraph);i++;
  }
}
