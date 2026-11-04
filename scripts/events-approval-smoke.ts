/**
 * Event calendar approval + day-lock smoke.
 * Run: npx tsx scripts/events-approval-smoke.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyApproveTransition,
  canApproveEvents,
  canBypassEventDateLock,
  canDeleteEventRow,
  canEditEventRow,
  canSubmitEvents,
  filterEventsForViewer,
  isEventDateLocked,
  lockedDatesFromEvents,
  mergeApproverUserIds,
  normalizeEventStatus,
  parseApproveRejectAction,
  parseApproverUserIdsFromEnv,
  resolveCreateStatus,
} from '../api/_utils/eventApprovalLogic.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
  console.log(`  OK: ${msg}`);
}

console.log('\nEvent calendar approval smoke');

const migration = read('supabase/migrations/events_approval_flow.sql');
const logic = read('api/_utils/eventApprovalLogic.ts');
const notify = read('api/_utils/eventApprovalNotify.ts');
const core = read('api/_utils/core.ts');
const permissions = read('lib/permissions.ts');
const overview = read('pages/events/Overview.tsx');
const drawer = read('components/Admin/NotificationDrawer.tsx');
const notifyTypes = read('api/_utils/notify.ts');

// --- Migration ---
assert(/status TEXT NOT NULL DEFAULT 'approved'/.test(migration), 'M: status column default approved');
assert(/submitted_by/.test(migration) && /approved_by/.test(migration), 'M: submitter/approver columns');
assert(/event_approver_config/.test(migration), 'M: approver config table');
assert(/jerlessm@gmail\.com/.test(migration), 'M: seeds Jerless via email');
assert(/'event_approval'/.test(migration), 'M: notification type widened');

// --- Permissions ---
assert(/'event\.submit'/.test(permissions), 'P: event.submit action');
assert(/'event\.approve'/.test(permissions), 'P: event.approve action');
assert(/'event\.submit':\s*\[[\s\S]*?MINISTRY_LEADER/.test(permissions), 'P: ministry can submit');
assert(/'event\.approve':\s*\[[\s\S]*?MINISTRY_LEADER/.test(permissions), 'P: ministry can approve');

// --- Notify type ---
assert(/event_approval/.test(notifyTypes), 'N: NotifyType includes event_approval');
assert(/event_approval/.test(drawer), 'N: drawer handles event_approval');

// --- API wiring ---
assert(/eventApprovalLogic/.test(core), 'A: core imports approval logic');
assert(/canBypassEventDateLock/.test(core), 'A: core imports date-lock bypass');
assert(/notifyEventApproversOfSubmit/.test(core), 'A: submit notifies approvers');
assert(/notifyEventSubmitterOfDecision/.test(core), 'A: decision notifies submitter');
assert(/action === 'approve'|parseApproveRejectAction/.test(core), 'A: approve/reject path');
assert(/isEventDateLocked/.test(core), 'A: date lock enforced on create');
assert(/canBypassDateLock/.test(core), 'A: GET meta includes canBypassDateLock');
assert(/Ask a Super Admin/.test(core), 'A: locked-day error points to Super Admin');
assert(/requireAuth/.test(core) && /Not allowed to create events/.test(core), 'A: POST requires auth + submit');

// --- UI ---
assert(/Request event/.test(overview), 'U: submitter CTA');
assert(/Pending requests|Pending \(/.test(overview), 'U: pending queue');
assert(/pending=1|showPendingPanel/.test(overview), 'U: deep link pending panel');
assert(/isDayLocked|Locked/.test(overview), 'U: locked day greying');
assert(/canBypassDateLock/.test(overview), 'U: greys using Super Admin bypass flag');
assert(/!canBypassDateLock && isDayLocked/.test(overview), 'U: lock not tied to canApproveEvents');
assert(/getAuthHeaders/.test(overview), 'U: auth headers on calendar fetches');
assert(
  /if \(!canEditListedEvent\(event\)\) return/.test(overview),
  'U: edit modal blocked without edit permission'
);
assert(
  /if \(canEditListedEvent\(ev\)\)[\s\S]*?openEditModal/.test(overview),
  'U: calendar chip opens edit only when allowed'
);

// --- Pure logic: status ---
assert(normalizeEventStatus(undefined) === 'approved', 'L: missing status = approved (legacy)');
assert(normalizeEventStatus('pending') === 'pending', 'L: pending status');
assert(normalizeEventStatus('REJECTED') === 'rejected', 'L: rejected status');

// --- Roles ---
assert(canApproveEvents({ role: 'SUPER_ADMIN', userId: 'a', configuredApproverIds: [] }), 'L: super admin approves');
assert(canApproveEvents({ role: 'PASTOR', userId: 'a', configuredApproverIds: [] }), 'L: pastor approves');
assert(canApproveEvents({ role: 'ADMIN', userId: 'a', configuredApproverIds: [] }), 'L: admin approves');
assert(
  canApproveEvents({ role: 'MINISTRY_LEADER', userId: 'x', configuredApproverIds: [] }),
  'L: ministry leader can approve'
);
assert(
  canApproveEvents({
    role: 'SECRETARY',
    userId: 'cfg-1',
    configuredApproverIds: ['cfg-1'],
  }),
  'L: configured approver bypasses role'
);
assert(canSubmitEvents({ role: 'MINISTRY_LEADER', userId: 'x', configuredApproverIds: [] }), 'L: ministry can submit');
assert(canSubmitEvents({ role: 'SECRETARY', userId: 'x', configuredApproverIds: [] }), 'L: secretary can submit');
assert(!canSubmitEvents({ role: 'MEMBER', userId: 'x', configuredApproverIds: [] }), 'L: member cannot submit');

// --- Date-lock bypass (Super Admin only) ---
assert(canBypassEventDateLock({ role: 'SUPER_ADMIN' }), 'L: super admin bypasses date lock');
assert(!canBypassEventDateLock({ role: 'PASTOR' }), 'L: pastor cannot bypass date lock');
assert(!canBypassEventDateLock({ role: 'ADMIN' }), 'L: admin cannot bypass date lock');
assert(!canBypassEventDateLock({ role: 'MINISTRY_LEADER' }), 'L: ministry cannot bypass date lock');

// --- Create status ---
assert(resolveCreateStatus(true) === 'approved', 'L: approver creates approved');
assert(resolveCreateStatus(false) === 'pending', 'L: submitter creates pending');

// --- Date lock ---
const sample = [
  { id: '1', date: '2026-10-05', status: 'approved' },
  { id: '2', date: '2026-10-06', status: 'pending' },
];
assert(isEventDateLocked(sample, '2026-10-05') === true, 'L: approved day is locked');
assert(isEventDateLocked(sample, '2026-10-06') === false, 'L: pending-only day not locked');
assert(isEventDateLocked(sample, '2026-10-07') === false, 'L: empty day not locked');
assert(JSON.stringify(lockedDatesFromEvents(sample)) === JSON.stringify(['2026-10-05']), 'L: lockedDates list');

// --- Visibility ---
const rows = [
  { id: 'a', date: '2026-10-01', status: 'approved', submitted_by: 'u1' },
  { id: 'b', date: '2026-10-02', status: 'pending', submitted_by: 'u1' },
  { id: 'c', date: '2026-10-03', status: 'pending', submitted_by: 'u2' },
  { id: 'd', date: '2026-10-04', status: 'rejected', submitted_by: 'u1' },
];
const publicView = filterEventsForViewer(rows, { viewerId: null, canApprove: false });
assert(publicView.length === 1 && publicView[0].id === 'a', 'L: public sees approved only');

const submitterView = filterEventsForViewer(rows, { viewerId: 'u1', canApprove: false });
assert(
  submitterView.map((e) => e.id).sort().join(',') === 'a,b,d',
  'L: submitter sees own pending/rejected + approved'
);

const approverView = filterEventsForViewer(rows, { viewerId: 'admin', canApprove: true });
assert(approverView.length === 4, 'L: approver sees all statuses');

// --- Edit gates ---
assert(
  canEditEventRow({ status: 'pending', submitted_by: 'u1' }, { viewerId: 'u1', canApprove: false }),
  'L: submitter edits own pending'
);
assert(
  !canEditEventRow({ status: 'approved', submitted_by: 'u1' }, { viewerId: 'u1', canApprove: false }),
  'L: submitter cannot edit approved'
);
assert(
  canDeleteEventRow({ status: 'pending', submitted_by: 'u1' }, { viewerId: 'admin', canApprove: true }),
  'L: approver can delete'
);

// --- Approve transition ---
assert(parseApproveRejectAction('approve') === 'approve', 'L: parse approve');
assert(parseApproveRejectAction('nope') === null, 'L: parse invalid action');
const approved = applyApproveTransition('approve', 'admin-1');
assert(approved.status === 'approved' && approved.approved_by === 'admin-1', 'L: approve transition');
const rejected = applyApproveTransition('reject', 'admin-1', 'Conflict');
assert(rejected.status === 'rejected' && rejected.rejection_reason === 'Conflict', 'L: reject transition');

// --- Env merge ---
assert(
  parseApproverUserIdsFromEnv('11111111-1111-1111-1111-111111111111, bad').length === 1,
  'L: env UUID parse'
);
assert(
  mergeApproverUserIds(['a'], ['a', 'b']).join(',') === 'a,b',
  'L: merge unique approver ids'
);

// --- Notify helper source ---
assert(/notifyUser/.test(notify) && /getResend/.test(notify), 'N: Vault + Resend path');
assert(/EVENT_APPROVER_USER_IDS/.test(notify), 'N: env override for approvers');
assert(/eventApprovalDeepLink|pending=1/.test(logic), 'N: deep link helper');

console.log('\nAll event approval smoke tests passed.');
