const {chromium}=require('C:/Users/Ataraxia/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
  const vault='a81a0000-0000-4000-8000-0000000000f1';let submitted=[],saved=[],chatStep=0,interrupted=false;
  const procedure='---\nai_enabled: true\n---\n\n# Reinstatement\n\nCheck for reason for cancellation.\n\n1. Is the customer’s state Florida (FL) or Virginia (VA)?\n   1. If yes\n      1. <span style="color: red">Stop.</span> Transfer to licensed. Follow [[Policies/Transfer to Licensed|Transfer to Licensed]].\n   2. If no\n      1. Continue to the next step.\n\n## Non-payment\n\n1. Check the **payment date**.\n2. “I can help you review the next steps.”\n\n## Customer requested\n\n1. Review the cancellation request.\n';
  const docs=new Map([['00 Inbox/Reinstatement.md',{content:procedure,version:1}],['Policies/Transfer to Licensed.md',{content:'# Transfer to Licensed\n\n## Transfer\n1. Confirm the state.\n2. “Let me connect you with a licensed representative.”',version:1}],['Start Here.md',{content:'# Start Here\n[[00 Inbox/Reinstatement]]',version:1}],['50 Maps/Home.md',{content:'# Home',version:1}]]);
  const {extractLinks,aliasesOf}=await import('../public/note-model.js');
  const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url,'http://localhost');let body; if(req.method==='POST'){let raw='';for await(const c of req)raw+=c;body=JSON.parse(raw);}
    const json=(v,status=200)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(v));};
    if(url.pathname==='/api/status')return json({configured:true,geminiReady:true,models:[{id:'gemini-3.5-flash-lite',name:'Gemini 3.5 Flash Lite',rpm:15,rpd:500}]});
    if(url.pathname==='/api/session')return json({email:'test@example.com'});
    if(url.pathname==='/api/vaults')return json({vaults:[{id:vault,name:'Aria Knowledge'}]});
    if(url.pathname==='/api/notes')return json({notes:[...docs].map(([path,n])=>({path,version:n.version,ai_enabled:true,aliases:aliasesOf(n.content),references:extractLinks(n.content)}))});
    if(url.pathname==='/api/note-read')return docs.has(body.path)?json({path:body.path,...docs.get(body.path)}):json({error:'Note not found'},404);
    if(url.pathname==='/api/note'){
      const old=docs.get(body.path);if(old&&old.version!==body.baseVersion)return json({error:'This note changed elsewhere. Your text is preserved.'},409);
      docs.set(body.path,{content:body.content,version:(old?.version??0)+1});saved.push(body);return json({version:docs.get(body.path).version,ai_enabled:true});
    }
    if(url.pathname==='/api/note-format')return json({layout:{blocks:[{line:2,kind:'heading',level:1}],spans:[]}});
    if(url.pathname==='/api/chat'){
      submitted.push(body);chatStep++;
      if(body.message==='Resume test'&&body.continuation&&!interrupted){interrupted=true;return json({error:'The connection was interrupted.'},503);}
      res.setHeader('Content-Type','application/x-ndjson');res.write(JSON.stringify({type:'progress',stage:'search',query:body.message})+'\n');
      res.write(JSON.stringify({type:'progress',stage:'results',notes:[{title:'Reinstatement',path:'00 Inbox/Reinstatement.md',vault:'Aria Knowledge'}]})+'\n');
      if(body.mode==='vault'&&!body.continuation)return res.end(JSON.stringify({type:'result',continuation:'checkpoint-fixture',research:{searches:1,planningCalls:0}})+'\n');
      return res.end(JSON.stringify({type:'result',answer:'**Check the state.** Transfer if required [S1].\n\n<img src=x onerror="window.pwned=1">',sources:[{id:'S1',title:'Reinstatement',path:'00 Inbox/Reinstatement.md',vault:'Aria Knowledge',excerpt:procedure}],research:{searches:2,planningCalls:1,warnings:[]}})+'\n');
    }
    const name=url.pathname==='/'?'index.html':url.pathname.slice(1);if(!/^[\w.-]+$/.test(name))return json({},404);
    try{res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(await fs.readFile(path.join(__dirname,'../public',name)));}catch{return json({},404);}
  });
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));let browser;
  try{
    browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(15000);
    const origin=`http://127.0.0.1:${server.address().port}`;await page.goto(origin+'/#notes');await page.locator('#nl [title="00 Inbox"]').waitFor();
    assert.equal(await page.locator('#nl').innerText().then(x=>x.includes('.md')),false);
    const folder=page.locator('#nl [title="00 Inbox"]');await folder.click();await page.locator('#nl [title="00 Inbox/Reinstatement.md"]').click();
    await page.locator('#note-rendered h1').waitFor();assert.equal(await page.locator('#note-rendered h1').innerText(),'Reinstatement');
    const yes=page.locator('#note-rendered summary').filter({hasText:/^If yes$/});await yes.waitFor();assert.equal(await yes.locator('..').evaluate(n=>n.open),false);await yes.click();
    assert.equal(await page.locator('#note-rendered span[style*="color"]').innerText(),'Stop.');assert.equal(await page.locator('#note-rendered .chat-example').count(),1);
    assert.match(await page.locator('#note-refs').innerText(),/References:.*Transfer to Licensed/s);
    await page.locator('#note-refs a').first().click({modifiers:['Control']});await page.waitForFunction(()=>document.querySelectorAll('.note-tab').length===2);
    await page.locator('.note-tab [role=tab]').first().click();await page.getByRole('button',{name:'Edit',exact:true}).click();
    const original=await page.locator('#ed').inputValue();await page.locator('#ed').fill(original+'\nDraft survives tabs.');
    await page.locator('.note-tab [role=tab]').nth(1).click();await page.locator('.note-tab [role=tab]').first().click();assert.match(await page.locator('#ed').inputValue(),/Draft survives tabs/);
    await page.locator('#sv').click();await page.waitForFunction(()=>document.querySelector('#sv').disabled);assert.match(saved[0].content,/Draft survives tabs/);
    await page.getByRole('button',{name:'Read',exact:true}).click();await page.locator('#note-rendered summary').filter({hasText:/^If yes$/}).click();
    await fs.mkdir(path.join(__dirname,'../../reports'),{recursive:true});await page.screenshot({path:path.join(__dirname,'../../reports/notes-desktop.png'),fullPage:true});
    console.log('Notes tree, tabs, drafts, read view passed.');
    await page.reload();await page.locator('#note-rendered h1').waitFor();assert.equal(await page.locator('.note-tab').count(),2);
    await page.locator('#tc').click();await page.locator('#mv').click();await page.locator('#q').fill('Customer is in Florida.');await page.locator('#send').click();await page.waitForFunction(()=>!document.querySelector('#send').disabled);
    assert.equal(submitted.length,2);assert.equal(submitted[1].continuation,'checkpoint-fixture');
    await page.locator('.c').first().click();assert.equal(await page.locator('.src .note-fold').count()>0,true);assert.equal(await page.locator('.src .chat-example').count(),1);assert.equal(await page.locator('.md img,.md script').count(),0);
    await page.locator('#q').fill('What should I do next?');await page.locator('#send').click();await page.waitForFunction(()=>!document.querySelector('#send').disabled);assert.ok(submitted.at(-1).history.some(m=>m.text.includes('Customer is in Florida')));
    console.log('Chat checkpoints, references and memory passed.');
    await page.locator('#new-chat').click();await page.locator('#q').fill('Resume test');await page.locator('#send').click();await page.locator('#resume-chat').waitFor();await page.reload();await page.locator('#resume-chat').waitFor();await page.locator('#resume-chat').click();await page.waitForFunction(()=>!document.querySelector('#send').disabled);assert.equal(await page.locator('#resume-chat').isHidden(),true);
    const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=','base64');
    await page.locator('#new-chat').click();await page.locator('#file').setInputFiles({name:'screenshot.png',mimeType:'image/png',buffer:png});await page.locator('.at').waitFor();await page.locator('#q').fill('Read screenshot');await page.locator('#send').click();await page.waitForFunction(()=>!document.querySelector('#send').disabled);assert.equal(submitted.at(-1).files[0].mime,'image/png');assert.equal(submitted.at(-1).files[0].data,png.toString('base64'));
    for(let i=0;i<9;i++){await page.locator('#new-chat').click();await page.locator('#q').fill('Chat '+i);await page.locator('#send').click();await page.waitForFunction(()=>!document.querySelector('#send').disabled);}
    assert.equal(await page.locator('#chat-history .hist-row').count(),10);assert.equal((await page.locator('#chat-history').innerText()).includes('Customer is in Florida'),false);
    await page.locator('#tn').click();await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:path.join(__dirname,'../../reports/notes-mobile.png'),fullPage:true});
    await page.goto(origin+'/import.html');await page.locator('#vault option').waitFor({state:'attached'});
    await page.locator('#paste').evaluate(n=>{const d=new DataTransfer();d.setData('text/plain','Stop.\nKeep every word.');d.setData('text/html','<p><b style="color:red">Stop.</b></p><p>Keep every word.</p>');n.dispatchEvent(new ClipboardEvent('paste',{clipboardData:d,bubbles:true,cancelable:true}));});
    await page.locator('#title').fill('Rich import');await page.locator('#preview').click();await page.locator('#formatted-preview strong').waitFor();assert.match(await page.locator('#formatted-preview').innerText(),/Stop\.\s+Keep every word/);
    await page.locator('#import').click();await page.locator('#done').waitFor();const imported=docs.get('00 Inbox/Rich import.md').content;assert.ok(imported.endsWith('Stop.\nKeep every word.'));assert.match(imported,/aria_format:/);
    assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>window.pwned),undefined);
    console.log('PASS: tree, tabs, drafts, folding, links, rich import, matching citations, research resume, memory, 10-chat retention, screenshots, mobile, XSS.');
  }finally{await browser?.close();server.closeAllConnections();await new Promise(ok=>server.close(ok));}
})().catch(e=>{console.error(e);process.exitCode=1;});
