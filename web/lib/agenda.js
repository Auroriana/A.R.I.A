import {settingsOf} from './core-settings.js';
import {isUuid} from './notes.js';
import {captureIntent} from '../public/capture.js';
export async function agendaRoutes({req,route,token,sb,send,fail,readBody,generate,model}){
 if(!['/api/capture','/api/agenda','/api/reminder-complete'].includes(route))return false;
 const rpc=(name,body)=>sb('/rest/v1/rpc/'+name,token,body);
 if(route==='/api/agenda'&&req.method==='GET'){
  await rpc('aria_reminder_conversations',{});
  send(200,{reminders:await rpc('aria_reminder_list',{})});return true;
 }
 if(req.method!=='POST')throw fail('Method not allowed.',405);
 const b=await readBody(req,80000);
 if(!isUuid(b.key))throw fail('A valid request identifier is required.');
 if(route==='/api/reminder-complete'){
  send(200,await rpc('aria_reminder_complete',{p_id:b.key}));return true;
 }
 if(typeof b.message!=='string'||b.message.length>4000)throw fail('Enter a message of up to 4,000 characters.');
 const intent=captureIntent(b.message);if(!intent)throw fail('Use “Note this for me” or “Remind me about”.');
 if(intent.kind==='note'){
  const r=await rpc('aria_quick_enqueue',{p_key:b.key,p_text:intent.text,p_mode:'detailed'});
  if(!r.ok)throw fail('The note could not be queued. Try again after checking Quick Note.',409);
  send(200,{answer:'Saved your note to Quick Note. The original is stored; filing will run in the background.',kind:'note'});return true;
 }
 const due=Date.parse(b.due);
 if(!Number.isFinite(due))throw fail('Choose a future time within the next year.');
 try{new Intl.DateTimeFormat('en',{timeZone:b.timezone}).format();}catch{throw fail('Choose a valid time zone.');}
 if(typeof b.timezone!=='string'||b.timezone.length>100)throw fail('A time zone is required.');
 const existing=(await rpc('aria_reminder_list',{})).find(r=>r.id===b.key);
 if(existing){if(existing.text!==intent.text||Date.parse(existing.due_at)!==due||existing.timezone!==b.timezone)throw fail('This request already belongs to another reminder.',409);send(200,{kind:'reminder',answer:'Your reminder is saved: '+existing.text+' — '+new Date(existing.due_at).toLocaleString('en',{timeZone:existing.timezone})+' ('+existing.timezone+').'});return true;}
 if(due<=Date.now()||due>Date.now()+366*86400000)throw fail('Choose a future time within the next year.');
 let notification=null;
 // Generate once when scheduled; delivery never depends on model availability.
 if(process.env.GEMINI_API_KEY&&process.env.GEMINI_FREE_TIER_CONFIRMED==='true'){
  const request={systemInstruction:{parts:[{text:settingsOf(b.settings).prompts.personality+'\nWrite one short push notification in your own voice for the supplied reminder. Say what you want to say to the owner, grounded in the reminder. No invented facts, promises of completed work, or claims of sensing the user. The exact reminder text is appended separately. Maximum 180 characters. Return plain text.'}]},contents:[{role:'user',parts:[{text:JSON.stringify({reminder:intent.text,due:new Date(due).toISOString(),timezone:b.timezone})}]}],generationConfig:{maxOutputTokens:256}};
  try{if(await rpc('aria_reserve',{p_model:model,p_tokens:Buffer.byteLength(JSON.stringify(request))+256})){const result=await generate(model,request);if(!result.truncated&&typeof result.answer==='string')notification=result.answer.trim().slice(0,180)||null;}}catch{/* Scheduling still works if the model is unavailable. */}
 }
 const r=await rpc('aria_reminder_save',{p_id:b.key,p_text:intent.text,p_due:new Date(due).toISOString(),p_timezone:b.timezone,p_notification:notification});
 if(!r.ok)throw fail('This request identifier already belongs to another reminder.',409);
 send(200,{kind:'reminder',answer:'I’ll remind you: '+intent.text+' — '+new Intl.DateTimeFormat('en',{dateStyle:'full',timeStyle:'short',timeZone:b.timezone}).format(new Date(due))+'. You’ll see it here when Capri is open, or when you return.'});return true;
}
