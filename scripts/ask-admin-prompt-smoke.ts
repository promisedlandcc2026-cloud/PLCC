/**
 * Ask Admin prompt coverage smoke (no live LLM).
 * Run: npx tsx scripts/ask-admin-prompt-smoke.ts
 */
import { buildAskAdminSystemPrompt } from '../api/_utils/askAdminPrompt.js';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  OK: ${msg}`);
}

const prompt = buildAskAdminSystemPrompt(
  { members: 1, households: 1, recentAttendance: 0, mtdGiving: 0 },
  null,
  null
);

console.log('\nAsk Admin prompt smoke');
assert(/Live Huddle/i.test(prompt), 'mentions Live Huddle');
assert(/How do I start \/ join a Live Huddle/i.test(prompt), 'has Live Huddle how-to');
assert(/\/community\/chat/.test(prompt), 'links Chat path');
assert(/HOW-TO \/ WHERE-IS FIRST/i.test(prompt), 'how-to-first rule present');
assert(/EXPLAIN SIMPLY/i.test(prompt), 'ELI5 explain-simply rule present');
assert(/5-year-old|young child/i.test(prompt), 'child-simple voice present');
assert(
  /Do not use it for Live Huddle, Chat, Community/i.test(prompt),
  'UNKNOWN must not refuse Chat/Huddle'
);
assert(
  !/11\. UNKNOWN: "I don't have that in my guide/.test(prompt),
  'old hard UNKNOWN rule removed'
);
assert(!/BE DIRECT: Numbered steps only/i.test(prompt), 'old BE DIRECT rule removed');

assert(
  /What is Serve opportunities\? \(explain simply\)/i.test(prompt),
  'has simple Serve opportunities explainer'
);
assert(/Connect app/i.test(prompt) && /staff desk/i.test(prompt), 'Serve points members to Connect');
assert(/Serve eligibility/i.test(prompt), 'mentions Serve eligibility gate');

console.log('\nAll Ask Admin prompt smoke tests passed.');
