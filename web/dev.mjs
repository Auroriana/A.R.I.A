import http from 'node:http';
import {readFile} from 'node:fs/promises';
import handler from './api/index.js';
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css'};
const port=Number(process.env.PORT??3000);
const server=http.createServer(async(req,res)=>{
 if(req.url.startsWith('/api/'))return handler(req,res);
 let name;
 try{name=decodeURIComponent(new URL(req.url,'http://localhost').pathname.slice(1))||'index.html';}catch{name='';}
 const type=types[name.slice(name.lastIndexOf('.'))];
 if(!type||name.includes('..')||name.includes('\\')){res.writeHead(404);return res.end('Not found');}
 try{res.setHeader('Content-Type',type);res.end(await readFile(new URL(`public/${name}`,import.meta.url)));}
 catch{res.writeHead(404);res.end('Not found');}
});
server.on('error',error=>{
 if(error.code==='EADDRINUSE') console.error(`Port ${port} is already in use. Stop the previous Aria server with Ctrl+C, or run on another port in PowerShell: $env:PORT=3002; npm run dev`);
 else console.error(`Could not start Aria: ${error.code??'unknown error'}`);
 process.exitCode=1;
});
server.listen(port,'127.0.0.1',()=>console.log(`Aria: http://127.0.0.1:${port}`));
