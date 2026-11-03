const {chromium}=require('C:/Users/Ataraxia/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {spawn}=require('node:child_process'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const server=spawn(process.execPath,['dev.mjs'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:'0'},stdio:['ignore','pipe','inherit'],windowsHide:true});
 let browser;
 try{
  const line=await new Promise(resolve=>server.stdout.once('data',d=>resolve(String(d))));
  const origin=line.match(/http:\/\/127\.0\.0\.1:\d+/)[0];
  browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));let attempt=0;
  await page.route('**/api/**',async route=>{
   const name=new URL(route.request().url()).pathname;
   if(name==='/api/personality'){
    if(++attempt===1)return route.fulfill({status:429,json:{error:'Fixture quota reached'}});
    const passages=[{path:'Expression / Playful reaction.md'}];
    return route.fulfill({contentType:'application/x-ndjson',body:[{type:'progress',stage:'personality-scan',passages},{type:'result',route:'reply',answer:'wym, you caught me?',expression:'amused_interest',personalityResearch:{passages},usage:{totalTokenCount:234}}].map(x=>JSON.stringify(x)).join('\n')+'\n'});
   }
   const data={'/api/status':{configured:true,geminiReady:true,models:[{id:'gemini-3.5-flash-lite',name:'Flash Lite'}]},'/api/session':{email:'fixture'},'/api/welcome':{lines:['oh hey. there you are~'],generated_at:new Date().toISOString()},'/api/chats':{chats:[]}};
   return route.fulfill({json:data[name]||{notes:[],vaults:[]}});
  });
  await page.goto(origin);await page.locator('#out').waitFor();await page.getByText('oh hey. there you are~').waitFor();
  for(const asset of ['capri-eye.svg','capri-sky.svg'])assert.match((await page.request.get(origin+'/'+asset)).headers()['content-type'],/svg/);
  await page.screenshot({path:path.join(__dirname,'../../.local/capri-sky-desktop.png')});
  await page.locator('#q').fill('How cheeky');await page.locator('#send').click();await page.locator('#resume-chat').click();await page.getByText('wym, you caught me?').waitFor();
  assert.equal(await page.locator('.m.model').count(),1);assert.equal(await page.locator('.usage-details summary').innerText(),'234');
  assert.equal(await page.locator('.personality-research').getAttribute('open'),null);assert.match(await page.locator('#personality-path').innerText(),/Playful reaction/);
  assert.equal(await page.locator('#capri-face').getAttribute('data-expression'),'amused_interest');
  await page.setViewportSize({width:390,height:844});await page.locator('#pt').click();await page.screenshot({path:path.join(__dirname,'../../.local/capri-path-mobile.png')});assert.deepEqual(errors,[]);
  console.log('Sky assets, expression, live PATH, compact usage and one-bubble resume passed.');
 }finally{await browser?.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
