import test from 'node:test';
import assert from 'node:assert/strict';
import {validateQuickInput,quickRequest,validateQuickResult,composeQuickNote,QUICK_MODEL} from '../lib/quick-note.js';
import {runQuickQueue} from '../lib/quick-queue.js';
import {quickRoutes,workerAuthorized} from '../lib/quick-api.js';
import handler from '../api/index.js';

const id='11111111-1111-4111-8111-111111111111',v='22222222-2222-4222-8222-222222222222',u='33333333-3333-4333-8333-333333333333';
const job={id,text:'  Alice owes ¥42.50\r\nDue: 2026-11-03.\n\n',mode:'detailed',lease_token:'lease',attempts:1};
const vaults=[{id:v,allow_auto_file:true,folders:['Ideas']},{id:u,is_unsorted:true,folders:[]}];
const result=(extra={})=>({answer:JSON.stringify({vault:v,folder:'Ideas',newFolder:false,title:'Follow up',confidence:0.95,body:'## Follow up\nAlice owes ¥42.50. Due 2026-11-03.',...extra})});

test('quick input preserves whitespace, line endings and facts; rejects malformed or oversized requests',()=>{
  assert.equal(validateQuickInput({key:id,...job}).text,job.text);
  for(const patch of [{key:'bad'},{text:' '},{text:'x'.repeat(12001)},{text:'a\0b'},{mode:'invent'}])assert.throws(()=>validateQuickInput({key:id,...job,...patch}));
  const request=quickRequest(job,vaults);assert.deepEqual(JSON.parse(request.contents[0].parts[0].text).text,job.text);
});

test('invalid model routing falls back to Unsorted, including nested denied folders',()=>{
  for(const extra of [{vault:id},{confidence:0.74},{confidence:2},{title:'CON'}, {title:'a/b'}, {title:'a\nb'},
    {folder:'../Ideas'},{folder:'90 Attachments'},{folder:'Ideas/98 Private'},{folder:'99 Archive'},{folder:'Ideas/80 Templates'},
    {folder:'a/b/c/d'},{folder:'con.txt'},{folder:'a'.repeat(61)},{folder:'New',newFolder:false},{folder:'New',newFolder:true,confidence:0.89},{body:''}]){
    const plan=validateQuickResult(result(extra),job,vaults);assert.equal(plan.vault,u,JSON.stringify(extra));assert.equal(plan.fallback,true);
  }
  assert.equal(validateQuickResult(result(),job,[{id:v,allow_auto_file:false},vaults[1]]).vault,u);
  for(const response of [{answer:'not json'},{answer:'null'},{...result(),truncated:true}])assert.equal(validateQuickResult(response,job,vaults).vault,u);
  assert.equal(validateQuickResult(result({folder:'New',newFolder:true}),job,vaults).vault,v);
  assert.equal(validateQuickResult(result(),job,vaults).fallback,false);
});

test('composition preserves exact original bytes and sets search off outside model control',()=>{
  const plan=validateQuickResult(result(),job,vaults),content=composeQuickNote(job,plan);
  assert.ok(content.startsWith('---\nai_enabled: false\nsource: quick-note\nquick_note_id: '+id));
  assert.equal(content.split('## Quick note (original)\n\n')[1].split('\n\n## Expanded')[0],job.text);
  assert.ok(content.includes(plan.body));
});

