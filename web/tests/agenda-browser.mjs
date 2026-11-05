import {chromium} from 'playwright-core';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {defaults,coreModels} from '../lib/core-settings.js';
const id=crypto.randomUUID(),reminders=[{id,text:'Tea with Capri',due_at:new Date(Date.now()-60000).toISOString(),timezone:'Asia/Shanghai',notification:'Kettle time, choom.'}],captures=[],turns=[],cloud=new Map();
let failSync=false;
const server=http.createServer(async(req,res)=>{
 try{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/api/')){
 let raw='';for await(const c of req)raw+=c;const b=raw?JSON.parse(raw):{};let data={ok:true};
 switch(url.pathname){
 case '/api/status':data={configured:true,geminiReady:true,models:[{id:'gemini-3.5-flash-lite',name:'Flash'}]};break;
 case '/api/session':data={email:'test@example.com'};break;
 case '/api/core-settings':data={defaults,models:coreModels};break;
 case '/api/vaults':data={vaults:[]};break;
 case '/api/quick-list':data={notes:[]};break;
 case '/api/welcome':data={lines:['Hey, you.'],generated_at:new Date().toISOString()};break;
 case '/api/agenda':data={reminders};break;
 case '/api/chats':await new Promise(r=>setTimeout(r,400));if(failSync){res.statusCode=503;res.end(JSON.stringify({error:'Sync temporarily unavailable'}));return;}data={chats:[...cloud.values()].map(c=>({id:c.id,version:1}))};break;
 case '/api/chat-save':cloud.set(b.id,b.chat);data={version:1};break;
 case '/api/chat-get':data={chat:cloud.get(url.searchParams.get('id')),version:1};break;
 case '/api/capture':captures.push(b);data={kind:b.message.startsWith('Note')?'note':'reminder',answer:'Saved successfully.'};break;
 case '/api/personality':turns.push(b);data={route:'reply',answer:'Tea sounds good.',usage:{totalTokenCount:4}};break;
 }
 res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));return;
 }
 const name=url.pathname==='/'?'index.html':url.pathname.slice(1);res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.avif')?'image/avif':'text/html');res.end(await readFile(new URL('../public/'+name,import.meta.url)));
 }catch(e){res.statusCode=500;res.end(JSON.stringify({error:e.message}));}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE',e.message);});page.on('console',m=>{if(m.type()==='error')console.error('CONSOLE',m.text());});
 await page.goto('http://127.0.0.1:'+server.address().port);assert.equal(await page.locator('#capri-loading').isVisible(),true);await page.screenshot({path:'/tmp/capri-loading.png'});
 await page.locator('.agenda-dialog[open]').waitFor();assert.equal(await page.locator('#capri-loading').isHidden(),true);assert.match(await page.locator('.agenda-dialog[open]').innerText(),/Tea with Capri/);
 await page.getByRole('button',{name:'Keep for later'}).click();assert.ok(await page.locator('#chat-history button').count()>0);
 const rows=await page.evaluate(async()=>(await import('/chat-store.js')).listChats('test@example.com'));assert.ok(rows.some(c=>c.title.startsWith('Today with Capri')));assert.ok(rows.some(c=>c.id===id));
 await page.reload();await page.locator('.agenda-dialog[open]').waitFor();assert.equal(await page.evaluate(async()=>(await (await import('/chat-store.js')).listChats('test@example.com')).filter(c=>c.title.startsWith('Today with Capri')).length),1);await page.getByRole('textbox',{name:'Reply to Capri'}).fill('Looking forward to tea');await page.getByRole('button',{name:'Continue this chat'}).click();await page.waitForFunction(()=>!document.querySelector('#send').disabled);await page.getByText('Tea sounds good.',{exact:true}).waitFor();assert.match(turns[0].history[0].text,/Tea with Capri/);
 await page.locator('#q').fill('Note this for me, buy tea');await page.locator('#send').click();await page.getByText('Saved successfully.',{exact:true}).waitFor();assert.equal(captures[0].message,'Note this for me, buy tea');
 await page.waitForFunction(()=>!document.querySelector('#send').disabled);await page.locator('#q').fill('Remind me about tea in 10 minutes');await page.locator('#send').click();await page.waitForFunction(()=>document.querySelectorAll('.m.model').length>=4);assert.ok(Date.parse(captures[1].due)>Date.now());
 await page.waitForFunction(()=>!document.querySelector('#send').disabled);await page.locator('#q').fill('Remind me about the dentist');await page.locator('#send').click();await page.locator('input[type=datetime-local]').waitFor();await page.getByRole('button',{name:'Cancel',exact:true}).last().click();await page.getByText('No reminder set. Tell me when you’re ready.',{exact:true}).waitFor();assert.equal(captures.length,2);
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
 failSync=true;await page.reload();await page.getByRole('button',{name:'Retry sync'}).waitFor();assert.equal(await page.locator('#capri-loading').isVisible(),true);assert.equal(await page.locator('.agenda-dialog[open]').count(),0);failSync=false;await page.getByRole('button',{name:'Retry sync'}).click();await page.locator('.agenda-dialog[open]').waitFor();await page.screenshot({path:'/tmp/capri-agenda-mobile.png'});assert.equal(await page.locator('#capri-loading').isHidden(),true);
 console.log('PASS: loading, agenda, saved/dismissed history, contextual reply, note capture, timed reminder, missing-time cancellation mobile layout, delayed sync and failed-sync retry.');
}finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
