import {chunkMarkdown,isUuid} from './notes.js';
export function transcript(chat){
 if(!isUuid(chat?.id)||typeof chat.title!=='string'||!Array.isArray(chat.messages)||chat.messages.some(m=>!['user','model'].includes(m.role)||typeof m.text!=='string'))throw Object.assign(new Error('Invalid conversation archive.'),{status:400});
 return '# '+chat.title+'\n\nConversation: '+chat.id+'\n\n'+chat.messages.map(m=>'## '+(m.role==='user'?'You':'Aria')+'\n\n'+m.text+(m.ack?'\n\n### Acknowledgment\n\n'+m.ack:'')+(m.personality?'\n\n### Personality version\n\n'+m.personality:'')+(m.sources?.length?'\n\n### References\n\n'+m.sources.map(s=>'['+s.id+'] '+s.vault+' / '+s.path+'\n\n'+s.excerpt).join('\n\n'):'')).join('\n\n');
}
export async function archiveChat(chat,{sb,token}){
 const content=transcript(chat);if(!chat.messages.length)return {ok:true};
 let vaults=await sb('/rest/v1/aria_vaults?select=id,name',token),vault=vaults.find(v=>v.name.toLowerCase()==='history');
 if(!vault){const r=await sb('/rest/v1/rpc/aria_create_vault',token,{p_name:'History'});if(r.ok)vault=r;else if(r.reason==='exists')vault=(await sb('/rest/v1/aria_vaults?select=id,name',token)).find(v=>v.name.toLowerCase()==='history');if(!vault)throw Object.assign(new Error('Could not create History vault. Check the vault limit.'),{status:409});}
 const list=async()=>{const all=[];for(let offset=0;;offset+=500){const rows=await sb(`/rest/v1/aria_notes?select=path,version,updated_at,deleted&vault_id=eq.${vault.id}&path=like.Conversations/*&order=path.asc&limit=500&offset=${offset}`,token);all.push(...rows);if(rows.length<500)return all;}};
 const existing=await list(),prefix='Conversations/'+chat.id+'/',keep=new Set();
 for(let start=0,index=1;start<content.length;index++){
  let end=Math.min(start+150000,content.length);if(end<content.length&&/[\uD800-\uDBFF]/.test(content[end-1]))end--;
  const path=prefix+String(index).padStart(4,'0')+'.md',text='---\nai_enabled: true\n---\n'+content.slice(start,end);start=end;keep.add(path);
  const old=existing.find(n=>n.path===path),r=await sb('/rest/v1/rpc/aria_save_note',token,{p_vault:vault.id,p_path:path,p_content:text,p_base_version:old?.version||0,p_origin:'web',p_chunks:chunkMarkdown(text)});
  if(!r.ok)throw Object.assign(new Error('History archive changed elsewhere. Try syncing again.'),{status:409});
 }
 const rows=await list(),groups=new Map();
 for(const n of rows){const match=n.path.match(/^Conversations\/([0-9a-f-]{36})\/\d{4}\.md$/i);if(!match||n.deleted)continue;const id=match[1];groups.set(id,Math.max(groups.get(id)||0,Date.parse(n.updated_at)||0));}
 const expired=new Set([...groups].sort((a,b)=>b[1]-a[1]).slice(50).map(([id])=>id));
 for(const n of rows)if(!n.deleted&&((n.path.startsWith(prefix)&&!keep.has(n.path))||(/^Conversations\/[0-9a-f-]{36}\/\d{4}\.md$/i.test(n.path)&&expired.has(n.path.split('/')[1])))){const r=await sb('/rest/v1/rpc/aria_delete_note',token,{p_vault:vault.id,p_path:n.path,p_base_version:n.version});if(!r.ok)throw Object.assign(new Error('History saved, but retention cleanup needs a retry.'),{status:409});}
 return {ok:true,vault:vault.id};
}
