/**
 * GET/POST /api/vault?resource=people&subResource=keep-in-touch
 * Private request between two adults. Children are never included.
 */

import { isInactiveMemberStatus } from './memberDirectorySearchLogic.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MINOR_RELS = new Set(['child', 'dependent', 'youth']);

function setNoStore(res: any) {
  res.setHeader?.('Cache-Control', 'private, no-store');
}

function ageFromBirthday(value: unknown): number | undefined {
  const iso = String(value || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return undefined;
  // 1904 = birthday saved without a year (adults enter month & day only) — age unknown.
  if (iso.startsWith('1904-')) return undefined;
  const born = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(born.getTime())) return undefined;
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  const month = now.getMonth() - born.getMonth();
  if (month < 0 || (month === 0 && now.getDate() < born.getDate())) age -= 1;
  if (age < 0 || age > 120) return undefined;
  return age;
}

function displayName(row: { first_name?: string | null; last_name?: string | null; preferred_name?: string | null }) {
  const preferred = String(row.preferred_name || '').trim();
  const legal = [row.first_name, row.last_name].map((part) => String(part || '').trim()).filter(Boolean).join(' ');
  return legal || preferred || 'Member';
}

function missingTable(error: { message?: string } | null): boolean {
  return /member_keep_in_touch/i.test(String(error?.message || ''));
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

async function isAdultMember(supabase: any, memberId: string): Promise<boolean> {
  const { data: member } = await supabase
    .from('members')
    .select('id, birthday, status')
    .eq('id', memberId)
    .maybeSingle();
  if (!member?.id || isInactiveMemberStatus(member.status)) return false;
  const age = ageFromBirthday(member.birthday);
  if (age !== undefined && age < 18) return false;
  const { data: edges } = await supabase
    .from('household_members')
    .select('relationship_type')
    .eq('member_id', memberId)
    .eq('status', 'active');
  const minor = (edges || []).some((row: { relationship_type?: string }) =>
    MINOR_RELS.has(String(row.relationship_type || '').toLowerCase())
  );
  return !minor;
}

async function pairRows(supabase: any, left: string, right: string) {
  const { data, error } = await supabase
    .from('member_keep_in_touch')
    .select('id, from_member_id, to_member_id, status')
    .or(`and(from_member_id.eq.${left},to_member_id.eq.${right}),and(from_member_id.eq.${right},to_member_id.eq.${left})`);
  return { data: Array.isArray(data) ? data : [], error };
}

function relationState(rows: any[], selfId: string) {
  const accepted = rows.find((row) => row.status === 'accepted');
  if (accepted) return 'accepted';
  const pending = rows.find((row) => row.status === 'pending');
  if (!pending) return 'none';
  return String(pending.from_member_id) === selfId ? 'outgoing' : 'incoming';
}

async function messageUserId(supabase: any, memberId: string): Promise<string | null> {
  const { data } = await supabase
    .from('user_member_links')
    .select('user_id')
    .eq('member_id', memberId)
    .eq('status', 'verified')
    .maybeSingle();
  return data?.user_id ? String(data.user_id) : null;
}

export async function handleKeepInTouch(req: any, res: any, supabase: any, user: any) {
  setNoStore(res);
  if (!user?.id) return res.status(401).json({ ok: false, error: 'Sign in to keep in touch.' });
  const selfId = await linkedMemberId(supabase, user.id);
  if (!selfId) return res.status(200).json({ ok: true, ready: true, linked: false, state: 'none' });

  if (req.method === 'GET') {
    const memberId = String(req.query?.memberId || '').trim();
    if (memberId) {
      if (!UUID_RE.test(memberId) || memberId === selfId) {
        return res.status(200).json({ ok: true, ready: true, state: 'none', messageUserId: null });
      }
      const pair = await pairRows(supabase, selfId, memberId);
      if (missingTable(pair.error)) {
        return res.status(200).json({ ok: true, ready: false, state: 'none', messageUserId: null });
      }
      if (pair.error) {
        console.error('[Vault API] keep-in-touch:', pair.error.message);
        return res.status(502).json({ ok: false, error: 'Could not load keep in touch.' });
      }
      const state = relationState(pair.data, selfId);
      return res.status(200).json({
        ok: true,
        ready: true,
        state,
        messageUserId: state === 'accepted' ? await messageUserId(supabase, memberId) : null,
      });
    }

    const { data, error } = await supabase
      .from('member_keep_in_touch')
      .select('id, from_member_id, to_member_id, status')
      .or(`from_member_id.eq.${selfId},to_member_id.eq.${selfId}`);
    if (missingTable(error)) return res.status(200).json({ ok: true, ready: false, incoming: [], accepted: [] });
    if (error) {
      console.error('[Vault API] keep-in-touch list:', error.message);
      return res.status(502).json({ ok: false, error: 'Could not load keep in touch.' });
    }
    const rows = (data || []).filter((row: { status?: string }) => row.status === 'pending' || row.status === 'accepted');
    const otherIds = rows.map((row: { from_member_id: string; to_member_id: string }) =>
      String(row.from_member_id) === selfId ? String(row.to_member_id) : String(row.from_member_id)
    );
    const { data: people } = otherIds.length
      ? await supabase.from('members').select('id, first_name, last_name, preferred_name, avatar_url').in('id', otherIds)
      : { data: [] };
    const byId = new Map((people || []).map((row: { id: string }) => [String(row.id), row]));
    const card = (row: { from_member_id: string; to_member_id: string; status: string }) => {
      const otherId = String(row.from_member_id) === selfId ? String(row.to_member_id) : String(row.from_member_id);
      const person = byId.get(otherId) as { avatar_url?: string | null } | undefined;
      const avatar = String(person?.avatar_url || '').trim();
      const status =
        row.status === 'accepted' ? 'accepted' : String(row.to_member_id) === selfId ? 'incoming' : 'outgoing';
      return {
        memberId: otherId,
        displayName: person ? displayName(person) : 'Member',
        avatarUrl: /^https:\/\//i.test(avatar) ? avatar : null,
        status,
      };
    };
    const cards = rows.map(card);
    return res.status(200).json({
      ok: true,
      ready: true,
      incoming: cards.filter((item: { status: string }) => item.status === 'incoming'),
      outgoing: cards.filter((item: { status: string }) => item.status === 'outgoing'),
      accepted: cards.filter((item: { status: string }) => item.status === 'accepted'),
    });
  }

  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  const action = String(req.body?.action || '').trim();
  const memberId = String(req.body?.memberId || '').trim();
  if (!UUID_RE.test(memberId) || memberId === selfId) {
    return res.status(400).json({ ok: false, error: 'Choose another adult.' });
  }
  if (!(await isAdultMember(supabase, selfId)) || !(await isAdultMember(supabase, memberId))) {
    return res.status(403).json({ ok: false, error: 'Keep in touch is for adults only.' });
  }

  const pair = await pairRows(supabase, selfId, memberId);
  if (missingTable(pair.error)) {
    return res.status(503).json({ ok: false, error: 'Keep in touch is not on the church record yet.' });
  }
  if (pair.error) return res.status(502).json({ ok: false, error: 'Could not update keep in touch.' });
  const rows = pair.data;

  if (action === 'request') {
    if (rows.some((row: { status?: string }) => row.status === 'accepted')) {
      return res.status(200).json({ ok: true, state: 'accepted', messageUserId: await messageUserId(supabase, memberId) });
    }
    const incoming = rows.find(
      (row: { status?: string; to_member_id?: string }) => row.status === 'pending' && String(row.to_member_id) === selfId
    );
    if (incoming) {
      await supabase.from('member_keep_in_touch').update({ status: 'accepted', updated_at: new Date().toISOString() }).eq('id', incoming.id);
      return res.status(200).json({ ok: true, state: 'accepted', messageUserId: await messageUserId(supabase, memberId) });
    }
    const mine = rows.find((row: { from_member_id?: string }) => String(row.from_member_id) === selfId);
    if (mine) {
      await supabase
        .from('member_keep_in_touch')
        .update({ status: 'pending', updated_at: new Date().toISOString() })
        .eq('id', mine.id);
    } else {
      const inserted = await supabase.from('member_keep_in_touch').insert({
        from_member_id: selfId,
        to_member_id: memberId,
        status: 'pending',
      });
      if (inserted.error) return res.status(502).json({ ok: false, error: 'Could not send that request.' });
    }
    return res.status(200).json({ ok: true, state: 'outgoing', messageUserId: null });
  }

  if (action === 'accept') {
    const incoming = rows.find(
      (row: { status?: string; to_member_id?: string }) => row.status === 'pending' && String(row.to_member_id) === selfId
    );
    if (!incoming) return res.status(404).json({ ok: false, error: 'There is no request to accept.' });
    await supabase.from('member_keep_in_touch').update({ status: 'accepted', updated_at: new Date().toISOString() }).eq('id', incoming.id);
    return res.status(200).json({ ok: true, state: 'accepted', messageUserId: await messageUserId(supabase, memberId) });
  }

  if (action === 'decline' || action === 'remove') {
    const ids = rows.map((row: { id: string }) => row.id);
    if (ids.length) {
      await supabase.from('member_keep_in_touch').delete().in('id', ids);
    }
    return res.status(200).json({ ok: true, state: 'none', messageUserId: null });
  }

  return res.status(400).json({ ok: false, error: 'Choose keep in touch, accept, or remove.' });
}
