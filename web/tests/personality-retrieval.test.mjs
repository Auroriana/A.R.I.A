import test from 'node:test';
import assert from 'node:assert/strict';
import {personalize} from '../lib/personality.js';
import {searchPersonality,personalitySearchRequest,PERSONALITY_LIMITS} from '../lib/personality-retrieval.js';
const body={action:'rewrite',message:'How would you react to betrayal?',answer:'Consider what happened [S1].',settings:{memory:false,web:'off'}};
test('personality can answer after a guaranteed local lookup with no extra classifier',async()=>{
 let calls=0;const result=await personalize({body:{...body,message:'Hello',answer:'Hello'},generate:async request=>{calls++;assert.ok(JSON.parse(request.contents[0].parts[0].text).personalityPassages.length);return {answer:'Hey.'};}});
 assert.equal(calls,1);assert.equal(result.personalityResearch.searched,true);assert.ok(result.personalityResearch.passages.length);
});
test('model-requested personality RAG supplies real records independently of factual-memory setting',async()=>{
 let calls=0;const result=await personalize({body,generate:async request=>{
  const data=JSON.parse(request.contents[0].parts[0].text);
  if(++calls===1){assert.ok(data.personalityPassages.length);return {answer:'{"personalitySearch":{"query":"betrayal trust disappointment"}}'};}
  assert.ok(data.personalityPassages.some(p=>p.path.includes('Betrayal')));
  assert.ok(data.personalityPassages.every(p=>p.kind&&p.contentHash&&p.content));
  assert.deepEqual(data.allowedCitations,['S1']);
  return {answer:'I would want the truth first. Consider what happened [S1].'};
 }});
 assert.equal(calls,2);assert.equal(result.personalityResearch.searches,2);assert.ok(result.personalityResearch.passages.length);assert.equal(result.citationWarning,null);assert.deepEqual(result.sources,[]);
});
test('two searches deduplicate passages and preserve the total content budget',async()=>{
 let calls=0,first=[];const result=await personalize({body,generate:async request=>{
  const data=JSON.parse(request.contents[0].parts[0].text);calls++;
  if(calls===1)return {answer:'{"personalitySearch":{"query":"playful praise teasing"}}'};
  if(calls===2){first=data.personalityPassages.map(p=>p.id);return {answer:'{"personalitySearch":{"query":"technical uncertainty repairs"}}'};}
  assert.equal(data.personalityRetrieval.exhausted,true);assert.ok(first.every(id=>data.personalityPassages.some(p=>p.id===id)));
  assert.equal(new Set(data.personalityPassages.map(p=>p.id)).size,data.personalityPassages.length);
  assert.ok(data.personalityPassages.reduce((n,p)=>n+p.content.length,0)<=PERSONALITY_LIMITS.characters);
  return {answer:'A grounded response [S1].'};
 }});assert.equal(calls,3);assert.equal(result.personalityResearch.searches,3);
});
test('repeated query is not searched twice and a third tool request fails visibly',async()=>{
 let calls=0;const query='{"personalitySearch":{"query":"betrayal trust"}}';
 const result=await personalize({body,generate:async request=>{if(++calls<3)return {answer:query};assert.equal(JSON.parse(request.contents[0].parts[0].text).personalityRetrieval.exhausted,true);return {answer:'Answer [S1].'};}});
 assert.equal(result.personalityResearch.searches,2);
 await assert.rejects(personalize({body,generate:async()=>({answer:query})}),/more personality searches/);
});
test('empty matches finish from the core without invented passages',async()=>{
 let calls=0;const result=await personalize({body,generate:async request=>{if(++calls===1)return {answer:'{"personalitySearch":{"query":"zxqvnotaword"}}'};const data=JSON.parse(request.contents[0].parts[0].text);assert.ok(data.personalityPassages.length);assert.equal(data.personalityRetrieval.exhausted,true);return {answer:'I cannot establish that trait [S1].'};}});
 assert.equal(result.personalityResearch.searches,2);assert.ok(result.personalityResearch.passages.length);
});
test('retrieval uses corrected source records and validates tool requests',()=>{
 assert.ok(searchPersonality('repairs arm leg').some(p=>p.id==='capri.transcript.t2-e04'));
 assert.deepEqual(searchPersonality('betrayal',{remainingCharacters:0}),[]);
 assert.equal(personalitySearchRequest('Ordinary text'),null);
 assert.throws(()=>personalitySearchRequest('{"personalitySearch":{"query":""}}'),/invalid/);
 assert.throws(()=>personalitySearchRequest('{"personalitySearch":{"query":"hello"},"extra":true}'),/invalid/);
});
