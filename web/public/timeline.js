import {identifyMessages,portableMessage} from './chat-sync.js';
let opening;
function db(){return opening??=new Promise((resolve,reject)=>{const r=indexedDB.open('capri-timeline',1);r.onupgradeneeded=()=>{r.result.createObjectStore('accounts');};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function read(owner){const d=await db();return new Promise((resolve,reject)=>{const r=d.transaction('accounts').objectStore('accounts').get(owner);r.onsuccess=()=>resolve(r.result||{outbox:{},recent:[],state:null,migrated:false});r.onerror=()=>reject(r.error);});}
async function update(owner,fn){const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction('accounts','readwrite'),s=tx.objectStore('accounts'),r=s.get(owner);r.onsuccess=()=>s.put(fn(r.result||{outbox:{},recent:[],state:null,migrated:false}),owner);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
export function mergeMessages(...lists){const map=new Map();for(const m of lists.flat()){const old=map.get(m.id);if(!old||m.edited>=old.edited)map.set(m.id,{...old,...m});}return [...map.values()].sort((a,b)=>a.started-b.started||a.turn.localeCompare(b.turn)||Number(a.role==='model')-Number(b.role==='model')||a.id.localeCompare(b.id));}
export function createTimeline({api,owner,legacy}){
 let persisted=new Map(),latest=0,before=null,more=false;
 return {
  get hasMore(){return more;},
  async load(){
   const account=owner(),local=await read(account);
   if(!local.migrated){
    const chats=(await legacy(account)).filter(c=>!c.deleted&&Array.isArray(c.messages));
    for(const chat of chats){identifyMessages(chat);chat.messages.forEach((m,i)=>{if(m.started<946684800000)m.started=(chat.updated||Date.now())+i;});}
    const interrupted=[...chats].sort((a,b)=>b.updated-a.updated).find(c=>c.pending||c.capture);
    await update(account,s=>({...s,state:s.state||(interrupted?{id:interrupted.id,pending:interrupted.pending,capture:interrupted.capture}:null),migrated:true,outbox:{...Object.fromEntries(chats.flatMap(c=>c.messages).map(m=>[m.id,m])),...s.outbox}}));
   }
   const page=await api('messages');if(owner()!==account)return null;
   const cache=await read(account);latest=Math.max(0,...page.messages.map(m=>m.seq||0));before=Math.min(Infinity,...page.messages.map(m=>m.seq||Infinity));more=page.hasMore;
   const interrupted=cache.recent.filter(m=>m.id===cache.state?.pending?.turnId||m.id===cache.state?.capture?.key);
   const messages=mergeMessages(page.messages,interrupted,Object.values(cache.outbox));persisted=new Map(messages.map(m=>[m.id,JSON.stringify(m)]));
   return {...cache.state,messages};
  },
  async save(chat){
   identifyMessages(chat);const changed=chat.messages.filter(m=>persisted.get(m.id)!==JSON.stringify(m));
   const {messages,...state}=structuredClone(chat);await update(owner(),s=>({...s,state,recent:messages.slice(-120),outbox:{...s.outbox,...Object.fromEntries(changed.map(m=>[m.id,m]))}}));
   for(const m of changed)persisted.set(m.id,JSON.stringify(m));
  },
  async sync(){
   const account=owner(),local=await read(account);
   const pending=Object.values(local.outbox);
   for(let i=0;i<pending.length;){
    if(owner()!==account)return [];
    const batch=[];let bytes=0;
    while(i<pending.length&&batch.length<40){const size=new TextEncoder().encode(JSON.stringify(portableMessage(pending[i]))).length;if(bytes+size>950000&&batch.length)break;if(size>950000)throw Error('A message exceeds the sync size limit. Its browser copy is saved.');bytes+=size;batch.push(pending[i++]);}
    await api('messages-save',{messages:batch.map(portableMessage)});
    await update(account,s=>{for(const m of batch)if(JSON.stringify(s.outbox[m.id])===JSON.stringify(m))delete s.outbox[m.id];return s;});
   }
   const found=[];let hasMore=true;
   while(hasMore&&owner()===account){const page=await api('messages?after='+latest);if(owner()!==account)return [];found.push(...page.messages);for(const m of page.messages)latest=Math.max(latest,m.seq||0);hasMore=page.hasMore;}
   if(owner()===account)for(const m of found)persisted.set(m.id,JSON.stringify(m));
   return owner()===account?found:[];
  },
  async older(){if(!more||!Number.isFinite(before))return [];const account=owner(),page=await api('messages?before='+before);if(owner()!==account)return [];more=page.hasMore;for(const m of page.messages){before=Math.min(before,m.seq);persisted.set(m.id,JSON.stringify(m));}return page.messages;},
  clear(){persisted.clear();latest=0;before=null;more=false;}
 };
}
