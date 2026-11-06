import test from 'node:test';
import assert from 'node:assert/strict';
import {bubbleDelay,turnHistory} from '../public/conversation-flow.js';

test('each bubble gets a short length-based delay, never a minute hold',()=>{
  assert.equal(bubbleDelay('hey'),650);
  assert.ok(bubbleDelay('x'.repeat(100))>bubbleDelay('x'.repeat(30)));
  assert.equal(bubbleDelay('x'.repeat(10000)),4500);
});

test('follow-up history retains the reply completed after the follow-up was sent',()=>{
  const messages=[{id:'a',role:'user',text:'Original',started:1},{id:'b',role:'user',text:'Next',started:2},{id:'c',role:'model',text:'Just finished',started:3},{id:'d',role:'user',text:'Still queued',started:4}];
  assert.deepEqual(turnHistory(messages,[messages[1]],[messages[3]]).map(m=>m.id),['a','c']);
});

