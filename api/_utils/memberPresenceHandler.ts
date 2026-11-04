/**
 * GET /api/vault?resource=people&subResource=member-presence
 * Members see people who chose Online. A Super Admin sees the whole adult list.
 */

import { isInactiveMemberStatus } from './memberDirectorySearchLogic.js';
import { courtesyName } from '../../lib/courtesyName.js';

function setNoStore(res: any) {
  res.setHeader?.('Cache-Control', 'private, no-store');
}

function displayName(row: {
  first_name?: string | null;
  last_name?: string | null;
  preferred_name?: string | null;
  address_as?: string | null;
  birthday?: string | null;
  minor?: boolean;
}) {
  return courtesyName({
    firstName: row.first_name,
    lastName: row.last_name,
    preferredName: row.preferred_name,
    addressAs: row.address_as,
    birthday: row.birthday,
    minor: row.minor,
  });
}

async function linkedMemberId(supabase: any, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('user_member_links')
    .select('member_id')
    .eq('user_id', userId)
    .eq('status', 'verified')
    .maybeSingle();
  return data?.member_id ? String(data.member_id) : null;
}

async function keptMemberIds(supabase: any, memberId: string | null): Promise<Set<string>> {
  if (!memberId) return new Set();
  const { data, error } = await supabase
    .from('member_keep_in_touch')
    .select('from_member_id, to_member_id')
    .eq('status', 'accepted')
    .or(`from_member_id.eq.${memberId},to_member_id.eq.${memberId}`);
  if (error || !Array.isArray(data)) return new Set();
  const ids = new Set<string>();
  for (const row of data) {
    const other = String(row.from_member_id) === memberId ? String(row.to_member_id) : String(row.from_member_id);
    if (other) ids.add(other);
  }
  return ids;
}

async function youthMemberIds(supabase: any, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const { data, error } = await supabase
    .from('household_members')
    .select('member_id')
    .in('member_id', ids)
    .in('relationship_type', ['youth'])
    .eq('status', 'active');
  if (error || !Array.isArray(data)) return new Set();
  return new Set(data.map((row: { member_id?: string }) => String(row.member_id || '')).filter(Boolean));
}

async function childMemberIds(supabase: any, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const { data, error } = await supabase
    .from('household_members')
    .select('member_id')
    .in('member_id', ids)
    .in('relationship_type', ['child', 'dependent'])
    .eq('status', 'active');
  if (error || !Array.isArray(data)) return new Set();
  return new Set(data.map((row: { member_id?: string }) => String(row.member_id || '')).filter(Boolean));
}

export async function handleMemberPresence(req: any, res: any, supabase: any, user: any, role: string | null) {
  setNoStore(res);
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  if (!user?.id) {
    return res.status(401).json({ ok: false, error: 'Sign in to see who is online.' });
  }

  const seeEveryone = String(role || '').toUpperCase() === 'SUPER_ADMIN';
  const columns =
    'id, first_name, last_name, preferred_name, avatar_url, status, fellowship_online, address_as, birthday';
  const plainColumns =
    'id, first_name, last_name, preferred_name, avatar_url, status, fellowship_online';
  let query = supabase.from('members').select(columns).limit(200);
  if (!seeEveryone) query = query.eq('fellowship_online', true);
  let result = await query;
  if (result.error && /address_as/i.test(String(result.error.message || ''))) {
    let plain = supabase.from('members').select(plainColumns).limit(200);
    if (!seeEveryone) plain = plain.eq('fellowship_online', true);
    result = await plain;
  }
  if (result.error && /fellowship_online/i.test(String(result.error.message || ''))) {
    return res.status(200).json({ ok: true, scope: seeEveryone ? 'everyone' : 'online', ready: false, members: [] });
  }
  if (result.error && /preferred_name/i.test(String(result.error.message || ''))) {
    let basic = supabase
      .from('members')
      .select('id, first_name, last_name, avatar_url, status, fellowship_online')
      .limit(200);
    if (!seeEveryone) basic = basic.eq('fellowship_online', true);
    result = await basic;
  }
  if (result.error) {
    console.error('[Vault API] member-presence:', result.error.message);
    return res.status(502).json({ ok: false, error: 'Could not load who is online.' });
  }

  const viewerId = await linkedMemberId(supabase, user.id);
  const kept = await keptMemberIds(supabase, viewerId);
  const rows = Array.isArray(result.data) ? result.data : [];
  const hidden = await childMemberIds(
    supabase,
    rows.map((row: { id?: string }) => String(row.id || '')).filter(Boolean)
  );
  const youth = await youthMemberIds(
    supabase,
    rows.map((row: { id?: string }) => String(row.id || '')).filter(Boolean)
  );
  const members = rows
    .filter((row: { id?: string; status?: string | null; fellowship_online?: boolean }) => {
      const id = String(row.id || '').trim();
      if (!id || hidden.has(id) || isInactiveMemberStatus(row.status)) return false;
      if (!seeEveryone && row.fellowship_online !== true) return false;
      return true;
    })
    .map((row: { id?: string; avatar_url?: string | null; fellowship_online?: boolean; first_name?: string | null; last_name?: string | null; preferred_name?: string | null; address_as?: string | null; birthday?: string | null }) => {
      const avatar = String(row.avatar_url || '').trim();
      return {
        id: String(row.id),
        displayName: displayName({ ...row, minor: youth.has(String(row.id)) }),
        avatarUrl: /^https:\/\//i.test(avatar) ? avatar : null,
        online: row.fellowship_online === true,
        inTouch: kept.has(String(row.id)),
      };
    })
    .sort((left: { online: boolean; inTouch: boolean; displayName: string }, right: { online: boolean; inTouch: boolean; displayName: string }) => {
      if (left.inTouch !== right.inTouch) return left.inTouch ? -1 : 1;
      if (left.online !== right.online) return left.online ? -1 : 1;
      return left.displayName.localeCompare(right.displayName);
    })
    .slice(0, 80);

  return res.status(200).json({
    ok: true,
    scope: seeEveryone ? 'everyone' : 'online',
    ready: true,
    members,
  });
}