function queueFixture({generate=async()=>result(),reserve=true,finish=()=>({ok:true}),jobs=[job]}={}){
  const calls=[];let pending=[...jobs];
  const rpc=async(name,body)=>{calls.push({name,body});if(name==='aria_quick_claim')return pending.shift()??null;if(name==='aria_folder_map')return vaults;if(name==='aria_reserve')return reserve;if(name==='aria_quick_finish')return finish(body);if(name==='aria_quick_fail')return {ok:true};throw Error(name);};
  return {rpc,generate,calls};
}
test('queue reserves only pinned model and serializes generation; retries filenames without another model call',async()=>{
  let active=0,max=0,count=0,saves=0;
  const f=queueFixture({jobs:[job,{...job,id:u}],generate:async(model)=>{assert.equal(model,QUICK_MODEL);active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,5));active--;count++;return result();},finish:()=>({ok:++saves!==1,reason:'conflict'})});
  assert.deepEqual(await runQuickQueue(f),{filed:2});assert.equal(max,1);assert.equal(count,2);
  assert.equal(f.calls.filter(c=>c.name==='aria_quick_finish')[1].body.p_path,'Ideas/Follow up (2).md');
  assert.ok(f.calls.filter(c=>c.name==='aria_reserve').every(c=>c.body.p_model===QUICK_MODEL));
});
test('reservation refusal and provider 429 requeue and stop the entire run',async()=>{
  for(const reserve of [true,false]){
    let generated=0;const f=queueFixture({reserve,jobs:[job,job],generate:async()=>{generated++;throw Object.assign(new Error('quota'),{status:429});}});
    await runQuickQueue(f);assert.equal(generated,reserve?1:0);assert.equal(f.calls.filter(c=>c.name==='aria_quick_claim').length,1);
    assert.equal(f.calls.find(c=>c.name==='aria_quick_fail').body.p_retry_after,900);
  }
});
test('quick filing skips protected moved-source filenames without another generation',async()=>{
  let attempts=0,generated=0;const f=queueFixture({generate:async()=>{generated++;return result();},finish:()=>++attempts===1?{ok:false,reason:'moved'}:{ok:true}});
  assert.equal((await runQuickQueue(f)).filed,1);assert.equal(generated,1);
  assert.equal(f.calls.filter(c=>c.name==='aria_quick_finish')[1].body.p_path,'Ideas/Follow up (2).md');
});
test('stale worker stops without attempting to fail the new lease',async()=>{
  const f=queueFixture({finish:()=>({ok:false,reason:'stale'})});await runQuickQueue(f);
  assert.ok(!f.calls.some(c=>c.name==='aria_quick_fail'));
});
test('worker secret rejects missing, short and incorrect values',()=>{
  const secret='s'.repeat(40);assert.ok(workerAuthorized('Bearer '+secret,secret));
  for(const header of [undefined,'Bearer bad','Bearer '+'x'.repeat(40)])assert.equal(workerAuthorized(header,secret),false);
  assert.equal(workerAuthorized('Bearer short','short'),false);
});
test('AI toggle checks both displayed version and atomic save conflict',async()=>{
  for(const changedBeforeRead of [true,false]){
    const calls=[];await assert.rejects(quickRoutes({req:{method:'POST'},route:'/api/quick-ai',readBody:async()=>({vault:v,path:'Ideas/Test.md',version:2,enabled:true}),
      sb:async(route,token,body)=>{calls.push({route,body});return body?{ok:false,reason:'conflict'}:[{version:changedBeforeRead?3:2,content:composeQuickNote(job,validateQuickResult(result(),job,vaults))}];},
      fail:(message,status)=>Object.assign(new Error(message),{status}),send:()=>assert.fail('should not succeed')}),{status:409});
    assert.equal(calls.length,changedBeforeRead?1:2);
    if(!changedBeforeRead){assert.equal(calls[1].body.p_base_version,2);assert.match(calls[1].body.p_content,/ai_enabled: true/);assert.ok(calls[1].body.p_chunks.length);}
  }
});
test('HTTP worker cannot bypass authentication with a browser cookie or an invalid secret',async()=>{
  Object.assign(process.env,{SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public',OWNER_USER_ID:id,QUICK_WORKER_SECRET:'s'.repeat(40)});
  let data;const res={setHeader(){},end(x){data=JSON.parse(x);}};
  await handler({method:'POST',url:'/api/quick-worker',headers:{'content-type':'application/json',host:'localhost',cookie:'aria_session=anything',authorization:'Bearer wrong'},body:{}},res);
  assert.equal(res.statusCode,403);assert.equal(data.error,'Access denied.');
});
