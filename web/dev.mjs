import http from 'node:http';
import {readFile} from 'node:fs/promises';
import handler from './api/index.js';
const files={'/':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/style.css':['style.css','text/css'],'/notes.html':['notes.html','text/html'],'/notes.js':['notes.js','text/javascript'],'/notes.css':['notes.css','text/css']};
const port=Number(process.env.PORT??3000);
const server=http.createServer(async(req,res)=>{
 if(req.url.startsWith('/api/'))return handler(req,res);
 const file=files[new URL(req.url,'http://localhost').pathname];
 if(!file){res.writeHead(404);return res.end('Not found');}
 res.setHeader('Content-Type',file[1]);res.end(await readFile(new URL(`public/${file[0]}`,import.meta.url)));
});
server.on('error',error=>{
 if(error.code==='EADDRINUSE') console.error(`Port ${port} is already in use. Stop the previous Aria server with Ctrl+C, or run on another port in PowerShell: $env:PORT=3002; npm run dev`);
 else console.error(`Could not start Aria: ${error.code??'unknown error'}`);
 process.exitCode=1;
});
server.listen(port,'127.0.0.1',()=>console.log(`Aria: http://127.0.0.1:${port}`));
