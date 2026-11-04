/**
 * Tell linked parents when a child earns PLCC Bucks.
 * The inbox link is the child's AWCD card ref. No member id is included.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { notifyUser } from './notify.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const KIDS_CARD_REF_RE = /^AWCD\.[0-9a-f]{64}$/;

export function bucksNotifyParentIds(input: {
  guardianUserIds: string[];
  householdAdultUserIds: string[];
  actorUserId: string;
}): string[] {
  const actor = String(input.actorUserId || '').trim();
  const ids = new Set<string>();
  for (const raw of [...input.guardianUserIds, ...input.householdAdultUserIds]) {
    const id = String(raw || '').trim();
    if (!UUID_RE.test(id) || id === actor) continue;
    ids.add(id);
  }
  return [...ids];
}

async function linkedParentIds(supabase: SupabaseClient, childId: string, actorUserId: string): Promise<string[]> {
  const guardians = await supabase
    .from('guardian_relationships')
    .select('guardian_user_id')
    .eq('child_member_id', childId)
    .eq('status', 'active');
  const kidHomes = await supabase
    .from('household_members')
    .select('household_id')
    .eq('member_id', childId)
    .eq('status', 'active')
    .in('relationship_type', ['child', 'dependent']);
  const householdIds = [...new Set((kidHomes.data || []).map((r: any) => String(r.household_id || '')).filter((id) => UUID_RE.test(id)))];
  let adultUserIds: string[] = [];
  if (householdIds.length) {
    const adults = await supabase
      .from('household_members')
      .select('member_id, relationship_type')
      .in('household_id', householdIds)
      .eq('status', 'active');
    const adultMemberIds = [...new Set(
      (adults.data || [])
        .filter((r: any) => !['child', 'dependent'].includes(String(r.relationship_type || '').toLowerCase()))
        .map((r: any) => String(r.member_id || ''))
        .filter((id) => UUID_RE.test(id))
    )];
    if (adultMemberIds.length) {
      const links = await supabase
        .from('user_member_links')
        .select('user_id')
        .in('member_id', adultMemberIds)
        .eq('status', 'verified');
      adultUserIds = (links.data || []).map((r: any) => String(r.user_id || ''));
    }
  }
  return bucksNotifyParentIds({
    guardianUserIds: (guardians.data || []).map((r: any) => String(r.guardian_user_id || '')),
    householdAdultUserIds: adultUserIds,
    actorUserId,
  });
}

/** No-op on a duplicate award, a missing card ref, or a notify failure. */
export async function notifyParentsOfBucksAward(
  supabase: SupabaseClient,
  input: { childId: string; amount: number; reasonLabel: string; entryId: string; actorUserId: string; duplicate?: boolean }
): Promise<void> {
  try {
    if (input.duplicate) return;
    const amount = Math.round(Number(input.amount));
    const entryId = String(input.entryId || '').trim();
    const childId = String(input.childId || '').trim();
    if (!UUID_RE.test(childId) || !UUID_RE.test(entryId) || !(amount > 0)) return;

    const [{ data: member }, { data: card }] = await Promise.all([
      supabase.from('members').select('first_name').eq('id', childId).maybeSingle(),
      supabase.from('dependent_digital_cards').select('card_ref, status').eq('member_id', childId).maybeSingle(),
    ]);
    const cardRef = String(card?.card_ref || '');
    if (card?.status && card.status !== 'active') return;
    if (!KIDS_CARD_REF_RE.test(cardRef)) return;

    const name = String(member?.first_name || '').trim() || 'Your child';
    const reason = String(input.reasonLabel || '').trim() || 'a kids ministry moment';
    const parents = await linkedParentIds(supabase, childId, input.actorUserId);
    await Promise.all(parents.map((userId) => notifyUser(supabase, userId, {
      type: 'kids_bucks_award',
      title: `${name} earned PLCC Bucks`,
      body: `${name} earned ${amount} PLCC Bucks for ${reason}.`,
      link: `/family/kids/${cardRef}`,
      sourceId: entryId,
    })));
  } catch (err: any) {
    console.warn('[kids-bucks-notify]', err?.message || err);
  }
}
