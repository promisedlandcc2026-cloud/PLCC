/**
 * Huddle WhatsApp / OG share preview contracts.
 * Run: npx tsx scripts/community-phase-huddle-share-preview-smoke.ts
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildHuddlePreviewShareUrl,
  buildHuddleSharePayload,
  huddleInviteLooksSafe,
} from '../api/_utils/huddleInvite.js';
import {
  getHuddleSharePreview,
  huddleShareImagePath,
  renderHuddleSharePreviewHtml,
  resolveHuddleShareCard,
} from '../api/_utils/huddleSharePreview.js';
import { isSocialPreviewCrawler } from '../api/_utils/socialPreviewCrawler.js';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  OK: ${msg}`);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const CHANNEL = 'cdd9ed73-6cdc-45a0-a7e7-57beec6eea5e';
const ORIGIN = 'https://plcc-vault.vercel.app';

console.log('Huddle share preview smoke — Mount Moriah card');

assert(existsSync(join(root, 'public/images/share/mount-moriah-channel.jpg')), 'banner file present');
const preview = getHuddleSharePreview(CHANNEL);
assert(!!preview, 'Mount Moriah channel is registered');
assert(preview!.slug === 'mount-moriah-channel', 'slug matches filename');
assert(huddleShareImagePath(preview) === '/images/share/mount-moriah-channel.jpg', 'image path');

const shareUrl = buildHuddlePreviewShareUrl({ origin: ORIGIN, channelId: CHANNEL })!;
assert(
  shareUrl === `${ORIGIN}/api/share-huddle?channel=${CHANNEL}`,
  'WhatsApp share URL is /api/share-huddle'
);
assert(huddleInviteLooksSafe(shareUrl), 'share-huddle URL is treated as safe');

const payload = buildHuddleSharePayload({
  origin: ORIGIN,
  channelId: CHANNEL,
  channelName: 'Mount Moriah',
})!;
assert(payload.url === shareUrl, 'Share Huddle payload uses OG landing URL');

const card = resolveHuddleShareCard({ origin: ORIGIN, channelId: CHANNEL })!;
assert(card.imageUrl.endsWith('/images/share/mount-moriah-channel.jpg'), 'absolute image URL');
assert(/Mount Moriah/i.test(card.title), 'card title');

const html = renderHuddleSharePreviewHtml({
  title: card.title,
  description: card.description,
  imageUrl: card.imageUrl,
  previewShareUrl: card.previewShareUrl,
  appInviteUrl: card.appInviteUrl,
});
assert(/og:image/.test(html) && html.includes(card.imageUrl), 'HTML includes og:image');
assert(html.includes('/#/community/chat?channel='), 'HTML includes HashRouter invite');
assert(!/http-equiv="refresh"/.test(html), 'no meta refresh (breaks WhatsApp OG)');
assert(/location\.replace/.test(html), 'JS redirect for browsers');
assert(isSocialPreviewCrawler('WhatsApp/2.23'), 'detects WhatsApp UA');
assert(isSocialPreviewCrawler('facebookexternalhit/1.1'), 'detects facebookexternalhit');
assert(!isSocialPreviewCrawler('Mozilla/5.0 Chrome/120'), 'browsers are not crawlers');

console.log('\nHuddle share preview smoke — DB image priority');

const withDb = resolveHuddleShareCard({
  origin: ORIGIN,
  channelId: CHANNEL,
  channelName: 'Mount Moriah',
  shareImageUrl: 'https://cdn.example.com/custom-huddle-card.jpg',
})!;
assert(
  withDb.imageUrl === 'https://cdn.example.com/custom-huddle-card.jpg',
  'DB share_image_url wins over static registry'
);

const namedOther = resolveHuddleShareCard({
  origin: ORIGIN,
  channelId: '11111111-1111-1111-1111-111111111111',
  channelName: 'Youth',
})!;
assert(/Youth · Live Huddle/.test(namedOther.title), 'unregistered channel uses channel name in title');
assert(
  namedOther.imageUrl.endsWith('/images/awc-connect-logo.png'),
  'unregistered channel falls back to Connect logo when no DB image'
);

const emptyDbKeepsRegistry = resolveHuddleShareCard({
  origin: ORIGIN,
  channelId: CHANNEL,
  channelName: 'Mount Moriah',
  shareImageUrl: null,
})!;
assert(
  emptyDbKeepsRegistry.imageUrl.endsWith('/images/share/mount-moriah-channel.jpg'),
  'Mount Moriah registry wins when DB image empty'
);

console.log('\nHuddle share preview smoke — wiring');

const vercel = read('vercel.json');
const handler = read('api/share-huddle.ts');
const ui = read('components/Community/VoiceHuddle.tsx');
const chat = read('pages/community/Chat.tsx');
const core = read('api/_utils/core.ts');
const migration = read('supabase/migrations/add_chat_channel_share_image.sql');

assert(/share-huddle/.test(vercel), 'vercel routes share-huddle');
assert(/renderHuddleSharePreviewHtml/.test(handler), 'API renders OG HTML');
assert(/chat_channels/.test(handler) && /share_image_url/.test(handler), 'share-huddle loads chat_channels');
assert(/buildHuddleOgImageProxyUrl/.test(handler), 'share-huddle uses JPEG OG proxy helper');
assert(/location\.replace/.test(read('api/_utils/huddleSharePreview.ts')), 'preview HTML uses JS redirect');
assert(!/http-equiv="refresh"/.test(read('api/_utils/huddleSharePreview.ts')), 'preview HTML has no meta refresh');
assert(/share-huddle-image/.test(vercel), 'vercel routes share-huddle-image');
assert(existsSync(join(root, 'api/share-huddle-image.ts')), 'share-huddle-image handler present');
assert(
  /compressImageForWhatsAppOg/.test(read('api/_utils/whatsappOgImage.ts')),
  'WhatsApp OG compressor present'
);
assert(/buildHuddlePreviewShareUrl/.test(ui), 'VoiceHuddle copies preview share URL');
assert(/share_image_url/.test(migration), 'migration adds share_image_url');
assert(/Copy WhatsApp link/.test(chat), 'Chat has Copy WhatsApp link');
assert(/Upload WhatsApp card/.test(chat), 'Chat has Upload WhatsApp card');
assert(/buildHuddlePreviewShareUrl/.test(chat), 'Chat copies /api/share-huddle URL');
assert(/subResource=share-image/.test(chat), 'Chat uploads via share-image endpoint');
assert(
  /chatType === 'channels'/.test(core) && /share_image_url|shareImageUrl/.test(core),
  'vault PATCH can set share_image_url'
);
assert(/chatType === 'share-image'/.test(core), 'vault POST share-image handler');
assert(/add_chat_channel_share_image\.sql/.test(core), 'share-image errors mention migration');

console.log('\nHuddle share preview smoke — all checks passed');
