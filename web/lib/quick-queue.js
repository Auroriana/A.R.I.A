import {QUICK_MODEL,quickRequest,validateQuickResult,quickPath,composeQuickNote} from './quick-note.js';

// DB serializes claims across browser kicks, cron invocations and server instances.
// Finish atomically saves + records the note, so a lost HTTP response cannot duplicate it.
export async function runQuickQueue({rpc,generate,now=Date.now,budgetMs=45000}) {
  const start=now(); let filed=0;
  while (now()-start < budgetMs) {
    const job=await rpc('aria_quick_claim',{});
    if (!job) break;
    try {
      const vaults=await rpc('aria_folder_map',{});
      const request=quickRequest(job,vaults);
      const reserved=await rpc('aria_reserve',{p_model:QUICK_MODEL,p_tokens:Buffer.byteLength(JSON.stringify(request))+8192});
      if (!reserved) throw Object.assign(new Error('Quick Note model quota reached. Try again later.'),{status:429});
      const result=await generate(QUICK_MODEL,request);
      const plan=validateQuickResult(result,job,vaults);
      const content=composeQuickNote(job,plan);
      let saved=false;
      for (let suffix=1;suffix<=100;suffix++) {
        const r=await rpc('aria_quick_finish',{p_id:job.id,p_lease:job.lease_token,p_vault:plan.vault,p_path:quickPath(plan,suffix),p_content:content,p_confidence:plan.confidence});
        if (r.ok) { saved=true; filed++; break; }
        if (r.reason==='stale') return {filed};
        if (!['conflict','moved'].includes(r.reason)) throw new Error(r.reason==='invalid_vault' ? 'Vault filing permission changed. Retry to choose another destination.' : 'Quick note could not be saved.');
      }
      if (!saved) throw new Error('Too many notes with this title. Retry later.');
    } catch (error) {
      await rpc('aria_quick_fail',{p_id:job.id,p_lease:job.lease_token,p_error:String(error.message).slice(0,500),p_retry_after:error.status===429?900:Math.min(3600,60*2**(job.attempts-1))});
      // Do not flood a quota-limited provider, even if more jobs are waiting.
      if (error.status===429) break;
    }
  }
  return {filed};
}
