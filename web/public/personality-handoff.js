// The draft carries factual conclusions and qualifications. Only citation identity
// crosses with it; raw passages remain with the original answer in the UI.
export function citationMap(answer,sources=[]){
 const ids=new Set([...String(answer).matchAll(/\[((?:[SP]\d+)(?:\s*[,;]\s*[SP]\d+)*)\]/g)].flatMap(m=>m[1].match(/[SP]\d+/g)));
 const seen=new Set();
 return sources.filter(s=>s&&ids.has(s.id)&&s.read!==false&&!seen.has(s.id)&&(seen.add(s.id),true))
  .map(s=>({id:s.id,title:typeof s.title==='string'?s.title:'',path:typeof s.path==='string'?s.path:'',vault:typeof s.vault==='string'?s.vault:''}));
}

export function personalityHandoff(body,result){
 return {action:'rewrite',pendingReplies:body.pendingReplies,message:body.message,answer:result.answer,history:body.history??[],overview:body.overview??[],settings:body.settings,concise:body.concise,
  sourceBasis:result.research?.reusedSources?'snapshot':'draft',snapshotCapturedAt:result.research?.snapshotCapturedAt??null,vaultSearches:result.research?.searches??0,citationSources:citationMap(result.answer,result.sources??[])};
}
