import http from 'node:http';
import {readFile} from 'node:fs/promises';
import handler from './api/index.js';
const files={'/':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/style.css':['style.css','text/css']};
http.createServer(async(req,res)=>{
 if(req.url.startsWith('/api/'))return handler(req,res);
 const file=files[new URL(req.url,'http://localhost').pathname];
 if(!file){res.writeHead(404);return res.end('Not found');}
 res.setHeader('Content-Type',file[1]);res.end(await readFile(new URL(`public/${file[0]}`,import.meta.url)));
}).listen(Number(process.env.PORT??3000),'127.0.0.1',()=>console.log(`Aria: http://127.0.0.1:${process.env.PORT??3000}`));
