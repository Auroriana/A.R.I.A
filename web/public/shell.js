import {queueJump,clearScan,showScan,stopFlight} from '/scan-path.js';
import {readChatStream} from '/chat-stream.js';
import {setExpression} from '/expression.js';
import {personalityHandoff} from '/personality-handoff.js';
import {mountCoreSettings} from '/core-settings.js';
import {addUsage} from '/token-usage.js';
import {estimateQuestion,usageTitle,usageDetails} from '/token-usage.js';
import {renderMarkdown,highlightClaim} from '/note-renderer.js';
import {mountWorkspace} from '/workspace.js';
import {mountQuick} from '/quick.js';
import {syncChats,portableChat} from '/chat-sync.js';
import {conversationMemory,listChats,saveChat,deleteChat,chatRows,commitSync} from '/chat-store.js';

const $=id=>document.getElementById(id),el=(t,x)=>{const n=document.createElement(t);if(x!==undefined)n.textContent=x;return n};
let history=[],signedIn=false,busy=false,cfg,first=true,owner="",currentChat=null,chatController=null;
const core=mountCoreSettings({api,owner:()=>owner,busy:()=>busy,onWelcome:()=>loadWelcome(owner,true),onArchive:async()=>{await syncHistory(true);archiveError=null;archived.clear();for(const c of [...await listChats(owner)].reverse())archive(c);await archiveQueue;if(archiveError)throw archiveError;await loadVaults();}});
let archiveQueue=Promise.resolve(),archiveError=null;const archived=new Map();
function archive(c){const account=owner,snapshot=portableChat(structuredClone(c)),fingerprint=JSON.stringify(snapshot.messages);if(!account||!snapshot.messages.length||archived.get(account+':'+c.id)===fingerprint)return;archiveQueue=archiveQueue.then(async()=>{if(owner!==account)return;const result=await api('history-archive',snapshot);if(result.vault&&![...$('vault').options].some(o=>o.value===result.vault)){const selected=$('vault').value;await loadVaults();$('vault').value=selected;}archived.set(account+':'+snapshot.id,fingerprint)}).catch(e=>{archiveError=e;err('History vault sync failed: '+e.message+' The browser copy is still available.');});}
function showPersonality(it,m,animate=true){
 if(m.personalityPending&&!m.personality){
   setStatus(it,'This earlier reply was interrupted.');
   if(m.webContext){
     const retry=el('button','Finish Capri’s reply');it.append(retry);
     retry.onclick=async()=>{if(busy)return;lockChat(true);try{
       const r=await personalityCall({...m.webContext,sprite:true});m.personalityPending=false;
       Object.assign(m,{text:r.answer,personality:r.answer,edited:Date.now(),expression:r.expression,personalityResearch:r.personalityResearch,usage:addUsage(m.usage,r.usage),sources:[...(m.sources||[]),...(r.sources||[])]});
       retry.remove();showPersonality(it,m);showUsage(it,m.usage);await persistChat();
     }catch(e){err(e.message)}finally{lockChat(false)}};
   }
   return;
 }
 setExpression(m.expression);
 md(it.querySelector('.md'),m.personality||m.text);
 it.querySelector('.personality-research')?.remove();
 if(m.personalityResearch){
   const r=m.personalityResearch,info=el('details'),arrow=el('summary','▸');arrow.setAttribute('aria-label','Personality retrieval details');info.append(arrow,el('pre','Personality database · '+r.passages.length+' notes\n'+r.passages.map(p=>p.path).join('\n')));showScan(r.passages,animate);
   info.className='personality-research';info.title=r.passages.map(p=>p.path).join('\n');it.append(info);
 }
 if(m.citationWarning){const w=el('small','An unrecognized source marker was removed.');w.className='cite-warn';it.append(w);}
}
function webPanel(it,m){
 it.querySelector('.web-panel')?.remove();if(!m.web&&!m.webRequest)return;const panel=el('div');panel.className='web-panel';
 if(m.web){const d=el('details');d.append(el('summary','Web research'));const content=el('div');md(content,m.web.answer);d.append(content);for(const source of m.web.sources){const a=el('a',source.title);a.href=source.url;a.target='_blank';a.rel='noopener noreferrer';d.append(a,el('br'));}if(m.web.entryPoint){const frame=el('iframe');frame.title='Google Search suggestions';frame.setAttribute('sandbox','allow-popups allow-popups-to-escape-sandbox');frame.srcdoc=m.web.entryPoint;frame.style.cssText='width:100%;height:120px;border:0';d.append(frame)}panel.append(d)}
 if(m.webRequest&&m.webContext){panel.append(el('p',m.webRequest.question),el('small','Public search: '+m.webRequest.query));const yes=el('button','Search the web'),no=el('button','Not now');panel.append(yes,no);no.onclick=async()=>{m.webRequest=null;webPanel(it,m);await persistChat()};yes.onclick=async()=>{if(busy)return;lockChat(true);chatController=new AbortController();yes.disabled=true;try{const styled=await personalityCall({...m.webContext,approvedWebQuery:m.webRequest.query},chatController.signal);m.edited=Date.now();m.text=styled.answer;m.expression=styled.expression;delete m.personality;m.personalityResearch=styled.personalityResearch;m.citationWarning=styled.citationWarning;m.web=styled.web;m.webRequest=null;m.usage=addUsage(m.usage,styled.usage);m.sources=[...(m.sources||[]).filter(s=>!s.id.startsWith('P')),...(styled.sources||[])];it.querySelectorAll('.refs,.personality-toggle,.cite-warn').forEach(n=>n.remove());refs(it,m.sources);showPersonality(it,m);webPanel(it,m);showUsage(it,m.usage);history=conversationMemory(currentChat.messages);await persistChat()}catch(e){err(e.message);yes.disabled=false}finally{chatController=null;lockChat(false)}};}it.append(panel);
}
async function personalityCall(body,signal){const r=await fetch('/api/personality',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/x-ndjson'},body:JSON.stringify(body),signal});return readChatStream(r,e=>{if(e.stage==='personality-scan'){setExpression('focused_analysis');showScan(e.passages);}if(e.stage==='quota-wait'){const it=$('msgs').querySelector('[data-pending]');if(it)setStatus(it,e.message);}});}
const workspace=mountWorkspace($("notes"),{api,ask,confirm:confirmAction,model:()=>$("model").value});
const quick=mountQuick($('quick'),{api,confirm:confirmAction,voice:()=>{const s=core.get();return s?.enabled?s.prompts.personality:null;},move:(path,vault,version)=>workspace.move(path,vault,version),open:async(path,vault)=>{tab(true);await workspace.open(path,vault);}});
async function api(p,b){const r=await fetch('/api/'+p,{method:b?'POST':'GET',headers:b?{'Content-Type':'application/json'}:{},body:b?JSON.stringify(b):undefined});const d=await r.json().catch(()=>({}));if(r.status===401){signedIn=false;$('login').showModal()}if(!r.ok)throw Object.assign(new Error(d.error||'Request failed.'),{status:r.status});return d}
async function chat(body,on){
 const r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/x-ndjson'},body:JSON.stringify(body),signal:chatController?.signal});
 if(r.status===401){signedIn=false;$('login').showModal()}
 if(!r.ok||!r.headers.get('content-type')?.includes('ndjson')){const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Request failed.');return d}
 const rd=r.body.getReader(),dec=new TextDecoder();let buf='',res;
 const eat=l=>{if(!l.trim())return;const e=JSON.parse(l);if(e.type==='error')throw new Error(e.error);if(e.type==='progress')on(e);if(e.type==='result')res=e};
 for(;;){const{done,value}=await rd.read();if(done)break;buf+=dec.decode(value,{stream:true});let i;while((i=buf.indexOf('\n'))>=0){eat(buf.slice(0,i));buf=buf.slice(i+1)}}
 eat(buf);if(!res)throw new Error('Connection ended before Capri finished.');return res}
function setStatus(it,text){const n=it.querySelector('.md');n.textContent=text;n.classList.add('status')}
function md(root,text){root.classList.remove('status');renderMarkdown(root,text,{citations:true,notes:workspace.notes,onLink:(link)=>{if(link.resolved){tab(true);workspace.open(link.resolved)}}});}
// ---- messages, references (collapsed), citation highlight
function msg(role,text){const it=el('article');it.className='m '+role;const w=el('div','YOU');if(role!=='user')w.textContent='Capri';w.className='who';const b=el('div');b.className='md';if(role==='user')b.textContent=text;else b.textContent=text;it.append(w,b);$('msgs').append(it);$('welcome').hidden=true;$('scroll').scrollTop=1e9;return it}
function refs(it,src){if(!src.length)return;const d=el('details');d.className='refs';d.append(el('summary','References ('+src.length+')'));
 for(const x of src){const e=el('details');e.className='src';e.dataset.s=x.id;e.dataset.path=x.path;e.dataset.vault=x.vault||'';const p=el('div');p.className='ex';p.dataset.t=x.excerpt;
 renderMarkdown(p,x.excerpt,{path:x.path,notes:workspace.notes,onLink:async link=>{tab(true);const v=[...document.querySelector('#nv').options].find(o=>o.textContent===x.vault);await workspace.openReference(link,x.path,v?.value);}});
 const sm=el('small',(x.vault?x.vault+' / ':'')+x.path.replace(/\.md$/i,'')),open=el('button','Open note ↗');open.className='open-source';open.onclick=()=>openSource(x.path,x.vault);
 if(x.snapshotCapturedAt)sm.append(' · Earlier snapshot: '+new Date(x.snapshotCapturedAt).toLocaleString());
 e.append(el('summary','['+x.id+'] '+x.title),sm,p,open);d.append(e)}it.append(d)}
async function openSource(path,vaultName){tab(true);const opts=[...document.querySelector('#nv').options],v=opts.find(o=>o.textContent===vaultName);await workspace.open(path,v?.value);}
const hl=highlightClaim;
$('msgs').onclick=e=>{const b=e.target.closest('.c');if(!b)return;const it=b.closest('.m'),src=it.querySelector('.src[data-s="'+b.dataset.s+'"]');if(!src)return;
 src.closest('.refs').open=true;it.querySelectorAll('.src').forEach(x=>x.open=x===src);it.querySelectorAll('.c').forEach(x=>x.classList.toggle('on',x===b));
 const mk=hl(src.querySelector('.ex'),b.dataset.claim);src.querySelector('.warn')?.remove();
 const lg=s=>new Set((s.match(/\b(and|or)\b/gi)||[]).map(x=>x.toLowerCase())),c=lg(b.dataset.claim),g=lg([...src.querySelectorAll('mark')].map(m=>m.textContent).join(' '));
 if(c.size&&g.size&&![...c].some(x=>g.has(x))){const w=el('div','Check: the answer says “'+[...c].join('/')+'” but this passage says “'+[...g].join('/')+'”.');w.className='warn';src.querySelector('small').after(w)}
 lit(src.dataset.vault,src.dataset.path);(mk||src).scrollIntoView({block:'center',behavior:'smooth'})};
// ---- PATH sidebar: vault -> folder -> note, with a search log and the state of every note
const trail=$('trail'),nodes=new Map(),dirs=new Map(),boxes=new Map(),slog=el('div');let order=0;slog.id='slog';$('cur').after(slog);
const key=(v,p)=>(v||'')+'\u0000'+p;
function box(v){let b=boxes.get(v);if(!b){const w=el('div'),h=el('div',v||'Vault');h.className='vn';b=el('div');b.head=h;w.append(h,b);trail.append(w);boxes.set(v,b)}return b}
function dir(v,path){if(!path)return box(v);const k=key(v,path);if(dirs.has(k))return dirs.get(k);const i=path.lastIndexOf('/'),par=dir(v,i<0?'':path.slice(0,i)),f=el('div'),h=el('div',path.slice(i+1)),kids=el('div');h.className='fh';kids.className='fk';kids.head=h;f.append(h,kids);par.append(f);dirs.set(k,kids);return kids}
function file(n){const k=key(n.vault,n.path);let d=nodes.get(k);
 if(d){queueJump(d);d.hits++;d.classList.remove('hot');void d.offsetWidth;d.classList.add('hot');d.lastChild.textContent='matched ×'+d.hits;return}
 const i=n.path.lastIndexOf('/'),parent=dir(n.vault,i<0?'':n.path.slice(0,i));
 d=el('div');d.className='fi hot';d.hits=1;d.title=n.title;d.append(el('span',n.path.slice(i+1).replace(/\.md$/i,'')),el('b','matched'));parent.append(d);nodes.set(k,d);queueJump(d);
 for(let p=parent;p&&p!==trail;p=p.parentElement)p.head?.classList.add('used');d.scrollIntoView({block:'nearest',behavior:'smooth'})}
function scope(ev){$('cur').textContent=ev.reason||ev.intent;for(const v of ev.vaults){const b=box(v.name);b.head.classList.toggle('skip',v.state!=='search');b.head.dataset.s=v.state==='search'?'searching':v.state==='skip'?'skipped':'not searchable';for(const f of v.folders)dir(v.name,f).head.classList.add('dim')}}
// After the answer: each note ends as cited, read-but-not-cited, or not read (over the context budget).
function markUsed(src){
 const best=new Map();
 for(const s of src){const rank=s.cited?3:s.read?2:1,k=key(s.vault,s.path),cur=best.get(k);if(!cur||rank>cur.rank)best.set(k,{rank,id:s.id})}
 for(const [k,b] of best){const d=nodes.get(k);if(!d)continue;d.classList.remove('hot','rd','ct');
  if(b.rank===3){d.classList.add('ct');d.lastChild.textContent='cited ['+b.id+']'}
  else if(b.rank===2){d.classList.add('rd');d.lastChild.textContent='read, not cited'}
  else d.lastChild.textContent='not read (over budget)'}}
const cool=()=>trail.querySelectorAll('.hot').forEach(n=>n.classList.remove('hot'));
function lit(v,path){nodes.forEach(n=>n.classList.remove('lit','hot'));const n=nodes.get(key(v,path));if(n){n.classList.add('lit');n.scrollIntoView({block:'nearest',behavior:'smooth'})}}
function onProgress(it,ev){
 if(ev.stage==='quota-wait'){setStatus(it,ev.message);return;}if(ev.stage==='usage'){showUsage(it,ev.usage);return;}
 if(ev.stage==='search'){cool()}
 else if(ev.stage==='scope')scope(ev);
 else if(ev.stage==='searching'){$('cur').textContent='⌕ '+ev.vault;slog.append(el('div',(slog.children.length+1)+'. '+ev.vault+' · '+ev.sent))}
 else if(ev.stage==='results'){if(slog.lastChild)slog.lastChild.textContent+=' → '+ev.notes.length+(ev.notes.length===1?' passage':' passages');for(const n of ev.notes)file(n)}
 else if(ev.stage==='routing'||ev.stage==='planning'||ev.stage==='answering'||ev.stage==='verifying'){setStatus(it,ev.message);if(ev.stage==='answering'){cool();$('cur').textContent='composing answer'}}
 else if(ev.stage==='thought-summary'){let t=it.querySelector('.th');if(!t){t=el('details');t.className='th';t.append(el('summary','Thinking'),el('div'));it.querySelector('.who').after(t)}t.lastChild.append(ev.text)}}
function showUsage(it,usage){
 if(!usage)return;let n=it.querySelector('.token-count');if(!n){n=el('span');n.className='token-count';it.append(n)}
 n.textContent=String(usage.totalTokenCount);n.title=usageTitle(usage);n.setAttribute('aria-label',n.title);
 let details=it.querySelector('.usage-details');if(!details){details=el('details');details.className='usage-details';details.append(el('summary'),el('pre'));it.append(details)}
 details.firstChild.textContent=String(usage.totalTokenCount);details.firstChild.title=usageTitle(usage);details.firstChild.setAttribute('aria-label','Token report, '+usage.totalTokenCount+' tokens');details.lastChild.textContent=usageDetails(usage);
 $('token-count').textContent=n.textContent;$('token-count').title=n.title;$('token-count').setAttribute('aria-label',n.title);
}
function estimateDraft(){if(busy)return;const n=$('token-count');n.textContent=String(estimateQuestion($('q').value.trim()||(files.length?'Read the text in this attachment and help me with it.':''),history,files));n.title='Estimated tokens for question, conversation history and attachments. Attachments use a rough allowance of 4096 tokens each.';n.setAttribute('aria-label',n.title);}
$('q').addEventListener('input',estimateDraft);
// ---- ui
const err=m=>{$('err').textContent=m;$('err').hidden=!m};
function reset(){clearScan();setExpression('neutral_attention');showWelcome();history=[];$('msgs').replaceChildren();$('welcome').hidden=false;err('');nodes.clear();dirs.clear();boxes.clear();slog.replaceChildren();order=0;trail.replaceChildren();$('cur').textContent='';estimateDraft()}
const GEM='<svg viewBox="0 0 24 24"><path d="M12 2c.5 5.5 4.5 9.5 10 10-5.5.5-9.5 4.5-10 10-.5-5.5-4.5-9.5-10-10 5.5-.5 9.5-4.5 10-10z"/></svg>',DS='<svg viewBox="0 0 24 24"><path d="M2 14c0-4 4-8 10-8 4 0 7 2 8 5l2-2-.5 6c-1 3-5 5-10 5-5 0-9.5-2-9.5-6z"/><circle cx="9" cy="12" r=".8"/></svg>';
function buildModels(){const p=$('pm');p.replaceChildren();const g=el('div');g.className='pg';g.innerHTML=GEM+'GEMINI';p.append(g);
 for(const m of cfg.models){const b=el('button',m.name);b.type='button';b.className='po'+(m.id===$('model').value?' on':'');b.dataset.id=m.id;b.append(el('small',m.rpm+'/min · '+m.rpd+'/day'));p.append(b)}
 const d=el('div');d.className='pg off';d.innerHTML=DS+'DEEPSEEK · OFF';p.append(d)}
function upd(){const m=cfg?.models.find(m=>m.id===$('model').value);$('mp').title=m?.name||'';}
async function acct(email){currentChat=null;reset();tab(false);$('resume-chat').hidden=true;signedIn=true;owner=email;await core.load().catch(()=>{});$('out').hidden=false;if($('login').open)$('login').close();await loadVaults();await restoreChats();quick.init(owner);scheduleSync();loadWelcome(owner);}
async function loadVaults(){try{const{vaults}=await api('vaults');const v=$('vault');v.replaceChildren(new Option('All vaults','all'));for(const x of vaults)v.append(new Option(x.name,x.id));await workspace.init(vaults,owner);}catch(e){err(e.message)}}
function setMode(v){$('mode').value=v;$('mc').classList.toggle('on',v==='general');$('mv').classList.toggle('on',v==='vault');$('vault').hidden=v!=='vault';if(currentChat){currentChat.mode=v;persistChat();}}
$('mc').onclick=()=>!busy&&setMode('general');$('mv').onclick=()=>!busy&&setMode('vault');
$('mp').onclick=()=>{if(cfg)$('pm').hidden=!$('pm').hidden};
$('pm').onclick=e=>{const b=e.target.closest('.po');if(!b)return;$('model').value=b.dataset.id;buildModels();upd();$('pm').hidden=true};
document.addEventListener('click',e=>{if(!e.target.closest('.pick'))$('pm').hidden=true});
$('pt').onclick=()=>{if($('app').classList.toggle('pt'))$('app').classList.add('hc');};
$('skip').onclick=()=>$('login').close();
$('lf').onsubmit=async e=>{e.preventDefault();$('lb').disabled=true;$('le').textContent='';try{await acct((await api('login',{email:$('email').value,password:$('pw').value,remember:$('remember-device').checked})).email);$('pw').value=''}catch(x){$('le').textContent=x.message}finally{$('lb').disabled=false}};
$('out').onclick=async()=>{try{await api('logout',{});signedIn=false;welcomeLines=[];reset();workspace.clear();quick.clear();owner='';core.clear();currentChat=null;$('chat-history').replaceChildren();$('out').hidden=true;$('login').showModal()}catch(x){err(x.message)}};
$('q').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('f').requestSubmit()}};

function blankChat(){return {id:crypto.randomUUID(),title:'New conversation',updated:Date.now(),messages:[],mode:$('mode').value,vault:$('vault').value||'all',model:$('model').value,pending:null};}
async function refreshHistory(){const chats=await listChats(owner),box=$('chat-history');box.replaceChildren();
 for(const c of chats){const row=el('div');row.className='hist-row'+(c.id===currentChat?.id?' on':'');const b=el('button',c.title);b.title=c.title;b.onclick=()=>openChat(c.id);
  const x=el('button','×');x.className='hist-del';x.setAttribute('aria-label','Delete conversation');x.onclick=e=>{e.stopPropagation();removeChat(c.id)};row.append(b,x);box.append(row)}}
const closeHist=()=>{if(matchMedia('(max-width:860px)').matches)$('app').classList.add('hc')};
async function openChat(id){if(busy)return;const c=(await listChats(owner)).find(c=>c.id===id);if(c){displayChat(c);await refreshHistory();closeHist()}}
async function removeChat(id){if(busy||!await confirmAction('Delete this conversation on your devices? Its History vault archive remains available.','Delete'))return;await deleteChat(owner,id);scheduleSync();if(currentChat?.id===id){currentChat=null;reset();$('resume-chat').hidden=true}await refreshHistory()}
async function persistChat(){if(!owner||!currentChat)return;try{currentChat.updated=Date.now();await saveChat(owner,currentChat);scheduleSync();archive(currentChat);await refreshHistory();}catch{err('Conversation could not be saved in this browser. Keep this page open.');}}
function displayChat(c){reset();currentChat=c;$('mode').value=c.mode||'general';$('mc').classList.toggle('on',c.mode!=='vault');$('mv').classList.toggle('on',c.mode==='vault');$('vault').hidden=c.mode!=='vault';$('vault').value=c.vault||'all';if(cfg.models.some(m=>m.id===c.model))$('model').value=c.model;buildModels();upd();
 for(const m of c.messages){const it=msg(m.role,m.text);if(m.role==='model'){md(it.querySelector('.md'),m.text);refs(it,m.sources||[]);showUsage(it,m.usage);showPersonality(it,m,false);webPanel(it,m);}}
 history=conversationMemory(c.messages);$('resume-chat').hidden=!c.pending;$('resume-chat').textContent='Resume reply';estimateDraft();
}
let syncTimer,syncRunning=false;
function scheduleSync(){clearTimeout(syncTimer);syncTimer=setTimeout(syncHistory,400);}
async function syncHistory(manual=false){
 const account=owner;if(!account||!signedIn||busy||syncRunning||document.hidden)return;
 syncRunning=true;const active=()=>account===owner&&signedIn;
 try{
   await syncChats({rows:await chatRows(account),api,active,commit:async(prior,next)=>{
     if(!active())return;
     const applied=await commitSync(account,prior,next);
     if(applied&&active()&&!busy&&prior.id===currentChat?.id){
       if(!next){currentChat=null;reset();$('resume-chat').hidden=true;}
       else if(!currentChat.pending&&JSON.stringify(currentChat.messages)!==JSON.stringify(next.messages))displayChat(next);
     }
   }});
   if(active())$('sync-status').textContent='';
 }catch(e){if(active())$('sync-status').textContent='Chat sync pending · '+e.message;if(manual)throw e;}
 finally{syncRunning=false;if(active())await refreshHistory();}
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)scheduleSync()});
window.addEventListener('online',scheduleSync);
setInterval(()=>{if(!$('chat').hidden)scheduleSync()},30000);
async function restoreChats(){try{await refreshHistory();}catch{err('Browser history is unavailable. Conversations will last for this page only.');}}
$('new-chat').onclick=()=>{if(busy)return;reset();currentChat=null;$('resume-chat').hidden=true;refreshHistory();closeHist();$('q').focus()};
$('resume-chat').onclick=()=>{if(!busy&&currentChat?.pending)runPending();};
function lockChat(value){busy=value;for(const id of ['send','add','mc','mv','mp','concise','new-chat','vault','aria-settings'])$(id).disabled=value;$('resume-chat').hidden=value||!currentChat?.pending;$('pause-chat').hidden=!value;if(!value)scheduleSync();}
$('pause-chat').onclick=()=>chatController?.abort();
async function runPending(){
 if(!currentChat?.pending)return;chatController=new AbortController();lockChat(true);err('');
 const pending=currentChat.pending,it=$('msgs').querySelector('[data-pending]')||msg('model','');it.dataset.pending='true';clearScan();setStatus(it,pending.continuation?'Continuing research…':'Thinking…');first=true;
 const body=pending.body,signal=chatController.signal;
 showUsage(it,pending.usage||{totalTokenCount:estimateQuestion(body.message,body.history,body.files),estimated:true});
 try{
   if(!pending.decision){
     // Older in-flight checkpoints already have a reasoning route.
     pending.decision=pending.continuation?{route:body.mode==='vault'?'vault':'reasoning'}:
       await personalityCall({action:'turn',message:body.message,mode:body.mode,history:body.history,
         settings:body.settings,hasAttachments:!!body.files?.length},signal);
     await persistChat();
   }
   const first=pending.decision;
   let reply=first,extraSources=[],followupCache=null,webContext=null,usage=first.usage;
   if(first.route!=='reply'){
     if(!['reasoning','vault'].includes(first.route))throw Error('Invalid conversation route.');
     setExpression('focused_analysis');
     if(!pending.report){
       for(;;){
         const result=await chat({...body,mode:first.route==='vault'?'vault':'general',researchTool:true,resumable:true,
           ...(pending.continuation?{continuation:pending.continuation}:{})},ev=>{
           if(ev.stage==='usage'){pending.usage=addUsage(first.usage,ev.usage);showUsage(it,pending.usage);}else onProgress(it,ev);
         });
         if(!result.continuation){pending.report=result;break;}
         pending.continuation=result.continuation;await persistChat();
       }
       await persistChat();
     }
     const report=pending.report;
     setStatus(it,'Preparing Capri’s response…');
     webContext={...personalityHandoff(body,report),sprite:true};
     reply=await personalityCall(webContext,signal);
     extraSources=(report.sources||[]).filter(s=>s.cited!==false);markUsed(report.sources||[]);
     followupCache=report.followupCache??null;usage=addUsage(addUsage(first.usage,report.usage),reply.usage);
   }
   if(typeof reply.answer!=='string'||!reply.answer.trim())throw Error('Capri returned an empty reply.');
   const turn=currentChat.messages.find(m=>m.id===pending.turnId)||currentChat.messages.at(-1);
   const saved={id:crypto.randomUUID(),turn:turn.id,started:turn.started,edited:Date.now(),role:'model',
     text:reply.answer,expression:reply.expression,sources:[...extraSources,...(reply.sources||[])],personalityResearch:reply.personalityResearch,
     citationWarning:reply.citationWarning,usage,followupCache,web:reply.web,webRequest:reply.webRequest,
     ...(reply.webRequest?{webContext}:{})};
   delete it.dataset.pending;currentChat.messages.push(saved);currentChat.pending=null;history=conversationMemory(currentChat.messages);
   showPersonality(it,saved);refs(it,saved.sources);webPanel(it,saved);showUsage(it,usage);cool();await persistChat();
 }catch(x){const message=x.name==='AbortError'?'Paused by you.':x.message;setExpression('neutral_attention');setStatus(it,'Reply paused: '+message);err(message+' Your progress is saved. Use Resume reply to continue.');cool();}
 finally{chatController=null;lockChat(false);$('q').focus();}
}
$('f').onsubmit=async e=>{e.preventDefault();if(busy)return;if(!signedIn){$('login').showModal();return;}
 const text=$('q').value.trim()||(files.length?'Read the text in this attachment and help me with it.':'');if(!text)return;
 if(currentChat?.pending){err('Resume the pending question or start a new conversation.');return;}
 lockChat(true);
 try{
 currentChat??=blankChat();history=conversationMemory(currentChat.messages);
 const sent=files;files=[];renderAtt();$('q').value='';nodes.clear();dirs.clear();boxes.clear();slog.replaceChildren();order=0;trail.replaceChildren();$('cur').textContent='';
 const display=text+(sent.length?'\n'+sent.map(f=>'[attached: '+f.name+']').join(' '):'');msg('user',display);
 if(!currentChat.messages.length)currentChat.title=text.slice(0,65);currentChat.messages.push({id:crypto.randomUUID(),started:Date.now(),role:'user',text:display});
 currentChat.mode=$('mode').value;currentChat.vault=$('vault').value;currentChat.model=$('model').value;
 const overview=(await listChats(owner)).filter(c=>c.id!==currentChat.id).map(c=>({title:c.title,recent:c.messages.slice(-4).map(m=>({role:m.role,text:(m.personality||m.text).slice(0,1500)}))}));
 const retrying=/\b(again|retry)\b/i.test(text)&&/\b(mir|age|search|do it|try)\b/i.test(text);const priorQuestion=[...history].reverse().find(m=>m.role==='user'&&!/\b(again|retry)\b/i.test(m.text))?.text;
 currentChat.pending={turnId:currentChat.messages.at(-1).id,body:{message:retrying&&priorQuestion?priorQuestion:text,model:$('model').value,mode:$('mode').value,vault:$('vault').value||'all',history,followupCache:[...currentChat.messages].reverse().find(m=>m.role==='model')?.followupCache??null,concise:$('concise').checked,depth:$('concise').checked?'age':'mir',settings:core.get(),overview,files:sent.map(({mime,data})=>({mime,data}))}};
 await persistChat();await runPending();
 }catch(e){err(e.message);}finally{lockChat(false);}};
