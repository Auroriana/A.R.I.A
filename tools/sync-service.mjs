import {readFile,writeFile,mkdir,open,unlink,realpath} from 'node:fs/promises';
import {watch} from 'node:fs';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {validateSyncConfig} from './sync-config.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),local=path.join(root,'.local');
const configArg=process.argv.indexOf('--config');
const configPath=configArg>=0?path.resolve(process.argv[configArg+1]):path.join(local,'sync.json');
const once=process.argv.includes('--once'),dry=process.argv.includes('--dry-run');
let lock,child,stopped=false,running=false,timer;const watchers=[];
async function cycle(config){
  if(running||stopped)return;running=true;const results=[];
  try{for(const v of config.vaults){if(stopped)break;
    const args=[path.join(root,'tools','sync-vault.mjs'),'--vault',v.localPath,'--cloud-vault',v.cloudName];
    if(!dry)args.push('--apply');if(v.createCloudVault)args.push('--create-vault');
    const code=await new Promise(resolve=>{child=spawn(process.execPath,args,{cwd:root,env:process.env,stdio:'inherit',windowsHide:true});child.once('error',()=>resolve(1));child.once('exit',code=>resolve(code??1));});
    results.push({vault:v.cloudName,ok:code===0});
  }
  await writeFile(path.join(local,'sync-status.json'),JSON.stringify({checkedAt:new Date().toISOString(),dryRun:dry,vaults:results},null,2));
  }finally{running=false;child=null;}
  return results.every(r=>r.ok);
}
async function main(){
  let config=validateSyncConfig(JSON.parse(await readFile(configPath,'utf8')));
  config=validateSyncConfig({...config,vaults:await Promise.all(config.vaults.map(async v=>({...v,localPath:await realpath(v.localPath)})))});
  await mkdir(local,{recursive:true});const lockPath=path.join(local,'sync-service.lock');
  try{lock=await open(lockPath,'wx');}catch(e){if(e.code!=='EEXIST')throw e;
    const pid=Number(await readFile(lockPath,'utf8'));try{process.kill(pid,0);throw new Error('Automatic sync is already running.');}catch(err){if(err.code!=='ESRCH')throw err;}
    await unlink(lockPath);lock=await open(lockPath,'wx');
  }
  await lock.writeFile(String(process.pid));
  try{
    const stop=()=>{stopped=true;clearInterval(timer);watchers.forEach(w=>w.close());child?.kill();};process.once('SIGINT',stop);process.once('SIGTERM',stop);
    if(once){if(!await cycle(config))process.exitCode=1;return;}
    let debounce;
    for(const v of config.vaults){try{const watcher=watch(v.localPath,{recursive:true},(_,name)=>{if(!name||!name.endsWith('.md')||name.split(/[\\/]/).some(s=>s.startsWith('.')))return;clearTimeout(debounce);debounce=setTimeout(()=>cycle(config).catch(e=>console.error(e.message)),1500);});watcher.on('error',()=>console.warn('File watcher stopped; polling still checks the vault.'));watchers.push(watcher);}catch{console.warn('File watcher unavailable; polling still checks the vault.');}}
    await cycle(config);timer=setInterval(()=>cycle(config).catch(e=>console.error(e.message)),config.intervalSeconds*1000);
    await new Promise(resolve=>{process.once('SIGINT',resolve);process.once('SIGTERM',resolve);});clearTimeout(debounce);
  }finally{await lock.close();await unlink(lockPath);}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
