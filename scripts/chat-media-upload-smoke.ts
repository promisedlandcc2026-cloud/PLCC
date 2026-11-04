/**
 * Chat media upload smoke (no Supabase required).
 * Run: npx tsx scripts/chat-media-upload-smoke.ts
 */
import assert from 'node:assert/strict';
import {
  CHAT_MEDIA_MAX_BYTES,
  chatAttachmentKind,
  cleanChatFilename,
  normalizeChatMime,
  planChatAttachmentUpload,
  statChatUpload,
  storagePathBelongsToMessage,
} from '../api/_utils/chatAttachmentUpload.js';

const C = '11111111-1111-4111-8111-111111111111';
const M = '22222222-2222-4222-8222-222222222222';
let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const plan = (mimeType: string, filename = 'x', sizeBytes: number = 1000) =>
  planChatAttachmentUpload({ channelId: C, messageId: M, filename, mimeType, sizeBytes, random: 'abc123', now: 1700000000000 });

async function main() {
console.log('Chat media uploads');
await check('photo, voice note (Android + iPhone), video, PDF are allowed', () => {
  for (const m of ['image/jpeg', 'audio/webm;codecs=opus', 'audio/mp4', 'video/quicktime', 'application/pdf']) {
    assert.equal(plan(m).ok, true, m);
  }
});
await check('codec params are stripped', () => {
  assert.equal(normalizeChatMime('Audio/WebM; codecs=opus'), 'audio/webm');
});
await check('path is inside this message folder with a safe extension', () => {
  const p = plan('audio/mp4', 'Voice.m4a');
  assert.ok(p.ok);
  if (p.ok) {
    assert.equal(p.storagePath, `${C}/${M}/1700000000000-abc123.m4a`);
    assert.equal(storagePathBelongsToMessage(p.storagePath, C, M), true);
  }
});
await check('scripts, web pages, SVG and unknown types are refused', () => {
  assert.equal(plan('text/html').ok, false);
  assert.equal(plan('image/svg+xml').ok, false);
  assert.equal(plan('application/x-msdownload', 'a.exe').ok, false);
  assert.equal(plan('application/pdf', 'evil.js').ok, false);
});
await check('size: empty refused, 25 MB allowed, bigger refused with 413', () => {
  assert.equal(plan('image/png', 'a.png', 0).ok, false);
  assert.equal(plan('video/mp4', 'v.mp4', CHAT_MEDIA_MAX_BYTES).ok, true);
  const big = plan('video/mp4', 'v.mp4', CHAT_MEDIA_MAX_BYTES + 1);
  assert.equal(big.ok, false);
  if (!big.ok) assert.equal(big.status, 413);
});
await check('confirm cannot point at another message or folder', () => {
  const other = '33333333-3333-4333-8333-333333333333';
  assert.equal(storagePathBelongsToMessage(`${C}/${other}/1-a.jpg`, C, M), false);
  assert.equal(storagePathBelongsToMessage(`${C}/${M}/../x/1-a.jpg`, C, M), false);
  assert.equal(storagePathBelongsToMessage(`${C}/${M}/sub/1-a.jpg`, C, M), false);
  assert.equal(storagePathBelongsToMessage(`x${C}/${M}/1-a.jpg`, C, M), false);
});
await check('kind fits the DB constraint (image|file)', () => {
  assert.equal(chatAttachmentKind('image/webp'), 'image');
  assert.equal(chatAttachmentKind('audio/mp4'), 'file');
  assert.equal(chatAttachmentKind('video/mp4'), 'file');
});
await check('filenames are cleaned', () => {
  assert.equal(cleanChatFilename('../../etc/passwd'), '.._.._etc_passwd');
  assert.equal(cleanChatFilename(''), 'file');
});
await check('statChatUpload reads the real stored size', async () => {
  const storage: any = {
    from: () => ({
      list: async (folder: string, opts: any) => ({
        data: folder === `${C}/${M}` ? [{ name: opts.search, metadata: { size: 4242, mimetype: 'audio/mp4' } }] : [],
        error: null,
      }),
    }),
  };
  assert.deepEqual(await statChatUpload(storage, `${C}/${M}/1-a.m4a`), { size: 4242, mime: 'audio/mp4' });
  const empty: any = { from: () => ({ list: async () => ({ data: [], error: null }) }) };
  assert.equal(await statChatUpload(empty, `${C}/${M}/1-a.m4a`), null);
});

console.log(`\n${passed} checks passed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
