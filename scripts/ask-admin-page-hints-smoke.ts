/**
 * Ask Admin page-title hints smoke.
 * Run: npx tsx scripts/ask-admin-page-hints-smoke.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ASK_ADMIN_PAGE_HINTS,
  getAskAdminHintForPath,
  normalizeAskAdminPath,
} from '../lib/askAdminPageHints.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
  console.log(`  OK: ${msg}`);
}

console.log('\nAsk Admin page hints smoke');

assert(normalizeAskAdminPath('/members/') === '/members', 'normalize trailing slash');
assert(
  getAskAdminHintForPath('/households/abc') === ASK_ADMIN_PAGE_HINTS['/households'],
  'household detail uses households hint'
);
assert(
  getAskAdminHintForPath('/members') === 'How do I enable Connect child cards for a parent?',
  'members hint'
);
assert(getAskAdminHintForPath('/unknown-xyz') === null, 'unknown path returns null');

const navSrc = readFileSync(join(root, 'lib/simpleNav.tsx'), 'utf8');
const pathMatches = [...navSrc.matchAll(/path:\s*'(\/[^']+)'/g)].map((m) => m[1]);
const uniquePaths = [...new Set(pathMatches)].filter((p) => !p.startsWith('http'));

assert(uniquePaths.includes('/members'), 'simpleNav defines /members');
assert(uniquePaths.includes('/events/who-checked-in'), 'simpleNav defines who-checked-in');

const missing = uniquePaths.filter((p) => !getAskAdminHintForPath(p));
assert(
  missing.length === 0,
  missing.length === 0
    ? `catalog covers all ${uniquePaths.length} everyday nav paths`
    : `missing hints for: ${missing.join(', ')}`
);

const linkComp = readFileSync(join(root, 'components/common/AskAdminTitleLink.tsx'), 'utf8');
assert(/openAskAdmin/.test(linkComp), 'title link opens Ask Admin');

const drawer = readFileSync(join(root, 'components/AI/AssistantDrawer.tsx'), 'utf8');
assert(/askAdminPrompt/.test(drawer) && /clearAskAdminPrompt/.test(drawer), 'drawer seeds from context');

const navCtx = readFileSync(join(root, 'lib/NavContext.tsx'), 'utf8');
assert(/openAskAdmin/.test(navCtx) && /askAdminOpen/.test(navCtx), 'NavContext exposes Ask Admin API');

console.log('\nAll Ask Admin page hints smoke tests passed.');
