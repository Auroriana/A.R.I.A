import {portableMessage} from '../public/chat-sync.js';
export async function timelineRoutes({req,route,token,sb,send,fail,readBody}){
 if(!['/api/messages','/api/messages-save'].includes(route))return false;
 const rpc=(name,body)=>sb('/rest/v1/rpc/'+name,token,body);
 if(route==='/api/messages'&&req.method==='GET'){
  const query=new URL(req.url,'http://localhost').searchParams;
  const number=key=>{const raw=query.get(key);if(raw===null)return null;if(!/^\d{1,15}$/.test(raw))throw fail('Invalid message cursor.');return Number(raw);};
  const before=number('before'),after=number('after');if(before!==null&&after!==null)throw fail('Use one message cursor.');
  const rows=await rpc('aria_message_page',{p_before:before,p_after:after,p_limit:40});
  send(200,{messages:rows.map(r=>({...r.message,seq:r.seq})),hasMore:rows.length===40});return true;
 }
 if(route!=='/api/messages-save'||req.method!=='POST')throw fail('Method not allowed.',405);
 const {messages}=await readBody(req,1050000);
 if(!Array.isArray(messages)||!messages.length||messages.length>40||messages.some(m=>!m||!['user','model'].includes(m.role)||typeof m.id!=='string'||m.id.length>100||!m.id||typeof m.turn!=='string'||m.turn.length>100||typeof m.text!=='string'||m.text.length>100000||!Number.isSafeInteger(m.started)||m.started<0||!Number.isSafeInteger(m.edited)||m.edited<0))throw fail('Invalid messages.');
 if(messages.some(m=>m.blocks!==undefined&&(!Array.isArray(m.blocks)||m.blocks.length>16||m.blocks.some(x=>typeof x!=='string')||m.blocks.join('').length>100000)))throw fail('Invalid message blocks.');
 // Reuse the portable field allowlist, without dropping user-only turns.
 const clean=messages.map(portableMessage);
 send(200,{messages:await rpc('aria_message_save',{p_messages:clean})});return true;
}
