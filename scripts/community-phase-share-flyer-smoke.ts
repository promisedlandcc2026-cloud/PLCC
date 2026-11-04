/**
 * Flyer share (WhatsApp / text OG landing) contracts.
 * Run: npx tsx scripts/community-phase-share-flyer-smoke.ts
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  THANKSGIVING_FLYER_ID,
  THANKSGIVING_FLYER_SLUG,
  buildFlyerShareUrl,
  flyerRowToCard,
  normalizeDestinationUrl,
  renderFlyerSharePreviewHtml,
  smsShareHref,
  whatsappShareHref,
} from '../api/_utils/shareFlyerPreview.js';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  OK: ${msg}`);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const ORIGIN = 'https://plcc-vault.vercel.app';

console.log('Share flyer smoke — schema + helpers');

assert(existsSync(join(root, 'supabase/migrations/add_share_flyers.sql')), 'migration present');
const migration = read('supabase/migrations/add_share_flyers.sql');
assert(/CREATE TABLE IF NOT EXISTS public\.share_flyers/i.test(migration), 'share_flyers table');
assert(/ENABLE ROW LEVEL SECURITY/i.test(migration), 'RLS enabled');
assert(migration.includes(THANKSGIVING_FLYER_ID), 'Thanksgiving seed id');
assert(/thanksgiving-dinner-2026/i.test(migration), 'Thanksgiving slug seed');

assert(
  existsSync(join(root, 'public/images/share/thanksgiving-dinner-2026.jpg')),
  'Thanksgiving flyer image present'
);

assert(normalizeDestinationUrl('https://example.com/rsvp') === 'https://example.com/rsvp', 'https dest ok');
assert(
  normalizeDestinationUrl('/#/events/abc/rsvp') === '/#/events/abc/rsvp',
  'hash dest ok'
);
assert(normalizeDestinationUrl('javascript:alert(1)') === null, 'rejects javascript:');
assert(normalizeDestinationUrl('data:text/html,hi') === null, 'rejects data:');

const shareUrl = buildFlyerShareUrl({ origin: ORIGIN, id: THANKSGIVING_FLYER_ID })!;
assert(
  shareUrl === `${ORIGIN}/api/share-flyer?id=${THANKSGIVING_FLYER_ID}`,
  'share URL uses /api/share-flyer?id='
);
assert(/wa\.me\/\?text=/.test(whatsappShareHref(shareUrl, 'Thanksgiving')), 'WhatsApp href');
assert(/^sms:\?&body=/.test(smsShareHref(shareUrl, 'Thanksgiving')), 'SMS href');

const card = flyerRowToCard(
  {
    id: THANKSGIVING_FLYER_ID,
    title: 'PLCC Grand Family Celebration 2026',
    image_url: '/images/share/thanksgiving-dinner-2026.jpg',
    destination_url: '/#/events/86ac9498-ee56-4c6a-baae-079832b0ea73/rsvp',
    slug: THANKSGIVING_FLYER_SLUG,
  },
  ORIGIN
)!;
assert(card.imageUrl.endsWith('/images/share/thanksgiving-dinner-2026.jpg'), 'absolute flyer image');
assert(card.destinationHref.includes('/#/events/'), 'destination resolves to HashRouter RSVP');

const html = renderFlyerSharePreviewHtml({
  title: card.title,
  imageUrl: card.imageUrl,
  previewShareUrl: card.previewShareUrl,
  destinationHref: card.destinationHref,
});
assert(/og:image/.test(html) && html.includes(card.imageUrl), 'OG HTML includes flyer image');
assert(html.includes(card.destinationHref), 'OG HTML includes destination');
assert(!/http-equiv="refresh"/.test(html), 'flyer HTML has no meta refresh');
assert(/location\.replace/.test(html), 'flyer HTML uses JS redirect for browsers');

console.log('\nShare flyer smoke — wiring');

const vercel = read('vercel.json');
const handler = read('api/share-flyer.ts');
const core = read('api/_utils/core.ts');
const ui = read('pages/events/FlyerShare.tsx');
const simpleNav = read('lib/simpleNav.tsx');
const app = read('App.tsx');

assert(/share-flyer/.test(vercel), 'vercel routes share-flyer before vault catch-all');
assert(/share-flyer\.ts/.test(vercel), 'vercel functions include share-flyer');
assert(/renderFlyerSharePreviewHtml/.test(handler), 'API renders OG HTML');
assert(/location\.replace/.test(read('api/_utils/shareFlyerPreview.ts')), 'flyer preview uses JS redirect');
assert(!/http-equiv="refresh"/.test(read('api/_utils/shareFlyerPreview.ts')), 'flyer preview has no meta refresh');
assert(/case 'share-flyers'/.test(core), 'vault resource=share-flyers');
assert(/handleShareFlyers/.test(core), 'vault wires shareFlyersHandler');
assert(/Copy link/.test(ui) && /WhatsApp/.test(ui) && /Text \/ SMS/.test(ui), 'UI copy/WhatsApp/SMS');
assert(/resource=share-flyers/.test(ui), 'UI calls share-flyers API');
assert(/subResource=upload-image/.test(ui), 'UI reuses event image upload');
assert(/Flyer share/.test(simpleNav) && /\/events\/flyer-share/.test(simpleNav), 'nav Flyer share');
assert(/FlyerSharePage/.test(app) && /\/events\/flyer-share/.test(app), 'App route flyer-share');

console.log('\nShare flyer smoke — event RSVP OG landing');

const shareRsvp = read('api/share-rsvp.ts');
const overview = read('pages/events/Overview.tsx');
const rsvpPreview = read('api/_utils/eventRsvpSharePreview.ts');
assert(/share-rsvp/.test(vercel), 'vercel routes share-rsvp');
assert(/resolveEventRsvpShareCard/.test(shareRsvp), 'share-rsvp loads event flyer');
assert(/buildEventRsvpShareUrl/.test(rsvpPreview), 'event RSVP share URL helper');
assert(/publicEventRsvpShareUrl/.test(overview), 'Overview copies /api/share-rsvp link');
assert(/Copy WhatsApp link/.test(overview), 'Overview has Copy WhatsApp link');

console.log('\nShare flyer smoke — all checks passed');
