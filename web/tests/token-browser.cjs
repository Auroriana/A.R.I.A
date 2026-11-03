const {chromium}=require('C:/Users/Ataraxia/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 let finish;
 const server=http.createServer(async(req,res)=>{
 if(req.url.startsWith('/api/')){
  if(req.url==='/api/personality'){let raw='';for await(const chunk of req)raw+=chunk;const b=JSON.parse(raw);res.end(JSON.stringify(b.action==='turn'?{route:'reasoning'}:{answer:b.answer}));return;}
  if(req.url==='/api/chat'){res.setHeader('Content-Type','application/x-ndjson');res.write(JSON.stringify({type:'progress',stage:'usage',usage:{totalTokenCount:123,estimated:true}})+'\n');finish=()=>res.end(JSON.stringify({type:'result',answer:'Done',sources:[],usage:{totalTokenCount:456,promptTokenCount:300,candidatesTokenCount:100,thoughtsTokenCount:56,estimated:false,calls:[{model:'fixture-model',role:'reasoning',phase:'answer',totalTokenCount:456,promptTokenCount:300,candidatesTokenCount:100,thoughtsTokenCount:56,latencyMs:20,estimated:false}]}})+'\n');return;}
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify(req.url==='/api/status'?{configured:true,geminiReady:true,models:[{id:'gemini-3.8-flash',name:'Flash'}]}:req.url==='/api/session'?{email:'test@example.com'}:{vaults:[],notes:[]}));return;
 }
 try{const name=req.url==='/'?'index.html':req.url.slice(1);res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(await fs.readFile(path.join(__dirname,'../public',name)));}catch{res.statusCode=404;res.end();}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>!document.querySelector('#out').hidden);
 await page.locator('#q').fill('abcdefgh');assert.equal(await page.locator('#token-count').textContent(),'2');
 await page.locator('#send').click();await page.waitForFunction(()=>document.querySelector('#token-count').textContent==='123');finish();
 await page.waitForFunction(()=>document.querySelector('#token-count').textContent==='456');assert.match(await page.locator('#token-count').getAttribute('title'),/Thinking: 56/);
 await page.waitForFunction(()=>!document.querySelector('#send').disabled);await page.reload();await page.locator('#chat-history button[title="abcdefgh"]').waitFor();assert.equal(await page.locator('.m').count(),0);await page.locator('#chat-history button[title="abcdefgh"]').click();await page.waitForFunction(()=>document.querySelector('.m.model .token-count')?.textContent==='456');
 assert.match(await page.locator('.m.model .usage-details summary').textContent(),/^456$/);await page.locator('.m.model .usage-details summary').click();assert.match(await page.locator('.m.model .usage-details pre').textContent(),/reasoning \/ answer/);
 await page.setViewportSize({width:390,height:844});if(!await page.locator('#app').evaluate(n=>n.classList.contains('hc')))await page.locator('#ht').click();await page.waitForFunction(()=>{const n=document.querySelector('.usage-details'),r=n.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&n.scrollWidth<=n.clientWidth});assert.equal(await page.locator('#token-count').evaluate(n=>{const r=n.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth}),true);assert.equal(await page.locator('.usage-details').evaluate(n=>{const r=n.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&n.scrollWidth<=n.clientWidth}),true);await page.screenshot({path:path.join(__dirname,'../../reports/token-usage-mobile.png'),fullPage:true});assert.deepEqual(errors,[]);console.log('Numeric draft, live, completed, persisted and mobile token display passed.');
 }finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
