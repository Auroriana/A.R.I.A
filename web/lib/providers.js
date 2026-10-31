export async function gemini(model,body,fetcher=fetch) {
  let response,data;
  try {
    response=await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':process.env.GEMINI_API_KEY},body:JSON.stringify(body),signal:AbortSignal.timeout(model==='gemini-3.8-flash'?75000:45000)});
    if(response.ok)data=await response.json();
  } catch(error) {
    const timeout=['TimeoutError','AbortError'].includes(error.name);
    throw Object.assign(new Error(timeout?`${model} timed out before returning an answer. Please try again or choose another model.`:`Could not reach Gemini for ${model}. Check server connectivity and try again.`),{status:timeout?504:502});
  }
  if(!response.ok) {
    let reasons=[];try{const errorBody=await response.json();reasons=errorBody.error?.details?.map(d=>d.reason)??[];}catch{}
    const invalidKey=reasons.includes('API_KEY_INVALID');
    throw Object.assign(new Error(invalidKey?'Google rejected the configured Gemini API key. Replace GEMINI_API_KEY in the server environment and restart or redeploy.':response.status===429?'Gemini quota reached. Wait or manually choose another available model.':response.status===404?`${model} is unavailable to your API project. Select another model.`:response.status===400?`Gemini rejected the request settings for ${model} (HTTP 400). Check model compatibility.`:[401,403].includes(response.status)?`Gemini denied access to ${model}. Check the API key and model access.`:response.status>=500?`Gemini is temporarily unavailable for ${model} (HTTP ${response.status}). Try again later.`:'Gemini could not answer. Check the API key, free-tier access, and model availability.'),{status:response.status===429?429:502});
  }
  const candidate=data.candidates?.[0];
  const answer=candidate?.content?.parts?.filter(p=>!p.thought).map(p=>p.text??'').join('');
  if(!answer) throw Object.assign(new Error('Gemini returned no answer. It may have blocked the request or exhausted its output budget.'),{status:502});
  return {answer,usage:data.usageMetadata??null,truncated:candidate.finishReason==='MAX_TOKENS'};
}
export async function embed(text,fetcher=fetch) {
  const response=await fetcher('https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':process.env.GEMINI_API_KEY},body:JSON.stringify({content:{parts:[{text}]},outputDimensionality:768}),signal:AbortSignal.timeout(30000)});
  if(!response.ok) throw Object.assign(new Error('Embedding request failed or its quota was reached. No chat request was made.'),{status:response.status===429?429:502});
  const vector=(await response.json()).embedding?.values;
  if(!Array.isArray(vector)||vector.length!==768||vector.some(v=>!Number.isFinite(v))) throw new Error('Invalid embedding response.');
  return vector;
}
