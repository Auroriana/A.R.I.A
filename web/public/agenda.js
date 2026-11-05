import {captureIntent,relativeTime,scheduledTime,localDateTime} from './capture.js';
export function reminderChat(r,model){
 const started=Date.parse(r.due_at),text=(r.notification||'Hey, this is your reminder.')+'\n\n'+r.text+'\n\n'+new Date(r.due_at).toISOString()+' ('+r.timezone+')';
 return {id:r.id,title:'Reminder · '+r.text.slice(0,50),updated:started,mode:'general',vault:'all',model,messages:[{id:r.id+'/opening',turn:r.id+'/opening',started,edited:0,role:'model',text}]};
}
async function dailyId(owner){
 const day=localDateTime(new Date()).slice(0,10),bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('capri-agenda:'+owner+':'+day))).slice(0,16);bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const h=[...bytes].map(n=>n.toString(16).padStart(2,'0')).join('');return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
}
export function mountAgenda({api,owner,busy,ready=()=>true,model,save,open,reply,onError,settings}){
 const node=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
 const popup=node('dialog');popup.className='agenda-dialog';popup.setAttribute('aria-label','A moment with Capri');
 const heading=node('h2','Hey. Here’s what’s on today.'),body=node('div'),form=node('form'),input=node('textarea');input.placeholder='Talk to Capri about this…';input.setAttribute('aria-label','Reply to Capri');input.required=true;input.maxLength=4000;
 const send=node('button','Continue this chat'),close=node('button','Keep for later'),push=node('button','Enable notifications'),status=node('p');const disable=node('button','Disable notifications on this device');disable.type='button';close.type=push.type='button';status.setAttribute('role','status');form.append(input,send);popup.append(heading,body,form,close,push,disable,status);document.body.append(popup);
 disable.onclick=async()=>{disable.disabled=true;try{const reg=await navigator.serviceWorker?.getRegistration('/');const sub=await reg?.pushManager.getSubscription();if(sub){await api('push-unsubscribe',{endpoint:sub.endpoint});await sub.unsubscribe();}status.textContent='Notifications disabled on this device.';push.hidden=false;disable.hidden=true;}catch(e){status.textContent=e.message;}finally{disable.disabled=false;}};
 close.onclick=()=>popup.close();let activeChat,checking=false,seen=new Set(),account='';
 form.onsubmit=async e=>{e.preventDefault();if(busy()||!input.value.trim())return;const text=input.value.trim();await open(activeChat);popup.close();input.value='';reply(text);};
 push.onclick=async()=>{push.disabled=true;try{
  if(!('serviceWorker' in navigator)||!('PushManager' in window))throw Error('Push notifications are not supported here. On iPhone or iPad, add Capri to your Home Screen and open it there.');
  const permission=await Notification.requestPermission();if(permission!=='granted')throw Error('Allow notifications in your browser settings to receive reminders when Capri is closed.');
  const config=await api('push-config');if(!config.publicKey)throw Error('Push delivery has not been configured on the server yet.');
  await navigator.serviceWorker.register('/sw.js');const reg=await navigator.serviceWorker.ready;
  const raw=atob(config.publicKey.replace(/-/g,'+').replace(/_/g,'/'));const key=Uint8Array.from(raw,c=>c.charCodeAt(0));
  const subscription=await reg.pushManager.getSubscription()||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
  await api('push-subscribe',{subscription:subscription.toJSON()});status.textContent='Notifications enabled on this device. Capri can reach you when the site is closed.';push.hidden=true;disable.hidden=false;
 }catch(e){status.textContent=e.message;}finally{push.disabled=false;}};
 async function check(initial=false,all=false){
  const who=owner();if(!who||checking||busy()||(!initial&&(document.hidden||!ready())))return;
  checking=true;
  try{
   const {reminders}=await api('agenda');if(owner()!==who)return;
   if(account!==who){account=who;seen=new Set();}
   const now=Date.now(),today=new Date().toDateString(),due=reminders.filter(r=>Date.parse(r.due_at)<=now),relevant=reminders.filter(r=>Date.parse(r.due_at)<=now||new Date(r.due_at).toDateString()===today);
   for(const r of due)if(!seen.has(r.id))await save(reminderChat(r,model()),who);
   const fresh=due.filter(r=>!seen.has(r.id));if(!initial&&!fresh.length)return;
   if(popup.open||busy())return;
   const rows=initial?(all?reminders:relevant):fresh;
   heading.textContent=all?'Your reminders.':initial?'Hey. Here’s what’s on today.':'Hey, it’s time.';
   const text=rows.length?'Here’s what we have coming up.\n\n'+rows.map(r=>(r.notification?r.notification+'\n':'')+'• '+r.text+' — '+new Date(r.due_at).toLocaleString()+(Date.parse(r.due_at)<now?' (due)':'')).join('\n\n'):'You’re here. What are we getting into today? You have no saved reminders or plans due today.';
   const todayId=initial?await dailyId(who):null;
   activeChat=initial?{id:todayId,title:'Today with Capri · '+new Date().toLocaleDateString(),updated:now,mode:'general',vault:'all',model:model(),messages:[{id:todayId+'/opening',turn:todayId+'/opening',started:Date.parse(localDateTime(new Date()).slice(0,10)+'T00:00:00Z'),edited:now,role:'model',text}]}:reminderChat(fresh[0],model());
   // Save before showing; dismissing the dialog never discards the conversation.
   activeChat=await save(activeChat,who)||activeChat;if(owner()!==who)return;
   body.replaceChildren(node('p',text));
   for(const r of rows){const done=node('button','Done · '+r.text.slice(0,45));done.type='button';done.onclick=async()=>{done.disabled=true;try{const result=await api('reminder-complete',{key:r.id});if(!result.ok)throw Error('Reminder was not found.');done.textContent='Completed';}catch(e){done.disabled=false;status.textContent=e.message;}};body.append(done);}
   for(const r of due)seen.add(r.id);
   if(!initial&&fresh.length>1){activeChat={...activeChat,id:crypto.randomUUID(),title:'Reminders from Capri',messages:[{id:crypto.randomUUID(),started:now,role:'model',text}]};await save(activeChat,who);}
   disable.hidden=!('Notification' in window)||Notification.permission!=='granted';push.hidden=false;status.textContent='This conversation is saved in History.';popup.showModal();
  }catch(e){if(initial)throw e;if(owner()===who)onError('Could not load reminders: '+e.message);}finally{checking=false;}
 }
 setInterval(()=>check(),30000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)check();});window.addEventListener('online',()=>check());
 return {check,clear(){popup.close();seen.clear();account='';},async capture(message,key){
  const intent=captureIntent(message);if(!intent)return null;
  let due;
  if(intent.kind==='reminder'&&scheduledTime(intent.text))due=scheduledTime(intent.text).toISOString();
  if(intent.kind==='reminder'&&!due)due=await new Promise(resolve=>{
   const d=node('dialog');d.className='agenda-dialog';const f=node('form'),label=node('label','When should I remind you?'),date=node('input'),ok=node('button','Set reminder'),cancel=node('button','Cancel');date.type='datetime-local';date.required=true;date.min=localDateTime(new Date(Date.now()+60000));date.value=localDateTime(relativeTime(intent.text)||new Date(Date.now()+3600000));label.append(date);cancel.type='button';let value=null;cancel.onclick=()=>d.close();f.append(node('p',intent.text),label,node('p',Intl.DateTimeFormat().resolvedOptions().timeZone),ok,cancel);d.append(f);document.body.append(d);f.onsubmit=e=>{e.preventDefault();const time=new Date(date.value);if(time<=new Date()){date.setCustomValidity('Choose a future time.');date.reportValidity();return;}value=time.toISOString();d.close();};date.oninput=()=>date.setCustomValidity('');d.onclose=()=>{d.remove();resolve(value);};d.showModal();
  });
  if(intent.kind==='reminder'&&!due)return {cancelled:true};
  return {key,message,due,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,settings:settings()};
 }};
}
