import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateQuestion,normalizeUsage,addUsage} from '../public/token-usage.js';
import {geminiStream} from '../lib/providers.js';
import {sealCheckpoint,openCheckpoint} from '../lib/checkpoint.js';
test('draft estimate includes history and attachments without counting base64 as text',()=>{
 assert.equal(estimateQuestion('abcd',[{text:'abcdefgh'}],[{data:'x'.repeat(10000)}]),4099);
});
test('reported total includes thinking once and missing metadata stays estimated',()=>{
 const a=normalizeUsage({promptTokenCount:100,candidatesTokenCount:20,thoughtsTokenCount:30,totalTokenCount:150});
 const b=normalizeUsage({promptTokenCount:50,candidatesTokenCount:10,totalTokenCount:60});
 assert.deepEqual(addUsage(a,b),{totalTokenCount:210,estimated:false,promptTokenCount:150,candidatesTokenCount:30,thoughtsTokenCount:30});
 assert.equal(addUsage(a,normalizeUsage(null,40)).estimated,true);
 assert.equal(normalizeUsage(null,40).totalTokenCount,40);
 const saved=sealCheckpoint({tokenUsage:addUsage(a,b)},'owner','request');
 assert.equal(openCheckpoint(saved,'owner','request').tokenUsage.totalTokenCount,210);
});
test('stream usage snapshots replace earlier cumulative counts',async()=>{
 const counts=[];
 const chunks=[{usageMetadata:{totalTokenCount:100},candidates:[{content:{parts:[{text:'Hello'}]}}]},{usageMetadata:{promptTokenCount:100,candidatesTokenCount:2,thoughtsTokenCount:5,totalTokenCount:107},candidates:[{finishReason:'STOP'}]}];
 const result=await geminiStream('test',{}, {onUsage:u=>counts.push(u.totalTokenCount)},async()=>new Response(chunks.map(c=>'data: '+JSON.stringify(c)+'\n\n').join('')));
 assert.deepEqual(counts,[100,107]);assert.equal(result.usage.totalTokenCount,107);
});
