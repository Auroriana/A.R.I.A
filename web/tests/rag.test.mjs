import test from 'node:test';
import assert from 'node:assert/strict';
import {researchVault,RAG_LIMITS} from '../lib/rag.js';
import handler from '../api/index.js';

const passage=(id,title=String(id),content=`Content ${id}`)=>({id:String(id),title,source_path:`${id}.md`,vault_name:'Insurance',content});
const plan=(queries)=>({answer:JSON.stringify({queries})});
const scenario='Authenticated - Customer came in asking - My husband is at the dealership buying a 2026 Toyota Camry. Add full coverage, email the ID card, check our last payment and Chase autopay.';

test('authenticated multi-intent case expands beyond the first authentication document and follows new references',async()=>{
  const requests=[],queries=[];
  const replies=[plan(['Third Party Authorization','Add vehicle coverage','ID card delivery','Payment history autopay']),plan(['Automatic payment bank disclosure']),{answer:'Proceed with the completed identity check. Check third-party authority [S2], clarify coverage [S3], then delivery [S4] and billing [S5]. Autopay disclosure requires [S6].'}];
  const results=[[passage(1,'Authentication Process')],[passage(1),passage(2,'Third Party Authorization')],[passage(3,'Add vehicle')],[passage(4,'ID card delivery')],[passage(5,'Billing')],[passage(6,'Bank disclosure')]];
  const result=await researchVault({message:scenario,search:async(q,options)=>{queries.push({q,...options});return results.shift();},generate:async request=>{requests.push(request);return replies.shift();}});
  assert.equal(queries.length,6);assert.equal(queries[0].initial,true);assert.ok(queries.slice(1).every(q=>!q.initial));
  assert.equal(requests.length,3);assert.equal(result.sources.length,6);
  assert.deepEqual(result.sources.map(s=>s.id),['S1','S2','S3','S4','S5','S6']);
  const final=JSON.parse(requests.at(-1).contents[0].parts[0].text);
  assert.equal(final.operatorMessage,scenario);assert.equal(final.evidence[0].title,'Authentication Process');
  assert.equal(final.evidence.at(-1).id,'S6');
  assert.equal(result.research.planningCalls,2);
});

test('empty initial retrieval can recover with a focused search',async()=>{
  let n=0;const replies=[plan(['ID card']),plan([]),{answer:'Delivery procedure [S1].'}];
  const result=await researchVault({message:'Need proof for dealer',search:async()=>++n===1?[]:[passage(1)],generate:async()=>replies.shift()});
  assert.equal(n,2);assert.equal(result.sources.length,1);
});

test('no evidence still reaches synthesis with an explicit empty evidence set',async()=>{
  let call=0;
  const result=await researchVault({message:'Unknown topic',search:async()=>[],generate:async request=>{
    if(call++===0)return plan([]);
    assert.deepEqual(JSON.parse(request.contents[0].parts[0].text).evidence,[]);
    return {answer:'No supporting notes found. General suggestion: clarify the request.'};
  }});
  assert.equal(result.sources.length,0);assert.equal(call,2);
});

test('duplicate queries and duplicate passages do not consume unbounded searches or change citations',async()=>{
  let searches=0,calls=0;
  const result=await researchVault({message:'Authentication',search:async()=>{searches++;return [passage(1)];},generate:async()=>++calls===1?plan([' authentication ','ID card','id  card']):calls===2?plan(['ID CARD']):{answer:'See [S1].'}});
  assert.equal(searches,2);assert.equal(result.sources.length,1);assert.equal(calls,3);
});

test('round and source budgets bound expansion even when the model always requests more',async()=>{
  let searches=0,calls=0;
  const result=await researchVault({message:'Question',search:async()=>{const n=searches++;return Array.from({length:4},(_,i)=>passage(n*4+i));},generate:async request=>{
    if(calls++<2)return plan(Array.from({length:4},(_,i)=>`query ${calls} ${i}`));
    const evidence=JSON.parse(request.contents[0].parts[0].text).evidence;
    assert.equal(evidence.length,RAG_LIMITS.sources);return {answer:'Answer [S24].'};
  }});
  assert.equal(searches,9);assert.equal(calls,3);assert.equal(result.sources.length,24);
  assert.ok(result.research.warnings.some(w=>w.includes('Evidence limit')));
});

test('evidence character budget preserves complete passages',async()=>{
  let calls=0;
  const result=await researchVault({message:'Question',search:async()=>Array.from({length:24},(_,i)=>passage(i,String(i),'x'.repeat(3000))),generate:async()=>++calls===1?plan([]):{answer:'Answer [S20].'}});
  assert.equal(result.sources.length,20);assert.ok(result.sources.every(s=>s.excerpt.length===3000));
});

