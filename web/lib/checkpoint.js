import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
const key=()=>createHash('sha256').update('aria-research-checkpoint-v1:'+process.env.GEMINI_API_KEY).digest();
export const requestHash=request=>createHash('sha256').update(JSON.stringify(request)).digest('hex');
export function sealCheckpoint(state, owner, request) {
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv);
  const content=Buffer.from(JSON.stringify({state,owner,request,expires:Date.now()+7*86400000}));
  return Buffer.concat([iv,cipher.update(content),cipher.final(),cipher.getAuthTag()]).toString('base64url');
}
export function openCheckpoint(token,owner,request) {
  try{
    if(typeof token!=='string'||token.length>2_000_000)throw new Error();
    const data=Buffer.from(token,'base64url'),cipher=createDecipheriv('aes-256-gcm',key(),data.subarray(0,12));
    cipher.setAuthTag(data.subarray(-16));const payload=JSON.parse(Buffer.concat([cipher.update(data.subarray(12,-16)),cipher.final()]).toString());
    if(payload.owner!==owner||payload.request!==request||payload.expires<Date.now())throw new Error();return payload.state;
  }catch{throw Object.assign(new Error('This research checkpoint expired or does not match this conversation. Start the question again.'),{status:400});}
}
