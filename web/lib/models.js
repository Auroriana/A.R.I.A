import {isUuid} from './notes.js';
export const models = [
  {id:'gemini-3.5-flash-lite',name:'Gemini 3.5 Flash Lite',purpose:'Everyday · recommended',rpm:15,rpd:500},
  {id:'gemini-3.1-flash-lite',name:'Gemini 3.1 Flash Lite',purpose:'Everyday · alternative',rpm:15,rpd:500},
  {id:'gemini-3.8-flash',name:'Gemini 3.8 Flash',purpose:'Complex synthesis',rpm:5,rpd:20},
  {id:'gemini-3.6-flash',name:'Gemini 3.6 Flash',purpose:'Compare complex answers',rpm:5,rpd:20},
  {id:'gemini-3-flash',name:'Gemini 3 Flash',purpose:'Compatibility / comparison',rpm:5,rpd:20},
  {id:'gemini-2.5-flash',name:'Gemini 2.5 Flash',purpose:'Earlier-model comparison',rpm:5,rpd:20}
];
export function validateChat(body) {
  const model=models.find(m=>m.id===body.model);
  if(!model) throw new Error('Choose a supported Gemini chat model.');
  if(typeof body.message!=='string'||!body.message.trim()||body.message.length>4000) throw new Error('Enter a question of 1–4,000 characters.');
  if(!['general','vault'].includes(body.mode)) throw new Error('Choose general chat or vault search.');
  const vault=body.vault===undefined||body.vault==='all'?null:body.vault;
  if(vault!==null&&!isUuid(vault)) throw new Error('Choose a valid vault.');
  if(body.concise!==undefined&&typeof body.concise!=='boolean')throw Object.assign(new Error('Concise must be a boolean.'),{status:400});
  const concise=body.concise??false;
  const history=body.history??[];
  if(!Array.isArray(history)||history.length>8||history.some(m=>!['user','model'].includes(m.role)||typeof m.text!=='string'||m.text.length>6000)||JSON.stringify(history).length>18000) throw new Error('Conversation is too long. Start a new chat.');
  return {model:model.id,message:body.message.trim(),mode:body.mode,history,vault,concise};
}
