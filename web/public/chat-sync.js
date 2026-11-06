const messageFields=['id','turn','started','edited','role','text','expression','sources','usage','citationWarning','personalityResearch','web','ack','blocks','note','event','reminder','captureJob'];
const pick=(value,keys)=>Object.fromEntries(keys.filter(k=>value[k]!==undefined).map(k=>[k,value[k]]));
export const portableMessage=m=>({...pick(m,messageFields),text:m.personality||m.reasoningText||m.text});

export function identifyMessages(chat){
  let turn,started;
  for(const [i,m] of chat.messages.entries()){
    // Legacy browser copies of the same transcript must derive the same IDs.
    m.id??=chat.id+'/'+i;
    if(m.role==='user'||!turn){turn=m.id;started=m.started??i;}
    m.turn??=turn;m.started??=started;m.edited??=0;
  }
}

export function portableChat(chat){
  identifyMessages(chat);
  const completed=new Set(chat.messages.filter(m=>m.role==='model'&&!m.personalityPending).map(m=>m.turn));
  return {...pick(chat,['id','title','updated','mode','vault','model']),
    messages:chat.messages.filter(m=>completed.has(m.turn)&&!m.personalityPending).map(portableMessage)};
}

// Keep the two sides of a turn together even when two offline devices append
// concurrently. Device-only fields stay with their original local message.
export function mergeChats(local,remote){
  identifyMessages(local);identifyMessages(remote);
  const byId=new Map(local.messages.map(m=>[m.id,m]));
  for(const m of remote.messages){
    const old=byId.get(m.id);
    if(!old||m.edited>old.edited||(!old.personality&&m.personality))byId.set(m.id,{...old,...m});
  }
  const messages=[...byId.values()].sort((a,b)=>a.started-b.started||a.turn.localeCompare(b.turn)||
    Number(a.role==='model')-Number(b.role==='model')||a.id.localeCompare(b.id));
  return {...local,...(remote.updated>local.updated?pick(remote,['updated','title','mode','vault','model']):{}),messages};
}

// Network I/O takes place outside IDB transactions. commit() compares the local
// revision read before the fetch so a late server reply cannot overwrite a new turn.
export async function syncChats({rows,api,commit,active=()=>true}){
  const {chats}=await api('chats');
  if(!Array.isArray(chats))throw Error('Conversation sync is unavailable.');
  const manifest=new Map(chats.map(c=>[c.id,c])),errors=[];
  for(const row of rows){
    if(!active())return;
    const remote=manifest.get(row.id);manifest.delete(row.id);
    try{
      if(row.deleted){
        await api('chat-save',{id:row.id,version:row.version||0,chat:null});
        await commit(row,null);continue;
      }
      if(row.version&&!remote){await commit(row,null);continue;}
      let local=row,version=row.version||0;
      if(remote&&remote.version!==version){
        const fetched=await api('chat-get?id='+row.id);
        if(!fetched.chat){await commit(row,null);continue;}
        local=mergeChats(row,fetched.chat);version=fetched.version;
      }
      if(row.dirty!==false){
        const portable=portableChat(local);
        if(!portable.messages.length)continue;
        let saved=await api('chat-save',{id:local.id,version,chat:portable});
        if(saved.conflict){
          local=mergeChats(local,saved.chat);
          saved=await api('chat-save',{id:local.id,version:saved.version,chat:portableChat(local)});
        }
        if(saved.conflict)throw Error('Changed on another device. Sync will retry.');
        if(saved.deleted){await commit(row,null);continue;}
        version=saved.version;
      }
      if(version!==row.version||row.dirty)await commit(row,{...local,version,dirty:false});
    }catch(e){errors.push(e.message);}
  }
  for(const {id} of manifest.values()){
    if(!active())return;
    const fetched=await api('chat-get?id='+id);
    if(fetched.chat)await commit({id},{...fetched.chat,version:fetched.version,dirty:false});
  }
  if(errors.length)throw Error(errors[0]);
}
