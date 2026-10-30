export async function gemini(model,body,fetcher=fetch) {
  const response=await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':process.env.GEMINI_API_KEY},body:JSON.stringify(body),signal:AbortSignal.timeout(45000)});
  if(!response.ok) throw Object.assign(new Error(response.status===429?'Gemini quota reached. Wait or manually choose another available model.':response.status===404?'This model ID is unavailable to your API project. Select another model.':'Gemini could not answer. Check the API key, free-tier access, and model availability.'),{status:response.status===429?429:502});
  const data=await response.json();
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