test('malformed or truncated plans stop research visibly without treating model text as a query',async()=>{
  for(const bad of [{answer:'not JSON'},plan(['x'.repeat(201)]),plan(Array(5).fill('query')),plan([null]),{...plan(['query']),truncated:true}]){
    let calls=0,searches=0;
    const result=await researchVault({message:'Question',search:async()=>{searches++;return [passage(1)];},generate:async()=>++calls===1?bad:{answer:'Answer [S1].'}});
    assert.equal(searches,1);assert.equal(calls,2);assert.match(result.research.warnings[0],/incomplete or invalid/);
  }
});

test('citations outside the merged evidence set are rejected, including with no results',async()=>{
  for(const answer of ['Answer [S0].','Answer [S2].']){
    let n=0;
    await assert.rejects(researchVault({message:'Question',search:async()=>[passage(1)],generate:async()=>++n===1?plan([]):{answer}}),/invalid source/);
  }
  let n=0;
  await assert.rejects(researchVault({message:'Question',search:async()=>[],generate:async()=>++n===1?plan([]):{answer:'[S1]'}}),/invalid source/);
});

test('upstream research failures propagate without retries or model fallback',async()=>{
  let calls=0;
  await assert.rejects(researchVault({message:'Question',search:async()=>[],generate:async()=>{calls++;throw Object.assign(new Error('quota'),{status:429});}}),{status:429});
  assert.equal(calls,1);
  let searches=0;
  await assert.rejects(researchVault({message:'Question',search:async()=>{if(++searches>1)throw new Error('database');return [];},generate:async()=>plan(['next'])}),/database/);
  assert.equal(searches,2);
});

test('API keeps all model-driven searches in the authenticated selected vault and reserves every generation',async t=>{
  const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public',OWNER_USER_ID:'owner',GEMINI_API_KEY:'test',GEMINI_FREE_TIER_CONFIRMED:'true',ENABLE_SEMANTIC_SEARCH:'false'};
  const previous=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);
  t.after(()=>{for(const [k,v] of Object.entries(previous))if(v===undefined)delete process.env[k];else process.env[k]=v;});
  const vault='a81a0000-0000-4000-8000-0000000000f1',events=[],bodies=[];
  let generations=0;
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    const body=options.body?JSON.parse(options.body):null;
    if(url.endsWith('/auth/v1/user'))return {ok:true,json:async()=>({id:'owner'})};
    if(url.endsWith('/aria_reserve')){events.push('reserve');assert.ok(body.p_tokens>2048);return {ok:true,json:async()=>true};}
    if(url.endsWith('/aria_search')){events.push('search');assert.equal(body.p_vault,vault);assert.equal(body.p_embedding,null);assert.equal(options.headers.Authorization,'Bearer test-session');return {ok:true,json:async()=>[passage(1)]};}
    if(url.includes(':generateContent')){
      events.push('generate');bodies.push(body);generations++;
      const answer=generations===1?plan(['payment history']).answer:generations===2?plan([]).answer:'Answer [S1].';
      return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:answer}]}}]})};
    }
    throw new Error('Unexpected URL');
  });
  let response;const res={setHeader(){},end(value){response=JSON.parse(value);}};
  await handler({method:'POST',url:'/api/chat',headers:{'content-type':'application/json',host:'localhost',cookie:'aria_session=test-session'},body:{model:'gemini-3.5-flash-lite',mode:'vault',vault,message:scenario,history:[{role:'model',text:'DELETED SECRET EVIDENCE'}]}},res);
  assert.equal(res.statusCode,200);assert.equal(response.research.searches,2);
  assert.equal(events.filter(x=>x==='reserve').length,3);
  events.forEach((event,i)=>{if(event==='generate')assert.equal(events[i-1],'reserve');});
  assert.ok(bodies.every(b=>!JSON.stringify(b).includes('DELETED SECRET EVIDENCE')));
  assert.ok(bodies.every(b=>JSON.parse(b.contents[0].parts[0].text).operatorMessage===scenario));
});

test('discrepancies reported by the planner reach the final answer context',async()=>{
  let call=0,seen;
  await researchVault({message:'I live in Georgia. ZIP 10001.',search:async()=>[],generate:async request=>{
    if(++call===1)return {answer:JSON.stringify({discrepancies:['Georgia vs ZIP 10001 (New York)'],queries:[]})};
    seen=JSON.parse(request.contents[0].parts[0].text);return {answer:'Confirm the state.'};
  }});
  assert.deepEqual(seen.discrepancies,['Georgia vs ZIP 10001 (New York)']);
});
