import {chromium} from 'playwright-core';
import http from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {defaults,coreModels} from '../lib/core-settings.js';
const output=new URL('../../.local/',import.meta.url);await mkdir(output,{recursive:true});
const vault=crypto.randomUUID(),job=crypto.randomUUID(),messages=[],captures=[],turns=[],reminders=[];let seq=0,noteStatus='queued',pageReads=0;
const add=m=>{const old=messages.find(x=>x.id===m.id);if(old)return;messages.push({...m,seq:++seq});};
for(let i=0;i<90;i++){const id='seed-'+i;add({id,turn:id,started:Date.now()-10000000+i*1000,edited:0,role:i%2?'model':'user',text:i%2?'Yeah. One thing at a time, choom.':'Let’s pick this up after the shift.'});}
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');if(url.pathname.startsWith('/api/')){
 let raw='';for await(const c of req)raw+=c;const b=raw?JSON.parse(raw):{};let data={ok:true};
 switch(url.pathname){
 case '/api/status':data={configured:true,geminiReady:true,models:[{id:'gemini-3.5-flash-lite',name:'Flash'}]};break;
 case '/api/session':data={email:'fixture@example.com'};break;
 case '/api/core-settings':data={defaults,models:coreModels};break;
 case '/api/vaults':data={vaults:[{id:vault,name:'Reminders',description:'Dated reminder overviews',allow_auto_file:false}]};break;
 case '/api/notes':data={notes:[{path:'Overviews/2026-11-06.md',title:'Reminders · today',version:1,ai_enabled:true}]};break;
 case '/api/note-read':data={path:b.path,content:'# Reminder overview\n\nSnapshot: 2026-11-06\n\n- Tea',version:1};break;
 case '/api/quick-list':data={notes:[]};break;
 case '/api/welcome':data={lines:['hey. there you are~'],generated_at:new Date().toISOString()};break;
 case '/api/agenda':data={reminders};break;
 case '/api/messages':{pageReads++;let rows;if(url.searchParams.has('after'))rows=messages.filter(m=>m.seq>Number(url.searchParams.get('after')));else rows=messages.filter(m=>!url.searchParams.has('before')||m.seq<Number(url.searchParams.get('before'))).toReversed();data={messages:rows.slice(0,40),hasMore:rows.length>=40};break;}
 case '/api/messages-save':for(const m of b.messages)add(m);data={messages:b.messages.map(m=>({id:m.id,seq:messages.find(x=>x.id===m.id).seq}))};break;
 case '/api/capture':captures.push(b);if(/note/i.test(b.message)){data={kind:'note',job,answer:'Got it, choom. Noting it now.'};}else data={kind:'reminder',answer:'I’ll remind you to stretch.',note:{vault,path:'Overviews/2026-11-06.md',title:'Reminders · today'}};break;
 case '/api/quick-status':data={note:{id:job,status:noteStatus,title:'Transit plan',content:'# Transit plan\n\nLeave twenty minutes earlier.\nCheck the next train before heading out.'}};break;
 case '/api/quick-kick':await new Promise(r=>setTimeout(r,1500));noteStatus='filed';{const id='note:'+job;add({id,turn:id,started:Date.now(),edited:Date.now(),role:'model',text:'Also, finished that note.',event:'note.filed',note:{id:job,vault,path:'Transit plan.md',title:'Transit plan'}});}break;
 case '/api/reminder-overview':data={answer:'Today’s reminders:\n\n- Tea — 16:00',note:{vault,path:'Overviews/2026-11-06.md',title:'Reminders · today'}};break;
 case '/api/personality':turns.push(b);data=b.action==='turn'&&/save(?:d)? in my notes/i.test(b.message)?{route:'vault'}:{route:'reply',answer:'Delta out now, obv.\n\n<capri-message>\n\nCutting it close just means you’re gambling with your job.\n\n<capri-message>\n\nFor twenty extra minutes? It’s just not worth it.',blocks:['Delta out now, obv.','Cutting it close just means you’re gambling with your job.','For twenty extra minutes? It’s just not worth it.'],usage:{totalTokenCount:64}};break;
 case '/api/chat':{
  const sources=[{id:'S1',title:'Transit',vault:'Reminders',path:'Transit.md',excerpt:'Leave twenty minutes early. Check the next train before heading out.',read:true,cited:true},{id:'S2',title:'Shift',vault:'Reminders',path:'Shift.md',excerpt:'The morning shift starts at 09:00. Allow time for the station transfer.',read:true,cited:false},{id:'S3',title:'Older route',vault:'Reminders',path:'Older route.md',excerpt:'An older matched route that was excluded from the context budget.',read:false,cited:false}];
  res.setHeader('Content-Type','application/x-ndjson');res.write(JSON.stringify({type:'progress',stage:'results',notes:sources})+'\n');res.write(JSON.stringify({type:'progress',stage:'evidence',notes:sources})+'\n');await new Promise(r=>setTimeout(r,1800));res.end(JSON.stringify({type:'result',answer:'Leave early. [S1]',sources})+'\n');return;
 }
 }
 res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));return;
 }
 const name=url.pathname==='/'?'index.html':url.pathname.slice(1);if(name.includes('..'))throw Error('Invalid path');const ext=name.split('.').at(-1);res.setHeader('Content-Type',({js:'text/javascript',css:'text/css',avif:'image/avif',png:'image/png',svg:'image/svg+xml'})[ext]||'text/html');res.end(await readFile(new URL('../public/'+name,import.meta.url)));
 }catch(e){res.statusCode=500;res.end(JSON.stringify({error:e.message}));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE',e.message);});
 await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('#capri-loading').waitFor({state:'hidden'});
 assert.equal(await page.locator('.agenda-dialog[open]').count(),0);assert.equal(await page.locator('#hist').isVisible(),false);assert.equal(await page.locator('#tq').isVisible(),false);
 assert.equal(await page.locator('#msgs>.m').count(),40);const initialPages=pageReads;
 await page.locator('#scroll').evaluate(n=>n.scrollTop=0);await page.waitForFunction(()=>document.querySelectorAll('#msgs>.m').length>=80);assert.ok(pageReads>initialPages);
 const send=async text=>{await page.locator('#q').fill(text);await page.locator('#send').click();await page.waitForFunction(()=>!document.querySelector('#send').disabled);};
 await send('Should I leave for the train now?');await page.getByText('Delta out now, obv.',{exact:true}).waitFor();assert.equal(await page.locator('.block-followup').count(),2);assert.equal(turns.length,1);
 await send('Remind me to stretch');await page.getByText('When should I remind you?',{exact:false}).waitFor();assert.equal(captures.length,0);
 await send('in 5 minutes');assert.ok(Date.parse(captures[0].due)>Date.now());assert.equal(await page.locator('#app').evaluate(n=>n.classList.contains('terminals-open')),true);
 await send('Capri note this: Leave twenty minutes earlier.');await send('Really? I know right.');assert.equal(turns.length,2);await page.getByText('Also, finished that note.',{exact:true}).waitFor({timeout:12000});
 await page.locator('#overclock').click();assert.equal(await page.locator('#overclock').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('#overclock').evaluate(n=>n.nextElementSibling.id),'voice');assert.equal(await page.getByRole('button',{name:'SEARCH NOTES',exact:true}).count(),0);
 await page.locator('.terminal-title button[aria-label^="Minimize"]').last().click();assert.ok(await page.locator('.terminal-window.minimized').count());
 await page.locator('.terminal-title button[aria-label^="Minimize"]').last().click();
 const bar=page.locator('.terminal-title').last();const pos=await bar.boundingBox();await page.mouse.move(pos.x+35,pos.y+12);await page.mouse.down();await page.mouse.move(pos.x+70,pos.y+32);await page.mouse.up();
 await page.locator('#q').fill('What did I save in my notes about the morning commute?');await page.locator('#send').click();
 await page.locator('.terminal-window[data-active=true] #capri-face').waitFor({timeout:10000}).catch(async e=>{console.error(await page.locator('#err').textContent(),await page.locator('#terminals').innerText());throw e;});const firstEye=await page.locator('#capri-face').evaluate(n=>n.closest('.terminal-window').querySelector('strong').textContent);
 await page.waitForFunction(first=>document.querySelector('#capri-face').closest('.terminal-window')?.querySelector('strong').textContent!==first,firstEye);await page.waitForFunction(()=>!document.querySelector('#send').disabled);
 assert.equal(await page.locator('.terminal-window[data-state=skipped]').count(),1);assert.ok(await page.locator('.terminal-window[data-state=accessed]').count());
 await page.screenshot({path:new URL('conversation-desktop.png',output).pathname.replace(/^\/(.:)/,'$1')});
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.waitForFunction(()=>document.querySelector('#app>main').getBoundingClientRect().width>=innerWidth-1);
 await page.screenshot({path:new URL('conversation-mobile-overlay.png',output).pathname.replace(/^\/(.:)/,'$1')});
 await page.getByRole('button',{name:'Hide',exact:true}).click();assert.equal(await page.locator('#app').evaluate(n=>n.classList.contains('terminals-open')),false);await page.locator('#pt').click();assert.equal(await page.locator('#app').evaluate(n=>n.classList.contains('terminals-open')),true);
 await page.getByRole('button',{name:'Hide',exact:true}).click();await send('What are today’s reminders?');await page.getByText('Today’s reminders:',{exact:false}).first().waitFor();await page.locator('#pt').click();
 await page.getByRole('button',{name:'Hide',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#terminals').getBoundingClientRect().top>=innerHeight);await page.screenshot({path:new URL('conversation-mobile.png',output).pathname.replace(/^\/(.:)/,'$1')});
 await page.reload();await page.locator('#capri-loading').waitFor({state:'hidden'});await page.getByText('Also, finished that note.',{exact:true}).waitFor();assert.deepEqual(errors,[]);
 await page.evaluate(async()=>{const connect=name=>new Promise((resolve,reject)=>{const r=indexedDB.open(name);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});const old=await connect('aria-conversations');await new Promise((resolve,reject)=>{const tx=old.transaction('chats','readwrite');tx.objectStore('chats').put({key:'fixture@example.com:deleted',owner:'fixture@example.com',id:'deleted',deleted:true});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});old.close();const db=await connect('capri-timeline');await new Promise((resolve,reject)=>{const tx=db.transaction('accounts','readwrite');tx.objectStore('accounts').delete('fixture@example.com');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();});
 await page.reload();await page.locator('#capri-loading').waitFor({state:'hidden'});assert.deepEqual(errors,[]);
 console.log('PASS: pagination, no empty popup, message blocks, reminder clarification, nonblocking note completion, Overclock beside microphone, inferred retrieval, moving eye, read/skipped colors, randomized draggable terminals, mobile overlay/hide, live reminder lookup and persistence.');
}finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
