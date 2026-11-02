import {createHash} from 'node:crypto';
export const PERSONALITY_EMBEDDING={model:'gemini-embedding-2',dimensions:768,formatVersion:1};
export const hashText=text=>createHash('sha256').update(text).digest('hex');
export function documentInput(record){
 const body=record.text.replace(/^---\n[\s\S]*?\n---\n/,'').split(/\n## (?:Retrieval guidance|Calibration and continuity|Provenance and retrieval)/)[0];
 return `title: ${record.path} | text: ${record.kind}; ${record.status}\n${body}`;
}
export const queryInput=query=>`task: search result | query: ${query}`;
export function normalizeVector(values){
 if(!Array.isArray(values)||values.length!==PERSONALITY_EMBEDDING.dimensions||values.some(v=>!Number.isFinite(v)))throw new Error('Invalid personality embedding.');
 const norm=Math.hypot(...values);if(!Number.isFinite(norm)||norm===0)throw new Error('Invalid personality embedding norm.');
 return values.map(v=>v/norm);
}
