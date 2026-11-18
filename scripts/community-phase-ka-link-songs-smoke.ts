/**
 * Ka Link song library (#12) smoke — no DB or storage needed.
 * Run: npx tsx scripts/community-phase-ka-link-songs-smoke.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_SONG_BYTES, songExtensionForMime, titleFromFilename, validateSongUpload } from '../api/_utils/kaLinkSongs.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const ok = (name: string, fn: () => void) => {
  fn();
  passed += 1;
  console.log(`✓ ${name}`);
};

ok('accepts audio files only, up to 25 MB', () => {
  assert.equal(songExtensionForMime('audio/mpeg'), 'mp3');
  assert.equal(songExtensionForMime('audio/x-m4a'), 'm4a');
  assert.equal(songExtensionForMime('video/mp4'), null);
  assert.equal(validateSongUpload({ mime: 'image/png', size: 10 }).ok, false);
  assert.equal(validateSongUpload({ mime: 'audio/mpeg', size: MAX_SONG_BYTES + 1 }).ok, false);
  assert.equal(validateSongUpload({ mime: 'audio/mpeg', size: 0 }).ok, false);
});

ok('title from the file name when none typed; text cleaned', () => {
  assert.equal(titleFromFilename('Way_Maker-live.mp3'), 'Way Maker live');
  const v = validateSongUpload({ mime: 'audio/mpeg', size: 1000, filename: 'Oceans.mp3', artist: ' <b>Hillsong</b> ' });
  assert.equal(v.ok, true);
  assert.equal((v as any).title, 'Oceans');
  assert.equal((v as any).artist, 'b Hillsong /b');
});

ok('wiring: endpoint, managers, page, migration', () => {
  const core = readFileSync(join(root, 'api/_utils/core.ts'), 'utf8');
  assert.match(core, /chatType === 'ka-link-songs'/);
  assert.match(core, /subResource === 'ka-link-songs'/);
  assert.match(core, /Only the Pastor, Admins and Ka Link team Admins can manage songs/);
  assert.match(readFileSync(join(root, 'App.tsx'), 'utf8'), /admin\/ka-link-music/);
  const sql = readFileSync(join(root, 'supabase/migrations/ka_link_songs.sql'), 'utf8');
  assert.match(sql, /'ka-link-songs', 'ka-link-songs', false/);
});

console.log(`\n${passed} checks passed`);
