// Only explicit commands trigger writes; quoted text and ordinary chat stay chat.
export function captureIntent(text){
 const note=/^(?:capri[,!]?\s+)?(?:please\s+)?(?:note this(?: for me)?|take a note|save (?:this|a) note)\s*[:,—-]?\s+([\s\S]+)$/i.exec(text.trim());
 if(note)return {kind:'note',text:note[1].trim()};
 const reminder=/^(?:capri[,!]?\s+)?(?:please\s+)?remind me\s+(?:about\s+|to\s+)?([\s\S]+)$/i.exec(text.trim());
 if(reminder)return {kind:'reminder',text:reminder[1].trim()};
 return null;
}
export function relativeTime(text,now=Date.now()){
 const m=/\bin\s+(\d+)\s*(minutes?|hours?|days?)\b/i.exec(text);
 if(!m)return null;
 const n=Number(m[1]),unit=/minute/i.test(m[2])?60000:/hour/i.test(m[2])?3600000:86400000;
 return n>0&&n<=365?new Date(now+n*unit):null;
}
export function localDateTime(date){const pad=n=>String(n).padStart(2,'0');return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;}

export function scheduledTime(text,now=new Date()){
 const relative=relativeTime(text,now.getTime());if(relative)return relative;
 const m=/\b(today|tomorrow)\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i.exec(text);
 if(!m)return null;
 let hour=Number(m[2]),minute=Number(m[3]||0);const ampm=m[4]?.toLowerCase();
 if(minute>59||hour>23||(ampm&&(hour<1||hour>12)))return null;
 if(ampm)hour=hour%12+(ampm==='pm'?12:0);
 const date=new Date(now);if(m[1].toLowerCase()==='tomorrow')date.setDate(date.getDate()+1);date.setHours(hour,minute,0,0);
 return date>now?date:null;
}
