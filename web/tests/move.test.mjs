import test from 'node:test';
import assert from 'node:assert/strict';
import {noteRoutes} from '../lib/notes-api.js';
import {planSync} from '../../tools/sync-plan.mjs';
const vault='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
test('move API validates both vaults and paths before touching the database',async()=>{
 for(const patch of [{toVault:'bad'},{toPath:'../Note.md'},{toPath:'98 Private/N.md'},{path:'../N.md'},{baseVersion:0}]){
  await assert.rejects(noteRoutes({req:{method:'POST',body:{vault,path:'Note.md',baseVersion:2,toVault:other,toPath:'Folder/Note.md',...patch}},route:'/api/note-move',fail:(m,s=400)=>Object.assign(Error(m),{status:s}),sb:()=>assert.fail('invalid request reached DB')}));
 }
});
test('move checks the observed version, sends chunks, and surfaces collisions without another save',async()=>{
 for(const reason of ['conflict','exists','ok']){
  let calls=0,result;
  const run=()=>noteRoutes({req:{method:'POST',body:{vault,path:'Note.md',baseVersion:2,toVault:other,toPath:'Folder/Note.md'}},route:'/api/note-move',token:'t',fail:(m,s=400)=>Object.assign(Error(m),{status:s}),send:(s,d)=>result=d,sb:async(route,token,body)=>{
   calls++;if(!body)return[{version:2,content:'---\nai_enabled: true\n---\n# Test\nKeep this.'}];
   assert.equal(body.p_base_version,2);assert.equal(body.p_to_vault,other);assert.ok(body.p_chunks.length);return{ok:reason==='ok',reason};
  }});
  if(reason==='ok'){await run();assert.ok(result.ok);}else await assert.rejects(run(),{status:409});assert.equal(calls,2);
 }
});
test('move tombstones retire unchanged local notes and protect local edits from resurrection',()=>{
 const remote=new Map([['Old.md',{deleted:true,movedTo:'id',hash:'original',version:3}],['New.md',{hash:'original',version:3}]]);
 const base=new Map([['Old.md',{hash:'original',version:2}]]);
 let actions=planSync({local:new Map([['Old.md','original']]),remote,base});
 assert.equal(actions.find(a=>a.path==='Old.md').type,'retire-moved');assert.equal(actions.find(a=>a.path==='New.md').type,'pull');
 actions=planSync({local:new Map([['Old.md','edited']]),remote,base,resolve:{'Old.md':'local'}});
 assert.equal(actions.find(a=>a.path==='Old.md').type,'move-conflict');assert.ok(!actions.some(a=>a.type==='push'));
 assert.equal(planSync({local:new Map(),remote,base}).find(a=>a.path==='Old.md').type,'forget');
});
