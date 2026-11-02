import {records} from './personality-data.js';
import {vectorIndex} from './personality-vectors.js';
import {PERSONALITY_EMBEDDING,normalizeVector,documentInput,hashText,queryInput} from './personality-embedding.js';
import {searchPersonality,PERSONALITY_LIMITS} from './personality-retrieval.js';

export function createSemanticPersonalitySearch({embedQuery,catalog=records,index=vectorIndex,fallback=searchPersonality,onSearch=()=>{}}){
 let rows=[];
 try{
  if(!Object.entries(PERSONALITY_EMBEDDING).every(([k,v])=>index[k]===v))throw Error('metadata');
  const vectors=new Map(index.entries.map(e=>[e.id,e]));
  rows=catalog.map(record=>{const entry=vectors.get(record.id);if(!entry||entry.contentHash!==record.contentHash||entry.inputHash!==hashText(documentInput(record)))throw Error('stale');return {record,vector:normalizeVector(entry.values)};});
 }catch{rows=[];}
 return async(query,options={})=>{
  if(!rows.length||!embedQuery){const reason=rows.length?'embedding-unavailable':'index-missing-or-stale';const hits=fallback(query,options);onSearch({method:'local-keyword',fallbackReason:reason});return {hits,method:'local-keyword',fallbackReason:reason};}
  let vector;try{vector=normalizeVector(await embedQuery(queryInput(query)));}
  catch{const hits=fallback(query,options);onSearch({method:'local-keyword',fallbackReason:'embedding-request-failed'});return {hits,method:'local-keyword',fallbackReason:'embedding-request-failed'};}
  const excluded=new Set(options.exclude??[]);let available=Math.max(0,Math.min(PERSONALITY_LIMITS.characters,options.remainingCharacters??PERSONALITY_LIMITS.characters));
  const ranked=rows.filter(r=>!excluded.has(r.record.id)).map(row=>({...row,score:row.vector.reduce((n,v,i)=>n+v*vector[i],0)})).filter(r=>r.score>=0.3).sort((a,b)=>b.score-a.score||a.record.id.localeCompare(b.record.id));
  const hits=[];for(const {record,score}of ranked){const content=record.text.replace(/^---\n[\s\S]*?\n---\n/,'');if(content.length>available)continue;hits.push({id:record.id,path:record.path,module:record.module,kind:record.kind,status:record.status,sourceId:record.sourceId,contentHash:record.contentHash,content,similarity:score});available-=content.length;if(hits.length===PERSONALITY_LIMITS.passages)break;}
  onSearch({method:'semantic'});return {hits,method:'semantic'};
 };
}

// Bounded process-local query cache; raw query text is never used as a cache key.
export function cachedQueryEmbedder(embed,{maxEntries=128,ttlMs=600000,now=Date.now}={}){
 const cache=new Map();
 return async text=>{
  const key=hashText(text),entry=cache.get(key);if(entry&&entry.expires>now())return entry.promise;
  cache.delete(key);while(cache.size>=maxEntries)cache.delete(cache.keys().next().value);
  const promise=Promise.resolve().then(()=>embed(text)).then(normalizeVector);
  const value={promise,expires:now()+ttlMs};cache.set(key,value);
  try{return await promise;}catch(e){if(cache.get(key)===value)cache.delete(key);throw e;}
 };
}
