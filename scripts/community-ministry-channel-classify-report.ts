/**
 * Read-only Ministry Channel membership classification (NO mutations).
 *
 * Offline fixture (audit expectations for test channel 91942994-…):
 *   npx tsx scripts/community-ministry-channel-classify-report.ts
 *
 * Live read-only (optional; requires env — does NOT update rows):
 *   CLASSIFY_LIVE=1 npx tsx scripts/community-ministry-channel-classify-report.ts
 *
 * Channel under review: 91942994-7fcc-4348-b139-1ef931c3e407
 */
import { createClient } from '@supabase/supabase-js';
import {
  classifyMinistryChannelMemberships,
  listMinistryRosterUserIds,
} from '../api/_utils/communityMembership.js';

const TEST_CHANNEL_ID = '91942994-7fcc-4348-b139-1ef931c3e407';
const CANONICAL_CREATOR = 'cc16b787-203c-49ed-af94-f77bdaef0c23';

/** Audit fixture: 1 creator + 2 roster + 29 manual extras = 32 members. */
function runOfflineFixture() {
  const rosterUserIds = ['roster-a', 'roster-b'];
  const manualExtras = Array.from({ length: 29 }, (_, i) => `extra-${i}`);
  const memberUserIds = [CANONICAL_CREATOR, ...rosterUserIds, ...manualExtras];
  const report = classifyMinistryChannelMemberships({
    createdBy: CANONICAL_CREATOR,
    memberUserIds,
    rosterUserIds,
  });
  console.log(
    JSON.stringify(
      {
        mode: 'offline-fixture',
        channelId: TEST_CHANNEL_ID,
        expectedFromAudit: { creator: 1, roster: 2, manualExtras: 29, totalMembers: 32 },
        classification: report,
        note: 'Do NOT reclassify live data from this script. Repair is a separate approval step.',
      },
      null,
      2
    )
  );
  if (
    report.counts.creator !== 1 ||
    report.counts.roster !== 2 ||
    report.counts.manualExtras !== 29 ||
    report.counts.totalMembers !== 32
  ) {
    throw new Error('Offline fixture counts do not match audit expectations');
  }
}

async function runLiveReadOnly() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) {
    throw new Error('CLASSIFY_LIVE=1 requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  }
  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: channel, error: chErr } = await supabase
    .from('chat_channels')
    .select('id, name, visibility, ministry_id, created_by')
    .eq('id', TEST_CHANNEL_ID)
    .maybeSingle();
  if (chErr) throw chErr;
  if (!channel) throw new Error(`Channel ${TEST_CHANNEL_ID} not found`);

  const { data: members, error: mErr } = await supabase
    .from('chat_room_members')
    .select('user_id, role, source')
    .eq('channel_id', TEST_CHANNEL_ID);
  if (mErr) throw mErr;

  const rosterUserIds = await listMinistryRosterUserIds(
    supabase,
    String(channel.ministry_id || '')
  );
  const classification = classifyMinistryChannelMemberships({
    createdBy: channel.created_by,
    memberUserIds: (members || []).map((m) => String(m.user_id)),
    rosterUserIds,
  });

  console.log(
    JSON.stringify(
      {
        mode: 'live-read-only',
        channel: {
          id: channel.id,
          name: channel.name,
          visibility: channel.visibility,
          ministry_id: channel.ministry_id,
          created_by: channel.created_by,
        },
        rosterUserIds,
        membershipSources: (members || []).reduce(
          (acc: Record<string, number>, m: { source?: string | null }) => {
            const s = String(m.source || 'manual');
            acc[s] = (acc[s] || 0) + 1;
            return acc;
          },
          {}
        ),
        classification,
        mutated: false,
      },
      null,
      2
    )
  );
}

async function main() {
  if (process.env.CLASSIFY_LIVE === '1') {
    await runLiveReadOnly();
    return;
  }
  runOfflineFixture();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
