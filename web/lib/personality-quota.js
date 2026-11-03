import {setTimeout as delay} from 'node:timers/promises';
import {estimateText} from '../public/token-usage.js';

export async function withPersonalityQuota(request,{reserve,generate,onWait,signal,deadline,wait=delay}){
 const tokens=estimateText(JSON.stringify(request))+request.generationConfig.maxOutputTokens;
 for(let attempt=0;;attempt++){
   signal?.throwIfAborted();
   if(await reserve(tokens)){
     try{return await generate(request);}
     catch(error){if(error.status!==429)throw error;}
   }
   if(!onWait||attempt||Date.now()+61000>deadline)throw Object.assign(new Error('The personality model is at its request or token limit. Your progress is saved.'),{status:429});
   onWait();
   await wait(61000,undefined,{signal});
 }
}
