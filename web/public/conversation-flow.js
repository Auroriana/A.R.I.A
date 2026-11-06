// Outgoing messages never wait for a batching timer. Only Capri's individual
// bubbles are paced, using their length rather than a model-chosen minute delay.
export function bubbleDelay(text) {
  return Math.min(4500, Math.max(650, String(text).trim().length * 24));
}

export function turnHistory(messages, batch, queued = []) {
  const excluded = new Set([...batch, ...queued].map(m => m.id));
  return messages.filter(m => !excluded.has(m.id));
}
