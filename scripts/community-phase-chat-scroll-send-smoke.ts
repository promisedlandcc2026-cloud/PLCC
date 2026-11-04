/**
 * Community Chat — pin-to-bottom scroll + single-flight send (source smoke).
 * Run: npx tsx scripts/community-phase-chat-scroll-send-smoke.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { shouldAutoScrollHuddleChat } from '../api/_utils/huddleChat.js';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  OK: ${msg}`);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

console.log('Community Chat scroll + send smoke');

assert(shouldAutoScrollHuddleChat({ distanceFromBottom: 0 }), 'at bottom → auto-scroll');
assert(shouldAutoScrollHuddleChat({ distanceFromBottom: 80 }), 'at threshold → auto-scroll');
assert(!shouldAutoScrollHuddleChat({ distanceFromBottom: 81 }), 'above threshold → no auto-scroll');

const chat = read('pages/community/Chat.tsx');
const dm = read('pages/community/DM.tsx');

assert(/shouldAutoScrollHuddleChat/.test(chat), 'Chat imports near-bottom helper');
assert(/pinnedToBottomRef/.test(chat), 'Chat tracks pinned-to-bottom');
assert(/forceScrollRef/.test(chat), 'Chat can force scroll on send/channel switch');
assert(/onMessageListScroll/.test(chat), 'Chat listens to message list scroll');
assert(/data-chat-message-list/.test(chat), 'Chat message list marker');
assert(
  !/useEffect\(\s*\(\)\s*=>\s*\{\s*scrollBottomRef\.current\?\.scrollIntoView\(\{\s*behavior:\s*'smooth'\s*\}\);\s*\},\s*\[messages,\s*activeChannel\]\)/.test(
    chat
  ),
  'Chat no longer unconditionally scrolls on every messages change'
);
assert(/sendingRef/.test(chat), 'Chat has sendingRef single-flight guard');
assert(/setIsSending\(true\)/.test(chat), 'Chat sets isSending while posting');
assert(/data-chat-send/.test(chat), 'Chat send button marker');
assert(/disabled=\{isSending \|\| uploading/.test(chat), 'Chat disables send while in flight');

assert(/shouldAutoScrollHuddleChat/.test(dm), 'DM imports near-bottom helper');
assert(/pinnedToBottomRef/.test(dm), 'DM tracks pinned-to-bottom');
assert(/sendingRef/.test(dm), 'DM has sendingRef guard');
assert(/onMessageListScroll/.test(dm), 'DM listens to message list scroll');
assert(/data-dm-message-list/.test(dm), 'DM message list marker');

console.log('\nAll community chat scroll/send smoke tests passed.');
