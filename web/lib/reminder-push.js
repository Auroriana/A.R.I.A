import webpush from 'web-push';
import {workerAuthorized} from './quick-api.js';
// Exact vendor hosts only. Do not allow client-supplied arbitrary HTTP targets.
export function validSubscription(value){
 if(!value||typeof value.endpoint!=='string'||value.endpoint.length>2048)return false;
 let url;try{url=new URL(value.endpoint);}catch{return false;}
 if(url.protocol!=='https:'||url.port||url.username||url.password||url.hash)return false;
 if(!['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com'].includes(url.hostname)&&!/^([a-z0-9-]+\.)?notify\.windows\.com$/.test(url.hostname))return false;
 return typeof value.keys?.p256dh==='string'&&/^[A-Za-z0-9_-]{87}$/.test(value.keys.p256dh)&&typeof value.keys?.auth==='string'&&/^[A-Za-z0-9_-]{22}$/.test(value.keys.auth);
}
export async function pushRoutes({req,route,token,sb,send,fail,readBody}){
 if(route==='/api/push-config'&&req.method==='GET'){send(200,{publicKey:process.env.VAPID_PUBLIC_KEY||null});return true;}
 if(route==='/api/push-unsubscribe'&&req.method==='POST'){const {endpoint}=await readBody(req,3000);if(typeof endpoint!=='string'||endpoint.length>2048)throw fail('Invalid endpoint.');await sb('/rest/v1/rpc/aria_push_remove',token,{p_endpoint:endpoint});send(200,{ok:true});return true;}
 if(route!=='/api/push-subscribe')return false;
 if(req.method!=='POST')throw fail('Method not allowed.',405);
 const {subscription}=await readBody(req,5000);if(!validSubscription(subscription))throw fail('Unsupported or invalid push subscription.');
 await sb('/rest/v1/rpc/aria_push_subscribe',token,{p_subscription:subscription});send(200,{ok:true});return true;
}
export async function deliverReminders({rpc,deliver=webpush.sendNotification.bind(webpush),env=process.env}){
 if(!env.VAPID_PUBLIC_KEY||!env.VAPID_PRIVATE_KEY||!env.VAPID_SUBJECT)throw Error('Configure VAPID push keys and contact before starting delivery.');
 const jobs=await rpc('aria_reminder_claim',{});let delivered=0,failed=0;
 for(const job of jobs){
  let body=(job.notification||'Hey, it’s time.')+'\n'+job.text;
  while(Buffer.byteLength(body)>2400)body=body.slice(0,-2);
  const payload=JSON.stringify({id:job.id,body});
  const subscriptions=await rpc('aria_push_list',{});let success=false,retry=false;
  await Promise.all(subscriptions.map(async sub=>{
   if(!validSubscription(sub.subscription))return;
   try{await deliver(sub.subscription,payload,{TTL:86400,urgency:'high',timeout:15000,...(env.HTTPS_PROXY?{proxy:env.HTTPS_PROXY}:{}),vapidDetails:{subject:env.VAPID_SUBJECT,publicKey:env.VAPID_PUBLIC_KEY,privateKey:env.VAPID_PRIVATE_KEY}});success=true;}
   catch(e){if([404,410].includes(e.statusCode))await rpc('aria_push_remove',{p_endpoint:sub.subscription.endpoint});else retry=true;}
  }));
  await rpc('aria_reminder_delivery',{p_id:job.id,p_lease:job.push_lease,p_delivered:success&&!retry});
  if(success)delivered++;else failed++;
 }
 return {delivered,failed};
}
export async function reminderWorker({req,sb,fail,send}){
 if(!workerAuthorized(req.headers.authorization,process.env.REMINDER_WORKER_SECRET))throw fail('Access denied.',403);
 if(!process.env.ARIA_EMAIL||!process.env.ARIA_PASSWORD)throw fail('Reminder worker account is not configured.',503);
 const session=await sb('/auth/v1/token?grant_type=password',null,{email:process.env.ARIA_EMAIL,password:process.env.ARIA_PASSWORD});
 if(session.user?.id!==process.env.OWNER_USER_ID)throw fail('Worker account does not own Capri.',403);
 const result=await deliverReminders({rpc:(name,body)=>sb('/rest/v1/rpc/'+name,session.access_token,body)});send(200,result);
}
