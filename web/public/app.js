import {renderMarkdown} from '/markdown.js';
import {readChatStream} from '/chat-stream.js';
import {mountVaults} from '/vaults.js';
const $=id=>document.getElementById(id);let history=[],signedIn=false,busy=false,config,vaults;
async function api(path,body){const response=await fetch(`/api/${path}`,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})});const data=await response.json();if(!response.ok){if(response.status===401){signedIn=false;$('login').showModal();}throw new Error(data.error??'Request failed.');}return data;}
async function chat(body,onProgress){
  const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/x-ndjson'},body:JSON.stringify(body)});
  if(response.status===401){signedIn=false;$('login').showModal();}
  return readChatStream(response,onProgress);
}
// One "Thinking" panel per answer: searches, retrieved notes and Gemini's thought summary flow into a single stream.
function thinkingPanel(item){
  let panel=item.querySelector('.thinking');
  if(!panel){
    panel=document.createElement('details');panel.className='thinking live';panel.open=true;panel.dataset.start=String(Date.now());
    const summary=document.createElement('summary');summary.textContent='Thinking';
    const stream=document.createElement('div');stream.className='stream';
    panel.append(summary,stream);item.append(panel);
  }
  return panel;
}
function showProgress(item,event){
  if(!['thought-summary','search','results'].includes(event.stage))return;
  const stream=thinkingPanel(item).querySelector('.stream');
  if(event.stage==='thought-summary'){
    let last=stream.lastElementChild;
    if(!last||!last.classList.contains('thought')){last=document.createElement('p');last.className='thought';stream.append(last);}
    last.append(document.createTextNode(event.text));
  }else{
    const step=document.createElement('div');step.className='step';
    if(event.stage==='search')step.textContent='⌕ '+(event.query.length>160?event.query.slice(0,160)+'…':event.query);
    else{
      step.textContent='↳ '+event.notes.length+(event.notes.length===1?' passage':' passages');
      if(event.notes.length){const list=document.createElement('ul');for(const note of event.notes){const li=document.createElement('li');li.textContent=note.title+' — '+(note.vault?note.vault+' / ':'')+note.path;list.append(li);}step.append(list);}
    }
    stream.append(step);
  }
  stream.scrollTop=stream.scrollHeight;$('scroll').scrollTop=$('scroll').scrollHeight;
}
function finishThinking(panel,research,answerItem){
  const seconds=Math.max(1,Math.round((Date.now()-Number(panel.dataset.start))/1000));
  panel.classList.remove('live');panel.open=false;
  panel.querySelector('summary').textContent='Thought for '+seconds+'s'+(research?' · '+research.searches+(research.searches===1?' search':' searches'):'');
  answerItem.querySelector('.who').after(panel);
}
try{$('concise').checked=localStorage.getItem('aria-concise')==='true';}catch{}
$('concise').onchange=()=>{try{localStorage.setItem('aria-concise',String($('concise').checked));}catch{}};
function showError(message){$('error').textContent=message;$('error').hidden=!message;}
function reset(){history=[];$('messages').replaceChildren();$('welcome').hidden=false;showError('');}
function researchSummary(research){return research?'\n\nResearch: '+research.searches+' searches · '+(research.planningCalls+1)+' model calls'+(research.warnings.length?'\n'+research.warnings.join('\n'):''):'';}
function updateQuota(){const m=config?.models.find(m=>m.id===$('model').value);$('quota').textContent=m?`${m.rpm}/min · ${m.rpd}/day model quota · notes use 2–3 calls`:'Setup needed';}
function message(role,text,sources=[]){const item=document.createElement('article');item.className=`message ${role}`;const who=document.createElement('div');who.className='who';who.textContent=role==='user'?'YOU':'Capri';const content=document.createElement('div');content.className=role==='model'?'markdown':'user-text';if(role==='model')renderMarkdown(content,text);else content.textContent=text;item.append(who,content);if(sources.length){const list=document.createElement('div');list.className='sources';for(const source of sources){const detail=document.createElement('details'),summary=document.createElement('summary'),path=document.createElement('small'),excerpt=document.createElement('p');summary.textContent=`[${source.id}] ${source.title}`;path.textContent=source.vault?source.vault+' · '+source.path:source.path;excerpt.textContent=source.excerpt;detail.append(summary,path,excerpt);list.append(detail);}item.append(list);}$('messages').append(item);$('welcome').hidden=true;$('scroll').scrollTop=$('scroll').scrollHeight;return item;}
function syncVaultUi(){const on=$('mode').value==='vault';$('vault-wrap').hidden=!on;$('new-vault').hidden=!on;}
async function loadVaults(){if(vaults)return;try{vaults=await mountVaults({select:$('vault'),api,includeAll:true,createButton:$('new-vault')});}catch{vaults=undefined;}syncVaultUi();}
function account(email){signedIn=true;loadVaults();$('account').textContent=email;$('session-label').textContent='Owner workspace';$('logout').hidden=false;if($('login').open)$('login').close();}
$('new-chat').onclick=()=>{if(!busy)reset();};$('model').onchange=updateQuota;$('mode').onchange=()=>{reset();syncVaultUi();$('question').placeholder=$('mode').value==='vault'?'Ask about your approved notes…':'What’s on your mind?';};
$('browse').onclick=()=>$('login').close();$('login').addEventListener('cancel',()=>{});
$('login-form').onsubmit=async e=>{e.preventDefault();$('login-button').disabled=true;$('login-error').textContent='';try{account((await api('login',{email:$('email').value,password:$('password').value})).email);$('password').value='';}catch(err){$('login-error').textContent=err.message;}finally{$('login-button').disabled=false;}};
$('logout').onclick=async()=>{try{await api('logout',{});signedIn=false;reset();$('account').textContent='Your private workspace';$('session-label').textContent='Sign in to begin';$('logout').hidden=true;$('login').showModal();}catch(e){showError(e.message);}};
document.querySelectorAll('[data-prompt]').forEach(button=>button.onclick=()=>{$('question').value=button.dataset.prompt;$('question').focus();});
$('question').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('chat-form').requestSubmit();}};
$('chat-form').onsubmit=async e=>{e.preventDefault();if(busy)return;if(!signedIn){$('login').showModal();return;}const text=$('question').value.trim();if(!text)return;showError('');busy=true;$('send').disabled=true;$('mode').disabled=true;$('model').disabled=true;$('concise').disabled=true;message('user',text);$('question').value='';const pending=message('model',$('mode').value==='vault'?'Researching your notes and checking for missing context…':'Thinking…');try{const data=await chat({message:text,model:$('model').value,mode:$('mode').value,vault:$('vault').value||'all',history:history.slice(-6),concise:$('concise').checked},event=>showProgress(pending,event));pending.querySelector('.markdown')?.remove();const answerItem=message('model',data.answer+(data.truncated?'\n\n[Answer reached its output limit.]':'')+researchSummary(data.research),data.sources);const thinking=pending.querySelector('.thinking');if(thinking)finishThinking(thinking,data.research,answerItem);pending.remove();history.push({role:'user',text},{role:'model',text:data.answer.slice(0,6000)});while(JSON.stringify(history.slice(-6)).length>16000)history.splice(0,2);history=history.slice(-6);}catch(err){const content=pending.querySelector('.markdown');if(content)content.textContent='Request stopped: '+err.message;const panel=pending.querySelector('.thinking');if(panel){panel.classList.remove('live');panel.querySelector('summary').textContent='Stopped before finishing';}showError(err.message);$('question').value=text;}finally{busy=false;$('send').disabled=false;$('mode').disabled=false;$('model').disabled=false;$('concise').disabled=false;$('question').focus();}};
try{config=await api('status');for(const m of config.models){const option=document.createElement('option');option.value=m.id;option.textContent=`${m.name} · ${m.purpose}`;$('model').append(option);}updateQuota();if(!config.configured||!config.geminiReady){$('setup').hidden=false;$('setup').textContent='Preview mode: finish Supabase and Gemini setup to enable answers. Your notes have not been imported.';}if(config.configured){try{account((await api('session')).email);}catch{}}}catch(err){showError('Could not reach the app server. Refresh or check your connection.');}
