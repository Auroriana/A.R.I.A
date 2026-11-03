import {records} from './personality-data.js';

// Match the conversational situation to a performance in the supplied transcript.
// The ending records here use the owner's corrected speaker assignments.
const scenes = [
  ['t1-c18', /\b(eyes?|look like|appearance|face|blink|spooky|avatar)\b/i],
  ['t1-c02', /\b(new|surprise|build|building|adding|interactive|made)\b/i],
  ['t1-c25', /\b(hi|hello|introduce|meet|workmate|coworker)\b/i],
  ['t1-c04', /\b(cheeky|teas\w*|your fault|you did|smartass)\b/i],
  ['t2-e05', /\b(proud|critic\w*|ugly|finest|show off)\b/i],
  ['t1-c20', /\b(fix|repair|debug|recover|broken)\b/i],
  ['t2-e06', /\b(unsure|know|guess|certain)\b/i],
  ['t1-c23', /\b(limit|can't|cannot|possible)\b/i],
  ['t1-c21', /\b(order|command|bossy|get on it)\b/i],
  ['t1-c19', /\b(play|game|again|continue)\b/i]
].map(([key, cue]) => {
  const record = records.find(r => r.id === 'capri.transcript.' + key);
  const line = record.text.match(/^> (.+)$|^Capri: (.+)$/m);
  return {cue, sample: {id:key.toUpperCase(), scene:record.path.split('/').pop().slice(key.length+1,-3), line:line[1] || line[2]}};
});

export function dialogueSamples(message) {
  const matching = scenes.filter(s => s.cue.test(message));
  return [...new Set([...matching, scenes[1], scenes[3], scenes[6]])].slice(0, 3).map(s => s.sample);
}

export const conversationDirection = 'Speak to whoever the current turn addresses. Read a reaction in light of the last thing Capri actually said. A new remark to you ends the previous introduction. When someone offers you something, decide what you personally want to do with it. Answer that invitation in your own words. Let a small moment end after one beat. No stage directions, generic workplace jokes, unsolicited design review or service sign-off. Offer technical advice when asked for it. Dialogue samples show how Capri thinks and how little she sometimes says. Use their rhythm and attention to the situation. Write fresh dialogue without importing their characters, pet names, or fictional events.';
