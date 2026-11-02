import { renderMarkdown } from './note-renderer.js';
import { noteName, parentPath, buildTree, extractLinks, resolveLink, aliasesOf, splitNote, setProperty, withLayout, rebaseLayout, readLayout, aiDefault } from './note-model.js';
import { captureRichPaste } from './rich-paste.js';
import {createMovePicker} from './note-move.js';

const icons = {file:'<path d="M5 3h9l5 5v13H5zM14 3v6h5M8 13h8M8 17h6"/>',folder:'<path d="M3 6h7l2 2h9v12H3zM15 11v6M12 14h6"/>',collapse:'<path d="m7 3 5 5 5-5M7 21l5-5 5 5M4 12h16"/>',search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',sidebar:'<rect x="3" y="4" width="18" height="16"/><path d="M9 4v16"/>'};
const icon = k => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[k]}</svg>`;
export function mountWorkspace(root, { api, ask, confirm: confirmBox = async m => globalThis.confirm(m), model = () => 'gemini-3.5-flash-lite' }) {
  root.innerHTML = `<div class="notes-workspace"><section class="file-explorer" aria-label="File explorer">
    <div class="explorer-tools"><b>FILES</b><button id="nn" class="icon-button" title="New note" aria-label="New note">${icon('file')}</button><button id="nf" class="icon-button" title="New folder" aria-label="New folder">${icon('folder')}</button><button id="nc" class="icon-button" title="Collapse all folders" aria-label="Collapse all folders">${icon('collapse')}</button><button id="ne" class="icon-button" title="Expand all folders" aria-label="Expand all folders">⌄</button><a class="icon-button" href="/import.html" title="Import notes" aria-label="Import notes">⇪</a></div>
    <div class="file-search"><input id="note-search" type="search" placeholder="Find a note…" aria-label="Find a note"></div><button id="move-root" class="tree-row" title="Drop a note here to move it to the vault root">/ Vault root</button><div id="nl" class="file-tree" role="tree" aria-label="Notes"></div>
    <div class="vault-footer"><select id="nv" aria-label="Notes vault"></select><button id="new-vault" class="icon-button" title="New vault" aria-label="New vault">+</button><button id="vault-desc" class="icon-button" title="Vault description (helps Capri pick where to search)" aria-label="Vault description">ⓘ</button><button id="sync-info" class="icon-button" title="Obsidian sync setup" aria-label="Obsidian sync setup">↻</button><button id="reindex" class="icon-button" title="Rebuild the search index for this vault (text is not changed)" aria-label="Rebuild search index">⟲</button></div></section><div class="explorer-resize" role="separator" aria-label="Resize file explorer" aria-orientation="vertical" tabindex="0"></div>
    <div class="note-pane"><div id="note-tabs" class="note-tabs" role="tablist" aria-label="Open notes"></div>
    <div class="note-bar"><button id="explorer-toggle" class="icon-button" aria-label="Toggle file explorer">${icon('sidebar')}</button><div id="np" class="note-breadcrumb">No note open</div><div class="view-modes"><button data-mode="read" aria-pressed="true">Read</button><button data-mode="split" aria-pressed="false">Edit</button><button data-mode="source" aria-pressed="false">Source</button></div><button id="note-format" class="mb" title="Suggest layout without rewriting the text">Capri format</button><button id="note-segment" class="mb" title="Split a long note into scoped sections Capri can search precisely (your text is copied, never rewritten)">Segment</button></div>
    <div id="note-refs" class="reference-bar" hidden></div><details id="note-properties" class="note-properties" hidden><summary>Properties</summary><div><label><input id="note-ai" type="checkbox"> Allow AI search</label><label>Aliases <input id="note-aliases" placeholder="comma separated"></label></div></details>
    <div id="ns" class="note-message" role="status"></div><div id="note-content" class="note-content" data-mode="read"><div id="note-empty" class="note-blank"><h2>Your notes, connected.</h2><p>Open a note from the explorer.<br>Ctrl + click opens another tab.</p></div><div id="note-source" class="note-source" hidden><div class="format-tools"><button data-format="bold" title="Bold">B</button><button data-format="italic" title="Italic"><i>I</i></button><button data-format="heading" title="Heading">H</button><button data-format="link" title="Link a note">[[ ]]</button><button data-format="red">Red</button><button data-format="quote">“Quote”</button><button data-format="indent" title="Indent">⇥</button></div><textarea id="ed" spellcheck="false" aria-label="Note editor"></textarea></div><div id="note-reading" class="note-reading" hidden><div id="note-rendered"></div></div><div id="note-suggest" class="note-suggest" hidden></div></div>
    <div class="note-bottom"><span id="note-state">Select a note to begin.</span><button id="note-reload" hidden>Load saved version</button><button id="sv" disabled>Save</button></div></div></div>
    <div id="ctx" class="ctx" role="menu" hidden></div>
    <dialog id="vdlg"><form id="vdf"><label id="vdl" for="vdt">Describe this vault so Capri knows when to search it</label><textarea id="vdt" rows="6" maxlength="500" spellcheck="true"></textarea><small id="vdc"></small><label><input type="checkbox" id="vdquick"> Allow Quick Note to file here</label><small id="vdquick-help"></small><div id="vdm" class="ns" role="status" hidden></div><button type="button" id="vdai">✦ Let Capri write it</button><div class="ab"><button type="button" id="vdx">Cancel</button><button id="vdok">Save</button></div></form></dialog>`;
  const $ = id => root.querySelector('#'+id), el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  let vault='', notes=[], tabs=[], active=null, folder='', expanded=new Set(), folders=[], mode='read', account='', loading=0, saving=false, moving=false, descriptions=new Map(), quickVaults=new Map(), cache=new Map(), inflight=new Map(), lastStamp=null;
  const sessionKey=()=>`aria.workspace.${account}.${vault}`, folderKey=()=>`aria.folders.${account}.${vault}`;
  const dirty=t=>t&&t.content!==t.baseline;
  const status=s=>$('ns').textContent=s;
  function remember(){try{sessionStorage.setItem(sessionKey(),JSON.stringify({tabs,active:active?.path,expanded:[...expanded],mode}));localStorage.setItem(folderKey(),JSON.stringify(folders));}catch{status('Browser storage is full. Save your changes before leaving.');}}
  function update(){ $('sv').disabled=!active||!dirty(active)||saving; $('note-format').disabled=!active||saving; $('note-state').textContent=active?`${dirty(active)?'Unsaved changes':'Saved'} · ${splitNote(active.content).body.trim().split(/\s+/).filter(Boolean).length} words · ${notes.find(n=>n.path===active.path)?.ai_enabled?'AI search on':'AI search off'}`:'Select a note to begin.'; renderTabs();remember(); }
  function renderTabs(){
    const bar=$('note-tabs');bar.replaceChildren();
    tabs.forEach(t=>{const wrap=el('div');wrap.className='note-tab'+(t===active?' active':'');const b=el('button',noteName(t.path)+(dirty(t)?' •':''));b.setAttribute('role','tab');b.setAttribute('aria-selected',String(t===active));b.title=t.path;dragNote(b,t.path,t.version);b.oncontextmenu=e=>{e.preventDefault();menu(e.clientX,e.clientY,noteItems(t.path));};b.onclick=()=>activate(t);const x=el('button','×');x.className='icon-button';x.setAttribute('aria-label','Close '+noteName(t.path));x.onclick=()=>closeTab(t);wrap.append(b,x);bar.append(wrap);});
    const add=el('button','+');add.className='icon-button';add.title='Open another note';add.setAttribute('aria-label','Open another note');add.onclick=()=>{$('note-search').focus();showExplorer();};bar.append(add);
  }
  function renderTree(){
    const filter=$('note-search').value.trim().toLowerCase(), tree=buildTree(notes.filter(n=>n.path.toLowerCase().includes(filter)||n.aliases?.some(a=>a.toLowerCase().includes(filter))),filter?[]:folders);
    const list=$('nl');list.replaceChildren();
    function walk(node,parent){
      [...node.folders.values()].sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true})).forEach(f=>{
        const wrap=el('div'),line=el('div'),b=el('button'),arrow=el('span','›'),label=el('span',f.name),add=el('button','+');
        line.className='tree-line';b.className='tree-row';arrow.className='chevron';b.append(arrow,label);b.title=f.path;dropTarget(b,f.path);b.setAttribute('role','treeitem');b.setAttribute('aria-expanded',String(!!filter||expanded.has(f.path)));
        add.className='row-add';add.type='button';add.title='New note or folder in '+f.name;add.setAttribute('aria-label','Add to '+f.name);
        add.onclick=e=>{e.stopPropagation();const r=add.getBoundingClientRect();menu(r.left,r.bottom,[['New note here',()=>newNoteIn(f.path)],['New folder here',()=>newFolderIn(f.path)]]);};
        b.oncontextmenu=e=>{e.preventDefault();menu(e.clientX,e.clientY,folderItems(f.path));};
        const children=el('div');children.className='tree-children';children.setAttribute('role','group');children.hidden=!filter&&!expanded.has(f.path);
        b.onclick=()=>{folder=f.path;if(expanded.has(f.path))expanded.delete(f.path);else expanded.add(f.path);renderTree();remember();};
        line.append(b,add);wrap.append(line,children);walk(f,children);parent.append(wrap);
      });
      node.notes.sort((a,b)=>noteName(a.path).localeCompare(noteName(b.path),undefined,{numeric:true})).forEach(n=>{
        const b=el('button');b.className='tree-row';b.setAttribute('role','treeitem');b.append(el('span',''),el('span',noteName(n.path)));b.firstChild.className='chevron';b.title=n.path;dragNote(b,n.path,n.version);b.setAttribute('aria-current',String(active?.path===n.path));
        b.onclick=e=>openNote(n.path,{newTab:e.ctrlKey||e.metaKey});b.onauxclick=e=>{if(e.button===1){e.preventDefault();openNote(n.path,{newTab:true});}};b.ondblclick=()=>openNote(n.path,{newTab:true});
        b.onmouseenter=b.onfocus=()=>prefetch(n.path);
        b.oncontextmenu=e=>{e.preventDefault();menu(e.clientX,e.clientY,noteItems(n.path));};
        parent.append(b);
      });
    }
    walk(tree,list);if(!notes.length||(!tree.folders.size&&!tree.notes.length))list.append(Object.assign(el('p',filter?'No matching notes.':'Create a note or import your vault.'),{className:'tree-empty'}));
  }
  // ---- moving and explorer controls
  const picker=createMovePicker({api,localFolders:id=>{try{return JSON.parse(localStorage.getItem('aria.folders.'+account+'.'+id)??'[]');}catch{return [];}}});
  const dragType='application/x-aria-note';
  function dragNote(node,path,version){
    node.draggable=true;
    node.ondragstart=e=>{if(saving){e.preventDefault();return;}e.dataTransfer.effectAllowed='move';e.dataTransfer.setData(dragType,JSON.stringify({path,vault,version}));};
  }
  function dropTarget(node,destination){
    let hover;
    node.ondragover=e=>{if(![...e.dataTransfer.types].includes(dragType))return;e.preventDefault();e.stopPropagation();e.dataTransfer.dropEffect='move';node.classList.add('drop-target');if(destination&&!expanded.has(destination)&&!hover)hover=setTimeout(()=>{expanded.add(destination);renderTree();},650);};
    node.ondragleave=()=>{node.classList.remove('drop-target');clearTimeout(hover);hover=null;};
    node.ondrop=e=>{if(![...e.dataTransfer.types].includes(dragType))return;e.preventDefault();e.stopPropagation();clearTimeout(hover);node.classList.remove('drop-target');try{const n=JSON.parse(e.dataTransfer.getData(dragType));performMove(n,{vault,folder:destination}).catch(err=>status(err.message));}catch{status('This note could not be moved.');}};
  }
  dropTarget($('move-root'),'');
  function sourceDraft(source){
    if(source.vault===vault)return tabs.find(t=>t.path===source.path);
    try{return JSON.parse(sessionStorage.getItem('aria.workspace.'+account+'.'+source.vault)??'null')?.tabs?.find(t=>t.path===source.path);}catch{return null;}
  }
  async function performMove(source,destination){
    if(saving)throw new Error('Wait for the current save to finish.');
    if(dirty(sourceDraft(source)))throw new Error('Save this note’s draft before moving it.');
    let toPath=[destination.folder,source.path.split('/').at(-1)].filter(Boolean).join('/');
    saving=true;moving=true;$('ed').readOnly=true;$('note-ai').disabled=true;$('note-aliases').disabled=true;update();
    let result;
    try{
      result=await api('note-move',{vault:source.vault,path:source.path,baseVersion:source.version,toVault:destination.vault,toPath});
      toPath=result.path;
      cache.clear();inflight.clear();loading++;
      if(source.vault===vault)dropTabs([source.path]);
      else{const key='aria.workspace.'+account+'.'+source.vault;try{const s=JSON.parse(sessionStorage.getItem(key)??'null');if(s){s.tabs=s.tabs.filter(t=>t.path!==source.path);if(s.active===source.path)s.active=s.tabs[0]?.path;sessionStorage.setItem(key,JSON.stringify(s));}}catch{}}
      if(destination.vault!==vault){if(![...$('nv').options].some(o=>o.value===destination.vault)){const {vaults}=await api('vaults');for(const v of vaults)if(![...$('nv').options].some(o=>o.value===v.id))$('nv').append(new Option(v.name,v.id));}$('nv').value=destination.vault;await switchVault(destination.vault);}
      else await loadList();
      $('note-search').value='';let p=destination.folder;while(p){expanded.add(p);p=parentPath(p);}await openNote(toPath,{newTab:true});showExplorer();renderTree();remember();
      requestAnimationFrame(()=>[...$('nl').querySelectorAll('.tree-row')].find(b=>b.title===toPath)?.scrollIntoView({block:'nearest'}));
      status('Moved to '+toPath+'.');window.dispatchEvent(new Event('aria-note-moved'));return result;
    }catch(e){if(result){status('Moved successfully. Reopen Notes to refresh the destination.');window.dispatchEvent(new Event('aria-note-moved'));return result;}throw e;}
    finally{moving=false;saving=false;$('ed').readOnly=false;$('note-ai').disabled=false;$('note-aliases').disabled=false;update();}
  }
  async function moveNote(path,id=vault,version){
    if(saving)throw new Error('Wait for the current save to finish.');
    const source={path,vault:id,version:version??(id===vault?notes.find(n=>n.path===path)?.version:undefined)};
    if(dirty(sourceDraft(source)))throw new Error('Save this note’s draft before moving it.');
    if(!source.version)source.version=(await api('note-read',{vault:id,path})).version;
    return picker(source,dest=>performMove(source,dest));
  }
  const explorer=root.firstChild,resize=root.querySelector('.explorer-resize');
  const narrow=()=>matchMedia('(max-width:580px)').matches;
  function explorerState(){const on=narrow()?explorer.classList.contains('explorer-open'):!explorer.classList.contains('explorer-collapsed');$('explorer-toggle').setAttribute('aria-expanded',String(on));}
  function showExplorer(){explorer.classList.remove('explorer-collapsed');explorer.classList.add('explorer-open');explorerState();}
  function toggleExplorer(){explorer.classList.toggle(narrow()?'explorer-open':'explorer-collapsed');explorerState();try{localStorage.setItem('aria.explorer.collapsed.'+account,String(explorer.classList.contains('explorer-collapsed')));}catch{}}
  function width(value){const w=Math.max(180,Math.min(480,value));explorer.style.setProperty('--explorer-width',w+'px');resize.setAttribute('aria-valuenow',w);try{localStorage.setItem('aria.explorer.width.'+account,String(w));}catch{}}
  function restoreExplorer(){try{width(Number(localStorage.getItem('aria.explorer.width.'+account))||260);explorer.classList.toggle('explorer-collapsed',localStorage.getItem('aria.explorer.collapsed.'+account)==='true');}catch{}explorerState();}
  resize.setAttribute('aria-valuemin','180');resize.setAttribute('aria-valuemax','480');
  resize.onpointerdown=e=>{if(narrow())return;resize.setPointerCapture(e.pointerId);resize.onpointermove=ev=>width(ev.clientX-explorer.getBoundingClientRect().left);resize.onpointerup=()=>{resize.onpointermove=null;};};
  resize.onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();width((parseInt(explorer.style.getPropertyValue('--explorer-width'))||260)+(e.key==='ArrowRight'?20:-20));}};
  window.addEventListener('resize',explorerState);
  // ---- context menu, delete / archive / duplicate
  const hideMenu=()=>{$('ctx').hidden=true;};
  function menu(x,y,items){const m=$('ctx');m.replaceChildren();for(const [label,fn,danger] of items){const b=el('button',label);b.setAttribute('role','menuitem');if(danger)b.className='danger';b.onclick=()=>{hideMenu();fn();};m.append(b);}m.hidden=false;m.style.left=Math.max(4,Math.min(x,innerWidth-m.offsetWidth-8))+'px';m.style.top=Math.max(4,Math.min(y,innerHeight-m.offsetHeight-8))+'px';m.querySelector('button')?.focus();}
  document.addEventListener('click',hideMenu);window.addEventListener('resize',hideMenu);root.addEventListener('scroll',hideMenu,true);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')hideMenu();});
  const under=f=>notes.filter(n=>n.path.startsWith(f+'/')).map(n=>n.path);
  const free=base=>{let q=base,i=1;while(notes.some(x=>x.path.toLowerCase()===q.toLowerCase()))q=base.replace(/\.md$/i,` (${++i}).md`);return q;};
  const noteItems=p=>[['Open in new tab',()=>openNote(p,{newTab:true})],['Move to…',()=>moveNote(p).catch(e=>status(e.message))],['Duplicate',()=>duplicateNote(p)],['Archive',()=>archive([p],'“'+noteName(p)+'”')],['Delete',()=>remove([p],'“'+noteName(p)+'”'),true]];
  const folderItems=f=>[['New note here',()=>newNoteIn(f)],['New folder here',()=>newFolderIn(f)],['Archive folder',()=>archive(under(f),'folder “'+f+'”',f)],['Delete folder',()=>remove(under(f),'folder “'+f+'” and everything in it',f),true]];
  async function newNoteIn(base){const name=await ask('New note in “'+base+'”',base+'/Untitled');if(name)createNote(name);}
  async function newFolderIn(base){
    const name=await ask('New folder (empty folders stay in this browser until a note is added)',[base,'New folder'].filter(Boolean).join('/'));if(!name)return;
    if(name.split('/').some(p=>!p||p==='..'||p.startsWith('.')||/[\\:*?"<>|]/.test(p))){status('Choose a valid folder name.');return;}
    folders=[...new Set([...folders,name])];folder=name;let p=name;while(p){expanded.add(p);p=parentPath(p);}renderTree();remember();
  }
  function dropTabs(paths){const gone=new Set(paths);tabs=tabs.filter(t=>!gone.has(t.path));if(active&&gone.has(active.path))activate(tabs.at(-1)??null);else update();}
  async function remove(paths,what,folderPath){
    if(saving)return;const drafts=tabs.filter(t=>paths.includes(t.path)&&dirty(t)).length;
    const ok=await confirmBox(`Delete ${what}?\n${paths.length>1?paths.length+' notes will be deleted. ':''}This cannot be undone from Capri${drafts?` and ${drafts} unsaved draft${drafts>1?'s':''} will be lost`:''}.\nIf this vault is synced with Obsidian, the copy on your computer may be restored by the next sync.`,'Delete');
    if(!ok)return;
    try{
      for(const p of paths){const meta=notes.find(n=>n.path===p);if(!meta)continue;await api('note-delete',{vault,path:p,baseVersion:meta.version});dropTabs([p]);}
      if(folderPath){folders=folders.filter(f=>f!==folderPath&&!f.startsWith(folderPath+'/'));expanded.delete(folderPath);}
      await loadList();status(paths.length?`Deleted ${paths.length} note${paths.length===1?'':'s'}.`:'Folder removed.');
    }catch(e){await loadList().catch(()=>{});status(e.message);}
  }
  async function archive(paths,what,folderPath){
    if(saving)return;if(!paths.length&&!folderPath)return;
    if(paths.some(p=>/^99 Archive\//i.test(p))){status('These notes are already archived.');return;}
    if(!await confirmBox(`Archive ${what}?\nThe notes move to “99 Archive” and AI search is turned off for them.`,'Archive'))return;
    try{
      for(const p of paths){const n=await api('note-read',{vault,path:p});await api('note',{vault,path:free('99 Archive/'+p),content:setProperty(n.content,'ai_enabled',false),baseVersion:0});await api('note-delete',{vault,path:p,baseVersion:n.version});dropTabs([p]);}
      if(folderPath){folders=folders.filter(f=>f!==folderPath&&!f.startsWith(folderPath+'/'));expanded.delete(folderPath);}
      await loadList();status(`Archived ${paths.length} note${paths.length===1?'':'s'}.`);
    }catch(e){await loadList().catch(()=>{});status(e.message);}
  }
  async function duplicateNote(path){
    try{const n=await api('note-read',{vault,path}),to=free(path.replace(/\.md$/i,' copy.md'));
      // AI search is off on the copy so duplicate passages never compete in search.
      await api('note',{vault,path:to,content:setProperty(n.content,'ai_enabled',false),baseVersion:0});await loadList();await openNote(to,{newTab:true});}
    catch(e){status(e.message);}
  }
  // ---- fast opening: hover prefetch + cache validated against the list's version
  const keyOf=(id,path)=>id+'\u0000'+path;
  function prefetch(path){
    const id=vault,k=keyOf(id,path),meta=notes.find(n=>n.path===path);
    if(!meta||cache.get(k)?.version===meta.version||inflight.has(k))return;
    if(cache.size>60)cache.clear();
    inflight.set(k,api('note-read',{vault:id,path}).then(r=>{cache.set(k,r);}).catch(()=>{}).finally(()=>inflight.delete(k)));
  }
  async function load(path,id){
    const k=keyOf(id,path),meta=notes.find(n=>n.path===path),fresh=n=>n&&meta&&n.version===meta.version;
    if(fresh(cache.get(k)))return cache.get(k);
    await inflight.get(k);if(fresh(cache.get(k)))return cache.get(k);
    const n=await api('note-read',{vault:id,path});cache.set(k,n);return n;
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
    $('np').replaceChildren();if(t){$('np').append(el('span',parentPath(t.path).replaceAll('/',' / ')+(parentPath(t.path)?' / ':'')),el('strong',noteName(t.path)));$('note-ai').checked=aiDefault(t.content,t.path);$('note-aliases').value=aliasesOf(t.content).join(', ');preview();}
    else{$('np').textContent='No note open';$('note-refs').hidden=true;}
    setMode(mode);renderTree();update();status('');$('note-reload').hidden=!t?.conflict;
  }
  function setMode(next){mode=next;$('note-content').dataset.mode=mode;$('note-source').hidden=!active||mode==='read';$('note-reading').hidden=!active||mode==='source';root.querySelectorAll('[data-mode]').forEach(b=>{if(b.tagName==='BUTTON')b.setAttribute('aria-pressed',String(b.dataset.mode===mode));});remember();}
  async function closeTab(t){if(dirty(t)&&await ask(`Close “${noteName(t.path)}” without saving? Type discard to discard changes.`)!=='discard')return;const i=tabs.indexOf(t);tabs.splice(i,1);if(active===t)activate(tabs[Math.min(i,tabs.length-1)]??null);else update();}
  async function loadList(){const id=vault;if(!id)return;const data=await api('notes?vault='+id);if(id!==vault)return;notes=data.notes;renderTree();if(active){renderReferences();update();}}
  async function openNote(path,{newTab=false,anchor=''}={}){
    if(!vault)return;const existing=tabs.find(t=>t.path===path);if(existing){activate(existing);jump(anchor);return;}
    const ticket=++loading,id=vault;
    try{status('Opening…');const n=await load(path,id);if(ticket!==loading||id!==vault)return;
      const t={path:n.path,version:n.version,content:n.content,baseline:n.content};
      if(!newTab&&active&&!dirty(active))tabs.splice(tabs.indexOf(active),1,t);else tabs.push(t);
      let p=parentPath(path);while(p){expanded.add(p);p=parentPath(p);}activate(t);root.firstChild.classList.remove('explorer-open');jump(anchor);
      extractLinks(t.content).slice(0,6).forEach(r=>{const l=resolveLink(r,t.path,notes);if(l.resolved)prefetch(l.resolved);});
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
    try{await api('note',{vault,path,content:'---\nai_enabled: true\n---\n\n# '+noteName(path)+'\n',baseVersion:0});await loadList();await openNote(path,{newTab:true});setMode('split');$('ed').focus();}catch(e){status(e.message);}
  }
  async function save(){
    if(!active||!dirty(active)||saving)return;const t=active,id=vault,content=t.content;saving=true;update();
    try{const r=await api('note',{vault:id,path:t.path,content,baseVersion:t.version});t.baseline=content;t.version=r.version;t.conflict=false;status('Saved.');await loadList();}
    catch(e){t.conflict=true;status(e.message+' Your unsaved text is kept in this tab.');$('note-reload').hidden=false;}
    finally{saving=false;update();}
  }
  function input(){if(!active||moving)return;const editor=$('ed'),cursor=editor.selectionStart,next=editor.value;active.content=rebaseLayout(active.content,next);if(active.content!==next){editor.value=active.content;const shift=active.content.length-next.length;editor.setSelectionRange(cursor+shift,cursor+shift);}preview();update();suggest();}
  function suggest(){const box=$('note-suggest');box.replaceChildren();const before=$('ed').value.slice(0,$('ed').selectionStart),m=/\[\[([^\]\n]*)$/.exec(before);box.hidden=!m;if(!m)return;notes.filter(n=>n.path.toLowerCase().includes(m[1].toLowerCase())||n.aliases?.some(a=>a.toLowerCase().includes(m[1].toLowerCase()))).slice(0,12).forEach(n=>{const b=el('button',noteName(n.path));b.append(el('small',parentPath(n.path)));b.onmousedown=e=>e.preventDefault();b.onclick=()=>{const editor=$('ed'),from=editor.selectionStart-m[1].length;editor.setRangeText(n.path.replace(/\.md$/i,'')+']]',from,editor.selectionStart,'end');input();box.hidden=true;editor.focus();};box.append(b);});}
  $('ed').oninput=input;
  $('ed').onpaste=e=>{if(moving){e.preventDefault();return;}const rich=captureRichPaste(e.clipboardData);if(!rich?.layout.spans.length&&!rich?.layout.blocks.length)return;e.preventDefault();const editor=$('ed'),start=editor.selectionStart,end=editor.selectionEnd;editor.setRangeText(rich.text,start,end,'end');const content=editor.value,body=splitNote(content).body,offset=start-(content.length-body.length);if(offset>=0){try{active.content=withLayout(content,{spans:rich.layout.spans.map(s=>({...s,start:s.start+offset,end:s.end+offset})),blocks:rich.layout.blocks.map(b=>({...b,line:b.line+body.slice(0,offset).split('\n').length-1}))});editor.value=active.content;editor.setSelectionRange(start+rich.text.length+(active.content.length-content.length),start+rich.text.length+(active.content.length-content.length));}catch{active.content=content;}}input();};
  $('ed').onkeydown=e=>{if(e.key==='Escape')$('note-suggest').hidden=true;if(e.key==='Tab'){e.preventDefault();const ed=$('ed');if(e.shiftKey){const s=ed.value.lastIndexOf('\n',ed.selectionStart-1)+1;if(ed.value.slice(s,s+4)==='    ')ed.setRangeText('',s,s+4,'end');}else ed.setRangeText('    ',ed.selectionStart,ed.selectionEnd,'end');input();}};
  root.querySelectorAll('[data-format]').forEach(b=>b.onclick=()=>{const ed=$('ed'),s=ed.selectionStart,e=ed.selectionEnd,v=ed.value.slice(s,e),pairs={bold:['**','**'],italic:['*','*'],link:['[[',']]'],red:['<span style="color: red">','</span>'],quote:['“','”'],heading:['## ',''],indent:['    ','']},[a,z]=pairs[b.dataset.format];ed.setRangeText(a+v+z,s,e,'select');ed.focus();input();});
  root.querySelectorAll('button[data-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
  $('nn').onclick=async()=>{const name=await ask('New note (use folder/name to choose its location)',[folder,'Untitled'].filter(Boolean).join('/'));if(name)createNote(name);};
  $('nf').onclick=()=>newFolderIn(folder);
  $('ne').onclick=()=>{for(const n of notes){let p=parentPath(n.path);while(p){expanded.add(p);p=parentPath(p);}}for(const f of folders){let p=f;while(p){expanded.add(p);p=parentPath(p);}}renderTree();remember();};
  $('nc').onclick=()=>{expanded.clear();renderTree();remember();};$('note-search').oninput=renderTree;$('sv').onclick=save;
  $('note-reload').onclick=async()=>{if(dirty(active)&&await ask('Replace this draft with the saved version? Type discard to continue.')!=='discard')return;const path=active.path;tabs.splice(tabs.indexOf(active),1);active=null;await openNote(path,{newTab:true});};
  $('note-ai').onchange=()=>{active.content=setProperty(active.content,'ai_enabled',$('note-ai').checked);$('ed').value=active.content;input();};
  $('note-aliases').onchange=()=>{active.content=setProperty(active.content,'aliases',$('note-aliases').value.split(',').map(s=>s.trim()).filter(Boolean));$('ed').value=active.content;input();};
  $('explorer-toggle').onclick=()=>toggleExplorer();
  $('note-format').onclick=async()=>{if(!active||saving)return;const t=active,original=t.content;saving=true;update();status('Capri is suggesting a layout. Your text stays unchanged.');try{const r=await api('note-format',{content:original,model:model()});if(t.content!==original)throw new Error('The note changed while formatting. Try again.');t.content=withLayout(original,{...r.layout,spans:[...(readLayout(original)?.spans??[]),...(r.layout.spans??[])]});if(t===active){$('ed').value=t.content;preview();setMode('read');}status('Layout applied to this draft. Original text verified unchanged. Save when ready.');}catch(e){status(e.message);}finally{saving=false;update();}};
  $('note-segment').onclick=async()=>{
    if(!active||saving)return;
    if(dirty(active)){status('Save this note before segmenting it.');return;}
    if(!await confirmBox('Segment “'+noteName(active.path)+'” with Capri?\nIts text is copied into sections under “Aria Segments/” (nothing is rewritten). AI search is then turned off for the original so duplicates do not compete; turn it back on any time.','Segment'))return;
    const t=active,id=vault;saving=true;update();status('Capri is reading and segmenting this note. Your text is not rewritten…');
    try{
      const r=await api('note-segment',{vault:id,path:t.path,model:model()});
      tabs.splice(tabs.indexOf(t),1);active=null;await loadList();expanded.add('Aria Segments');
      await openNote(t.path,{newTab:true});
      status('Created '+r.segments+' segments in “'+r.folder+'”. The original is kept, with AI search off.');
    }catch(e){status(e.message);}
    finally{saving=false;update();}
  };
  $('reindex').onclick=async()=>{
    if(!vault||saving||!await confirmBox('Rebuild the search index for every AI-enabled note in this vault? Text is not changed.','Rebuild'))return;
    saving=true;update();let done=0,failed=0,offset=0;
    try{while(offset!==null){const r=await api('vault-reindex',{vault,offset});done+=r.processed;failed+=r.failed;offset=r.next;status('Reindexed '+done+' notes…');}status('Reindexed '+done+' notes'+(failed?', '+failed+' skipped (changed elsewhere).':'.'));}
    catch(e){status(e.message);}
    finally{saving=false;update();await loadList().catch(()=>{});}
  };
  $('sync-info').onclick=()=>status('Automatic Obsidian sync setup: docs/OBSIDIAN-SYNC.md. Pair each local vault once, then install the background sync task. The website cannot access a local folder directly.');
  // ---- vault description dialog (with "Let Capri write it")
  const vdNote=m=>{$('vdm').textContent=m;$('vdm').hidden=!m;};
  const vdCount=()=>{$('vdc').textContent=$('vdt').value.length+' / 500';};
  $('vault-desc').onclick=()=>{if(!vault)return;$('vdlg').dataset.vault=vault;$('vdt').value=descriptions.get(vault)??'';vdCount();vdNote('');$('vdquick').checked=quickVaults.get(vault)?.allow_auto_file??false;$('vdquick').disabled=!!quickVaults.get(vault)?.is_unsorted;$('vdquick-help').textContent=quickVaults.get(vault)?.is_unsorted?'Unsorted always accepts uncertain quick notes.':'Shares this vault’s name, description and eligible folder names for filing.';$('vdlg').showModal();$('vdt').focus();};
  $('vdt').oninput=vdCount;
  $('vdx').onclick=()=>$('vdlg').close();
  $('vdai').onclick=async()=>{
    const id=$('vdlg').dataset.vault;$('vdai').disabled=true;$('vdok').disabled=true;vdNote('Capri is reading this vault’s note titles and headings…');
    try{const r=await api('vault-describe',{vault:id,model:model()});if(!$('vdlg').open)return;$('vdt').value=r.description;vdCount();vdNote('Review and edit it, then Save. Nothing is saved yet.');}
    catch(e){vdNote(e.message);}
    finally{$('vdai').disabled=false;$('vdok').disabled=false;}
  };
  $('vdf').onsubmit=async e=>{
    e.preventDefault();const id=$('vdlg').dataset.vault,text=$('vdt').value.trim();$('vdok').disabled=true;
    try{await api('vault-update',{vault:id,description:text});await api('vault-quick',{vault:id,allow:$('vdquick').checked});quickVaults.set(id,{...quickVaults.get(id),allow_auto_file:$('vdquick').checked});descriptions.set(id,text);const o=[...$('nv').options].find(o=>o.value===id);if(o)o.title=text;$('vdlg').close();status('Vault description saved.');}
    catch(err){vdNote(err.message);}
    finally{$('vdok').disabled=false;}
  };
  async function switchVault(id){remember();vault=id;lastStamp=null;loading++;tabs=[];active=null;expanded=new Set();folders=[];try{folders=JSON.parse(localStorage.getItem(folderKey())??'[]');const data=JSON.parse(sessionStorage.getItem(sessionKey())??'null');if(data){tabs=data.tabs??[];active=tabs.find(t=>t.path===data.active)??tabs[0];expanded=new Set(data.expanded);mode=data.mode??'read';}}catch{}activate(active);await loadList();}
  $('nv').onchange=()=>{if(saving){$('nv').value=vault;return;}switchVault($('nv').value).catch(e=>status(e.message));};
  $('new-vault').onclick=async()=>{const name=await ask('New vault name');if(!name)return;try{const v=await api('vault-create',{name});$('nv').append(new Option(v.name,v.id));$('nv').value=v.id;await switchVault(v.id);}catch(e){status(e.message);}};
  document.addEventListener('keydown',e=>{if(root.hidden)return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();save();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='e'){e.preventDefault();setMode(mode==='read'?'split':'read');}});
  window.addEventListener('beforeunload',e=>{remember();if(tabs.some(dirty)){e.preventDefault();e.returnValue='';}});
  // Cheap poll: ask only for the "last changed" stamp, and reload the list when it moves.
  setInterval(async()=>{
    if(root.hidden||document.hidden||!vault||saving)return;
    try{
      const {stamp}=await api('notes-stamp?vault='+vault);if(stamp===lastStamp)return;lastStamp=stamp;
      await loadList();const latest=notes.find(n=>n.path===active?.path);if(active&&latest&&latest.version!==active.version){
        if(dirty(active)){status('This note changed in another editor. Your draft is preserved; saving will check for conflicts.');return;}
        const t=active,id=vault,n=await api('note-read',{vault:id,path:t.path});if(active===t&&vault===id&&!dirty(t)){Object.assign(t,{content:n.content,baseline:n.content,version:n.version});activate(t);}
      }
    }catch(e){status(e.message);}
  },15000);
  return {
    async init(vaults,identity){account=identity??'owner';restoreExplorer();quickVaults=new Map(vaults.map(v=>[v.id,v]));descriptions=new Map(vaults.map(v=>[v.id,v.description??'']));$('nv').replaceChildren(...vaults.map(v=>{const o=new Option(v.name,v.id);o.title=v.description??'';return o;}));if(vaults.length)await switchVault(vaults[0].id);},
    refresh:loadList,
    move:moveNote,
    async open(path,vaultId){if(vaultId&&vaultId!==vault){$('nv').value=vaultId;await switchVault(vaultId);}await openNote(path,{newTab:true});},
    async openReference(ref,from,vaultId){if(vaultId&&vaultId!==vault){$('nv').value=vaultId;await switchVault(vaultId);}await follow(resolveLink(ref,from,notes),{ctrlKey:true});},
    clear(){for(const option of $('nv').options){try{sessionStorage.removeItem(`aria.workspace.${account}.${option.value}`);}catch{}}tabs=[];active=null;notes=[];vault='';cache.clear();inflight.clear();descriptions=new Map();quickVaults=new Map();activate(null);},
    get notes(){return notes;}, get vault(){return vault;}
  };
}
