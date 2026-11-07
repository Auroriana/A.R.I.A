export async function readChatStream(response,onProgress){
  if(!response.ok||!response.headers.get('content-type')?.includes('application/x-ndjson')){
    let data;try{data=await response.json();}catch{throw new Error(`The server returned an unreadable response (HTTP ${response.status}). Please try again.`);}
    if(!response.ok)throw Object.assign(new Error(data.error??'Request failed.'),{status:response.status});return data;
  }
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',result;
  function consume(line){
    if(!line.trim())return;const event=JSON.parse(line);
    if(event.type==='error')throw Object.assign(new Error(event.error),{status:event.status});
    if(event.type==='progress')onProgress(event);
    if(event.type==='result')result=event;
  }
  try{
    while(true){const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let index;while((index=buffer.indexOf('\n'))>=0){consume(buffer.slice(0,index));buffer=buffer.slice(index+1);}}
    buffer+=decoder.decode();consume(buffer);
    if(!result)throw new Error('The connection ended before Capri finished. Please try again.');return result;
  }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
