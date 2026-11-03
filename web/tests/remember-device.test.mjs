import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/index.js';

test('persistent sessions rotate tokens, enforce ownership, support opt-out and sign out locally',async t=>{
 const env={SUPABASE_URL:'https://example.invalid',SUPABASE_PUBLISHABLE_KEY:'fixture',OWNER_USER_ID:'owner'};
 for(const [k,v] of Object.entries(env)){const before=process.env[k];process.env[k]=v;t.after(()=>{if(before===undefined)delete process.env[k];else process.env[k]=before;});}
 let user={id:'owner',email:'fixture@example.com'},revoked=0;
 t.mock.method(globalThis,'fetch',async(url,opts)=>{
   if(url.endsWith('/user'))return opts.headers.Authorization==='Bearer expired'?new Response('{}',{status:401}):Response.json(user);
   if(url.includes('/logout')){revoked++;return new Response(null,{status:204});}
   return Response.json({access_token:'fresh',refresh_token:'rotated',expires_in:3500,user});
 });
 async function call(route,body,cookie=''){
   const headers={};let data;const res={setHeader(k,v){headers[k]=v;},end(v){data=JSON.parse(v);}};
   await handler({url:'/api/'+route,method:body?'POST':'GET',headers:{cookie,'content-type':'application/json'},body},res);
   return {status:res.statusCode,cookies:headers['Set-Cookie'],data};
 }
 for(const remember of [true,false]){
   const login=await call('login',{email:user.email,password:'fixture',remember});
   assert.equal(login.status,200);assert.deepEqual(login.data,{email:user.email});assert.match(login.cookies[1],remember?/rotated.*Max-Age=2592000.*HttpOnly/:/Max-Age=0/);
 }
 for(const cookie of ['capri_refresh=old','aria_session=expired; capri_refresh=old']){
   const result=await call('session',undefined,cookie);assert.equal(result.status,200);assert.match(result.cookies[0],/fresh/);assert.match(result.cookies[1],/rotated/);
 }
 const out=await call('logout',{},'capri_refresh=old');assert.equal(revoked,1);assert.ok(out.cookies.every(c=>c.includes('Max-Age=0')));
 user={id:'other'};const denied=await call('session',undefined,'capri_refresh=old');assert.equal(denied.status,403);assert.equal(denied.cookies,undefined);
});
