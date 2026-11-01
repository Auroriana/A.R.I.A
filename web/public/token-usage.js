const fields=['promptTokenCount','candidatesTokenCount','thoughtsTokenCount','toolUsePromptTokenCount'];
export const estimateText=text=>Math.ceil(new TextEncoder().encode(text||'').length/4);
// Attachment content cannot be tokenized locally; use a rough per-file allowance, never base64 length.
export function estimateQuestion(message,history=[],files=[]){return estimateText(message)+history.reduce((n,m)=>n+estimateText(m.text),0)+files.length*4096;}
export function normalizeUsage(usage,fallback=0){
  const out={};for(const key of fields)if(Number.isFinite(usage?.[key]))out[key]=usage[key];
  out.totalTokenCount=Number.isFinite(usage?.totalTokenCount)?usage.totalTokenCount:Object.values(out).reduce((a,b)=>a+b,0)||fallback;
  out.estimated=!Number.isFinite(usage?.totalTokenCount);return out;
}
export function addUsage(a,b){
  const out={totalTokenCount:(a?.totalTokenCount||0)+(b?.totalTokenCount||0),estimated:!!(a?.estimated||b?.estimated)};
  for(const key of fields)if(a?.[key]!==undefined||b?.[key]!==undefined)out[key]=(a?.[key]||0)+(b?.[key]||0);
  return out;
}
export function usageTitle(usage){return (usage.estimated?'Estimated tokens':'Tokens reported by models')+' · '+[['Input','promptTokenCount'],['Output','candidatesTokenCount'],['Thinking','thoughtsTokenCount']].map(([name,key])=>name+': '+(usage[key]??'unavailable')).join(' · ');}
