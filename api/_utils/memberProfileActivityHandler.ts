/**
 * Real profile activity.
 * GET /api/vault?resource=people&subResource=member-activity&memberId=
 * Status updates come from that member's Community Feed posts.
 * Sanctuary check-ins come from attendance_records.
 */
import { getSupabaseAdmin, requireAuth } from './auth.js';
import { canViewPeopleRoster } from './peopleRosterLogic.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SESSION_LABELS: Record<string, string> = {
  worship: 'Worship',
  event: 'Event',
  serve: 'Serve',
  bible_study: 'Bible Study',
  kids: 'Kids',
  other: 'Gathering',
};

function setNoStore(res: any) {
  res.setHeader?.('Cache-Control', 'private, no-store');
}

function chicagoDay(value: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}

function weekStart(ymd: string): string {
  const [year, month, day] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay();
  const mondayOffset = weekday === 0 ? 6 : weekday - 1;
  date.setUTCDate(date.getUTCDate() - mondayOffset);
  return date.toISOString().slice(0, 10);
}

function addDays(ymd: string, days: number): string {
  const [year, month, day] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function ageFromBirthday(birthday: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthday)) return null;
  // 1904 = birthday saved without a year (adults enter month & day only) — age unknown.
  if (birthday.startsWith('1904-')) return null;
  const today = chicagoDay(new Date().toISOString());
  const [year, month, day] = birthday.split('-').map(Number);
  const [nowYear, nowMonth, nowDay] = today.split('-').map(Number);
  let age = nowYear - year;
  if (nowMonth < month || (nowMonth === month && nowDay < day)) age -= 1;
  return age;
}

function emptyAttendance() {
  return {
    totalServicesThisYear: 0,
    streakWeeks: 0,
    lastCheckedIn: null as string | null,
    serviceTitle: null as string | null,
    serviceType: null as string | null,
    recent: [] as { checkedInAt: string; title: string; type: string }[],
  };
}

