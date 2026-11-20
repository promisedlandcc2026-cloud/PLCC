/**
 * Music team smoke (Nov 19 2026): leaders pick who may upload bought songs.
 * Run: npx tsx scripts/community-phase-music-team-smoke.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const core = readFileSync(join(root, 'api/_utils/core.ts'), 'utf8');
const songs = core.slice(core.indexOf("if (chatType === 'ka-link-songs') {"), core.indexOf("if (chatType === 'voice-recording') {"));
let passed = 0;
const ok = (name: string, fn: () => void) => {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
};
ok('music team may manage songs; only managers choose the team', () => {
  assert.match(songs, /from\('ka_link_music_team'\)/);
  assert.match(songs, /const isSongManager = isTeamManager \|\| isMusicTeam;/);
  assert.match(songs, /songAction === 'team-list' \|\| songAction === 'team-add' \|\| songAction === 'team-remove'[\s\S]{0,80}if \(!isTeamManager\)/);
});
ok('uploads need the "bought it" confirmation; music team changes only their own songs', () => {
  assert.match(songs, /req\.body\?\.purchased !== true/);
  assert.match(songs, /!isTeamManager && String\(\(song as any\)\.uploaded_by \|\| ''\) !== String\(authUserId\)/);
});
ok('Canaan page has the Music team section and the purchase checkbox', () => {
  const page = readFileSync(join(root, 'pages/admin/KaLinkMusic.tsx'), 'utf8');
  assert.match(page, /data-testid="music-team"/);
  assert.match(page, /disabled=\{!purchased \|\|/);
  assert.match(readFileSync(join(root, 'supabase/migrations/ka_link_songs.sql'), 'utf8'), /ka_link_music_team/);
});
console.log(`\n${passed} passed`);
