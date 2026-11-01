const {chromium}=require('C:/Users/Ataraxia/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 let finish,finishStyle,personalityBody;const {defaults,coreModels}=await import('../lib/core-settings.js');let archived=0;
 const server=http.createServer(async(req,res)=>{
 if(req.url.startsWith('/api/')){
  if(req.url==='/api/core-settings'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({defaults,models:coreModels,claudeReady:false}));return;}
  if(req.url==='/api/history-archive'){archived++;res.end(JSON.stringify({ok:true}));return;}
  if(req.url==='/api/personality'){let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);personalityBody=body;const respond=()=>res.end(JSON.stringify({answer:body.action==='ack'?'A curious request.':'Styled answer [S1].',usage:{totalTokenCount:10},sources:[]}));if(body.action==='ack')respond();else finishStyle=respond;return;}

  if(req.url==='/api/chat'){res.setHeader('Content-Type','application/x-ndjson');res.write(JSON.stringify({type:'progress',stage:'usage',usage:{totalTokenCount:123,estimated:true}})+'\n');finish=()=>res.end(JSON.stringify({type:'result',answer:'Done [S1]',sources:[{id:'S1',title:'Fixture',path:'Fixture.md',vault:'Test',excerpt:'RAW_EVIDENCE_NOT_FOR_HANDOFF',read:true,cited:true}],research:{searches:1,planningCalls:1,warnings:[]},usage:{totalTokenCount:456,promptTokenCount:300,candidatesTokenCount:100,thoughtsTokenCount:56,estimated:false}})+'\n');return;}
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify(req.url==='/api/status'?{configured:true,geminiReady:true,models:[{id:'gemini-3.8-flash',name:'Flash'}]}:req.url==='/api/session'?{email:'test@example.com'}:{vaults:[],notes:[]}));return;
 }
 try{const name=req.url==='/'?'index.html':req.url.slice(1);res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(await fs.readFile(path.join(__dirname,'../public',name)));}catch{res.statusCode=404;res.end();}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>!document.querySelector('#out').hidden);
 await page.locator('#aria-settings').click();await page.locator('#core-settings').waitFor();await page.locator('[name="enabled"]').check();await page.locator('[name="personality"]').selectOption('gemini-3.6-flash');await page.locator('#core-settings details').first().locator('summary').click();await page.locator('[name="prompt-personality"]').fill('Be quietly playful.');await page.getByRole('button',{name:'Save settings',exact:true}).click();
 await page.locator('#q').fill('abcdefgh');assert.equal(await page.locator('#token-count').textContent(),'2');
 await page.locator('#send').click();await page.waitForFunction(()=>document.querySelector('#token-count').textContent==='123');finish();
 await page.getByText('Preparing Aria’s response…',{exact:true}).waitFor();assert.doesNotMatch(await page.locator('.m.model .md').textContent(),/Done/);await page.waitForTimeout(100);assert.ok(finishStyle);assert.deepEqual(personalityBody.citationSources,[{id:'S1',title:'Fixture',path:'Fixture.md',vault:'Test'}]);assert.equal(personalityBody.vaultSearches,1);assert.doesNotMatch(JSON.stringify(personalityBody),/RAW_EVIDENCE_NOT_FOR_HANDOFF/);finishStyle();await page.getByRole('button',{name:'Show original',exact:true}).waitFor();assert.match(await page.locator('.m.model .md').textContent(),/Styled answer/);await page.getByRole('button',{name:'Show original',exact:true}).click();assert.match(await page.locator('.m.model .md').textContent(),/Done/);assert.equal(await page.locator('#token-count').textContent(),'466');
 await page.waitForFunction(()=>!document.querySelector('#send').disabled);await page.reload();await page.waitForFunction(()=>document.querySelector('.m.model .token-count')?.textContent==='466');
 assert.ok(archived>0);await page.locator('#aria-settings').click();assert.equal(await page.locator('[name=personality]').inputValue(),'gemini-3.6-flash');assert.equal(await page.locator('[name=prompt-personality]').inputValue(),'Be quietly playful.');await page.locator('[data-close]').click();
 await page.setViewportSize({width:390,height:844});assert.equal(await page.locator('#token-count').evaluate(n=>{const r=n.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth}),true);assert.deepEqual(errors,[]);console.log('Settings save/reload, compact personality handoff/rewrite/toggle, archive dispatch and usage totals passed.');
 }finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
