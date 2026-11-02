import {timingSafeEqual} from 'node:crypto';
import {validateQuickInput} from './quick-note.js';
import {runQuickQueue} from './quick-queue.js';
import {cleanPath,chunkMarkdown,isUuid} from './notes.js';
import {setProperty} from '../public/note-model.js';

export function workerAuthorized(header,secret) {
  if (!secret || secret.length<32 || typeof header!=='string') return false;
  const a=Buffer.from(header),b=Buffer.from('Bearer '+secret);
  return a.length===b.length && timingSafeEqual(a,b);
}

export async function quickRoutes({req,route,url,token,sb,fail,send,readBody,generate}) {
  if (!route.startsWith('/api/quick-') && route!=='/api/vault-quick') return false;
  const rpc=(name,body)=>sb('/rest/v1/rpc/'+name,token,body);
  if (req.method==='GET' && route==='/api/quick-list') {
    const offset=Number(url.searchParams.get('offset')??0);
    if (!Number.isInteger(offset)||offset<0||offset>100000) throw fail('Invalid page.');
    send(200,{notes:await rpc('aria_quick_list',{p_offset:offset})}); return true;
  }
  if (req.method!=='POST') return false;
  if (route==='/api/quick-kick' || route==='/api/quick-worker') {
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_FREE_TIER_CONFIRMED!=='true') throw fail('Gemini is not enabled. Your queued notes are saved.',503);
    send(200,await runQuickQueue({rpc,generate})); return true;
  }
  const b=await readBody(req,80000);
  if (route==='/api/quick-enqueue') {
    const {key,text,mode}=validateQuickInput(b);
    const voice=typeof b.personality==='string'&&b.personality.trim()?b.personality.trim().slice(0,16000):null;
    const r=await rpc('aria_quick_enqueue',{p_key:key,p_text:text,p_mode:mode,...(voice?{p_personality:voice}:{})});
    if (!r.ok) throw fail(r.reason==='full'?'Quick Note queue is full (100). Wait for existing notes to finish.':'This send key already belongs to another note.',409);
    send(200,r); return true;
  }
  if (route==='/api/vault-quick') {
    if (!isUuid(b.vault)||typeof b.allow!=='boolean') throw fail('Choose a vault and filing preference.');
    const r=await rpc('aria_set_vault_quick',{p_vault:b.vault,p_allow:b.allow});
    if (!r.ok) throw fail('Vault not found.',404);
    send(200,r); return true;
  }
  if (['/api/quick-retry','/api/quick-delete'].includes(route)) {
    if (!isUuid(b.id)) throw fail('Choose a quick note.');
    const r=await rpc(route.endsWith('retry')?'aria_quick_retry':'aria_quick_delete',{p_id:b.id});
    if (!r.ok) throw fail('This job changed. Refresh its status and try again.',409);
    send(200,r); return true;
  }
  if (route==='/api/quick-ai') {
    if (!isUuid(b.vault)||typeof b.enabled!=='boolean'||!Number.isInteger(b.version)||b.version<1) throw fail('Choose a saved note.');
    const path=cleanPath(b.path);
    const rows=await sb(`/rest/v1/aria_notes?select=content,version&deleted=eq.false&vault_id=eq.${b.vault}&path=eq.${encodeURIComponent(path)}`,token);
    if (!rows.length) throw fail('This note was moved or deleted. Refresh the history.',404);
    if (rows[0].version!==b.version) throw fail('This note changed elsewhere. Refresh before changing AI search.',409);
    const content=setProperty(rows[0].content,'ai_enabled',b.enabled);
    const r=await rpc('aria_save_note',{p_vault:b.vault,p_path:path,p_content:content,p_base_version:b.version,p_origin:'web',p_chunks:chunkMarkdown(content)});
    if (!r.ok) throw fail('This note changed elsewhere. Refresh before changing AI search.',409);
    send(200,{ai_enabled:r.ai_enabled}); return true;
  }
  return false;
}
