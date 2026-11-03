import {isUuid} from './notes.js';
import {dialogueSamples} from './capri-dialogue.js';
import {turnPassages} from './personality-retrieval.js';
import {settingsOf} from './core-settings.js';
import {portableChat} from '../public/chat-sync.js';

export async function chatRoutes({req,route,token,sb,send,fail,readBody,generate,model}){
  if(route==='/api/chats'&&req.method==='GET'){
    const chats=await sb('/rest/v1/aria_chats?select=id,version&chat=not.is.null&order=updated.desc&limit=10',token);
    send(200,{chats});return true;
  }
  if(route==='/api/chat-get'&&req.method==='GET'){
    const id=new URL(req.url,'http://localhost').searchParams.get('id');
    if(!isUuid(id))throw fail('Invalid conversation.');
    const [row]=await sb('/rest/v1/aria_chats?select=version,chat&id=eq.'+id,token);
    send(200,row??{chat:null});return true;
  }
  if(route==='/api/chat-save'&&req.method==='POST'){
    const {id,version,chat}=await readBody(req,1050000);
    if(!isUuid(id)||!Number.isSafeInteger(version)||version<0)throw fail('Invalid conversation version.');
    if(chat!==null&&(!chat||chat.id!==id||typeof chat.title!=='string'||chat.title.length>200||
      !Number.isSafeInteger(chat.updated)||chat.updated<0||!Array.isArray(chat.messages)||!chat.messages.length||
      chat.messages.some(m=>!m||!['model','user'].includes(m.role)||typeof m.text!=='string'||
        typeof m.id!=='string'||m.id.length>100||typeof m.turn!=='string'||m.turn.length>100||
        !Number.isSafeInteger(m.started)||!Number.isSafeInteger(m.edited))))throw fail('Invalid conversation data.');
    send(200,await sb('/rest/v1/rpc/aria_chat_save',token,{p_id:id,p_version:version,p_chat:chat&&portableChat(chat)}));return true;
  }
  if(route==='/api/welcome'&&['GET','POST'].includes(req.method)){
    const [current]=await sb('/rest/v1/aria_welcome?select=lines,generated_at&limit=1',token);
    if(req.method==='GET'){send(200,current??{lines:[]});return true;}
    const body=await readBody(req,80000);
    if(!body.refresh&&Date.parse(current?.generated_at)>Date.now()-7*86400000){send(200,current);return true;}
    if(!process.env.GEMINI_API_KEY||process.env.GEMINI_FREE_TIER_CONFIRMED!=='true')throw fail('Welcome generation is unavailable.',503);
    const request={systemInstruction:{parts:[{text:settingsOf(body.settings).prompts.personality+
      '\nWrite twelve different short plain-text lines you might say on opening an empty chat. A remark, invitation or question is enough. No claims about seeing the user, knowing what they did or sensing their surroundings. Use the supplied dialogue for rhythm; invent fresh lines. Return JSON {"lines":["..."]}. Each line at most 140 characters.'}]},
      contents:[{role:'user',parts:[{text:JSON.stringify({examples:dialogueSamples('hello surprise'),personalityPassages:turnPassages('greeting arrival casual hello')})}]}],
      generationConfig:{responseMimeType:'application/json',maxOutputTokens:1024}};
    const reserved=await sb('/rest/v1/rpc/aria_reserve',token,{p_model:model,p_tokens:Buffer.byteLength(JSON.stringify(request))+1024});
    if(!reserved)throw fail('Welcome generation quota reached.',429);
    const result=await generate(model,request);
    let parsed;try{parsed=JSON.parse(result.answer);}catch{}
    const lines=Array.isArray(parsed?.lines)?[...new Set(parsed.lines.filter(x=>typeof x==='string').map(x=>x.replace(/[\u0000-\u001f\u007f]|\[[SP]\d+\]/g,' ').trim()).filter(x=>x&&x.length<=140))].slice(0,12):[];
    if(result.truncated||!lines.length)throw fail('Capri did not return usable welcome lines.',502);
    await sb('/rest/v1/rpc/aria_welcome_save',token,{p_lines:lines});
    send(200,{lines,generated_at:new Date().toISOString()});return true;
  }
  return false;
}
