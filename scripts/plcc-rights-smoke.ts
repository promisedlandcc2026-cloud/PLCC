/** PLCC ONE rights — pure recording rule. Run: npx tsx scripts/plcc-rights-smoke.ts */
import assert from 'node:assert/strict';
import { decideKaLinkRecording, parsePlccRightChange, rowToPlccRights } from '../api/_utils/plccRights.js';

const d = (canModerate: boolean, role: string, hasRecordingRight: boolean, recordingRightInUse: boolean) =>
  decideKaLinkRecording({ canModerate, role, hasRecordingRight, recordingRightInUse });

assert.equal(d(true, 'MEMBER', false, false), true, 'before anyone has the right, moderators record (old rule)');
assert.equal(d(true, 'MEMBER', false, true), false, 'once handed out, plain mods cannot record');
assert.equal(d(true, 'ADMIN', true, true), true, 'recording team records');
assert.equal(d(false, 'MEMBER', true, true), false, 'right alone without being a moderator is not enough');
assert.equal(d(false, 'SUPER_ADMIN', false, true), true, 'full rights always record');
assert.deepEqual(rowToPlccRights(null), { kaLinkModerator: false, kaLinkRecording: false, admissions: false });
assert.equal(parsePlccRightChange({ userId: 'x', right: 'admissions', value: true }).ok, false);
assert.equal(parsePlccRightChange({ userId: '846fa364-fce7-4896-a752-fc832ca9a83a', right: 'admissions', value: true }).ok, true);
assert.equal(parsePlccRightChange({ userId: '846fa364-fce7-4896-a752-fc832ca9a83a', right: 'root', value: true }).ok, false);
console.log('plcc-rights smoke: ok');
