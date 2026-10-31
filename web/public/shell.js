import {renderMarkdown,highlightClaim} from '/note-renderer.js';
import {mountWorkspace} from '/workspace.js';
import {conversationMemory,listChats,saveChat,deleteChat} from '/chat-store.js';

const $=id=>document.getElementById(id),el=(t,x)=>{const n=document.createElement(t);if(x!==undefined)n.textContent=x;return n};
let history=[],signedIn=false,busy=false,cfg,first=true,owner="",currentChat=null,chatController=null;
const workspace=mountWorkspace($("notes"),{api,ask,model:()=>$("model").value});
async function api(p,b){const r=await fetch('/api/'+p,{method:b?'POST':'GET',headers:b?{'Content-Type':'application/json'}:{},body:b?JSON.stringify(b):undefined});const d=await r.json().catch(()=>({}));if(r.status===401){signedIn=false;$('login').showModal()}if(!r.ok)throw Object.assign(new Error(d.error||'Request failed.'),{status:r.status});return d}
async function chat(body,on){
 const r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/x-ndjson'},body:JSON.stringify(body),signal:chatController?.signal});
 if(r.status===401){signedIn=false;$('login').showModal()}
 if(!r.ok||!r.headers.get('content-type')?.includes('ndjson')){const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Request failed.');return d}
 const rd=r.body.getReader(),dec=new TextDecoder();let buf='',res;
 const eat=l=>{if(!l.trim())return;const e=JSON.parse(l);if(e.type==='error')throw new Error(e.error);if(e.type==='progress')on(e);if(e.type==='result')res=e};
 for(;;){const{done,value}=await rd.read();if(done)break;buf+=dec.decode(value,{stream:true});let i;while((i=buf.indexOf('\n'))>=0){eat(buf.slice(0,i));buf=buf.slice(i+1)}}
 eat(buf);if(!res)throw new Error('Connection ended before Aria finished.');return res}
function md(root,text){renderMarkdown(root,text,{citations:true,notes:workspace.notes,onLink:(link)=>{if(link.resolved){tab(true);workspace.open(link.resolved)}}});}
// ---- messages, references (collapsed), citation highlight
function msg(role,text){const it=el('article');it.className='m '+role;const w=el('div','YOU');if(role!=='user')w.textContent='ARIA';w.className='who';const b=el('div');b.className='md';if(role==='user')b.textContent=text;else b.textContent=text;it.append(w,b);$('msgs').append(it);$('welcome').hidden=true;$('scroll').scrollTop=1e9;return it}
function refs(it,src){if(!src.length)return;const d=el('details');d.className='refs';d.append(el('summary','References ('+src.length+')'));
 for(const x of src){const e=el('details');e.className='src';e.dataset.s=x.id;e.dataset.path=x.path;const p=el('div');p.className='ex';p.dataset.t=x.excerpt;
 renderMarkdown(p,x.excerpt,{path:x.path,notes:workspace.notes,onLink:async link=>{tab(true);const v=[...document.querySelector('#nv').options].find(o=>o.textContent===x.vault);await workspace.openReference(link,x.path,v?.value);}});
 const sm=el('small',(x.vault?x.vault+' / ':'')+x.path.replace(/\.md$/i,'')),open=el('button','Open note ↗');open.className='open-source';open.onclick=()=>openSource(x.path,x.vault);
 e.append(el('summary','['+x.id+'] '+x.title),sm,p,open);d.append(e)}it.append(d)}
async function openSource(path,vaultName){tab(true);const opts=[...document.querySelector('#nv').options],v=opts.find(o=>o.textContent===vaultName);await workspace.open(path,v?.value);}
const hl=highlightClaim;
$('msgs').onclick=e=>{const b=e.target.closest('.c');if(!b)return;const it=b.closest('.m'),src=it.querySelector('.src[data-s="'+b.dataset.s+'"]');if(!src)return;
 it.querySelector('.refs').open=true;it.querySelectorAll('.src').forEach(x=>x.open=x===src);it.querySelectorAll('.c').forEach(x=>x.classList.toggle('on',x===b));
 const mk=hl(src.querySelector('.ex'),b.dataset.claim);src.querySelector('.warn')?.remove();
 const lg=s=>new Set((s.match(/\b(and|or)\b/gi)||[]).map(x=>x.toLowerCase())),c=lg(b.dataset.claim),g=lg([...src.querySelectorAll('mark')].map(m=>m.textContent).join(' '));
 if(c.size&&g.size&&![...c].some(x=>g.has(x))){const w=el('div','Check: the answer says “'+[...c].join('/')+'” but this passage says “'+[...g].join('/')+'”.');w.className='warn';src.querySelector('small').after(w)}
 lit(src.dataset.path);(mk||src).scrollIntoView({block:'center',behavior:'smooth'})};
// ---- vault path sidebar
const trail=$('trail'),nodes=new Map(),dirs=new Map();let order=0;
function dir(path){if(!path)return trail;if(dirs.has(path))return dirs.get(path);const i=path.lastIndexOf('/'),par=dir(i<0?'':path.slice(0,i)),f=el('div'),h=el('div',path.slice(i+1)),k=el('div');h.className='fh';k.className='fk';f.append(h,k);par.append(f);dirs.set(path,k);return k}
function file(n){let d=nodes.get(n.path);if(d){d.classList.remove('hot');void d.offsetWidth;d.classList.add('hot');return}
 const i=n.path.lastIndexOf('/');d=el('div');d.className='fi hot';d.append(el('span',n.path.slice(i+1).replace(/\.md$/i,'')),el('b',String(++order)));dir(i<0?'':n.path.slice(0,i)).append(d);nodes.set(n.path,d);d.scrollIntoView({block:'nearest',behavior:'smooth'})}
const cool=()=>trail.querySelectorAll('.hot').forEach(n=>n.classList.remove('hot'));
function lit(path){nodes.forEach(n=>n.classList.remove('lit','hot'));const n=nodes.get(path);if(n){n.classList.add('lit');n.scrollIntoView({block:'nearest',behavior:'smooth'})}}
function onProgress(it,ev){
 if(ev.stage==='search'){cool();$('cur').textContent='⌕ '+(first?'your question':ev.query.length>90?ev.query.slice(0,90)+'…':ev.query);first=false}
 else if(ev.stage==='results'){for(const n of ev.notes)file(n)}
 else if(ev.stage==='planning'||ev.stage==='answering'){it.querySelector('.md').textContent=ev.message;if(ev.stage==='answering'){cool();$('cur').textContent='composing answer'}}
 else if(ev.stage==='thought-summary'){let t=it.querySelector('.th');if(!t){t=el('details');t.className='th';t.append(el('summary','Thinking'),el('div'));it.querySelector('.who').after(t)}t.lastChild.append(ev.text)}}
// ---- ui
const err=m=>{$('err').textContent=m;$('err').hidden=!m};
function reset(){history=[];$('msgs').replaceChildren();$('welcome').hidden=false;err('');nodes.clear();dirs.clear();order=0;trail.replaceChildren();$('cur').textContent=''}
const GEM='<svg viewBox="0 0 24 24"><path d="M12 2c.5 5.5 4.5 9.5 10 10-5.5.5-9.5 4.5-10 10-.5-5.5-4.5-9.5-10-10 5.5-.5 9.5-4.5 10-10z"/></svg>',DS='<svg viewBox="0 0 24 24"><path d="M2 14c0-4 4-8 10-8 4 0 7 2 8 5l2-2-.5 6c-1 3-5 5-10 5-5 0-9.5-2-9.5-6z"/><circle cx="9" cy="12" r=".8"/></svg>';
function buildModels(){const p=$('pm');p.replaceChildren();const g=el('div');g.className='pg';g.innerHTML=GEM+'GEMINI';p.append(g);
 for(const m of cfg.models){const b=el('button',m.name);b.type='button';b.className='po'+(m.id===$('model').value?' on':'');b.dataset.id=m.id;b.append(el('small',m.rpm+'/min · '+m.rpd+'/day'));p.append(b)}
 const d=el('div');d.className='pg off';d.innerHTML=DS+'DEEPSEEK · OFF';p.append(d)}
function upd(){const m=cfg?.models.find(m=>m.id===$('model').value);$('mp').title=m?.name||'';}
async function acct(email){signedIn=true;owner=email;$('out').hidden=false;if($('login').open)$('login').close();await loadVaults();await restoreChats();if(location.hash==='#notes')tab(true);}
async function loadVaults(){try{const{vaults}=await api('vaults');const v=$('vault');v.replaceChildren(new Option('All vaults','all'));for(const x of vaults)v.append(new Option(x.name,x.id));await workspace.init(vaults,owner);}catch(e){err(e.message)}}
function setMode(v){$('mode').value=v;$('mc').classList.toggle('on',v==='general');$('mv').classList.toggle('on',v==='vault');$('vault').hidden=v!=='vault';if(currentChat){currentChat.mode=v;persistChat();}}
$('mc').onclick=()=>!busy&&setMode('general');$('mv').onclick=()=>!busy&&setMode('vault');
$('mp').onclick=()=>{if(cfg)$('pm').hidden=!$('pm').hidden};
$('pm').onclick=e=>{const b=e.target.closest('.po');if(!b)return;$('model').value=b.dataset.id;buildModels();upd();$('pm').hidden=true};
document.addEventListener('click',e=>{if(!e.target.closest('.pick'))$('pm').hidden=true});
$('pt').onclick=()=>$('app').classList.toggle('pt');
$('skip').onclick=()=>$('login').close();
$('lf').onsubmit=async e=>{e.preventDefault();$('lb').disabled=true;$('le').textContent='';try{await acct((await api('login',{email:$('email').value,password:$('pw').value})).email);$('pw').value=''}catch(x){$('le').textContent=x.message}finally{$('lb').disabled=false}};
$('out').onclick=async()=>{try{await api('logout',{});signedIn=false;reset();workspace.clear();owner='';currentChat=null;$('chat-history').replaceChildren();$('out').hidden=true;$('login').showModal()}catch(x){err(x.message)}};
$('q').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('f').requestSubmit()}};

