export const MAX_CHATS=10;
export function recentChats(chats){return [...chats].sort((a,b)=>b.updated-a.updated).slice(0,MAX_CHATS);}
export function conversationMemory(messages){
  const out=[];let chars=0;
  for(const m of [...messages].reverse()){
    if(!['user','model'].includes(m.role))continue;
    const text=m.text.slice(0,40000),size=JSON.stringify({role:m.role,text}).length;
    if(chars+size>160000||out.length>=200)break;
    chars+=size;out.unshift({role:m.role,text});
  }
  return out;
}
let opening;
function database(){return opening??=new Promise((resolve,reject)=>{const r=indexedDB.open('aria-conversations',1);r.onupgradeneeded=()=>{const s=r.result.createObjectStore('chats',{keyPath:'key'});s.createIndex('owner','owner');};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
export async function listChats(owner){const db=await database();return new Promise((resolve,reject)=>{const r=db.transaction('chats').objectStore('chats').index('owner').getAll(owner);r.onsuccess=()=>resolve(recentChats(r.result));r.onerror=()=>reject(r.error);});}
export async function saveChat(owner,chat){
  const db=await database();return new Promise((resolve,reject)=>{
    const tx=db.transaction('chats','readwrite'),store=tx.objectStore('chats'),r=store.index('owner').getAll(owner);
    r.onsuccess=()=>{const entry={...chat,owner,key:owner+':'+chat.id},all=r.result.filter(c=>c.id!==chat.id);all.push(entry);const keep=new Set(recentChats(all).map(c=>c.key));store.put(entry);all.forEach(c=>{if(!keep.has(c.key))store.delete(c.key);});};
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });
}
export async function deleteChat(owner,id){const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('chats','readwrite');tx.objectStore('chats').delete(owner+':'+id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
