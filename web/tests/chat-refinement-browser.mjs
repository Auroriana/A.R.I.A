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
 case '/api/personality':turns.push(b);data=b.action==='turn'&&/save(?:d)? in my notes/i.test(b.message)?{route:'vault'}:{route:'reply',answer:'Delta out now, obv.\n\n<capri-message>\n\nCutting it close just means you’re gambling with your job.\n\n<capri-message>\n\nFor twenty extra minutes? It’s just not worth it.',blocks:['Delta out now, obv.','Cutting it close just means you’re gambling with your job.','For twenty extra minutes? It’s just not worth it.'],delaySeconds:b.message.includes('delay this')?120:0,usage:{totalTokenCount:64}};if(b.operational){const text=b.answer.includes('Ask what time')?'When, choom?':b.answer.includes('Today')?'Tea at four. That’s your list.':'Got you. I’ll ping you then.';data={answer:text,blocks:[text],usage:{totalTokenCount:32}};}break;
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
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.clock.install();
 await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('#capri-loading').waitFor({state:'hidden'});
 assert.equal(await page.locator('.agenda-dialog').count(),0);
 const send=async text=>{await page.locator('#q').fill(text);await page.locator('#send').click();};
 await send('delay this, I’m in bed');await send('work later again');await send('ugh');assert.equal(turns.length,0);
 await page.clock.fastForward(61000);await page.waitForFunction(()=>document.querySelector('#pause-chat').hidden);await page.waitForTimeout(500);
 assert.equal(turns.length,1);assert.ok(turns[0].message.includes('[Next message]'));assert.equal(await page.locator('.block-followup').count(),0);
 await send('one more thing');await page.clock.fastForward(61000);await page.waitForTimeout(700);assert.equal(turns.length,2);assert.ok(turns[1].pendingReplies.length);assert.equal(await page.locator('.block-followup').count(),0);
 await page.clock.fastForward(61000);await page.waitForFunction(()=>document.querySelectorAll('.block-followup').length===4);
 const bubble=page.locator('.m.model').last();await bubble.hover();await bubble.locator('summary').click();await bubble.getByRole('button',{name:'Reply',exact:true}).click();await send('Yeah, that bit');assert.ok(await page.locator('.reply-quote').count());
 await page.clock.fastForward(61000);await page.waitForTimeout(700);assert.ok(turns.at(-1).message.includes('[Reply to Capri:'));
 await send('Remind me to stretch');await page.clock.fastForward(61000);await page.getByText('When, choom?',{exact:true}).waitFor();
 await send('in 5 minutes');await page.clock.fastForward(61000);await page.getByText('Got you. I’ll ping you then.',{exact:true}).waitFor();assert.equal(captures.length,1);assert.equal(await page.locator('.note-chip').last().getAttribute('aria-label'),'Open reminder note');
 await send('What are today’s reminders?');await page.clock.fastForward(61000);await page.getByText('Tea at four. That’s your list.',{exact:true}).waitFor();
 assert.equal(await page.locator('.personality-research').count(),0);await page.locator('#pt').click();
 await page.screenshot({path:new URL('chat-refined-desktop.png',output).pathname.replace(/^\/(.:)/,'$1')});
 // Same-message sync must preserve the live DOM node.
 await page.evaluate(()=>window.keptBubble=document.querySelector('#msgs>.m'));await page.clock.fastForward(31000);await page.waitForTimeout(500);assert.equal(await page.evaluate(()=>window.keptBubble===document.querySelector('#msgs>.m')),true);
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:new URL('chat-refined-mobile.png',output).pathname.replace(/^\/(.:)/,'$1')});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.reload();await page.locator('#capri-loading').waitFor({state:'hidden'});assert.ok(await page.locator('#msgs>.m').count());assert.deepEqual(errors,[]);console.log('PASS: batching, delayed combined delivery, reply context, reminders, menus, no blink, cache reload, desktop/mobile');
}finally{await browser?.close();server.close();}
