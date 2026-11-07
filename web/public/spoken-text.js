// Metadata belongs in message options, never in Capri's spoken bubbles.
export function spokenText(text){return String(text||'').replace(/\[(?:sprite:[^\]]+|focus|focused_analysis|neutral_attention|amused_interest|concerned|surprised)\]\s*/gi,'').replace(/ ?\[(?:[SP]\d+)(?:\s*[,;]\s*[SP]\d+)*\]/g,'').trim();}
export function reminderPresentation(message){
 if(message.event!=='reminder.due')return {text:spokenText(message.text),details:null};
 const parts=String(message.text).split(/\n\n+/);
 return {text:spokenText(parts[0]),details:parts.slice(1).join('\n\n')||null};
}