function blankChat(){return {id:crypto.randomUUID(),title:'New conversation',updated:Date.now(),messages:[],mode:$('mode').value,vault:$('vault').value||'all',model:$('model').value,pending:null};}
async function refreshHistory(){const chats=await listChats(owner),s=$('chat-history');s.replaceChildren(new Option('New conversation',''));for(const c of chats)s.append(new Option(c.title,c.id));s.value=currentChat?.id??'';}
async function persistChat(){if(!owner||!currentChat)return;try{currentChat.updated=Date.now();await saveChat(owner,currentChat);await refreshHistory();}catch{err('Conversation could not be saved in this browser. Keep this page open.');}}
function displayChat(c){reset();currentChat=c;$('mode').value=c.mode||'general';$('mc').classList.toggle('on',c.mode!=='vault');$('mv').classList.toggle('on',c.mode==='vault');$('vault').hidden=c.mode!=='vault';$('vault').value=c.vault||'all';if(cfg.models.some(m=>m.id===c.model))$('model').value=c.model;buildModels();upd();
 for(const m of c.messages){const it=msg(m.role,m.text);if(m.role==='model'){md(it.querySelector('.md'),m.text);refs(it,m.sources||[]);}}
 history=conversationMemory(c.messages);$('resume-chat').hidden=!c.pending;$('resume-chat').textContent='Resume research';
}
async function restoreChats(){try{const chats=await listChats(owner);if(chats[0])displayChat(chats[0]);await refreshHistory();}catch{err('Browser history is unavailable. Conversations will last for this page only.');}}
$('chat-history').onchange=async()=>{if(busy)return;if(!$('chat-history').value){reset();currentChat=null;$('resume-chat').hidden=true;return;}const c=(await listChats(owner)).find(c=>c.id===$('chat-history').value);if(c)displayChat(c);};
$('new-chat').onclick=()=>{if(busy)return;reset();currentChat=null;$('chat-history').value='';$('resume-chat').hidden=true;$('q').focus();};
$('delete-chat').onclick=async()=>{if(busy||!currentChat)return;await deleteChat(owner,currentChat.id);currentChat=null;reset();$('resume-chat').hidden=true;await refreshHistory();};
$('resume-chat').onclick=()=>{if(!busy&&currentChat?.pending)runPending();};
function lockChat(value){busy=value;for(const id of ['send','add','mc','mv','mp','concise','new-chat','chat-history','delete-chat','vault'])$(id).disabled=value;$('resume-chat').hidden=value||!currentChat?.pending;$('pause-chat').hidden=!value;}
$('pause-chat').onclick=()=>chatController?.abort();
async function runPending(){
 if(!currentChat?.pending)return;chatController=new AbortController();lockChat(true);err('');
 const pending=currentChat.pending,it=msg('model',pending.continuation?'Continuing research…':'Thinking…');first=true;
 try{
  let result;
  for(;;){result=await chat({...pending.body,resumable:true,...(pending.continuation?{continuation:pending.continuation}:{})},ev=>onProgress(it,ev));
    if(!result.continuation)break;pending.continuation=result.continuation;await persistChat();it.querySelector('.md').textContent='Researching · '+result.research.searches+' searches';
  }
  const r=result.research,text=result.answer+(result.truncated?'\n\n[Answer reached its output limit.]':'')+(r?'\n\nResearch: '+r.searches+' searches · '+(r.planningCalls+1)+' model calls'+(r.warnings.length?'\n\n'+r.warnings.join(' '):''):'');
  md(it.querySelector('.md'),text);refs(it,result.sources||[]);cool();
  currentChat.messages.push({role:'model',text,sources:result.sources||[]});currentChat.pending=null;history=conversationMemory(currentChat.messages);await persistChat();
 }catch(x){const message=x.name==='AbortError'?'Paused by you.':x.message;it.querySelector('.md').textContent='Research paused: '+message;err(message+' Your progress is saved. Use Resume research to continue.');cool();}
 finally{chatController=null;lockChat(false);$('q').focus();}
}
$('f').onsubmit=async e=>{e.preventDefault();if(busy)return;if(!signedIn){$('login').showModal();return;}
 const text=$('q').value.trim()||(files.length?'Read the text in this attachment and help me with it.':'');if(!text)return;
 if(currentChat?.pending){err('Resume the pending question or start a new conversation.');return;}
 currentChat??=blankChat();history=conversationMemory(currentChat.messages);
 const sent=files;files=[];renderAtt();$('q').value='';nodes.clear();dirs.clear();order=0;trail.replaceChildren();$('cur').textContent='';
 const display=text+(sent.length?'\n'+sent.map(f=>'[attached: '+f.name+']').join(' '):'');msg('user',display);
 if(!currentChat.messages.length)currentChat.title=text.slice(0,65);currentChat.messages.push({role:'user',text:display});
 currentChat.mode=$('mode').value;currentChat.vault=$('vault').value;currentChat.model=$('model').value;
 currentChat.pending={body:{message:text,model:$('model').value,mode:$('mode').value,vault:$('vault').value||'all',history,concise:$('concise').checked,files:sent.map(({mime,data})=>({mime,data}))}};
 await persistChat();await runPending();};
