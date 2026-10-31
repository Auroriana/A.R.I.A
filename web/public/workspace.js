import { renderMarkdown } from './note-renderer.js';
import { noteName, parentPath, buildTree, extractLinks, resolveLink, aliasesOf, splitNote, setProperty, withLayout, rebaseLayout, readLayout } from './note-model.js';
import { captureRichPaste } from './rich-paste.js';

const icons = {file:'<path d="M5 3h9l5 5v13H5zM14 3v6h5M8 13h8M8 17h6"/>',folder:'<path d="M3 6h7l2 2h9v12H3zM15 11v6M12 14h6"/>',collapse:'<path d="m7 3 5 5 5-5M7 21l5-5 5 5M4 12h16"/>',search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',sidebar:'<rect x="3" y="4" width="18" height="16"/><path d="M9 4v16"/>'};
const icon = k => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[k]}</svg>`;
export function mountWorkspace(root, { api, ask, model = () => 'gemini-3.5-flash-lite' }) {
  root.innerHTML = `<div class="notes-workspace"><section class="file-explorer" aria-label="File explorer">
    <div class="explorer-tools"><b>FILES</b><button id="nn" class="icon-button" title="New note" aria-label="New note">${icon('file')}</button><button id="nf" class="icon-button" title="New folder" aria-label="New folder">${icon('folder')}</button><button id="nc" class="icon-button" title="Collapse all folders" aria-label="Collapse all folders">${icon('collapse')}</button><a class="icon-button" href="/import.html" title="Import notes" aria-label="Import notes">⇪</a></div>
    <div class="file-search"><input id="note-search" type="search" placeholder="Find a note…" aria-label="Find a note"></div><div id="nl" class="file-tree" role="tree" aria-label="Notes"></div>
    <div class="vault-footer"><select id="nv" aria-label="Notes vault"></select><button id="new-vault" class="icon-button" title="New vault" aria-label="New vault">+</button><button id="sync-info" class="icon-button" title="Obsidian sync setup" aria-label="Obsidian sync setup">↻</button></div></section>
    <div class="note-pane"><div id="note-tabs" class="note-tabs" role="tablist" aria-label="Open notes"></div>
    <div class="note-bar"><button id="explorer-toggle" class="icon-button" aria-label="Toggle file explorer">${icon('sidebar')}</button><div id="np" class="note-breadcrumb">No note open</div><div class="view-modes"><button data-mode="read" aria-pressed="true">Read</button><button data-mode="split" aria-pressed="false">Edit</button><button data-mode="source" aria-pressed="false">Source</button></div><button id="note-format" class="mb" title="Suggest layout without rewriting the text">Aria format</button></div>
    <div id="note-refs" class="reference-bar" hidden></div><details id="note-properties" class="note-properties" hidden><summary>Properties</summary><div><label><input id="note-ai" type="checkbox"> Allow AI search</label><label>Aliases <input id="note-aliases" placeholder="comma separated"></label></div></details>
    <div id="ns" class="note-message" role="status"></div><div id="note-content" class="note-content" data-mode="read"><div id="note-empty" class="note-blank"><h2>Your notes, connected.</h2><p>Open a note from the explorer.<br>Ctrl + click opens another tab.</p></div><div id="note-source" class="note-source" hidden><div class="format-tools"><button data-format="bold" title="Bold">B</button><button data-format="italic" title="Italic"><i>I</i></button><button data-format="heading" title="Heading">H</button><button data-format="link" title="Link a note">[[ ]]</button><button data-format="red">Red</button><button data-format="quote">“Quote”</button><button data-format="indent" title="Indent">⇥</button></div><textarea id="ed" spellcheck="false" aria-label="Note editor"></textarea></div><div id="note-reading" class="note-reading" hidden><div id="note-rendered"></div></div><div id="note-suggest" class="note-suggest" hidden></div></div>
    <div class="note-bottom"><span id="note-state">Select a note to begin.</span><button id="note-reload" hidden>Load saved version</button><button id="sv" disabled>Save</button></div></div></div>`;
  const $ = id => root.querySelector('#'+id), el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  let vault='', notes=[], tabs=[], active=null, folder='', expanded=new Set(), folders=[], mode='read', account='', loading=0, saving=false;
  const sessionKey=()=>`aria.workspace.${account}.${vault}`, folderKey=()=>`aria.folders.${account}.${vault}`;
  const dirty=t=>t&&t.content!==t.baseline;
  const status=s=>$('ns').textContent=s;
  function remember(){try{sessionStorage.setItem(sessionKey(),JSON.stringify({tabs,active:active?.path,expanded:[...expanded],mode}));localStorage.setItem(folderKey(),JSON.stringify(folders));}catch{status('Browser storage is full. Save your changes before leaving.');}}
  function update(){ $('sv').disabled=!active||!dirty(active)||saving; $('note-format').disabled=!active||saving; $('note-state').textContent=active?`${dirty(active)?'Unsaved changes':'Saved'} · ${splitNote(active.content).body.trim().split(/\s+/).filter(Boolean).length} words · ${notes.find(n=>n.path===active.path)?.ai_enabled?'AI search on':'AI search off'}`:'Select a note to begin.'; renderTabs();remember(); }
  function renderTabs(){
    const bar=$('note-tabs');bar.replaceChildren();
    tabs.forEach(t=>{const wrap=el('div');wrap.className='note-tab'+(t===active?' active':'');const b=el('button',noteName(t.path)+(dirty(t)?' •':''));b.setAttribute('role','tab');b.setAttribute('aria-selected',String(t===active));b.title=t.path;b.onclick=()=>activate(t);const x=el('button','×');x.className='icon-button';x.setAttribute('aria-label','Close '+noteName(t.path));x.onclick=()=>closeTab(t);wrap.append(b,x);bar.append(wrap);});
    const add=el('button','+');add.className='icon-button';add.title='Open another note';add.setAttribute('aria-label','Open another note');add.onclick=()=>{$('note-search').focus();root.firstChild.classList.add('explorer-open');};bar.append(add);
  }
  function renderTree(){
    const filter=$('note-search').value.trim().toLowerCase(), tree=buildTree(notes.filter(n=>n.path.toLowerCase().includes(filter)||n.aliases?.some(a=>a.toLowerCase().includes(filter))),filter?[]:folders);
    const list=$('nl');list.replaceChildren();
    function walk(node,parent){
      [...node.folders.values()].sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true})).forEach(f=>{
        const wrap=el('div'), b=el('button'), arrow=el('span','›'), label=el('span',f.name);b.className='tree-row';arrow.className='chevron';b.append(arrow,label);b.title=f.path;b.setAttribute('role','treeitem');b.setAttribute('aria-expanded',String(!!filter||expanded.has(f.path)));
        const children=el('div');children.className='tree-children';children.setAttribute('role','group');children.hidden=!filter&&!expanded.has(f.path);b.onclick=()=>{folder=f.path;if(expanded.has(f.path))expanded.delete(f.path);else expanded.add(f.path);renderTree();remember();};wrap.append(b,children);walk(f,children);parent.append(wrap);
      });
      node.notes.sort((a,b)=>noteName(a.path).localeCompare(noteName(b.path),undefined,{numeric:true})).forEach(n=>{const b=el('button');b.className='tree-row';b.setAttribute('role','treeitem');b.append(el('span',''),el('span',noteName(n.path)));b.firstChild.className='chevron';b.title=n.path;b.setAttribute('aria-current',String(active?.path===n.path));b.onclick=e=>openNote(n.path,{newTab:e.ctrlKey||e.metaKey});b.onauxclick=e=>{if(e.button===1){e.preventDefault();openNote(n.path,{newTab:true});}};b.ondblclick=()=>openNote(n.path,{newTab:true});parent.append(b);});
    }
    walk(tree,list);if(!notes.length||(!tree.folders.size&&!tree.notes.length))list.append(Object.assign(el('p',filter?'No matching notes.':'Create a note or import your vault.'),{className:'tree-empty'}));
  }
  function renderReferences(){
    const bar=$('note-refs');bar.replaceChildren();bar.hidden=!active;if(!active)return;
    const refs=extractLinks(active.content);bar.append(el('span','References:'));
    if(!refs.length)bar.append(el('span','None'));
    for(const ref of refs){const r=resolveLink(ref,active.path,notes),a=el('a',r.label);a.href='#';a.title=r.target;a.className=r.resolved?'':'unresolved';a.onclick=e=>{e.preventDefault();follow(r,e);};bar.append(a);}
    const backlinks=notes.filter(n=>n.path!==active.path&&n.references?.some(r=>resolveLink(r,n.path,notes).resolved===active.path));
    if(backlinks.length){bar.append(el('span','· Linked from:'));backlinks.forEach(n=>{const a=el('a',noteName(n.path));a.href='#';a.onclick=e=>{e.preventDefault();openNote(n.path,{newTab:e.ctrlKey||e.metaKey});};bar.append(a);});}
  }
  function preview(){if(!active)return;renderMarkdown($('note-rendered'),active.content,{path:active.path,notes,onLink:follow});renderReferences();}
  function activate(t){
    active=t;folder=t?parentPath(t.path):folder;$('ed').value=t?.content??'';$('note-empty').hidden=!!t;$('note-properties').hidden=!t;
    $('np').replaceChildren();if(t){$('np').append(el('span',parentPath(t.path).replaceAll('/',' / ')+(parentPath(t.path)?' / ':'')),el('strong',noteName(t.path)));const p=splitNote(t.content).properties;$('note-ai').checked=/^ai_enabled:\s*true\s*$/m.test(p);$('note-aliases').value=aliasesOf(t.content).join(', ');preview();}
    else{$('np').textContent='No note open';$('note-refs').hidden=true;}
    setMode(mode);renderTree();update();status('');$('note-reload').hidden=!t?.conflict;
  }
  function setMode(next){mode=next;$('note-content').dataset.mode=mode;$('note-source').hidden=!active||mode==='read';$('note-reading').hidden=!active||mode==='source';root.querySelectorAll('[data-mode]').forEach(b=>{if(b.tagName==='BUTTON')b.setAttribute('aria-pressed',String(b.dataset.mode===mode));});remember();}
  async function closeTab(t){if(dirty(t)&&await ask(`Close “${noteName(t.path)}” without saving? Type discard to discard changes.`)!=='discard')return;const i=tabs.indexOf(t);tabs.splice(i,1);if(active===t)activate(tabs[Math.min(i,tabs.length-1)]??null);else update();}
  async function loadList(){const id=vault;if(!id)return;const data=await api('notes?vault='+id);if(id!==vault)return;notes=data.notes;renderTree();if(active){renderReferences();update();}}
  async function openNote(path,{newTab=false,anchor=''}={}){
    if(!vault)return;const existing=tabs.find(t=>t.path===path);if(existing){activate(existing);jump(anchor);return;}
    const ticket=++loading,id=vault;
    try{const n=await api('note-read',{vault:id,path});if(ticket!==loading||id!==vault)return;
      const t={path:n.path,version:n.version,content:n.content,baseline:n.content};
      if(!newTab&&active&&!dirty(active))tabs.splice(tabs.indexOf(active),1,t);else tabs.push(t);
      let p=parentPath(path);while(p){expanded.add(p);p=parentPath(p);}activate(t);root.firstChild.classList.remove('explorer-open');jump(anchor);
    }catch(e){status(e.message);}
  }
  function jump(anchor){if(!anchor)return;setMode('read');const target=[...$('note-rendered').querySelectorAll('[id]')].find(n=>n.id.toLowerCase()===anchor.split('#').at(-1).toLowerCase());if(target){let p=target.parentElement;while(p&&p!==$('note-rendered')){if(p.tagName==='DETAILS')p.open=true;p=p.parentElement;}target.scrollIntoView({block:'start'});}}
  async function follow(link,e={}){
    if(link.resolved)return openNote(link.resolved,{newTab:e.ctrlKey||e.metaKey,anchor:link.anchor});
    if(link.ambiguous){status('More than one note has this name. Include its folder in the link.');return;}
    const path=await ask('Create this linked note?',link.createPath);if(path)await createNote(path);
  }
  async function createNote(path){
    path=/\.md$/i.test(path)?path:path+'.md';
    try{await api('note',{vault,path,content:'---\nai_enabled: false\n---\n\n# '+noteName(path)+'\n',baseVersion:0});await loadList();await openNote(path,{newTab:true});setMode('split');$('ed').focus();}catch(e){status(e.message);}
  }
  async function save(){
    if(!active||!dirty(active)||saving)return;const t=active,id=vault,content=t.content;saving=true;update();
    try{const r=await api('note',{vault:id,path:t.path,content,baseVersion:t.version});t.baseline=content;t.version=r.version;t.conflict=false;status('Saved.');await loadList();}
    catch(e){t.conflict=true;status(e.message+' Your unsaved text is kept in this tab.');$('note-reload').hidden=false;}
    finally{saving=false;update();}
  }
  function input(){if(!active)return;const editor=$('ed'),cursor=editor.selectionStart,next=editor.value;active.content=rebaseLayout(active.content,next);if(active.content!==next){editor.value=active.content;const shift=active.content.length-next.length;editor.setSelectionRange(cursor+shift,cursor+shift);}preview();update();suggest();}
  function suggest(){const box=$('note-suggest');box.replaceChildren();const before=$('ed').value.slice(0,$('ed').selectionStart),m=/\[\[([^\]\n]*)$/.exec(before);box.hidden=!m;if(!m)return;notes.filter(n=>n.path.toLowerCase().includes(m[1].toLowerCase())||n.aliases?.some(a=>a.toLowerCase().includes(m[1].toLowerCase()))).slice(0,12).forEach(n=>{const b=el('button',noteName(n.path));b.append(el('small',parentPath(n.path)));b.onmousedown=e=>e.preventDefault();b.onclick=()=>{const editor=$('ed'),from=editor.selectionStart-m[1].length;editor.setRangeText(n.path.replace(/\.md$/i,'')+']]',from,editor.selectionStart,'end');input();box.hidden=true;editor.focus();};box.append(b);});}
  $('ed').oninput=input;
  $('ed').onpaste=e=>{const rich=captureRichPaste(e.clipboardData);if(!rich?.layout.spans.length&&!rich?.layout.blocks.length)return;e.preventDefault();const editor=$('ed'),start=editor.selectionStart,end=editor.selectionEnd;editor.setRangeText(rich.text,start,end,'end');const content=editor.value,body=splitNote(content).body,offset=start-(content.length-body.length);if(offset>=0){try{active.content=withLayout(content,{spans:rich.layout.spans.map(s=>({...s,start:s.start+offset,end:s.end+offset})),blocks:rich.layout.blocks.map(b=>({...b,line:b.line+body.slice(0,offset).split('\n').length-1}))});editor.value=active.content;editor.setSelectionRange(start+rich.text.length+(active.content.length-content.length),start+rich.text.length+(active.content.length-content.length));}catch{active.content=content;}}input();};
  $('ed').onkeydown=e=>{if(e.key==='Escape')$('note-suggest').hidden=true;if(e.key==='Tab'){e.preventDefault();const ed=$('ed');if(e.shiftKey){const s=ed.value.lastIndexOf('\n',ed.selectionStart-1)+1;if(ed.value.slice(s,s+4)==='    ')ed.setRangeText('',s,s+4,'end');}else ed.setRangeText('    ',ed.selectionStart,ed.selectionEnd,'end');input();}};
  root.querySelectorAll('[data-format]').forEach(b=>b.onclick=()=>{const ed=$('ed'),s=ed.selectionStart,e=ed.selectionEnd,v=ed.value.slice(s,e),pairs={bold:['**','**'],italic:['*','*'],link:['[[',']]'],red:['<span style="color: red">','</span>'],quote:['“','”'],heading:['## ',''],indent:['    ','']},[a,z]=pairs[b.dataset.format];ed.setRangeText(a+v+z,s,e,'select');ed.focus();input();});
  root.querySelectorAll('button[data-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
  $('nn').onclick=async()=>{const name=await ask('New note (use folder/name to choose its location)',[folder,'Untitled'].filter(Boolean).join('/'));if(name)createNote(name);};
  $('nf').onclick=async()=>{const name=await ask('New folder (empty folders stay in this browser until a note is added)',[folder,'New folder'].filter(Boolean).join('/'));if(!name)return;if(name.split('/').some(p=>!p||p==='..'||p.startsWith('.')||/[\\:*?"<>|]/.test(p))){status('Choose a valid folder name.');return;}folders=[...new Set([...folders,name])];folder=name;expanded.add(name);renderTree();remember();};
  $('nc').onclick=()=>{expanded.clear();renderTree();remember();};$('note-search').oninput=renderTree;$('sv').onclick=save;
  $('note-reload').onclick=async()=>{if(dirty(active)&&await ask('Replace this draft with the saved version? Type discard to continue.')!=='discard')return;const path=active.path;tabs.splice(tabs.indexOf(active),1);active=null;await openNote(path,{newTab:true});};
  $('note-ai').onchange=()=>{active.content=setProperty(active.content,'ai_enabled',$('note-ai').checked);$('ed').value=active.content;input();};
  $('note-aliases').onchange=()=>{active.content=setProperty(active.content,'aliases',$('note-aliases').value.split(',').map(s=>s.trim()).filter(Boolean));$('ed').value=active.content;input();};
  $('explorer-toggle').onclick=()=>root.firstChild.classList.toggle('explorer-open');
  $('note-format').onclick=async()=>{if(!active||saving)return;const t=active,original=t.content;saving=true;update();status('Aria is suggesting a layout. Your text stays unchanged.');try{const r=await api('note-format',{content:original,model:model()});if(t.content!==original)throw new Error('The note changed while formatting. Try again.');t.content=withLayout(original,{...r.layout,spans:[...(readLayout(original)?.spans??[]),...(r.layout.spans??[])]});if(t===active){$('ed').value=t.content;preview();setMode('read');}status('Layout applied to this draft. Original text verified unchanged. Save when ready.');}catch(e){status(e.message);}finally{saving=false;update();}};
  $('sync-info').onclick=()=>status('Automatic Obsidian sync setup: docs/OBSIDIAN-SYNC.md. Pair each local vault once, then install the background sync task. The website cannot access a local folder directly.');
  async function switchVault(id){remember();vault=id;loading++;tabs=[];active=null;expanded=new Set();folders=[];try{folders=JSON.parse(localStorage.getItem(folderKey())??'[]');const data=JSON.parse(sessionStorage.getItem(sessionKey())??'null');if(data){tabs=data.tabs??[];active=tabs.find(t=>t.path===data.active)??tabs[0];expanded=new Set(data.expanded);mode=data.mode??'read';}}catch{}activate(active);await loadList();}
  $('nv').onchange=()=>{if(saving){$('nv').value=vault;return;}switchVault($('nv').value).catch(e=>status(e.message));};
  $('new-vault').onclick=async()=>{const name=await ask('New vault name');if(!name)return;try{const v=await api('vault-create',{name});$('nv').append(new Option(v.name,v.id));$('nv').value=v.id;await switchVault(v.id);}catch(e){status(e.message);}};
  document.addEventListener('keydown',e=>{if(root.hidden)return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();save();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='e'){e.preventDefault();setMode(mode==='read'?'split':'read');}});
  window.addEventListener('beforeunload',e=>{remember();if(tabs.some(dirty)){e.preventDefault();e.returnValue='';}});
  setInterval(async()=>{
    if(root.hidden||document.hidden||!vault||saving)return;
    try{await loadList();const latest=notes.find(n=>n.path===active?.path);if(active&&latest&&latest.version!==active.version){
      if(dirty(active)){status('This note changed in another editor. Your draft is preserved; saving will check for conflicts.');return;}
      const t=active,id=vault,n=await api('note-read',{vault:id,path:t.path});if(active===t&&vault===id&&!dirty(t)){Object.assign(t,{content:n.content,baseline:n.content,version:n.version});activate(t);}
    }}catch(e){status(e.message);}
  },15000);
  return {
    async init(vaults,identity){account=identity??'owner';$('nv').replaceChildren(...vaults.map(v=>new Option(v.name,v.id)));if(vaults.length)await switchVault(vaults[0].id);},
    refresh:loadList,
    async open(path,vaultId){if(vaultId&&vaultId!==vault){$('nv').value=vaultId;await switchVault(vaultId);}await openNote(path,{newTab:true});},
    async openReference(ref,from,vaultId){if(vaultId&&vaultId!==vault){$('nv').value=vaultId;await switchVault(vaultId);}await follow(resolveLink(ref,from,notes),{ctrlKey:true});},
    clear(){for(const option of $('nv').options){try{sessionStorage.removeItem(`aria.workspace.${account}.${option.value}`);}catch{}}tabs=[];active=null;notes=[];vault='';activate(null);},
    get notes(){return notes;}, get vault(){return vault;}
  };
}