export async function handleMemberProfileActivity(req: any, res: any) {
  setNoStore(res);
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(503).json({ ok: false, error: 'Supabase Admin not initialized' });
  const auth = await requireAuth(req, res, supabase);
  if (!auth?.user) return;

  const requestedMemberId = String(req.query?.memberId || '').trim();
  const viewingSelf = requestedMemberId === 'me';
  let memberId = requestedMemberId;
  let authorId = viewingSelf ? String(auth.user.id) : '';

  if (viewingSelf) {
    const { data: selfLink } = await supabase
      .from('user_member_links')
      .select('member_id')
      .eq('user_id', auth.user.id)
      .eq('status', 'verified')
      .maybeSingle();
    memberId = String(selfLink?.member_id || '');
  } else if (!UUID_RE.test(memberId)) {
    return res.status(400).json({ ok: false, error: 'Member id is not valid.' });
  }

  let member: { id: string; birthday?: string | null } | null = null;
  if (UUID_RE.test(memberId)) {
    const { data, error: memberError } = await supabase
      .from('members')
      .select('id, birthday')
      .eq('id', memberId)
      .maybeSingle();
    if (memberError) {
      console.error('[member-activity] member:', memberError.message);
      return res.status(502).json({ ok: false, error: 'Could not load this profile.' });
    }
    member = data;
  }
  if (!member && !viewingSelf) return res.status(404).json({ ok: false, error: 'Member not found.' });

  if (!viewingSelf && member) {
    const { data: authorLink } = await supabase
      .from('user_member_links')
      .select('user_id')
      .eq('member_id', member.id)
      .eq('status', 'verified')
      .maybeSingle();
    authorId = String(authorLink?.user_id || '');
  }

  const updates: {
    id: string;
    content: string;
    createdAt: string;
    amenCount: number;
    hasAmened: boolean;
  }[] = [];

  if (authorId) {
    const { data: posts, error: postError } = await supabase
      .from('feed_posts')
      .select('id, content, created_at')
      .eq('author_id', authorId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(20);
    if (postError) {
      console.error('[member-activity] posts:', postError.message);
    } else {
      const postIds = (posts || []).map((post: { id: string }) => post.id);
      const amenByPost = new Map<string, { count: number; mine: boolean }>();
      if (postIds.length > 0) {
        const { data: reactions, error: reactionError } = await supabase
          .from('feed_reactions')
          .select('target_id, user_id')
          .eq('target_type', 'post')
          .eq('reaction', 'praise')
          .in('target_id', postIds);
        if (reactionError) {
          console.error('[member-activity] amens:', reactionError.message);
        } else {
          for (const row of reactions || []) {
            const current = amenByPost.get(row.target_id) || { count: 0, mine: false };
            current.count += 1;
            if (String(row.user_id) === String(auth.user.id)) current.mine = true;
            amenByPost.set(row.target_id, current);
          }
        }
      }
      for (const post of posts || []) {
        const amen = amenByPost.get(post.id) || { count: 0, mine: false };
        updates.push({
          id: String(post.id),
          content: String(post.content || ''),
          createdAt: String(post.created_at || ''),
          amenCount: amen.count,
          hasAmened: amen.mine,
        });
      }
    }
  }

  const age = ageFromBirthday(String(member?.birthday || '').slice(0, 10));
  const childRecord = age !== null && age < 13;
  let maySeeCheckIns = Boolean(member);
  if (member && childRecord && !canViewPeopleRoster(auth.role)) {
    const viewingSelf = authorId && authorId === String(auth.user.id);
    let guardian = false;
    if (!viewingSelf) {
      const { data: link, error: guardianError } = await supabase
        .from('guardian_relationships')
        .select('id')
        .eq('guardian_user_id', auth.user.id)
        .eq('child_member_id', memberId)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();
      if (guardianError) console.error('[member-activity] guardian:', guardianError.message);
      guardian = Boolean(link?.id);
    }
    maySeeCheckIns = Boolean(viewingSelf || guardian);
  }

  const attendance = emptyAttendance();
  if (member && maySeeCheckIns) {
    const { data: records, error: recordError } = await supabase
      .from('attendance_records')
      .select('session_id, checked_in_at')
      .eq('member_id', memberId)
      .order('checked_in_at', { ascending: false })
      .limit(400);
    if (recordError) {
      console.error('[member-activity] check-ins:', recordError.message);
    } else {
      const rows = records || [];
      const sessionIds = [...new Set(rows.map((row: { session_id: string }) => row.session_id).filter(Boolean))];
      const sessions = new Map<string, { title: string; type: string }>();
      if (sessionIds.length > 0) {
        const { data: sessionRows, error: sessionError } = await supabase
          .from('attendance_sessions')
          .select('id, title, type')
          .in('id', sessionIds);
        if (sessionError) console.error('[member-activity] sessions:', sessionError.message);
        for (const session of sessionRows || []) {
          sessions.set(String(session.id), {
            title: String(session.title || '').trim(),
            type: String(session.type || '').trim(),
          });
        }
      }

      const year = chicagoDay(new Date().toISOString()).slice(0, 4);
      const weeks = new Set<string>();
      for (const row of rows) {
        const day = chicagoDay(String(row.checked_in_at));
        if (day.startsWith(year)) attendance.totalServicesThisYear += 1;
        weeks.add(weekStart(day));
      }

      const latest = rows[0];
      if (latest?.checked_in_at) {
        const latestDay = chicagoDay(String(latest.checked_in_at));
        const latestWeek = weekStart(latestDay);
        const currentWeek = weekStart(chicagoDay(new Date().toISOString()));
        const previousWeek = addDays(currentWeek, -7);
        if (latestWeek === currentWeek || latestWeek === previousWeek) {
          let cursor = latestWeek;
          while (weeks.has(cursor)) {
            attendance.streakWeeks += 1;
            cursor = addDays(cursor, -7);
          }
        }
        const session = sessions.get(String(latest.session_id));
        attendance.lastCheckedIn = String(latest.checked_in_at);
        attendance.serviceTitle = session?.title || null;
        attendance.serviceType = SESSION_LABELS[session?.type || ''] || session?.type || null;
      }

      attendance.recent = rows.slice(0, 5).map((row: { session_id: string; checked_in_at: string }) => {
        const session = sessions.get(String(row.session_id));
        return {
          checkedInAt: String(row.checked_in_at),
          title: session?.title || 'Sanctuary gathering',
          type: SESSION_LABELS[session?.type || ''] || 'Gathering',
        };
      });
    }
  }

  return res.status(200).json({
    ok: true,
    updates,
    attendance,
    checkInsVisible: maySeeCheckIns,
  });
}
