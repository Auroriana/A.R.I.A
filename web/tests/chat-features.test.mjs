import test from 'node:test';
import assert from 'node:assert/strict';
import {gemini} from '../lib/providers.js';
import {validateChat,models} from '../lib/models.js';
import {researchVault} from '../lib/rag.js';
import {readChatStream} from '../public/chat-stream.js';
import handler from '../api/index.js';

test('concise is optional and boolean; it changes synthesis without suppressing research',async()=>{
  const input={model:models[0].id,message:'test',mode:'vault'};
  assert.equal(validateChat(input).concise,false);assert.equal(validateChat({...input,concise:true}).concise,true);
  assert.throws(()=>validateChat({...input,concise:'true'}));
  let calls=0;const progress=[];
  await researchVault({message:'test',concise:true,onProgress:p=>progress.push(p),search:async()=>[{id:'1',title:'Note',source_path:'Note.md',content:'evidence'}],generate:async request=>{
    if(++calls===1)return {answer:'{"queries":[]}'};
    assert.match(request.systemInstruction.parts[0].text,/Keep the answer concise/);return {answer:'Answer [S1].'};
  }});
  assert.deepEqual(progress.map(p=>p.stage),['search','results','planning','evidence','answering','evidence']);assert.equal(progress[1].notes[0].title,'Note');assert.equal(progress[3].notes[0].read,true);
});
test('provider errors distinguish invalid credentials, timeouts and network failure without leaking details',async()=>{
  await assert.rejects(gemini('gemini-3.8-flash',{},async()=>({ok:false,status:400,json:async()=>({error:{message:'sensitive upstream text',details:[{reason:'API_KEY_INVALID'}]}})})),/Replace GEMINI_API_KEY/);
  await assert.rejects(gemini('gemini-3.8-flash',{},async()=>{throw Object.assign(new Error('secret'),{name:'TimeoutError'});}),{status:504});
  await assert.rejects(gemini('gemini-3.8-flash',{},async()=>{throw new TypeError('secret');}),/Could not reach Gemini/);
});
const streamed=chunks=>new Response(new ReadableStream({start(controller){for(const chunk of chunks)controller.enqueue(new TextEncoder().encode(chunk));controller.close();}}),{headers:{'content-type':'application/x-ndjson'}});
test('stream decoder handles split frames, progress and final results',async()=>{
  const events=[];const result=await readChatStream(streamed(['{"type":"pro','gress","stage":"search","query":"billing"}\n{"type":"heartbeat"}\n','{"type":"result","answer":"Done"}\n']),p=>events.push(p));
  assert.equal(events[0].query,'billing');assert.equal(result.answer,'Done');
});
test('stream errors and interrupted streams surface to the caller',async()=>{
  await assert.rejects(readChatStream(streamed(['{"type":"error","error":"Quota reached"}\n']),()=>{}),/Quota reached/);
  await assert.rejects(readChatStream(streamed(['{"type":"heartbeat"}\n']),()=>{}),/connection ended/);
});
test('HTTP streaming emits progress before generation finishes and returns model-specific settings',async t=>{
  const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'test',OWNER_USER_ID:'owner',GEMINI_API_KEY:'test',GEMINI_FREE_TIER_CONFIRMED:'true'};
  const old=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);
  t.after(()=>{for(const [k,v] of Object.entries(old))if(v===undefined)delete process.env[k];else process.env[k]=v;});
  const events=[];let ended=false;
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    if(url.endsWith('/auth/v1/user'))return {ok:true,json:async()=>({id:'owner'})};
    if(url.endsWith('/aria_reserve'))return {ok:true,json:async()=>true};
    assert.equal(events[0].stage,'answering');assert.equal(ended,false);
    const body=JSON.parse(options.body);assert.match(body.systemInstruction.parts[0].text,/Keep the answer concise/);
    assert.equal(body.generationConfig.thinkingConfig.thinkingLevel,'low');assert.equal(body.generationConfig.maxOutputTokens,8192);
    assert.ok(url.includes(':streamGenerateContent?alt=sse'));assert.equal(body.generationConfig.thinkingConfig.includeThoughts,true);
    return new Response('data: '+JSON.stringify({candidates:[{content:{parts:[{thought:true,text:'Public summary',thoughtSignature:'private-signature'},{text:'## Answer\n**Yes**'}]},finishReason:'STOP'}]})+'\n\n',{headers:{'content-type':'text/event-stream'}});
  });
  const res={setHeader(){},write(value){events.push(JSON.parse(value));},end(){ended=true;}};
  await handler({url:'/api/chat',method:'POST',headers:{host:'localhost',cookie:'aria_session=test','content-type':'application/json',accept:'application/x-ndjson'},body:{model:'gemini-3.8-flash',settings:{reasoning:''},message:'test',mode:'general',concise:true}},res);
  assert.equal(ended,true);assert.equal(events.at(-1).type,'result');assert.ok(!JSON.stringify(events).includes('private-signature'));assert.ok(events.some(e=>e.stage==='thought-summary'&&e.text==='Public summary'));
});