// ---- attachments (images are shrunk to JPEG <=1600px; PDFs sent as-is; ~2.8 MB total)
let files=[];
const b64=blob=>new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(r.result.split(',')[1]);r.onerror=no;r.readAsDataURL(blob)});
async function shrink(f){const bmp=await createImageBitmap(f),k=Math.min(1,1600/Math.max(bmp.width,bmp.height)),c=document.createElement('canvas');c.width=Math.round(bmp.width*k);c.height=Math.round(bmp.height*k);const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.drawImage(bmp,0,0,c.width,c.height);return new Promise(ok=>c.toBlob(ok,'image/jpeg',.85))}
function renderAtt(){const a=$('att');a.replaceChildren();files.forEach((f,i)=>{const d=el('span');d.className='at';if(f.mime!=='application/pdf'){const im=el('img');im.src='data:'+f.mime+';base64,'+f.data;im.alt='';d.append(im)}d.append(el('span',f.name));const x=el('button','×');x.type='button';x.setAttribute('aria-label','Remove');x.onclick=()=>{files.splice(i,1);renderAtt()};d.append(x);a.append(d)})}
async function addFiles(list){for(const f of list){if(files.length>=4){err('Up to 4 attachments.');break}
 try{let mime=f.type,blob=f;if(mime.startsWith('image/')){if(!['image/png','image/jpeg','image/webp'].includes(mime)||f.size>2_800_000){blob=await shrink(f);mime='image/jpeg'}}else if(mime!=='application/pdf'){err('Only images and PDFs are supported.');continue}
  const data=await b64(blob);if(files.reduce((n,x)=>n+x.data.length,0)+data.length>3.9e6){err('Attachments are too large (about 2.8 MB total).');continue}
  files.push({mime,data,name:f.name||'screenshot'});err('')}catch{err('Could not read '+(f.name||'that file')+'.')}}
 renderAtt()}
