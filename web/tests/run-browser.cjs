const {spawn}=require('node:child_process');
const server=spawn(process.execPath,['dev.mjs'],{env:{...process.env,PORT:'3001'},stdio:['ignore','pipe','inherit'],windowsHide:true});
server.stdout.once('data',()=>{const check=spawn(process.execPath,['tests/browser.cjs'],{stdio:'inherit',windowsHide:true});check.once('exit',code=>{server.kill();process.exitCode=code??1;});});
server.once('error',()=>{process.exitCode=1;});
server.once('exit',code=>{if(code)process.exitCode=code;});
