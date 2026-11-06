import {chunkMarkdown} from './notes.js';
export function reminderOverview(reminders,timezone,now=new Date()){
 if(typeof timezone!=='string'||timezone.length>100)throw Object.assign(Error('Choose a valid time zone.'),{status:400});
 try{new Intl.DateTimeFormat('en',{timeZone:timezone}).format(now);}catch{throw Object.assign(Error('Choose a valid time zone.'),{status:400});}
 const day=d=>new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(d),today=day(now);
 const format=r=>'- '+(r.completed_at?'[x]':'[ ]')+' '+r.text.replace(/\r?\n/g,' ')+' — '+new Intl.DateTimeFormat('en',{timeZone:timezone,dateStyle:'medium',timeStyle:'short'}).format(new Date(r.due_at))+(r.completed_at?' · completed':'');
 const relevant=reminders.filter(r=>day(new Date(r.due_at))===today),active=reminders.filter(r=>!r.completed_at);
 const answer=relevant.length?'Today’s reminders ('+timezone+'):\n\n'+relevant.map(format).join('\n'):'You have no reminders scheduled for today ('+timezone+').';
 const content='---\nai_enabled: true\ntags: [reminders, overview]\n---\n# Reminders · '+today+'\n\nSnapshot: '+now.toISOString()+'\nTime zone: '+timezone+'\n\n## Today\n\n'+answer+'\n\n## All pending reminders\n\n'+(active.map(format).join('\n')||'No pending reminders.')+'\n\nHistorical snapshot; ask Capri for today’s reminders to check live server records.\n';
 return {answer,content,day:today};
}
export async function archiveReminderOverview({sb,token,timezone,now=new Date()}){
 reminderOverview([],timezone,now); // Validate before sending the timezone into SQL.
 const rows=await sb('/rest/v1/rpc/aria_reminder_overview_rows',token,{p_timezone:timezone}),data=reminderOverview(rows,timezone,now);
 let vault=(await sb('/rest/v1/aria_vaults?select=id,name',token)).find(v=>v.name.toLowerCase()==='reminders');
 if(!vault){const r=await sb('/rest/v1/rpc/aria_create_vault',token,{p_name:'Reminders'});vault=r.ok?r:(await sb('/rest/v1/aria_vaults?select=id,name',token)).find(v=>v.name.toLowerCase()==='reminders');if(!vault)throw Error('Could not create the Reminders vault.');}
 // One immutable snapshot per changed state per local day. Repeated reads do not rewrite a note.
 const {createHash}=await import('node:crypto');
 const fingerprint=createHash('sha256').update(timezone+JSON.stringify(rows.map(r=>[r.id,r.text,r.due_at,r.completed_at]))).digest('hex').slice(0,12);
 const path='Overviews/'+data.day+'/'+fingerprint+'.md';
 const [old]=await sb('/rest/v1/aria_notes?select=version,deleted&vault_id=eq.'+vault.id+'&path=eq.'+encodeURIComponent(path),token);
 if(!old||old.deleted){const r=await sb('/rest/v1/rpc/aria_save_note',token,{p_vault:vault.id,p_path:path,p_content:data.content,p_base_version:old?.version||0,p_origin:'web',p_chunks:chunkMarkdown(data.content)});if(!r.ok&&r.reason!=='conflict')throw Error('Could not save reminder overview.');}
 return {...data,note:{vault:vault.id,path,title:'Reminders · '+data.day}};
}
