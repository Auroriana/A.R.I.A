import {gemini} from './providers.js';
export async function webSearch(query,{reserve,generate=gemini}){
 if(typeof query!=='string'||!query.trim()||query.length>300)throw Object.assign(new Error('Invalid web query.'),{status:400});
 const model='gemini-2.5-flash';
 await reserve(model,4096);
 const result=await generate(model,{contents:[{role:'user',parts:[{text:'Search the public web for this topic. Give a short factual briefing with sources. Separate synopsis/facts from reviews and subjective opinions. Do not invent having personally read or experienced the work. Topic: '+query}]}],tools:[{google_search:{}}],generationConfig:{maxOutputTokens:2048}});
 const meta=result.grounding,sources=(meta?.groundingChunks??[]).filter(c=>/^https:\/\//.test(c.web?.uri??'')).map(c=>({title:c.web.title||'Web source',url:c.web.uri}));
 if(!sources.length)throw Object.assign(new Error('Web search returned no verifiable sources. Try a more specific query.'),{status:502});
 return {answer:result.answer,sources,entryPoint:meta.searchEntryPoint?.renderedContent||'',usage:result.usage};
}
