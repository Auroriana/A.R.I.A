// The author chooses message boundaries. Never split Markdown or sentences heuristically.
export const BLOCK_SEPARATOR='\n\n<capri-message>\n\n';
export function messageBlocks(value,fallback=''){
 const blocks=Array.isArray(value)?value:[fallback];
 if(!blocks.length||blocks.length>16||blocks.some(x=>typeof x!=='string'||!x.trim())||blocks.join('').length>100000)throw Error('Invalid message blocks.');
 return blocks.map(x=>x.trim());
}
export function splitReply(text){return String(text||'').split(BLOCK_SEPARATOR).filter(x=>x.trim());}
