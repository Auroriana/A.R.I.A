// Two isolated Chrome profiles, real IndexedDB and the migration in local PostgreSQL.
const {chromium}=require('C:/Users/Ataraxia/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs/promises'),http=require('node:http'),assert=require('node:assert/strict');
(async()=>{
 const {PGlite}=await import('../../.local/quick-test/node_modules/@electric-sql/pglite/dist/index.js');
 const {chatRoutes}=await import('../lib/chat-routes.js');
 const db=new PGlite(),owner=crypto.randomUUID();
 await db.exec(`create role anon; create role authenticated; create schema auth;create table auth.users(id uuid primary key);
 insert into auth.users values('${owner}');create function auth.uid() returns uuid language sql as $$ select '${owner}'::uuid $$;
 create function public.aria_quick_owner() returns uuid language sql as $$ select auth.uid() $$;`);
 const migration=await fs.readFile(__dirname+'/../supabase/013_chats_welcome.sql','utf8');
 await db.exec(migration);await db.exec(migration);await db.exec('set role authenticated');
 await assert.rejects(db.exec('delete from public.aria_chats'),/permission denied/);
 const server=http.createServer(async(req,res)=>{
  try{
   if(req.url==='/'){res.end('<!doctype html>');return;}
   if(['/chat-sync.js','/chat-store.js'].includes(req.url)){res.setHeader('Content-Type','text/javascript');res.end(await fs.readFile(__dirname+'/../public'+req.url));return;}
   let raw='';for await(const chunk of req)raw+=chunk;
   await chatRoutes({req,route:req.url.split('?')[0],readBody:()=>JSON.parse(raw),fail:msg=>Error(msg),
    send:(status,value)=>{res.statusCode=status;res.end(JSON.stringify(value));},
    sb:async(url,_,body)=>{
     if(body)return (await db.query('select aria_chat_save($1,$2,$3) v',[body.p_id,body.p_version,body.p_chat===null?null:JSON.stringify(body.p_chat)])).rows[0].v;
     if(url.includes('&id=eq.'))return (await db.query('select version,chat from aria_chats where id=$1',[url.split('eq.')[1]])).rows;
     return (await db.query('select id,version from aria_chats where chat is not null')).rows;
    }});
  }catch(e){res.statusCode=500;res.end(JSON.stringify({error:e.message}));}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let browser;
 try{
  browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const id=crypto.randomUUID(),pages=await Promise.all([browser.newPage(),browser.newPage()]);
  for(const page of pages){
   await page.goto('http://127.0.0.1:'+server.address().port);
   await page.evaluate(async id=>{
    const store=await import('/chat-store.js'),{syncChats}=await import('/chat-sync.js');
    window.rows=()=>store.listChats('fixture');
    window.sync=async()=>syncChats({rows:await store.chatRows('fixture'),commit:(prior,next)=>store.commitSync('fixture',prior,next),api:async(path,b)=>{
      const r=await fetch('/api/'+path,b?{method:'POST',body:JSON.stringify(b)}:{});const d=await r.json();if(!r.ok)throw Error(d.error);return d;
    }});
    window.append=async text=>{
     const chat=(await rows())[0]||{id,title:'Fixture',messages:[]};chat.updated=Date.now();
     const turn=crypto.randomUUID(),started=Date.now();
     chat.messages.push({role:'user',id:turn,started,text},{role:'model',id:crypto.randomUUID(),started,turn,text:'reply '+text,expression:'amused_interest',webContext:'LOCAL ONLY'});
     await store.saveChat('fixture',chat);
    };
    window.drop=()=>store.deleteChat('fixture',id);
   },id);
  }
  const [a,b]=pages;
  await a.evaluate(async()=>{await append('first');await sync();});
  await b.evaluate(()=>sync());
  const first=await b.evaluate(()=>rows());assert.equal(first[0].messages[1].expression,'amused_interest');assert.ok(!JSON.stringify(first).includes('LOCAL ONLY'));
  await Promise.all(pages.map((p,i)=>p.evaluate(x=>append(x),'device'+i)));
  await Promise.all(pages.map(p=>p.evaluate(()=>sync())));await Promise.all(pages.map(p=>p.evaluate(()=>sync())));
  for(const p of pages)assert.deepEqual((await p.evaluate(()=>rows()))[0].messages.filter(m=>m.role==='user').map(m=>m.text).sort(),['device0','device1','first']);
  await a.evaluate(async()=>{await drop();await sync();});await b.evaluate(()=>sync());assert.deepEqual(await b.evaluate(()=>rows()),[]);
  console.log('Two-device upload, pull, concurrent append, expression persistence and deletion passed.');
 }finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
