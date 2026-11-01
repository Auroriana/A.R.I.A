import test from 'node:test';
import assert from 'node:assert/strict';
import {personalityHandoff,citationMap} from '../public/personality-handoff.js';
import {personalize} from '../lib/personality.js';

test('handoff preserves draft and continuity but sends only cited source identities',()=>{
 const history=[{role:'model',text:'1. First topic\n2. Second topic'}],overview=[{title:'Prior chat',recent:[]}];
 const body={message:'Your view of the first?',history,overview,settings:{enabled:true},files:[{data:'BASE64'}],continuation:'CHECKPOINT',usage:{totalTokenCount:999},mode:'vault'};
 const result={answer:'First topic may be useful, but evidence is uncertain [S2, S3].',research:{searches:2},sources:[
  {id:'S1',title:'Unused',excerpt:'UNUSED_PASSAGE'},
  {id:'S2',title:'Source',path:'Source.md',vault:'Notes',excerpt:'RAW_PASSAGE'.repeat(1000),read:true},
  {id:'S3',title:'Other',path:'Other.md',vault:'Notes',excerpt:'OTHER_PASSAGE',read:true},
  {id:'S2',title:'Duplicate',excerpt:'DUPLICATE'}]};
 const handoff=personalityHandoff(body,result);
 assert.equal(handoff.answer,result.answer);assert.deepEqual(handoff.history,history);assert.deepEqual(handoff.overview,overview);
 assert.deepEqual(handoff.citationSources,[{id:'S2',title:'Source',path:'Source.md',vault:'Notes'},{id:'S3',title:'Other',path:'Other.md',vault:'Notes'}]);
 assert.equal(handoff.vaultSearches,2);assert.doesNotMatch(JSON.stringify(handoff),/RAW_PASSAGE|OTHER_PASSAGE|UNUSED_PASSAGE|DUPLICATE|CHECKPOINT|BASE64|totalTokenCount/);
 assert.deepEqual(citationMap('[S1]',[{id:'S1',read:false}]),[]);
});

test('personality can seek a missing fact after reasoning searched, with S and P provenance intact',async()=>{
 const phases=[],contexts=[],queries=[];
 const result=await personalize({body:{action:'rewrite',message:'What does that imply?',answer:'The event is planned [S2].',vaultSearches:2,
  history:[{role:'model',text:'The event concerns the first project.'}],citationSources:[{id:'S2',title:'Plan',path:'Plan.md',vault:'Work',excerpt:'RAW_PASSAGE'}],settings:{enabled:true,web:'off'}},
  generate:async(request,meta)=>{phases.push(meta?.phase??'rewrite');contexts.push(JSON.parse(request.contents[0].parts[0].text));return {answer:phases.length===1?'{"query":"project deadline"}':'The plan [S2] leaves little room before the deadline [P1]. I would start now.'};},
  search:async q=>{queries.push(q);return [{title:'Deadline',source_path:'Deadline.md',vault_name:'Work',content:'Friday'}];}});
 assert.deepEqual(queries,['project deadline']);assert.deepEqual(phases,['memory-plan','rewrite']);
 assert.equal(contexts[0].vaultsChecked,true);assert.equal(contexts[0].conversation[0].text,'The event concerns the first project.');
 assert.deepEqual(contexts[0].citationSources,[{id:'S2',title:'Plan',path:'Plan.md',vault:'Work'}]);
 assert.doesNotMatch(JSON.stringify(contexts),/RAW_PASSAGE/);
 assert.deepEqual(contexts[1].allowedCitations,['S2','P1']);assert.equal(result.sources[0].id,'P1');assert.equal(result.citationWarning,null);
});

test('model-proposed current-information gap still checks vault and requests web permission',async()=>{
 let calls=0,searches=0;
 const result=await personalize({body:{action:'rewrite',message:'Would you recommend this?',answer:'No current reviews available.',settings:{enabled:true,web:'ask'}},
  generate:async request=>{calls++;if(calls>1)assert.equal(JSON.parse(request.contents[0].parts[0].text).vaultsChecked,true);return {answer:calls===1?'{"query":null,"webQuery":"public product current reviews"}':calls===2?'{"missingFromVaults":true,"opinionNeedsCurrentInformation":true,"webQuery":"public product current reviews","question":"Shall I check recent reviews?"}':'My view is provisional.'};},
  search:async()=>{searches++;return [];},webSearch:async()=>{throw Error('No permission');}});
 assert.equal(calls,3);assert.equal(searches,1);assert.equal(result.webRequest.query,'public product current reviews');
});

test('legacy handoffs remain accepted and malformed citation maps fail before generation',async()=>{
 const base={action:'rewrite',message:'Hi',answer:'Known [S1]',settings:{enabled:true,memory:false,web:'off'}};
 const result=await personalize({body:base,generate:async request=>{const c=JSON.parse(request.contents[0].parts[0].text);assert.deepEqual(c.citationSources,[]);assert.deepEqual(c.allowedCitations,['S1']);return {answer:'Known [S1]'};}});
 assert.equal(result.answer,'Known [S1]');
 for(const citationSources of [{},[{id:'S1',title:'x'.repeat(100001)}]])await assert.rejects(personalize({body:{...base,citationSources},generate:()=>{throw Error('Must not call');}}),/Invalid citation map/);
});