$('add').onclick=()=>$('file').click();
$('file').onchange=async e=>{await addFiles([...e.target.files]);e.target.value=''};
document.addEventListener('paste',e=>{if($('chat').hidden||$('login').open)return;const fs=[...(e.clipboardData?.files||[])].filter(f=>f.type.startsWith('image/')||f.type==='application/pdf');if(fs.length){e.preventDefault();addFiles(fs)}});
$('f').addEventListener('dragover',e=>e.preventDefault());
$('f').addEventListener('drop',e=>{if(e.dataTransfer.files.length){e.preventDefault();addFiles([...e.dataTransfer.files])}});
// in-page replacement for prompt(): resolves to the text, or null if cancelled
function ask(label,val=''){return new Promise(ok=>{const d=$('ask');let v=null;$('al').textContent=label;$('av').value=val;d.onclose=()=>ok(v);$('af').onsubmit=e=>{e.preventDefault();v=$('av').value.trim()||null;d.close()};$('ac').onclick=()=>d.close();d.showModal();$('av').select()})}
// ---- app views; note drafts are kept independently of chat navigation.
function tab(n){$('chat').hidden=n;$('notes').hidden=!n;$('app').classList.toggle('nm',n);$('tc').classList.toggle('on',!n);$('tn').classList.toggle('on',n);location.hash=n?'notes':'chat';if(n&&signedIn)workspace.refresh().catch(e=>err(e.message));}
$('tc').onclick=()=>tab(false);$('tn').onclick=()=>tab(true);
try{$('concise').checked=localStorage.getItem('aria.concise')==='true';}catch{}
$('concise').onchange=()=>{try{localStorage.setItem('aria.concise',String($('concise').checked));}catch{}};
const h=new Date().getHours();$('gr').textContent=h>=5&&h<12?'Good morning.':h>=12&&h<18?'Good afternoon.':'Good evening.';
try{cfg=await api('status');$('model').value=cfg.models[0].id;buildModels();upd();
 if(!cfg.configured||!cfg.geminiReady){$('setup').hidden=false;$('setup').textContent='Preview mode: finish Supabase and Gemini setup to enable answers.'}
 if(cfg.configured)try{await acct((await api('session')).email)}catch{}}catch{err('Could not reach the app server.')}
