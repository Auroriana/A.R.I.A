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
function showThought(item,event){
  let panel=item.querySelector('.thought-summaries');
  if(!panel){panel=document.createElement('details');panel.className='thought-summaries research-activity';panel.open=true;const title=document.createElement('summary');title.textContent='Gemini thought summaries';const note=document.createElement('p');note.textContent='Summaries provided by Gemini, not its full internal reasoning. Availability varies by response.';panel.append(title,note);item.append(panel);}
  let section=[...panel.querySelectorAll('[data-call]')].find(el=>el.dataset.call===String(event.callId));
  if(event.stage==='thought-start'){
    section=document.createElement('section');section.dataset.call=String(event.callId);const heading=document.createElement('strong');heading.textContent=event.phase==='planning'?'Research round '+event.round:'Answer preparation';const status=document.createElement('p');status.className='thought-status';status.textContent='Waiting for a summary from '+event.model+'…';const content=document.createElement('div');content.className='thought-text';section.append(heading,status,content);panel.append(section);
  }else if(section&&event.stage==='thought-summary'){
    section.querySelector('.thought-status').textContent='Receiving Gemini’s summary…';section.querySelector('.thought-text').append(document.createTextNode(event.text));
  }else if(section&&event.stage==='thought-end'){
    section.querySelector('.thought-status').textContent=event.hasSummary?'Summary complete.':'Gemini did not provide a thought summary for this step.';
  }
}
function showProgress(item,event){
  if(event.stage.startsWith('thought-')){showThought(item,event);return;}
  let activity=item.querySelector('.research-activity:not(.thought-summaries)');
  if(!activity){activity=document.createElement('details');activity.className='research-activity';activity.open=true;const summary=document.createElement('summary');summary.textContent='Research activity';activity.append(summary);item.append(activity);}
  const entry=document.createElement('div');entry.className='activity-entry';
  const time=document.createElement('time');time.textContent=new Date().toLocaleTimeString();entry.append(time);
  const text=document.createElement('span');text.textContent=event.stage==='search'?'Searching: '+event.query:event.stage==='results'?'Found '+event.notes.length+' passages for: '+event.query:event.message;entry.append(text);
  if(event.notes?.length){const list=document.createElement('ul');for(const note of event.notes){const li=document.createElement('li');li.textContent=note.title+' — '+(note.vault?note.vault+' / ':'')+note.path;list.append(li);}entry.append(list);}
  activity.append(entry);$('scroll').scrollTop=$('scroll').scrollHeight;
}
try{$('concise').checked=localStorage.getItem('aria-concise')==='true';}catch{}
$('concise').onchange=()=>{try{localStorage.setItem('aria-concise',String($('concise').checked));}catch{}};
function showError(message){$('error').textContent=message;$('error').hidden=!message;}
function reset(){history=[];$('messages').replaceChildren();$('welcome').hidden=false;showError('');}
function researchSummary(research){return research?'\n\nResearch: '+research.searches+' searches · '+(research.planningCalls+1)+' model calls'+(research.warnings.length?'\n'+research.warnings.join('\n'):''):'';}
function updateQuota(){const m=config?.models.find(m=>m.id===$('model').value);$('quota').textContent=m?`${m.rpm}/min · ${m.rpd}/day model quota · notes use 2–3 calls`:'Setup needed';}
function message(role,text,sources=[]){const item=document.createElement('article');item.className=`message ${role}`;const who=document.createElement('div');who.className='who';who.textContent=role==='user'?'YOU':'ARIA';const content=document.createElement('div');content.className=role==='model'?'markdown':'user-text';if(role==='model')renderMarkdown(content,text);else content.textContent=text;item.append(who,content);if(sources.length){const list=document.createElement('div');list.className='sources';for(const source of sources){const detail=document.createElement('details'),summary=document.createElement('summary'),path=document.createElement('small'),excerpt=document.createElement('p');summary.textContent=`[${source.id}] ${source.title}`;path.textContent=source.vault?source.vault+' · '+source.path:source.path;excerpt.textContent=source.excerpt;detail.append(summary,path,excerpt);list.append(detail);}item.append(list);}$('messages').append(item);$('welcome').hidden=true;$('scroll').scrollTop=$('scroll').scrollHeight;return item;}
function syncVaultUi(){const on=$('mode').value==='vault';$('vault-wrap').hidden=!on;$('new-vault').hidden=!on;}
async function loadVaults(){if(vaults)return;try{vaults=await mountVaults({select:$('vault'),api,includeAll:true,createButton:$('new-vault')});}catch{vaults=undefined;}syncVaultUi();}
function account(email){signedIn=true;loadVaults();$('account').textContent=email;$('session-label').textContent='Owner workspace';$('logout').hidden=false;if($('login').open)$('login').close();}
$('new-chat').onclick=()=>{if(!busy)reset();};$('model').onchange=updateQuota;$('mode').onchange=()=>{reset();syncVaultUi();$('question').placeholder=$('mode').value==='vault'?'Ask about your approved notes…':'What’s on your mind?';};
$('browse').onclick=()=>$('login').close();$('login').addEventListener('cancel',()=>{});
$('login-form').onsubmit=async e=>{e.preventDefault();$('login-button').disabled=true;$('login-error').textContent='';try{account((await api('login',{email:$('email').value,password:$('password').value})).email);$('password').value='';}catch(err){$('login-error').textContent=err.message;}finally{$('login-button').disabled=false;}};
$('logout').onclick=async()=>{try{await api('logout',{});signedIn=false;reset();$('account').textContent='Your private workspace';$('session-label').textContent='Sign in to begin';$('logout').hidden=true;$('login').showModal();}catch(e){showError(e.message);}};
document.querySelectorAll('[data-prompt]').forEach(button=>button.onclick=()=>{$('question').value=button.dataset.prompt;$('question').focus();});
$('question').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('chat-form').requestSubmit();}};
$('chat-form').onsubmit=async e=>{e.preventDefault();if(busy)return;if(!signedIn){$('login').showModal();return;}const text=$('question').value.trim();if(!text)return;showError('');busy=true;$('send').disabled=true;$('mode').disabled=true;$('model').disabled=true;$('concise').disabled=true;message('user',text);$('question').value='';const pending=message('model',$('mode').value==='vault'?'Researching your notes and checking for missing context…':'Thinking…');try{const data=await chat({message:text,model:$('model').value,mode:$('mode').value,vault:$('vault').value||'all',history:history.slice(-6),concise:$('concise').checked},event=>showProgress(pending,event));pending.querySelector('.markdown')?.remove();const answerItem=message('model',data.answer+(data.truncated?'\n\n[Answer reached its output limit.]':'')+researchSummary(data.research),data.sources);for(const activity of pending.querySelectorAll('.research-activity')){activity.open=false;answerItem.append(activity);}pending.remove();history.push({role:'user',text},{role:'model',text:data.answer.slice(0,6000)});while(JSON.stringify(history.slice(-6)).length>16000)history.splice(0,2);history=history.slice(-6);}catch(err){const content=pending.querySelector('.markdown');if(content)content.textContent='Request stopped: '+err.message;for(const status of pending.querySelectorAll('.thought-status'))status.textContent='Request stopped; any summary above is incomplete.';showError(err.message);$('question').value=text;}finally{busy=false;$('send').disabled=false;$('mode').disabled=false;$('model').disabled=false;$('concise').disabled=false;$('question').focus();}};
try{config=await api('status');for(const m of config.models){const option=document.createElement('option');option.value=m.id;option.textContent=`${m.name} · ${m.purpose}`;$('model').append(option);}updateQuota();if(!config.configured||!config.geminiReady){$('setup').hidden=false;$('setup').textContent='Preview mode: finish Supabase and Gemini setup to enable answers. Your notes have not been imported.';}if(config.configured){try{account((await api('session')).email);}catch{}}}catch(err){showError('Could not reach the app server. Refresh or check your connection.');}
