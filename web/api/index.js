import {models,validateChat} from '../lib/models.js';
import {noteRoutes} from '../lib/notes-api.js';
import {gemini,geminiStream,embed} from '../lib/providers.js';
import {describeVault} from '../lib/vault-describe.js';
import {researchVault,researchStep,createResearchState,CONCISE_INSTRUCTION,keywordQuery} from '../lib/rag.js';
import {sealCheckpoint,openCheckpoint,requestHash} from '../lib/checkpoint.js';
import {proposeLayout} from '../lib/note-format.js';
import {cleanContent,isUuid} from '../lib/notes.js';
// Routing and gap-checking never touch the selected (possibly 5/min, 20/day) model.
const PLANNER_MODEL='gemini-3.5-flash-lite';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const configured=()=>['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','OWNER_USER_ID'].every(k=>process.env[k]);
async function sb(route,token,body,method=body?'POST':'GET') {
  const response=await fetch(`${process.env.SUPABASE_URL}${route}`,{method,headers:{apikey:process.env.SUPABASE_PUBLISHABLE_KEY,...(token?{Authorization:`Bearer ${token}`} : {}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
  if(!response.ok) throw fail(route.includes('/auth/')?'Sign-in failed or session expired.':'Database request failed. Apply the Supabase migration and check access policies.',route.includes('/auth/')?401:503);
  return response.status===204?null:response.json();
}
function cookie(req){return (req.headers.cookie??'').split(';').map(v=>v.trim()).find(v=>v.startsWith('aria_session='))?.slice(13);}
function setCookie(res,value,age){res.setHeader('Set-Cookie',`aria_session=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${process.env.VERCEL?'; Secure':''}`);}
async function readBody(req,limit=40000){
  if(req.body) {if(Buffer.byteLength(JSON.stringify(req.body))>limit)throw fail('Request too large.',413);return typeof req.body==='string'?JSON.parse(req.body):req.body;}
  let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>limit)throw fail('Request too large.',413);}return raw?JSON.parse(raw):{};
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
  let streaming=false,heartbeat,deadlineTimer;const generationController=new AbortController();
  const disconnect=()=>{if(!res.writableEnded)generationController.abort('disconnected');};
  const emit=(type,data)=>{if(!res.destroyed&&!res.writableEnded)res.write(JSON.stringify({type,...data})+'\n');};
  const send=(status,data)=>{if(streaming){emit(data.error?'error':'result',data);res.end();}else{res.statusCode=status;res.end(JSON.stringify(data));}};
  try{
    const route=new URL(req.url,'http://localhost').pathname.replace(/\/$/,'');
    if(req.method==='GET'&&route==='/api/status')return send(200,{configured:!!configured(),geminiReady:!!process.env.GEMINI_API_KEY&&process.env.GEMINI_FREE_TIER_CONFIRMED==='true',models,embedding:{id:'gemini-embedding-2',enabled:process.env.ENABLE_SEMANTIC_SEARCH==='true',rpm:100,rpd:1000,tpm:30000},deepseekEnabled:false});
    if(!configured())throw fail('Setup is incomplete. Add the Supabase environment variables in Vercel.',503);
    if(req.method==='POST'){
      if(req.headers['content-type']?.split(';')[0]!=='application/json')throw fail('JSON required.',415);
      const origin=req.headers.origin;
      if(origin&&new URL(origin).host!==req.headers.host)throw fail('Origin not allowed.',403);
    }
    if(req.method==='POST'&&route==='/api/login'){
      const body=await readBody(req);
      if(typeof body.email!=='string'||typeof body.password!=='string'||body.email.length>320||body.password.length>1024)throw fail('Email and password required.');
      const session=await sb('/auth/v1/token?grant_type=password',null,{email:body.email,password:body.password});
      if(session.user?.id!==process.env.OWNER_USER_ID)throw fail('This account does not have access to Aria.',403);
      setCookie(res,session.access_token,Math.min(session.expires_in??3600,3600));return send(200,{email:session.user.email});
    }
    if(req.method==='POST'&&route==='/api/logout'){setCookie(res,'',0);return send(200,{ok:true});}
    const token=cookie(req);if(!token)throw fail('Sign in to continue.',401);
    const user=await sb('/auth/v1/user',token);
    if(user.id!==process.env.OWNER_USER_ID)throw fail('Access denied.',403);
    if(req.method==='GET'&&route==='/api/session')return send(200,{email:user.email});
    if(await noteRoutes({req,route,url:new URL(req.url,'http://localhost'),token,sb,fail,send}))return;
    if(req.method==='GET'&&route==='/api/notes-stamp'){
      const v=new URL(req.url,'http://localhost').searchParams.get('vault');
      if(!isUuid(v))throw fail('Choose a vault.');
      const rows=await sb(`/rest/v1/aria_notes?select=updated_at&vault_id=eq.${v.toLowerCase()}&order=updated_at.desc&limit=1`,token);
      return send(200,{stamp:rows[0]?.updated_at??''});
    }
    if(req.method==='POST'&&route==='/api/note-format'){
      const body=await readBody(req,420000),content=cleanContent(body.content);
      if(!models.some(m=>m.id===body.model))throw fail('Choose a supported model.');
      if(!process.env.GEMINI_API_KEY||process.env.GEMINI_FREE_TIER_CONFIRMED!=='true')throw fail('Gemini is not enabled.',503);
      const layout=await proposeLayout(content,async request=>{
        const ok=await sb('/rest/v1/rpc/aria_reserve',token,{p_model:body.model,p_tokens:Buffer.byteLength(JSON.stringify(request))+8192});
        if(!ok)throw fail('Model quota reached. Your text has not changed.',429);
        return gemini(body.model,request);
      });
      return send(200,{layout});
    }
    if(req.method==='POST'&&route==='/api/vault-describe'){
      const body=await readBody(req),vault=isUuid(body.vault)?body.vault.toLowerCase():null;
      if(!vault)throw fail('Choose a vault.');
      if(!models.some(m=>m.id===body.model))throw fail('Choose a supported model.');
      if(!process.env.GEMINI_API_KEY||process.env.GEMINI_FREE_TIER_CONFIRMED!=='true')throw fail('Gemini is not enabled.',503);
      const vaults=await sb('/rest/v1/aria_vaults?select=id,name&order=created_at.asc',token),mine=vaults.find(v=>v.id===vault);
      if(!mine)throw fail('Vault not found.',404);
      // Only notes with AI search on are ever sent, and only their paths and headings.
      const notes=await sb(`/rest/v1/aria_notes?select=path&deleted=eq.false&ai_enabled=eq.true&vault_id=eq.${vault}&order=path.asc&limit=400`,token);
      const chunks=await sb(`/rest/v1/aria_chunks?select=title&vault_id=eq.${vault}&order=title.asc&limit=300`,token);
      const description=await describeVault({vaultName:mine.name,otherVaults:vaults.filter(v=>v.id!==vault).map(v=>v.name),paths:notes.map(n=>n.path),headings:[...new Set(chunks.map(c=>c.title))]},async request=>{
        if(body.model==='gemini-3.8-flash')request={...request,generationConfig:{...request.generationConfig,maxOutputTokens:8192,thinkingConfig:{thinkingLevel:'low'}}};
        const ok=await sb('/rest/v1/rpc/aria_reserve',token,{p_model:body.model,p_tokens:Buffer.byteLength(JSON.stringify(request))+request.generationConfig.maxOutputTokens});
        if(!ok)throw fail('Model quota reached. Nothing was changed.',429);
        return gemini(body.model,request);
      });
      return send(200,{description});
    }
    if(req.method!=='POST'||route!=='/api/chat')throw fail('Not found.',404);
    const incoming=await readBody(req,4_200_000);
    const validated=validateChat(incoming);
    const {model,message,mode,history,vault,concise,files}=validated;
    if(!process.env.GEMINI_API_KEY||process.env.GEMINI_FREE_TIER_CONFIRMED!=='true')throw fail('Gemini is not enabled. Configure a Free-tier API key and confirm its billing tier.',503);
    if(req.headers.accept?.includes('application/x-ndjson')){
      streaming=true;res.setHeader('Content-Type','application/x-ndjson');res.setHeader('X-Accel-Buffering','no');res.flushHeaders?.();
      heartbeat=setInterval(()=>emit('heartbeat',{}),10000);
    }
    if(streaming){deadlineTimer=setTimeout(()=>generationController.abort('deadline'),270000);res.on?.('close',disconnect);}
    let generationId=0;
    const onProgress=event=>{if(streaming)emit('progress',event);};
    const reserve=async(id,tokens)=>{const ok=await sb('/rest/v1/rpc/aria_reserve',token,{p_model:id,p_tokens:tokens});if(!ok)throw fail('Model quota reservation limit reached. Wait before trying again. No automatic retries or paid fallback.',429);};
    const generate=async (request,{phase='answer',round}={})=>{
      // Routing and planning only emit short JSON, so they run on the light model (own quota, no deep thinking).
      const use=phase==='planning'||phase==='route'?PLANNER_MODEL:model;
      if(use==='gemini-3.8-flash')request={...request,generationConfig:{...request.generationConfig,maxOutputTokens:8192,thinkingConfig:{thinkingLevel:'low'}}};
      // Base64 bytes aren't text tokens. Reserve a conservative per-attachment allowance.
      const textRequest=JSON.stringify(request, (key,value)=>key==='inlineData'?{mimeType:value.mimeType}:value);
      await reserve(use,Buffer.byteLength(textRequest)+files.length*4096+request.generationConfig.maxOutputTokens);
      if(!streaming)return gemini(use,request);
      if(generationController.signal.aborted)throw fail('The overall response time limit was reached or the chat connection closed.',504);
      const callId=++generationId;let hasSummary=false;
      onProgress({stage:'thought-start',callId,phase,round,model:use});
      const result=await geminiStream(use,request,{
        signal:generationController.signal,
        onThought:text=>{hasSummary=true;onProgress({stage:'thought-summary',callId,text});},
        onAnswerStarted:()=>onProgress({stage:'model-output',message:phase==='planning'||phase==='route'?'Gemini is preparing its search requests.':'Gemini is writing the answer; checking citations before displaying it.'})
      });
      onProgress({stage:'thought-end',callId,hasSummary});return result;
    };
    if(mode==='vault'){
      let vaultRows;
      const loadVaults=async()=>vaultRows??=await sb('/rest/v1/rpc/aria_vault_overview',token,{}).catch(()=>[]);
      const getOverview=async()=>(await loadVaults()).map(({id,...v})=>({...v,searchable:!vault||id===vault.toLowerCase()}));
      const search=async(query,{initial,vault:target}={})=>{
        let scope=vault,vector=null;
        // Models may only pick among vaults inside the scope the user selected.
        if(!scope&&target){const hit=(await loadVaults()).find(v=>v.name.trim().toLowerCase()===target.trim().toLowerCase());if(hit)scope=hit.id;}
        // The 'simple' text config has no stop words, so filler is removed and wordings are expanded here.
        const rows=await loadVaults(),keywords=keywordQuery(query);
        onProgress({stage:'searching',vault:scope?(rows.find(v=>v.id===String(scope).toLowerCase())?.name??'selected vault'):'all vaults',sent:keywords});
        if(initial&&process.env.ENABLE_SEMANTIC_SEARCH==='true'){await reserve('gemini-embedding-2',Buffer.byteLength(query));vector=await embed(query);}
        return sb('/rest/v1/rpc/aria_search',token,{p_query:keywords,p_embedding:vector,p_vault:scope??null});
      };
      const routeOn=process.env.ENABLE_ROUTER!=='false';
      const options={message,search,generate,concise,onProgress,files,history,overview:getOverview,route:routeOn};
      // Old assistant answers and deleted evidence never become fresh vault evidence.
      if(incoming.resumable===true){
        const hash=requestHash(validated),state=incoming.continuation?openCheckpoint(incoming.continuation,user.id,hash):createResearchState();
        // Run several steps per HTTP request (saves round trips); checkpoint only if the time budget runs out.
        const started=Date.now();
        let next=await researchStep({...options,state});
        while(!next.result&&Date.now()-started<120000)next=await researchStep({...options,state:next.state});
        if(next.result)return send(200,{...next.result,model});
        return send(200,{continuation:sealCheckpoint(next.state,user.id,hash),research:{searches:next.state.searches.length,planningCalls:next.state.planningCalls},model});
      }
      return send(200,{...await researchVault(options),model});
    }
    const system='You are Aria, a thoughtful personal research assistant. This is general chat; you have not searched the user’s vault. Be clear about uncertainty.'+(concise?CONCISE_INSTRUCTION:'');
    const contents=[...history.map(m=>({role:m.role,parts:[{text:m.text}]})),{role:'user',parts:[{text:message},...files]}];
    const request={systemInstruction:{parts:[{text:system}]},contents,generationConfig:{maxOutputTokens:2048}};
    onProgress({stage:'answering',message:'Preparing your answer.'});
    const result=await generate(request);
    send(200,{...result,model,sources:[]});
  }catch(error){send(error.status??500,{error:error.status?error.message:['TimeoutError','AbortError'].includes(error.name)?'The upstream request timed out. Please try again.':error instanceof TypeError?'Could not connect to an upstream service. Check server connectivity and configuration.':'Request could not be completed. Check configuration or try again later.'});}
  finally{clearInterval(heartbeat);clearTimeout(deadlineTimer);res.off?.('close',disconnect);}
}
