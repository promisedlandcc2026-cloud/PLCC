/**
 * PLCC Community — Live Huddle shared waiting music smoke (no live media required).
 * Run: npx tsx scripts/community-phase-huddle-music-smoke.ts
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  canControlHuddleMusic,
  formatHuddleMusicError,
  HUDDLE_MUSIC_ASSET_PATH,
  HUDDLE_MUSIC_DEFAULT_VOLUME,
  HUDDLE_MUSIC_TRACK_NAME,
  huddleMusicButtonLabel,
  huddleRemoteAudioAttachKey,
  isHuddleMusicPublication,
  roomHasHuddleMusic,
} from '../api/_utils/huddleMusic.js';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  OK: ${msg}`);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

console.log('Huddle waiting music smoke — helpers');

assert(HUDDLE_MUSIC_TRACK_NAME === 'awc-huddle-music', 'track name constant');
assert(HUDDLE_MUSIC_ASSET_PATH === '/huddle/waiting.mp3', 'asset path constant');
assert(HUDDLE_MUSIC_DEFAULT_VOLUME === 0.18, 'default volume quieter for phones');
assert(HUDDLE_MUSIC_DEFAULT_VOLUME > 0 && HUDDLE_MUSIC_DEFAULT_VOLUME < 1, 'volume quieter than speech');
assert(huddleMusicButtonLabel(false) === 'Play Music', 'play label');
assert(huddleMusicButtonLabel(true) === 'Stop Music', 'stop label');
assert(isHuddleMusicPublication({ name: HUDDLE_MUSIC_TRACK_NAME }), 'match by name');
assert(isHuddleMusicPublication({ trackName: HUDDLE_MUSIC_TRACK_NAME }), 'match by trackName');
assert(!isHuddleMusicPublication({ name: 'microphone' }), 'mic is not music');
assert(roomHasHuddleMusic([{ name: 'mic' }, { trackName: HUDDLE_MUSIC_TRACK_NAME }]), 'room has music');
assert(!roomHasHuddleMusic([{ name: 'mic' }]), 'room without music');
assert(
  huddleRemoteAudioAttachKey('user-a', 'TR_abc') === 'user-a:TR_abc',
  'attach key includes trackSid'
);
assert(
  huddleRemoteAudioAttachKey('user-a', 'TR_1') !== huddleRemoteAudioAttachKey('user-a', 'TR_2'),
  'mic + music keys differ for same identity'
);
assert(
  formatHuddleMusicError(new Error('Waiting music file is not installed.')) ===
    'Waiting music file is not installed.',
  'missing file error'
);
assert(
  /not available in this browser/i.test(formatHuddleMusicError(new Error('captureStream not supported'))),
  'captureStream unsupported error'
);
assert(
  formatHuddleMusicError(new Error('Music is already playing.')) === 'Music is already playing.',
  'already playing error'
);

console.log('\nHuddle waiting music smoke — asset + UI wiring');

assert(
  existsSync(join(root, 'public/huddle/waiting.mp3')),
  'public/huddle/waiting.mp3 present (church may replace with licensed track)'
);

const ui = read('components/Community/VoiceHuddle.tsx');
const helper = read('api/_utils/huddleMusic.ts');

assert(/toggleHuddleMusic|stopHuddleMusic/.test(ui), 'UI has play/stop music handlers');
assert(/data-huddle-music-control/.test(ui), 'moderator music control present');
assert(/HUDDLE_MUSIC_TRACK_NAME/.test(ui), 'publishes named music track');
assert(/LocalAudioTrack/.test(ui), 'uses LocalAudioTrack for captureStream publish');
assert(/captureStream|mozCaptureStream/.test(ui), 'captureStream path wired');
assert(/huddleRemoteAudioAttachKey/.test(ui), 'remote audio attach keyed by trackSid');
assert(/data-huddle-music-active/.test(ui), 'Music playing chip for everyone');
assert(/data-huddle-music-volume/.test(ui), 'moderator music volume slider present');
assert(/setHuddleMusicVolume|musicVolume/.test(ui), 'music volume state wired');
assert(/musicAudioRef\.current\.volume|audioEl\.volume = musicVolume/.test(ui), 'volume applies to music audio element');
assert(/canControlHuddleMusic|canPlayHuddleMusic/.test(ui) && /data-huddle-music-control/.test(ui), 'music control uses canControlHuddleMusic');
assert(canControlHuddleMusic(true) === true, 'session/channel mod can control music');
assert(canControlHuddleMusic(false) === false, 'plain member cannot control music');
assert(/huddle session host|whoever started/i.test(helper), 'helper documents host/starter music access');
assert(/stopHuddleMusic/.test(ui) && /disconnectRoom/.test(ui), 'leave/disconnect cleans up music');
assert(/setMusicVolume\(HUDDLE_MUSIC_DEFAULT_VOLUME\)/.test(ui), 'volume resets to default on stop');
assert(!/CREATE TABLE|ALTER TABLE|recording|getDisplayMedia\s*\(/.test(helper), 'no DB/recording in helper');
assert(/church-supplied|licensed/i.test(helper), 'helper documents licensed asset requirement');

const core = read('api/_utils/core.ts');
assert(/!session\.roles\.hostId/.test(core), 'first joiner host claim unlocks starter music');

console.log('\nAll huddle waiting music smoke tests passed.');
