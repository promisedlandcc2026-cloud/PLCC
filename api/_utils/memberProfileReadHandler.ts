/**
 * Open one church profile.
 * GET /api/vault?resource=people&subResource=member-profile&memberId=
 * Staff receive name, photo, household, email, phone, and birthday.
 * A member receives the name, and household or photo only when that member allows them.
 * Email, phone, and birthday stay off unless that member opted in.
 */
import { getSupabaseAdmin, requireAuth } from './auth.js';
import { canViewPeopleRoster } from './peopleRosterLogic.js';
import {
  memberSinceLabel,
  normalizeFavoriteHuddles,
  normalizeJourneyMilestones,
  normalizeVolunteerBadges,
} from './memberSelfProfileHandler.js';
import { normalizeAddressAs } from '../../lib/courtesyName.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function setNoStore(res: any) {
  res.setHeader?.('Cache-Control', 'private, no-store');
}

export async function handleMemberProfileRead(req: any, res: any) {
  setNoStore(res);
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(503).json({ ok: false, error: 'Supabase Admin not initialized' });
  const auth = await requireAuth(req, res, supabase);
  if (!auth?.user) return;

  const memberId = String(req.query?.memberId || '').trim();
  if (!UUID_RE.test(memberId)) return res.status(400).json({ ok: false, error: 'Member id is not valid.' });

  let memberQuery = await supabase
    .from('members')
    .select(
      'id, first_name, last_name, preferred_name, birthday, phone, email, avatar_url, household_name, status, role, favorite_huddles, favorite_huddle_id, favorite_huddle_name, joined_on, created_at, volunteer_badges, journey_milestones, fellowship_online, cover_url, address_as'
    )
    .eq('id', memberId)
    .maybeSingle();
  if (memberQuery.error && /address_as/i.test(String(memberQuery.error.message || ''))) {
    memberQuery = await supabase
      .from('members')
      .select(
        'id, first_name, last_name, preferred_name, birthday, phone, email, avatar_url, household_name, status, role, favorite_huddles, favorite_huddle_id, favorite_huddle_name, joined_on, created_at, volunteer_badges, journey_milestones, fellowship_online, cover_url'
      )
      .eq('id', memberId)
      .maybeSingle();
  }
  if (memberQuery.error && /fellowship_online|cover_url/i.test(String(memberQuery.error.message || ''))) {
    memberQuery = await supabase
      .from('members')
      .select(
        'id, first_name, last_name, preferred_name, birthday, phone, email, avatar_url, household_name, status, role, favorite_huddles, favorite_huddle_id, favorite_huddle_name, joined_on, created_at, volunteer_badges, journey_milestones'
      )
      .eq('id', memberId)
      .maybeSingle();
  }
  if (memberQuery.error && /journey_milestones/i.test(String(memberQuery.error.message || ''))) {
    memberQuery = await supabase
      .from('members')
      .select(
        'id, first_name, last_name, preferred_name, birthday, phone, email, avatar_url, household_name, status, role, favorite_huddles, favorite_huddle_id, favorite_huddle_name, joined_on, created_at, volunteer_badges'
      )
      .eq('id', memberId)
      .maybeSingle();
  }
  if (memberQuery.error && /joined_on|volunteer_badges/i.test(String(memberQuery.error.message || ''))) {
    memberQuery = await supabase
      .from('members')
      .select(
        'id, first_name, last_name, preferred_name, birthday, phone, email, avatar_url, household_name, status, role, favorite_huddles, favorite_huddle_id, favorite_huddle_name, created_at'
      )
      .eq('id', memberId)
      .maybeSingle();
  }
  if (memberQuery.error && /favorite_huddles/i.test(String(memberQuery.error.message || ''))) {
    memberQuery = await supabase
      .from('members')
      .select(
        'id, first_name, last_name, preferred_name, birthday, phone, email, avatar_url, household_name, status, role, favorite_huddle_id, favorite_huddle_name'
      )
      .eq('id', memberId)
      .maybeSingle();
  }
  if (memberQuery.error && /favorite_huddle/i.test(String(memberQuery.error.message || ''))) {
    memberQuery = await supabase
      .from('members')
      .select('id, first_name, last_name, preferred_name, birthday, phone, email, avatar_url, household_name, status, role')
      .eq('id', memberId)
      .maybeSingle();
  }
  if (memberQuery.error && /preferred_name/i.test(String(memberQuery.error.message || ''))) {
    memberQuery = await supabase
      .from('members')
      .select('id, first_name, last_name, birthday, phone, email, avatar_url, household_name, status, role')
      .eq('id', memberId)
      .maybeSingle();
  }
  if (memberQuery.error) {
    console.error('[member-profile] load:', memberQuery.error.message);
    return res.status(502).json({ ok: false, error: 'Could not open that member.' });
  }
  if (!memberQuery.data) return res.status(404).json({ ok: false, error: 'Member not found.' });

  const row = memberQuery.data;
  const displayName =
    [row.preferred_name || row.first_name, row.last_name].filter(Boolean).join(' ').trim() || 'Member';
  const addressField = Object.prototype.hasOwnProperty.call(row, 'address_as')
    ? { addressAs: normalizeAddressAs(row.address_as) }
    : {};
  const birthday = String(row.birthday || '').slice(0, 10);
  const { data: selfLink } = await supabase
    .from('user_member_links')
    .select('member_id')
    .eq('user_id', auth.user.id)
    .eq('status', 'verified')
    .maybeSingle();
  const viewingSelf = String(selfLink?.member_id || '') === memberId;
  const staff = canViewPeopleRoster(auth.role);
  const fullRecord = staff || viewingSelf;

  if (fullRecord) {
    return res.status(200).json({
      ok: true,
      staff,
      member: {
        id: String(row.id),
        displayName,
        firstName: String(row.first_name || '').trim(),
        lastName: String(row.last_name || '').trim(),
        householdName: String(row.household_name || '').trim() || null,
        avatarUrl: String(row.avatar_url || '').trim() || null,
        email: String(row.email || '').trim() || null,
        phone: String(row.phone || '').trim() || null,
        birthday: /^\d{4}-\d{2}-\d{2}$/.test(birthday) ? birthday : null,
        role: String(row.role || '').trim() || null,
        status: String(row.status || '').trim() || null,
        favoriteHuddles: normalizeFavoriteHuddles(row.favorite_huddles, {
          id: row.favorite_huddle_id,
          name: row.favorite_huddle_name,
        }),
        favoriteHuddleId: String(row.favorite_huddle_id || '').trim() || null,
        favoriteHuddleName: String(row.favorite_huddle_name || '').trim() || null,
        joinedOn: String(row.joined_on || '').slice(0, 10) || null,
        createdAt: row.created_at ? String(row.created_at) : null,
        memberSince: memberSinceLabel(row.joined_on, row.created_at) || null,
        volunteerBadges: normalizeVolunteerBadges(row.volunteer_badges),
        journeyMilestones: normalizeJourneyMilestones(row.journey_milestones),
        fellowshipOnline: row.fellowship_online === true,
        coverUrl: /^https:\/\//i.test(String(row.cover_url || '').trim())
          ? String(row.cover_url).trim().slice(0, 2048)
          : null,
        ...addressField,
      },
    });
  }

  const { data: priv } = await supabase
    .from('member_directory_privacy')
    .select('directory_opt_in, show_photo, show_phone, show_email, show_birthday, show_household')
    .eq('member_id', memberId)
    .maybeSingle();
  const allow = (flag: string) => Boolean(priv && priv[flag]);

  return res.status(200).json({
    ok: true,
    staff: false,
    member: {
      id: String(row.id),
      displayName,
      firstName: String(row.first_name || '').trim(),
      lastName: String(row.last_name || '').trim(),
      householdName: allow('show_household') ? String(row.household_name || '').trim() || null : null,
      avatarUrl: allow('show_photo') ? String(row.avatar_url || '').trim() || null : null,
      email: allow('show_email') ? String(row.email || '').trim() || null : null,
      phone: allow('show_phone') ? String(row.phone || '').trim() || null : null,
      // The directory shares month & day only — never a birth year, even one the member chose to save.
      birthday: allow('show_birthday') && /^\d{4}-\d{2}-\d{2}$/.test(birthday) ? `1904-${birthday.slice(5, 10)}` : null,
      role: null,
      status: null,
      favoriteHuddles: normalizeFavoriteHuddles(row.favorite_huddles, {
        id: row.favorite_huddle_id,
        name: row.favorite_huddle_name,
      }),
      favoriteHuddleId: String(row.favorite_huddle_id || '').trim() || null,
      favoriteHuddleName: String(row.favorite_huddle_name || '').trim() || null,
      joinedOn: String(row.joined_on || '').slice(0, 10) || null,
      createdAt: row.created_at ? String(row.created_at) : null,
      memberSince: memberSinceLabel(row.joined_on, row.created_at) || null,
      volunteerBadges: normalizeVolunteerBadges(row.volunteer_badges),
      journeyMilestones: normalizeJourneyMilestones(row.journey_milestones),
      fellowshipOnline: row.fellowship_online === true,
      coverUrl: /^https:\/\//i.test(String(row.cover_url || '').trim())
        ? String(row.cover_url).trim().slice(0, 2048)
        : null,
      ...addressField,
    },
  });
}
