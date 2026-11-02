import test from 'node:test';
import assert from 'node:assert/strict';
import {researchVault} from '../lib/rag.js';
import {validateChat,models} from '../lib/models.js';
import {parseVerdict} from '../lib/mirage.js';
test('MIR verifies evidence and fixes flagged drafts',async()=>{
 const phases=[];let answers=0,checks=0;
 const result=await researchVault({message:'When?',deep:true,search:async()=>[{id:'one',title:'Rule',source_path:'rule.md',vault_name:'Work',content:'Cancellation matches the new start date.'}],generate:async(_,meta={})=>{
 phases.push(meta.phase??'answer');
 if(meta.phase==='planning')return {answer:JSON.stringify({queries:[],discrepancies:[],expectations:['Establish the date']})};
 if(meta.phase==='verify')return {answer:JSON.stringify(++checks===1?{verdict:'issues',issues:[{problem:'Clarify the date',query:''}]}:{verdict:'ok',issues:[]})};
 return {answer:++answers===1?'The date [S1]':'The new start date [S1]'};
 }});
 assert.equal(answers,2);assert.equal(checks,2);assert.equal(result.research.verifyRounds,2);
 assert.equal(result.sources[0].cited,true);
});
test('depth is explicit and legacy clients stay efficient',()=>{
 const body={model:models[0].id,message:'Hi',mode:'vault'};
 assert.equal(validateChat(body).depth,'age');
 assert.equal(validateChat({...body,depth:'mir'}).depth,'mir');
 assert.throws(()=>validateChat({...body,depth:'unknown'}));
});
test('verification rejects truncated output',()=>assert.throws(()=>parseVerdict('{"verdict":"ok","issues":[]}',true)));
