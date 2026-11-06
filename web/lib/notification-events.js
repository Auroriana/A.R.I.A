// Transport-neutral event contract. In-app messages are persisted before fan-out.
// Native APNs / FCM adapters can consume this envelope without invoking a model.
export function reminderEvent(job){
 let body=(job.notification||'Hey, it’s time.')+'\n'+job.text;
 while(Buffer.byteLength(body)>2400)body=body.slice(0,-2);
 return {version:1,type:'reminder.due',id:job.id,messageId:job.id+'/opening',occurredAt:job.due_at,title:'Capri',body,url:'/?message='+encodeURIComponent(job.id+'/opening')};
}
export async function mapConcurrent(items,limit,work){
 let next=0;await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{for(;;){const i=next++;if(i>=items.length)return;await work(items[i]);}}));
}
