// Only explicit commands trigger writes; quoted text and ordinary chat stay chat.
export function captureIntent(text){
 const input=text.trim().replace(/^(?:(?:hey\s+)?(?:capri|carpi)[,!]?\s+)?(?:(?:(?:can|could|would|will) you|I need you to|I'd like you to)\s+)?(?:please\s+)?/i,'');
 const note=/^(?:note this(?: for me)?|note down|jot (?:this|down)|write this down|take (?:a )?note(?: of)?|make (?:a )?(?:quick )?note(?: of)?|save (?:this|a) note|remember this)\s*[:,—-]?\s+([\s\S]+)$/i.exec(input);
 if(note)return {kind:'note',text:note[1].trim()};
 const reminder=/^(?:remind me|(?:set|create) (?:a )?reminder(?: for me)?)\s+(?:about\s+|to\s+)?([\s\S]+)$/i.exec(input);
 if(reminder)return {kind:'reminder',text:reminder[1].trim()};
 return null;
}
export function reminderQuery(text){
 if(!/\breminders?\b/i.test(text)||!(/\b(what|show|list|check|read|find|search|view|any|which|pull up)\b/i.test(text)||/^reminders?(?:\s+(?:today|yesterday))?[?!.]?$/i.test(text.trim())))return null;
 return /\b(yesterday|last|older|previous|ago|history)\b|20\d{2}-/i.test(text)?'older':'today';
}
export function relativeTime(text,now=Date.now()){
 const words={a:1,an:1,one:1,two:2,three:3,four:4,five:5,ten:10,fifteen:15,twenty:20,thirty:30,half:.5};
 const m=/\bin\s+(\d+(?:\.\d+)?|a|an|one|two|three|four|five|ten|fifteen|twenty|thirty|half)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?)\b/i.exec(text);
 if(!m)return null;
 const n=words[m[1].toLowerCase()]??Number(m[1]),unit=/^s/i.test(m[2])?1000:/^m/i.test(m[2])?60000:/^h/i.test(m[2])?3600000:/^w/i.test(m[2])?604800000:86400000;
 return n>0&&n*unit<=366*86400000?new Date(now+n*unit):null;
}
export function localDateTime(date){const pad=n=>String(n).padStart(2,'0');return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;}

export function scheduledTime(text,now=new Date()){
 const relative=relativeTime(text,now.getTime());if(relative)return relative;
 const exact=/\b(\d{4})-(\d{2})-(\d{2})(?:T|\s+(?:at\s+)?)(\d{1,2}):(\d{2})\b/.exec(text);
 if(exact){const [year,month,day,hour,minute]=exact.slice(1).map(Number),date=new Date(year,month-1,day,hour,minute);return date>now&&date.getFullYear()===year&&date.getMonth()===month-1&&date.getDate()===day&&date.getHours()===hour&&date.getMinutes()===minute?date:null;}
 const clock=/\b(\d{1,2}(?::\d{2})?\s*(?:am|pm)|\d{1,2}:\d{2})\b/i.exec(text);
 if(!/\b(today|tomorrow|next|monday|tuesday|wednesday|thursday|friday|saturday|sunday|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i.test(text)&&clock){const t=scheduledTime('today '+clock[1],now);return t||scheduledTime('tomorrow '+clock[1],now);}
 const m=/\b(today|tomorrow)\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i.exec(text);
 if(!m)return null;
 let hour=Number(m[2]),minute=Number(m[3]||0);const ampm=m[4]?.toLowerCase();
 if(minute>59||hour>23||(ampm&&(hour<1||hour>12)))return null;
 if(ampm)hour=hour%12+(ampm==='pm'?12:0);
 const date=new Date(now);if(m[1].toLowerCase()==='tomorrow')date.setDate(date.getDate()+1);date.setHours(hour,minute,0,0);
 return date>now?date:null;
}
