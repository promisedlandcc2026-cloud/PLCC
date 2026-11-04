/**
 * GET/PATCH /api/vault?resource=people&subResource=member-self
 * Signed-in member identity from the church record (linked members row).
 */

import { canViewPeopleRoster } from './peopleRosterLogic.js';
import { listAccessibleChannels } from './communityChatSecurity.js';
import { normalizeAddressAs } from '../../lib/courtesyName.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function httpsCoverUrl(value: unknown): string | null {
  const url = String(value || '').trim();
  if (!url) return null;
  if (!/^https:\/\//i.test(url) || url.length > 2048) return null;
  return url;
}

function fellowshipOnlineFlag(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function httpsAvatarUrl(value: unknown): string | null {
  const url = String(value || '').trim();
  if (!url || !/^https:\/\//i.test(url) || url.length > 2048) return null;
  return url;
}

function avatarFileFromDataUrl(value: unknown): { bytes: Buffer; contentType: string; ext: string } | null {
  const raw = String(value || '').trim();
  const match = /^data:image\/(jpeg|jpg|png|webp);base64,([a-z0-9+/=\s]+)$/i.exec(raw);
  if (!match) return null;
  const kind = match[1].toLowerCase() === 'jpg' ? 'jpeg' : match[1].toLowerCase();
  const bytes = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  if (!bytes.length || bytes.length > 450_000) return null;
  return {
    bytes,
    contentType: `image/${kind}`,
    ext: kind === 'jpeg' ? 'jpg' : kind,
  };
}

async function storedAvatarUrl(supabase: any, userId: string, value: unknown): Promise<string | null> {
  const existing = httpsAvatarUrl(value);
  if (existing) return existing;
  const image = avatarFileFromDataUrl(value);
  if (!image) return null;
  const path = `${userId}/profile.${image.ext}`;
  const { error } = await supabase.storage.from('avatars').upload(path, image.bytes, {
    contentType: image.contentType,
    upsert: true,
  });
  if (error) {
    console.error('[Vault API] member-self avatar:', error.message);
    return null;
  }
  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  const url = String(data?.publicUrl || '').trim();
  if (!url) return null;
  return httpsAvatarUrl(`${url}${url.includes('?') ? '&' : '?'}v=${Date.now()}`);
}

export const MAX_FAVORITE_HUDDLES = 8;

const BADGE_CATEGORIES = ['Outreach', 'Worship', 'Hospitality', 'Tech & Media', 'Ushering', 'Children'];
const PROFILE_ROLES = ['SUPER_ADMIN', 'PASTOR', 'LEADER', 'VOLUNTEER', 'MEMBER'];

function profileRole(value: unknown): string | null {
  const role = String(value || '').trim().toUpperCase().replace(/\s+/g, '_');
  return PROFILE_ROLES.includes(role) ? role : null;
}

const MILESTONE_CATEGORIES = ['Baptism', 'Membership', 'Leadership', 'Discipleship', 'Ordination', 'Service'];

export function normalizeJourneyMilestones(raw: unknown): {
  id: string;
  title: string;
  date: string;
  category: string;
  description: string;
  officiatedBy?: string;
}[] {
  if (!Array.isArray(raw)) return [];
  const milestones = [];
  for (const item of raw) {
    const title = String(item?.title || '').trim().slice(0, 120);
    const date = String(item?.date || '').trim().slice(0, 40);
    if (!title || !date) continue;
    const category = MILESTONE_CATEGORIES.includes(String(item?.category || ''))
      ? String(item.category)
      : 'Service';
    const officiatedBy = String(item?.officiatedBy || '').trim().slice(0, 80);
    milestones.push({
      id: String(item?.id || `jm_${milestones.length}`).trim().slice(0, 40),
      title,
      date,
      category,
      description: String(item?.description || '').trim().slice(0, 500),
      ...(officiatedBy ? { officiatedBy } : {}),
    });
    if (milestones.length >= 40) break;
  }
  return milestones;
}

export function normalizeVolunteerBadges(raw: unknown): { category: string; active: boolean }[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const badges: { category: string; active: boolean }[] = [];
  for (const item of raw) {
    const category = String(item?.category || '').trim();
    if (!BADGE_CATEGORIES.includes(category) || seen.has(category) || item?.active === false) continue;
    seen.add(category);
    badges.push({ category, active: true });
  }
  return badges;
}

export function memberSinceLabel(joinedOn: unknown, createdAt?: unknown): string {
  const raw = isoDate(joinedOn) || isoDate(String(createdAt || '').slice(0, 10));
  if (!raw) return '';
  const [year, month] = raw.split('-').map((part) => Number(part));
  const date = new Date(year, (month || 1) - 1, 1);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function normalizeFavoriteHuddles(
  raw: unknown,
  fallback?: { id?: string | null; name?: string | null }
): { id: string; name: string }[] {
  const source = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const huddles: { id: string; name: string }[] = [];
  for (const item of source) {
    const id = String(item?.id || '').trim();
    const name = String(item?.name || '').trim().slice(0, 80);
    if (!UUID_RE.test(id) || !name || seen.has(id)) continue;
    seen.add(id);
    huddles.push({ id, name });
    if (huddles.length >= MAX_FAVORITE_HUDDLES) break;
  }
  if (!huddles.length) {
    const id = String(fallback?.id || '').trim();
    const name = String(fallback?.name || '').trim().slice(0, 80);
    if (UUID_RE.test(id) && name) huddles.push({ id, name });
  }
  return huddles;
}

function setNoStore(res: any) {
  res.setHeader?.('Cache-Control', 'private, no-store');
}

function isoDate(value: unknown): string | null {
  const raw = String(value || '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
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

async function loadProfile(supabase: any, userId: string, memberId: string) {
  const selects = [
    'id, first_name, last_name, preferred_name, birthday, phone, email, avatar_url, household_name, status, role, bio, favorite_huddles, favorite_huddle_id, favorite_huddle_name, joined_on, created_at, volunteer_badges, journey_milestones, fellowship_online, cover_url, address_as',
    'id, first_name, last_name, preferred_name, birthday, phone, email, avatar_url, household_name, status, role, bio',
    'id, first_name, last_name, preferred_name, birthday, phone, email, avatar_url, household_name, status, role',
    'id, first_name, last_name, birthday, phone, email, avatar_url, household_name, status, role',
  ];
  let memberQuery = await supabase.from('members').select(selects[0]).eq('id', memberId).maybeSingle();
  if (memberQuery.error && /address_as/i.test(String(memberQuery.error.message || ''))) {
    memberQuery = await supabase
      .from('members')
      .select(selects[0].replace(', address_as', ''))
      .eq('id', memberId)
      .maybeSingle();
  }
  for (let i = 1; i < selects.length && memberQuery.error; i += 1) {
    memberQuery = await supabase.from('members').select(selects[i]).eq('id', memberId).maybeSingle();
  }
  const [{ data: member }, { data: appUser }] = [
    memberQuery,
    await supabase.from('users').select('name, title, birthday, phone, avatar_url').eq('id', userId).maybeSingle(),
  ];

  const firstName = String(member?.first_name || '').trim();
  const lastName = String(member?.last_name || '').trim();
  const preferredName = String(member?.preferred_name || '').trim();
  const displayName =
    preferredName ||
    [firstName, lastName].filter(Boolean).join(' ') ||
    String(appUser?.name || '').trim() ||
    'Member';

  return {
    linked: true,
    memberId,
    firstName: firstName || null,
    lastName: lastName || null,
    preferredName: preferredName || null,
    displayName,
    title: String(appUser?.title || '').trim() || null,
    birthday: isoDate(member?.birthday) || isoDate(appUser?.birthday),
    phone: String(member?.phone || appUser?.phone || '').trim() || null,
    email: String(member?.email || '').trim() || null,
    avatarUrl: String(member?.avatar_url || appUser?.avatar_url || '').trim() || null,
    householdName: String(member?.household_name || '').trim() || null,
    status: String(member?.status || '').trim() || null,
    role: profileRole(member?.role),
    bio: String(member?.bio || '').trim() || null,
    favoriteHuddles: normalizeFavoriteHuddles(member?.favorite_huddles, {
      id: member?.favorite_huddle_id,
      name: member?.favorite_huddle_name,
    }),
    favoriteHuddleId: String(member?.favorite_huddle_id || '').trim() || null,
    favoriteHuddleName: String(member?.favorite_huddle_name || '').trim() || null,
    joinedOn: isoDate(member?.joined_on),
    createdAt: member?.created_at ? String(member.created_at) : null,
    memberSince: memberSinceLabel(member?.joined_on, member?.created_at) || null,
    volunteerBadges: normalizeVolunteerBadges(member?.volunteer_badges),
    journeyMilestones: normalizeJourneyMilestones(member?.journey_milestones),
    fellowshipOnline:
      member && Object.prototype.hasOwnProperty.call(member, 'fellowship_online')
        ? member.fellowship_online === true
        : null,
    coverUrl:
      member && Object.prototype.hasOwnProperty.call(member, 'cover_url') ? httpsCoverUrl(member?.cover_url) : null,
    ...(member && Object.prototype.hasOwnProperty.call(member, 'address_as')
      ? { addressAs: normalizeAddressAs(member.address_as) }
      : {}),
  };
}

export async function handleMemberSelfProfile(
  req: any,
  res: any,
  supabase: any,
  user: any,
  role: string | null
) {
  setNoStore(res);
  if (!user?.id) {
    return res.status(401).json({ ok: false, error: 'Sign in to load your church profile.' });
  }

  const linkedId = await linkedMemberId(supabase, user.id);
  const requestedMemberId = String(req.body?.memberId || '').trim();
  if (
    req.method === 'PATCH' &&
    requestedMemberId &&
    requestedMemberId !== linkedId
  ) {
    if (String(role || '').toUpperCase() !== 'SUPER_ADMIN' || !UUID_RE.test(requestedMemberId)) {
      return res.status(403).json({ ok: false, error: 'Only a Super Admin can set how another member is addressed.' });
    }
    if (!('addressAs' in (req.body || {}))) {
      return res.status(400).json({ ok: false, error: 'Choose Brother or Sister.' });
    }
    const addressAs = normalizeAddressAs(req.body?.addressAs);
    if (req.body?.addressAs && !addressAs) {
      return res.status(400).json({ ok: false, error: 'Choose Brother or Sister.' });
    }
    const { error } = await supabase.from('members').update({ address_as: addressAs }).eq('id', requestedMemberId);
    if (error && /address_as/i.test(String(error.message || ''))) {
      return res.status(503).json({ ok: false, error: 'Address titles are not on the church record yet.' });
    }
    if (error) {
      console.error('[Vault API] member-self address:', error.message);
      return res.status(502).json({ ok: false, error: 'Could not update how that member is addressed.' });
    }
    return res.status(200).json({ ok: true, memberId: requestedMemberId, addressAs });
  }

  if (!linkedId) {
    return res.status(200).json({ ok: true, linked: false, profile: null });
  }

  const memberId = linkedId;

  if (req.method === 'GET') {
    const profile = await loadProfile(supabase, user.id, memberId);
    return res.status(200).json({ ok: true, ...profile });
  }

  if (req.method !== 'PATCH') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const body = req.body || {};
  const staff = canViewPeopleRoster(role);
  const memberPatch: Record<string, unknown> = {};
  const userPatch: Record<string, unknown> = {};

  if ('birthday' in body) {
    const birthday = body.birthday === null || body.birthday === '' ? null : isoDate(body.birthday);
    if (body.birthday && !birthday) {
      return res.status(400).json({ ok: false, error: 'Birthday must be YYYY-MM-DD.' });
    }
    memberPatch.birthday = birthday;
    userPatch.birthday = birthday;
  }

  if ('preferredName' in body || 'preferred_name' in body) {
    const preferred = String(body.preferredName ?? body.preferred_name ?? '').trim().slice(0, 80) || null;
    memberPatch.preferred_name = preferred;
  }

  if ('title' in body) {
    userPatch.title = String(body.title || '').trim().slice(0, 80) || null;
  }

  if ('role' in body && String(role || '').toUpperCase() === 'SUPER_ADMIN') {
    const nextRole = profileRole(body.role);
    if (!nextRole) {
      return res.status(400).json({ ok: false, error: 'Choose a membership role from the list.' });
    }
    memberPatch.role = nextRole;
  }

  if ('phone' in body) {
    const phone = String(body.phone || '').trim().slice(0, 40) || null;
    memberPatch.phone = phone;
    userPatch.phone = phone;
  }

  if ('avatarUrl' in body || 'avatar_url' in body) {
    const incoming = body.avatarUrl ?? body.avatar_url;
    if (incoming === null || String(incoming || '').trim() === '') {
      memberPatch.avatar_url = null;
      userPatch.avatar_url = null;
    } else {
      const stored = await storedAvatarUrl(supabase, user.id, incoming);
      if (!stored) {
        return res.status(400).json({ ok: false, error: 'Choose a photo the church profile can keep.' });
      }
      memberPatch.avatar_url = stored;
      userPatch.avatar_url = stored;
    }
  }

  if ('bio' in body) {
    memberPatch.bio = String(body.bio || '').trim().slice(0, 4000) || null;
  }

  if ('joinedOn' in body) {
    const joinedOn = body.joinedOn === null || body.joinedOn === '' ? null : isoDate(body.joinedOn);
    if (body.joinedOn && !joinedOn) {
      return res.status(400).json({ ok: false, error: 'Member Since must be a month and year.' });
    }
    memberPatch.joined_on = joinedOn;
  }

  if ('volunteerBadges' in body) {
    memberPatch.volunteer_badges = normalizeVolunteerBadges(body.volunteerBadges);
  }

  if ('journeyMilestones' in body) {
    memberPatch.journey_milestones = normalizeJourneyMilestones(body.journeyMilestones);
  }

  if ('fellowshipOnline' in body) {
    memberPatch.fellowship_online = fellowshipOnlineFlag(body.fellowshipOnline);
  }

  if ('addressAs' in body) {
    const addressAs = normalizeAddressAs(body.addressAs);
    if (body.addressAs && !addressAs) {
      return res.status(400).json({ ok: false, error: 'Choose Brother or Sister.' });
    }
    memberPatch.address_as = addressAs;
  }

  if ('coverUrl' in body) {
    const raw = String(body.coverUrl || '').trim();
    if (!raw) {
      memberPatch.cover_url = null;
    } else {
      const cover = httpsCoverUrl(raw);
      if (!cover) {
        return res.status(400).json({ ok: false, error: 'Cover photos need an https link.' });
      }
      memberPatch.cover_url = cover;
    }
  }

  if ('favoriteHuddles' in body || 'favoriteHuddleId' in body) {
    const requested = Array.isArray(body.favoriteHuddles)
      ? body.favoriteHuddles
      : body.favoriteHuddleId
        ? [{ id: body.favoriteHuddleId }]
        : [];
    const ids: string[] = [];
    for (const item of requested) {
      const huddleId = String(item?.id || item || '').trim();
      if (!huddleId || ids.includes(huddleId)) continue;
      if (!UUID_RE.test(huddleId)) {
        return res.status(400).json({ ok: false, error: 'Choose a huddle from your Community list.' });
      }
      ids.push(huddleId);
      if (ids.length >= MAX_FAVORITE_HUDDLES) break;
    }
    const channels = ids.length ? await listAccessibleChannels(supabase, user.id, role) : [];
    const saved: { id: string; name: string }[] = [];
    for (const huddleId of ids) {
      const channel = channels.find((item) => item.id === huddleId);
      if (!channel) {
        return res.status(403).json({ ok: false, error: 'That huddle is not one you can join.' });
      }
      saved.push({
        id: channel.id,
        name: String(channel.name || 'Huddle').trim().slice(0, 80) || 'Huddle',
      });
    }
    memberPatch.favorite_huddles = saved;
    memberPatch.favorite_huddle_id = saved[0]?.id || null;
    memberPatch.favorite_huddle_name = saved[0]?.name || null;
  }

  if (staff && ('firstName' in body || 'lastName' in body || 'fullName' in body)) {
    if ('firstName' in body) memberPatch.first_name = String(body.firstName || '').trim();
    if ('lastName' in body) memberPatch.last_name = String(body.lastName || '').trim();
    if ('fullName' in body && !('firstName' in body) && !('lastName' in body)) {
      const parts = String(body.fullName || '').trim().split(/\s+/).filter(Boolean);
      memberPatch.first_name = parts.slice(0, -1).join(' ') || parts[0] || '';
      memberPatch.last_name = parts.length > 1 ? parts[parts.length - 1] : '';
    }
  }

  if (Object.keys(memberPatch).length) {
    let { error } = await supabase.from('members').update(memberPatch).eq('id', memberId);
    if (error && memberPatch.role !== undefined && /role/i.test(String(error.message || ''))) {
      const { role: _role, ...withoutRole } = memberPatch;
      if (Object.keys(withoutRole).length) {
        ({ error } = await supabase.from('members').update(withoutRole).eq('id', memberId));
      } else {
        error = null;
      }
    }
    if (error && memberPatch.preferred_name !== undefined && /preferred_name/i.test(String(error.message || ''))) {
      const { preferred_name: _ignored, ...withoutPreferred } = memberPatch;
      ({ error } = await supabase.from('members').update(withoutPreferred).eq('id', memberId));
    }
    if (error && memberPatch.bio !== undefined && /bio/i.test(String(error.message || ''))) {
      const { bio: _ignoredBio, ...withoutBio } = memberPatch;
      if (Object.keys(withoutBio).length) {
        ({ error } = await supabase.from('members').update(withoutBio).eq('id', memberId));
      } else {
        error = null;
      }
    }
    if (error && memberPatch.favorite_huddles !== undefined && /favorite_huddles/i.test(String(error.message || ''))) {
      const { favorite_huddles: _list, ...withoutList } = memberPatch;
      if (Object.keys(withoutList).length) {
        ({ error } = await supabase.from('members').update(withoutList).eq('id', memberId));
      } else {
        error = null;
      }
    }
    if (
      error &&
      (memberPatch.favorite_huddle_id !== undefined || memberPatch.favorite_huddle_name !== undefined) &&
      /favorite_huddle/i.test(String(error.message || ''))
    ) {
      const { favorite_huddle_id: _id, favorite_huddle_name: _name, favorite_huddles: _list, ...withoutHuddle } =
        memberPatch;
      if (Object.keys(withoutHuddle).length) {
        ({ error } = await supabase.from('members').update(withoutHuddle).eq('id', memberId));
      } else {
        error = null;
      }
    }
    if (error && memberPatch.address_as !== undefined && /address_as/i.test(String(error.message || ''))) {
      const { address_as: _address, ...withoutAddress } = memberPatch;
      if (Object.keys(withoutAddress).length) {
        ({ error } = await supabase.from('members').update(withoutAddress).eq('id', memberId));
      } else {
        error = null;
      }
    }
    if (
      error &&
      (memberPatch.fellowship_online !== undefined || memberPatch.cover_url !== undefined) &&
      /fellowship_online|cover_url/i.test(String(error.message || ''))
    ) {
      const { fellowship_online: _online, cover_url: _cover, ...withoutPresence } = memberPatch;
      if (Object.keys(withoutPresence).length) {
        ({ error } = await supabase.from('members').update(withoutPresence).eq('id', memberId));
      } else {
        error = null;
      }
    }
    if (
      error &&
      (memberPatch.joined_on !== undefined ||
        memberPatch.volunteer_badges !== undefined ||
        memberPatch.journey_milestones !== undefined) &&
      /joined_on|volunteer_badges|journey_milestones/i.test(String(error.message || ''))
    ) {
      const { joined_on: _joined, volunteer_badges: _badges, journey_milestones: _miles, ...withoutService } =
        memberPatch;
      if (Object.keys(withoutService).length) {
        ({ error } = await supabase.from('members').update(withoutService).eq('id', memberId));
      } else {
        error = null;
      }
    }
    if (error) {
      console.error('[Vault API] member-self members:', error.message);
      return res.status(502).json({ ok: false, error: 'Could not update the church member record.' });
    }
  }

  if (staff && memberPatch.first_name !== undefined) {
    const display =
      String(memberPatch.preferred_name || '').trim() ||
      [memberPatch.first_name, memberPatch.last_name].filter(Boolean).join(' ');
    if (display) userPatch.name = display;
  } else if (memberPatch.preferred_name) {
    userPatch.name = memberPatch.preferred_name;
  }

  if (Object.keys(userPatch).length) {
    const { error } = await supabase.from('users').update(userPatch).eq('id', user.id);
    if (error) console.error('[Vault API] member-self users:', error.message);
  }

  const profile = await loadProfile(supabase, user.id, memberId);
  return res.status(200).json({ ok: true, ...profile });
}
