import {models,validateChat} from '../lib/models.js';
import {noteRoutes} from '../lib/notes-api.js';
import {gemini,embed} from '../lib/providers.js';
import {researchVault} from '../lib/rag.js';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const configured=()=>['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','OWNER_USER_ID'].every(k=>process.env[k]);
async function sb(route,token,body,method=body?'POST':'GET') {
  const response=await fetch(`${process.env.SUPABASE_URL}${route}`,{method,headers:{apikey:process.env.SUPABASE_PUBLISHABLE_KEY,...(token?{Authorization:`Bearer ${token}`} : {}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
  if(!response.ok) throw fail(route.includes('/auth/')?'Sign-in failed or session expired.':'Database request failed. Apply the Supabase migration and check access policies.',route.includes('/auth/')?401:503);
  return response.status===204?null:response.json();
}
function cookie(req){return (req.headers.cookie??'').split(';').map(v=>v.trim()).find(v=>v.startsWith('aria_session='))?.slice(13);}
function setCookie(res,value,age){res.setHeader('Set-Cookie',`aria_session=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${process.env.VERCEL?'; Secure':''}`);}
async function readBody(req){
  if(req.body) {if(Buffer.byteLength(JSON.stringify(req.body))>40000)throw fail('Request too large.',413);return typeof req.body==='string'?JSON.parse(req.body):req.body;}
  let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>40000)throw fail('Request too large.',413);}return raw?JSON.parse(raw):{};
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
  const send=(status,data)=>{res.statusCode=status;res.end(JSON.stringify(data));};
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
    if(req.method!=='POST'||route!=='/api/chat')throw fail('Not found.',404);
    const {model,message,mode,history,vault}=validateChat(await readBody(req));
    if(!process.env.GEMINI_API_KEY||process.env.GEMINI_FREE_TIER_CONFIRMED!=='true')throw fail('Gemini is not enabled. Configure a Free-tier API key and confirm its billing tier.',503);
    const reserve=async(id,tokens)=>{const ok=await sb('/rest/v1/rpc/aria_reserve',token,{p_model:id,p_tokens:tokens});if(!ok)throw fail('Model quota reservation limit reached. Wait before trying again. No automatic retries or paid fallback.',429);};
    const generate=async request=>{
      await reserve(model,Buffer.byteLength(JSON.stringify(request))+request.generationConfig.maxOutputTokens);
      return gemini(model,request);
    };
    if(mode==='vault'){
      const search=async(query,{initial})=>{
        let vector=null;
        // Follow-up queries are focused keyword searches; no extra embedding calls.
        if(initial&&process.env.ENABLE_SEMANTIC_SEARCH==='true'){await reserve('gemini-embedding-2',Buffer.byteLength(query));vector=await embed(query);}
        return sb('/rest/v1/rpc/aria_search',token,{p_query:query,p_embedding:vector,p_vault:vault});
      };
      // Old assistant answers and deleted evidence never become fresh vault evidence.
      return send(200,{...await researchVault({message,search,generate}),model});
    }
    const system='You are Aria, a thoughtful personal research assistant. This is general chat; you have not searched the user’s vault. Be clear about uncertainty.';
    const contents=[...history.map(m=>({role:m.role,parts:[{text:m.text}]})),{role:'user',parts:[{text:message}]}];
    const request={systemInstruction:{parts:[{text:system}]},contents,generationConfig:{maxOutputTokens:2048}};
    const result=await generate(request);
    send(200,{...result,model,sources:[]});
  }catch(error){send(error.status??500,{error:error.status?error.message:'Request could not be completed. Check configuration or try again later.'});}
}