// ---- attachments (images are shrunk to JPEG <=1600px; PDFs sent as-is; ~2.8 MB total)
let files=[];
const b64=blob=>new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(r.result.split(',')[1]);r.onerror=no;r.readAsDataURL(blob)});
async function shrink(f){const bmp=await createImageBitmap(f),k=Math.min(1,1600/Math.max(bmp.width,bmp.height)),c=document.createElement('canvas');c.width=Math.round(bmp.width*k);c.height=Math.round(bmp.height*k);const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.drawImage(bmp,0,0,c.width,c.height);return new Promise(ok=>c.toBlob(ok,'image/jpeg',.85))}
function renderAtt(){const a=$('att');a.replaceChildren();files.forEach((f,i)=>{const d=el('span');d.className='at';if(f.mime!=='application/pdf'){const im=el('img');im.src='data:'+f.mime+';base64,'+f.data;im.alt='';d.append(im)}d.append(el('span',f.name));const x=el('button','×');x.type='button';x.setAttribute('aria-label','Remove');x.onclick=()=>{files.splice(i,1);renderAtt()};d.append(x);a.append(d)});estimateDraft()}
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
function confirmAction(label,okText='Confirm'){return new Promise(ok=>{const d=$('ask');let v=false;$('al').textContent=label;$('av').hidden=true;$('ao').textContent=okText;
 d.onclose=()=>{$('av').hidden=false;$('ao').textContent='OK';ok(v)};$('af').onsubmit=e=>{e.preventDefault();v=true;d.close()};$('ac').onclick=()=>d.close();d.showModal()})}
