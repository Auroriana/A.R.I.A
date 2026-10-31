const {chromium}=require('C:/Users/Ataraxia/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const http=require('node:http');const fs=require('node:fs/promises');const path=require('node:path');const assert=require('node:assert/strict');
(async()=>{
  let finish,submitted;const answer='### Next steps\n**Authenticated**\n- Add vehicle\n  - Confirm VIN\n1. Check billing\n\n| Task | Status |\n| --- | --- |\n| ID card | Pending |\n\n```js\nconst x = "<script>";\n```\n<img src=x onerror="window.pwned=1">\n[unsafe](javascript:alert) [safe](https://example.com)';
  const server=http.createServer(async(req,res)=>{
    if(req.url==='/api/status'){res.end(JSON.stringify({configured:true,geminiReady:true,models:[{id:'gemini-3.8-flash',name:'Gemini 3.8 Flash',purpose:'test',rpm:5,rpd:20}]}));return;}
    if(req.url==='/api/session'){res.end(JSON.stringify({email:'test@example.com'}));return;}
    if(req.url==='/api/vaults'){res.end(JSON.stringify({vaults:[]}));return;}
    if(req.url==='/api/chat'){
      let raw='';for await(const chunk of req)raw+=chunk;submitted=JSON.parse(raw);
      res.setHeader('Content-Type','application/x-ndjson');res.write(JSON.stringify({type:'progress',stage:'results',query:'vehicle addition',notes:[{title:'Adding vehicles',path:'vehicles.md',vault:'Insurance'}]})+'\n');
      res.write(JSON.stringify({type:'progress',stage:'thought-start',callId:1,phase:'planning',round:1,model:'gemini-3.8-flash'})+'\n');
      res.write(JSON.stringify({type:'progress',stage:'thought-summary',callId:1,text:'I will check vehicle requirements. <script>window.pwned=1</script>'})+'\n');
      res.write(JSON.stringify({type:'progress',stage:'thought-end',callId:1,hasSummary:true})+'\n');
      finish=()=>res.end(JSON.stringify({type:'result',answer,sources:[],research:{searches:2,planningCalls:1,warnings:[]}})+'\n');return;
    }
    const name=req.url==='/'?'index.html':req.url.slice(1);
    if(!/^[\w.-]+$/.test(name)){res.statusCode=404;res.end();return;}
    try{res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(await fs.readFile(path.join(__dirname,'../public',name)));}catch{res.statusCode=404;res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
  try{
    browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>document.querySelector('#account').textContent==='test@example.com');
    await page.locator('#concise').check();await page.reload();assert.equal(await page.locator('#concise').isChecked(),true);
    await page.locator('#mode').selectOption('vault');await page.locator('#question').fill('Authenticated - add a car');await page.locator('#send').click();
    await page.getByText('Adding vehicles — Insurance / vehicles.md').waitFor();assert.equal(await page.locator('#send').isDisabled(),true);assert.equal(submitted.concise,true);
    await page.locator('.thought-text').waitFor();assert.match(await page.locator('.thought-text').innerText(),/vehicle requirements/);assert.equal(await page.locator('.thought-text script').count(),0);
    finish();await page.locator('.markdown h3').waitFor();assert.equal(await page.locator('.markdown strong').innerText(),'Authenticated');
    assert.equal(await page.locator('.markdown ul ul li').innerText(),'Confirm VIN');assert.equal(await page.locator('.markdown table').count(),1);assert.equal(await page.locator('.markdown pre code').count(),1);
    assert.equal(await page.locator('.markdown img,.markdown script').count(),0);assert.equal(await page.locator('.markdown a').count(),1);assert.equal(await page.evaluate(()=>window.pwned),undefined);
    assert.equal(await page.locator('.research-activity:not(.thought-summaries)').evaluate(e=>e.open),false);
    assert.equal(await page.locator('.thought-summaries').evaluate(e=>e.open),false);assert.match(await page.locator('.thought-status').textContent(),/complete/);
    await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
    console.log('Live progress before completion, concise preference, Markdown, injection safety and mobile width passed.');
  }finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
