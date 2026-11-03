import test from 'node:test';
import assert from 'node:assert/strict';
import {withPersonalityQuota} from '../lib/personality-quota.js';
import {estimateText} from '../public/token-usage.js';
const request={contents:[{text:'fixture'.repeat(60)}],generationConfig:{maxOutputTokens:123}};
for(const failure of ['reservation','provider','daily']){
 test('personality retry after '+failure,async()=>{
   let reserves=0,calls=0,waits=0;
   const pending=withPersonalityQuota(request,{deadline:Date.now()+135000,onWait(){},wait:async ms=>{assert.equal(ms,61000);waits++;},
    reserve:async n=>{assert.equal(n,estimateText(JSON.stringify(request))+123);reserves++;return failure!=='daily'&&(failure!=='reservation'||reserves>1);},
    generate:async()=>{calls++;if(failure==='provider'&&calls===1)throw Object.assign(Error(),{status:429});return 'ok';}});
   if(failure==='daily')await assert.rejects(pending,{status:429});else assert.equal(await pending,'ok');
   assert.equal(waits,1);assert.equal(reserves,2);assert.equal(calls,failure==='daily'?0:failure==='provider'?2:1);
 });
}