// ---- app views; note drafts are kept independently of chat navigation.
function tab(n){stopFlight();const q=n==='quick',notes=n===true,other=q||notes;const face=$('capri-face');(other?document.querySelector('header'):document.querySelector('.chat-history-bar')).append(face);if(other)setExpression(q?'neutral_attention':'focused_analysis');else setExpression(currentChat?.messages.findLast(m=>m.role==='model')?.expression);$('ht').hidden=other;$('chat').hidden=other;$('notes').hidden=!notes;$('quick').hidden=!q;$('app').classList.toggle('nm',other);$('tc').classList.toggle('on',!other);$('tn').classList.toggle('on',notes);$('tq').classList.toggle('on',q);window.history.replaceState(null,'',location.pathname+location.search+(other?(q?'#quick':'#notes'):''));if(notes&&signedIn)workspace.refresh().catch(e=>err(e.message));if(q&&signedIn)quick.refresh();}
$('tc').onclick=()=>tab(false);$('tn').onclick=()=>tab(true);$('tq').onclick=()=>tab('quick');
try{$('concise').checked=localStorage.getItem('aria.mirage')!=='mir';}catch{$('concise').checked=true;}
$('concise').onchange=()=>{try{localStorage.setItem('aria.mirage',$('concise').checked?'age':'mir');}catch{}};
const app=$('app');try{const s=localStorage.getItem('aria.history.collapsed');if(s===null?matchMedia('(max-width:860px)').matches:s==='true')app.classList.add('hc')}catch{}
$('ht').onclick=()=>{const c=app.classList.toggle('hc');try{localStorage.setItem('aria.history.collapsed',String(c))}catch{}};
estimateDraft();
const launchURL=new URL(location.href),openNotes=launchURL.searchParams.get('open')==='notes';launchURL.searchParams.delete('open');window.history.replaceState(null,'',launchURL.pathname+launchURL.search);
let welcomeLines=[];
function showWelcome(){
 const h=new Date().getHours();
 $('gr').textContent=welcomeLines.length?welcomeLines[Math.floor(Math.random()*welcomeLines.length)]:
   h>=5&&h<12?'Good morning.':h>=12&&h<18?'Good afternoon.':'Good evening.';
}
async function loadWelcome(account,refresh=false){
 const key='aria.welcome.'+account;
 const apply=pool=>{if(owner===account&&Array.isArray(pool?.lines)&&pool.lines.length){
   welcomeLines=pool.lines;showWelcome();try{localStorage.setItem(key,JSON.stringify(pool));}catch{}
 }};
 try{
   if(!refresh){try{apply(JSON.parse(localStorage.getItem(key)));}catch{}}
   let pool=await api('welcome');apply(pool);
   if(refresh||!pool.lines?.length||Date.parse(pool.generated_at)<Date.now()-7*86400000){
     if(owner!==account)return;
     pool=await api('welcome',{refresh,settings:core.get()});apply(pool);
   }
 }catch(e){if(refresh)throw e;}
}
showWelcome();
try{cfg=await api('status');$('model').value=cfg.models[0].id;buildModels();upd();
 if(!cfg.configured||!cfg.geminiReady){$('setup').hidden=false;$('setup').textContent='Preview mode: finish Supabase and Gemini setup to enable answers.'}
 if(cfg.configured)try{await acct((await api('session')).email);if(openNotes)tab(true)}catch{}}catch{err('Could not reach the app server.')}
