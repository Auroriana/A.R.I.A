// Run from the repo root: node web/tests/quick-browser.cjs
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/Ataraxia/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const vault='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333',jobs=new Map(),files=new Map(),original='Alice owes 42.50, due November 3.\n<script>window.pwned=1</script>';
 for(const p of ['Projects/Seed.md','Other/Seed.md','Occupied/Follow up.md'])files.set(other+'/'+p,{path:p,content:'# Seed',version:1,ai_enabled:false});
 let loseResponse=true,allow=false,toggles=0;
 const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');let body={};if(req.method==='POST'){let raw='';for await(const c of req)raw+=c;body=JSON.parse(raw);}
  const json=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
  if(url.pathname==='/api/status')return json({configured:true,geminiReady:true,models:[{id:'gemini-3.5-flash-lite',name:'Flash Lite',rpm:15,rpd:500}]});
  if(url.pathname==='/api/session')return json({email:'test@example.com'});
  if(url.pathname==='/api/vaults')return json({vaults:[{id:vault,name:'Ideas',description:'Ideas and reminders',allow_auto_file:allow},{id:other,name:'Work'}]});
  if(url.pathname==='/api/notes')return json({notes:[...files].filter(([k])=>k.startsWith(url.searchParams.get('vault')+'/')).map(([,v])=>v)});
  if(url.pathname==='/api/note-read')return files.has(body.vault+'/'+body.path)?json(files.get(body.vault+'/'+body.path)):json({error:'Missing'},404);
  if(url.pathname==='/api/note-move'){
   const key=body.vault+'/'+body.path,to=body.toVault+'/'+body.toPath,n=files.get(key);
   if(!n||n.version!==body.baseVersion)return json({error:'Note changed elsewhere.'},409);
   if(files.has(to)&&to!==key)return json({error:'That destination already has this filename.'},409);
   files.delete(key);Object.assign(n,{path:body.toPath,version:n.version+1});files.set(to,n);
   for(const job of jobs.values())if(job.vault_id===body.vault&&job.path===body.path)Object.assign(job,{path:body.toPath,vault_id:body.toVault,vault_name:body.toVault===other?'Work':'Ideas',version:n.version});
   return json({ok:true,path:body.toPath,vault:body.toVault,version:n.version});
  }
  if(url.pathname==='/api/notes-stamp')return json({stamp:''});
  if(url.pathname==='/api/quick-list')return json({notes:[...jobs.values()]});
  if(url.pathname==='/api/quick-enqueue'){
   if(!jobs.has(body.key))jobs.set(body.key,{id:body.key,text:body.text,mode:body.mode,status:'queued',created_at:new Date().toISOString(),next_attempt_at:new Date().toISOString()});
   if(loseResponse)return json({error:'Simulated lost acknowledgement'},503);
   return json({ok:true,id:body.key});
  }
  if(url.pathname==='/api/quick-kick'){
   for(const n of jobs.values())if(n.status==='queued'){Object.assign(n,{status:'filed',title:'Follow up',path:'Follow up.md',vault_id:vault,vault_name:'Ideas',version:1,ai_enabled:false,confidence:.95});files.set(vault+'/Follow up.md',{path:'Follow up.md',content:'# Follow up\n'+n.text,version:1,ai_enabled:false});}
   return json({filed:jobs.size});
  }
  if(url.pathname==='/api/quick-ai'){toggles++;return json({error:'This note changed elsewhere. Refresh before changing AI search.'},409);}
  if(url.pathname==='/api/vault-update')return json({ok:true});
  if(url.pathname==='/api/vault-quick'){allow=body.allow;return json({ok:true});}
  if(url.pathname.startsWith('/api/'))return json({error:'Unexpected '+url.pathname},404);
  const name=url.pathname==='/'?'index.html':url.pathname.slice(1);if(!/^[\w.-]+$/.test(name))return json({},404);
  try{res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(await fs.readFile(path.join(__dirname,'../public',name)));}catch{json({},404);}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/#quick`);
  await page.waitForSelector('#quick:not([hidden])');
  await page.fill('#quick-text',original);await page.click('.quick-controls .sw');await page.click('#quick-send');
  await page.waitForFunction(()=>document.querySelector('#quick-status').textContent.includes('unsent text'));
  assert.equal(await page.inputValue('#quick-text'),'');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('aria.quick.outbox.test@example.com')).length),1);
  assert.equal(jobs.size,1);assert.equal([...jobs.values()][0].mode,'detailed');
  // Reload after the server accepted the first send but its acknowledgement was lost.
  loseResponse=false;await page.reload();
  await page.waitForSelector('.quick-pill.filed');
  assert.equal(jobs.size,1);assert.equal([...jobs.values()][0].text,original);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('aria.quick.outbox.test@example.com')).length),0);
  assert.equal(await page.evaluate(()=>window.pwned),undefined);
  const toggle=page.locator('.quick-actions input');assert.equal(await toggle.isChecked(),false);await page.click('.quick-actions .sw');
  await page.waitForFunction(()=>document.querySelector('#quick-status').textContent.includes('changed elsewhere'));
  assert.equal(await toggle.isChecked(),false);assert.equal(toggles,1);
  await page.click('#tn');await page.click('#vault-desc');await page.check('#vdquick');await page.click('#vdok');
  await page.waitForFunction(()=>!document.querySelector('#vdlg').open);assert.equal(allow,true);
  await page.click('#tq');await page.screenshot({path:path.join(__dirname,'../../.local/quick-desktop.png'),fullPage:true});
  await page.locator('.quick-item').click({button:'right'});await page.getByRole('menuitem',{name:'Move to…'}).click();
  await page.locator('.move-dialog select').selectOption(other);
  await page.locator('.move-folders button').getByText('Projects',{exact:true}).click();await page.click('.move-submit');
  await page.waitForFunction(()=>!document.querySelector('.move-dialog').open&&document.querySelector('.quick-item small').textContent.includes('Work / Projects/Follow up.md'));
  assert.ok(!files.has(vault+'/Follow up.md'));assert.ok(files.has(other+'/Projects/Follow up.md'));
  await page.click('#tn');
  const note=()=>page.locator('#nl .tree-row[title="Projects/Follow up.md"]');
  await note().waitFor();assert.equal(await note().getAttribute('aria-current'),'true');
  await note().dragTo(page.locator('#nl .tree-row[title="Other"]'));
  await page.locator('#nl .tree-row[title="Other/Follow up.md"][aria-current=true]').waitFor();
  assert.ok(!files.has(other+'/Projects/Follow up.md'));assert.ok(files.has(other+'/Other/Follow up.md'));
  await page.locator('#nl .tree-row[title="Other/Follow up.md"]').click({button:'right'});await page.getByRole('menuitem',{name:'Move to…'}).click();
  await page.locator('.move-folders button').getByText('Occupied',{exact:true}).click();await page.click('.move-submit');
  await page.waitForFunction(()=>document.querySelector('.move-error').textContent.includes('already has'));
  assert.ok(files.has(other+'/Other/Follow up.md'));await page.click('.move-cancel');
  await page.click('#explorer-toggle');assert.equal(await page.locator('#explorer-toggle').getAttribute('aria-expanded'),'false');
  await page.click('#explorer-toggle');assert.equal(await page.locator('#explorer-toggle').getAttribute('aria-expanded'),'true');
  await page.locator('.explorer-resize').focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('.explorer-resize').getAttribute('aria-valuenow'),'280');
  await page.click('#nc');await page.click('#ne');assert.equal(await page.locator('#nl .tree-row[title="Projects"]').getAttribute('aria-expanded'),'true');
  await page.getByRole('button',{name:'Edit',exact:true}).click();await page.fill('#ed','# My unsaved draft');
  await page.locator('#nl .tree-row[title="Other/Follow up.md"]').click({button:'right'});await page.getByRole('menuitem',{name:'Move to…'}).click();
  await page.waitForFunction(()=>document.querySelector('#ns').textContent.includes('Save this note'));
  assert.equal(await page.inputValue('#ed'),'# My unsaved draft');assert.equal(await page.locator('.move-dialog').isVisible(),false);
  await page.click('#tq');
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:path.join(__dirname,'../../.local/quick-mobile.png'),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'No mobile horizontal overflow');
  assert.deepEqual(errors,[]);console.log('Quick Note browser checks passed: outbox, AI conflict, cross-vault move, folder drop/selection, collision, unsaved draft, explorer collapse/resize/expand, desktop/mobile.');
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
