import test from 'node:test';import assert from 'node:assert/strict';
import {geminiStream} from '../lib/providers.js';
const event=data=>'data: '+JSON.stringify(data)+'\r\n\r\n';
const candidate=(parts,finishReason)=>({candidates:[{index:0,content:{parts},...(finishReason?{finishReason}:{})}]});
const response=chunks=>new Response(new ReadableStream({start(c){for(const bytes of chunks)c.enqueue(bytes);c.close();}}));
const bytes=text=>new TextEncoder().encode(text);
test('SSE streams provider summaries separately and joins answer deltas across UTF-8/CRLF boundaries',async()=>{
  const summaries=[];let started=0;
  const input=bytes(': ping\r\n\r\n'+event(candidate([{thought:true,text:'Check café',thoughtSignature:'secret-signature'}]))+event(candidate([{text:'Hello '},{thought:true,text:' — compare'}]))+event({...candidate([{text:'world'}],'STOP'),usageMetadata:{totalTokenCount:42}}));
  const chunks=Array.from(input,b=>Uint8Array.of(b));
  const result=await geminiStream('gemini-3.8-flash',{generationConfig:{thinkingConfig:{thinkingLevel:'low'}}},{onThought:t=>summaries.push(t),onAnswerStarted:()=>started++},async(url,options)=>{
    assert.match(url,/:streamGenerateContent\?alt=sse$/);assert.deepEqual(JSON.parse(options.body).generationConfig.thinkingConfig,{thinkingLevel:'low',includeThoughts:true});return response(chunks);
  });
  assert.deepEqual(summaries,['Check café',' — compare']);assert.equal(result.answer,'Hello world');assert.equal(result.usage.totalTokenCount,42);assert.equal(started,1);assert.ok(!JSON.stringify(result).includes('secret-signature'));
});
test('summary-free and truncated answers are accepted; incomplete or blocked streams are rejected',async()=>{
  let summaries=0;
  const result=await geminiStream('test',{}, {onThought:()=>summaries++},async()=>response([bytes(event(candidate([{text:'Short'}],'MAX_TOKENS')))]));
  assert.equal(result.truncated,true);assert.equal(summaries,0);
  for(const data of [candidate([{text:'partial'}]),candidate([{text:'blocked'}],'SAFETY'),{error:{message:'secret'}},{promptFeedback:{blockReason:'SAFETY'}}]){
    await assert.rejects(geminiStream('test',{}, {},async()=>response([bytes(event(data))])),e=>e.status===502&&!e.message.includes('secret'));
  }
});
test('malformed streams and provider quota failures fail without retries',async()=>{
  await assert.rejects(geminiStream('test',{}, {},async()=>response([bytes('data: invalid\n\n')])),/unreadable/);
  let calls=0;await assert.rejects(geminiStream('test',{}, {},async()=>{calls++;return new Response('{}',{status:429});}),{status:429});assert.equal(calls,1);
});
// Match fetch's abort behavior without waiting for production-size timeouts.
function stalledFetcher(afterData=false){return async(url,{signal})=>new Response(new ReadableStream({start(c){
  if(afterData)c.enqueue(bytes(event(candidate([{thought:true,text:'Summary'}]))));
  signal.addEventListener('abort',()=>c.error(new DOMException('aborted','AbortError')),{once:true});
}}));}
test('idle timeout distinguishes no data from a stalled active stream',async()=>{
  await assert.rejects(geminiStream('test',{}, {idleMs:15,totalMs:1000},stalledFetcher()),/sent no stream data/);
  await assert.rejects(geminiStream('test',{}, {idleMs:15,totalMs:1000},stalledFetcher(true)),/stopped sending stream data/);
});
test('incoming chunks reset the idle timeout instead of imposing a fixed generation cutoff',async()=>{
  let timer;
  const result=await geminiStream('test',{}, {idleMs:100,totalMs:2000},async()=>new Response(new ReadableStream({start(c){
    let i=0;timer=setInterval(()=>{i++;c.enqueue(bytes(event(candidate([{text:'x'}],i===5?'STOP':undefined))));if(i===5){clearInterval(timer);c.close();}},30);
  },cancel(){clearInterval(timer);}})));
  assert.equal(result.answer,'xxxxx');
});
test('overall deadline and caller disconnect abort even while waiting for data',async()=>{
  await assert.rejects(geminiStream('test',{}, {idleMs:1000,totalMs:15},stalledFetcher()),/overall response time limit/);
  const controller=new AbortController();const result=geminiStream('test',{}, {signal:controller.signal},stalledFetcher());controller.abort('disconnected');
  await assert.rejects(result,/chat connection was closed/);
});
