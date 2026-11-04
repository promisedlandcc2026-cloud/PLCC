/**
 * Community voice huddle attendance — schema, webhook, API gate, UI contracts.
 * Run: npx tsx scripts/community-phase-huddle-attendance-smoke.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  canViewHuddleAttendance,
  HUDDLE_ATTENDANCE_VIEW_ROLES,
  isHuddleAttendanceWebhookEvent,
} from '../api/_utils/huddleAttendance.js';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  OK: ${msg}`);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

console.log('Huddle attendance smoke — role gate');

assert(HUDDLE_ATTENDANCE_VIEW_ROLES.has('PASTOR'), 'Pastor can view attendance');
assert(HUDDLE_ATTENDANCE_VIEW_ROLES.has('SUPER_ADMIN'), 'Super Admin can view attendance');
assert(HUDDLE_ATTENDANCE_VIEW_ROLES.has('ADMIN'), 'Admin can view attendance');
assert(HUDDLE_ATTENDANCE_VIEW_ROLES.has('MINISTRY_LEADER'), 'Ministry Leader can view attendance');
assert(canViewHuddleAttendance('PASTOR') === true, 'canViewHuddleAttendance(PASTOR)');
assert(canViewHuddleAttendance('MEMBER') === false, 'members cannot view named attendance');
assert(canViewHuddleAttendance('ADMIN_STAFF') === false, 'ADMIN_STAFF is not in plan lock set');

console.log('\nHuddle attendance smoke — webhook event filter');

assert(isHuddleAttendanceWebhookEvent('room_started') === true, 'room_started persists session');
assert(isHuddleAttendanceWebhookEvent('participant_joined') === true, 'participant_joined upserts');
assert(isHuddleAttendanceWebhookEvent('participant_left') === true, 'participant_left sets left_at');
assert(isHuddleAttendanceWebhookEvent('room_finished') === true, 'room_finished ends session');
assert(isHuddleAttendanceWebhookEvent('track_published') === false, 'unrelated events ignored');

console.log('\nHuddle attendance smoke — migration schema');

const migration = read('supabase/migrations/community_phase_huddle_attendance.sql');
assert(/CREATE TABLE IF NOT EXISTS public\.community_huddle_sessions/.test(migration), 'sessions table');
assert(/CREATE TABLE IF NOT EXISTS public\.community_huddle_attendance/.test(migration), 'attendance table');
assert(/UNIQUE \(session_id, identity\)/.test(migration), 'unique session+identity');
assert(/ENABLE ROW LEVEL SECURITY/.test(migration), 'RLS enabled');
assert(/channel_id/.test(migration) && /room_name/.test(migration) && /room_sid/.test(migration), 'session columns');
assert(/joined_at/.test(migration) && /left_at/.test(migration) && /display_name/.test(migration), 'attendance columns');

console.log('\nHuddle attendance smoke — webhook + API source');

const webhook = read('api/livekit-webhook.ts');
const helper = read('api/_utils/huddleAttendance.ts');
const core = read('api/_utils/core.ts');
assert(/handleHuddleAttendanceWebhookEvent/.test(webhook), 'webhook calls attendance handler');
assert(/isHuddleAttendanceWebhookEvent/.test(webhook), 'webhook filters attendance events');
assert(/participant_joined/.test(helper), 'helper handles participant_joined');
assert(/room_finished/.test(helper), 'helper handles room_finished');
assert(/voice-huddle-attendance/.test(core), 'API subresource voice-huddle-attendance');
assert(/canViewHuddleAttendance\(authRole\)/.test(core), 'API gates by attendance roles');
assert(
  /Only Pastor, Admin, Super Admin, or Ministry Leader can view huddle attendance/.test(core),
  'API 403 copy for non-leaders'
);
assert(/getHuddleAttendanceForChannel/.test(core), 'API loads live + session + history');

console.log('\nHuddle attendance smoke — UI strings');

const panel = read('components/Community/HuddleAttendancePanel.tsx');
const voice = read('components/Community/VoiceHuddle.tsx');
const chat = read('pages/community/Chat.tsx');
assert(/In huddle now/.test(panel), 'live roster section');
assert(/Joined this session/.test(panel), 'cumulative session section');
assert(/Recent huddle attendance/.test(panel), 'history section');
assert(/Huddle attendance/.test(panel), 'panel title');
assert(/voice-huddle-attendance/.test(panel), 'panel fetches attendance API');
assert(/data-huddle-attendance-toggle/.test(voice), 'VoiceHuddle attendance toggle');
assert(/HuddleAttendancePanel/.test(voice), 'VoiceHuddle embeds attendance panel');
assert(/data-huddle-attendance-dock/.test(voice), 'Attendance docks in main split (left rail)');
assert(/data-huddle-hands-panel/.test(voice), 'Hands queue is a dedicated panel/sheet');
assert(/data-huddle-hands-control/.test(voice), 'Footer Hands list toggle');
assert(/data-huddle-chat-panel/.test(voice), 'Chat remains a right/bottom panel');
assert(/openAttendancePanel|toggleAttendancePanel/.test(voice), 'Attendance open helpers');
assert(/sm:border-r/.test(voice) && /data-huddle-attendance-dock/.test(voice), 'Attendance left border rail');
assert(!/data-huddle-attendance-live="true">\s*<HuddleAttendancePanel/.test(voice), 'Attendance is not a top strip above split');
assert(/data-huddle-attendance-chat-toggle/.test(chat), 'Chat header attendance toggle');
assert(/Who.?s here/.test(chat), 'Chat live banner Who’s here entry');
assert(/data-huddle-attendance-history-panel/.test(chat), 'Chat history/live panel mount');
assert(/preferHistory/.test(chat), 'Chat prefers history when huddle not live');
assert(/canViewHuddleAttendanceUi/.test(chat) && /canViewHuddleAttendanceUi/.test(voice), 'UI role helper');

console.log('\nHuddle attendance smoke — all checks passed');
