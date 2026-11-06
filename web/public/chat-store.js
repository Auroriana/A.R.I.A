import {identifyMessages,mergeChats} from './chat-sync.js';
export const MAX_CHATS=10;
export function recentChats(chats){return [...chats].sort((a,b)=>b.updated-a.updated).slice(0,MAX_CHATS);}
export function conversationMemory(messages){
  const out=[];let chars=0;
  for(const m of [...messages].reverse()){
    if(!['user','model'].includes(m.role))continue;
    const text=((m.replyTo?'[Replying to Capri: '+m.replyTo.text+']\n':'')+(m.role==='model'?(m.personality||m.reasoningText||m.text):m.text)).slice(0,40000),size=JSON.stringify({role:m.role,text}).length;
    if(chars+size>160000||out.length>=200)break;
    chars+=size;out.unshift({role:m.role,text});
  }
  return out;
}
let opening;
function database(){return opening??=new Promise((resolve,reject)=>{const r=indexedDB.open('aria-conversations',1);r.onupgradeneeded=()=>{const s=r.result.createObjectStore('chats',{keyPath:'key'});s.createIndex('owner','owner');};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
export async function chatRows(owner){
  const db=await database();
  return new Promise((resolve,reject)=>{
    const r=db.transaction('chats').objectStore('chats').index('owner').getAll(owner);
    r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
  });
}
export async function listChats(owner){return recentChats((await chatRows(owner)).filter(c=>!c.deleted));}
async function update(owner,id,edit){
  const db=await database(),key=owner+':'+id;
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('chats','readwrite'),store=tx.objectStore('chats'),read=store.get(key);
    let changed=false;
    read.onsuccess=()=>{
      const next=edit(read.result);
      if(next===undefined)return;
      changed=true;
      if(next===null)store.delete(key);
      else store.put({...next,key,owner,revision:crypto.randomUUID()});
    };
    tx.oncomplete=()=>resolve(changed);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });
}
export function saveChat(owner,chat){
  identifyMessages(chat);
  const snapshot=structuredClone(chat);
  return update(owner,chat.id,old=>old?.deleted?undefined:{
    ...(old?mergeChats(snapshot,old):snapshot),version:old?.version||0,dirty:true
  });
}
export function deleteChat(owner,id){
  return update(owner,id,old=>({id,updated:Date.now(),version:old?.version||0,deleted:true}));
}
export function commitSync(owner,prior,next){
  return update(owner,prior.id,old=>old?.revision===prior.revision&&Boolean(old)===Boolean(prior.key)?next:undefined);
}
