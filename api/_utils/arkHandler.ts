/**
 * PLCC Ark — scores, leaderboards and PLCC Bucks for the church's retro games.
 * resource=ark&action=…   (PLCC Connect reaches it through its same-origin /api/ark bridge)
 *
 * Members:  GET me · GET board · POST score · POST privacy (hide a player's name on the boards)
 * Staff:    GET admin · POST remove · POST approve · PATCH settings
 *
 * The client never sends Bucks, names or ranks — only who played (themselves or one
 * of their own household's children), which game, and the score. Bucks go through
 * awc_ark_award in Postgres (kids only, caps, idempotent). See supabase/migrations/awc_ark.sql.
 */
import { getSupabaseAdmin, requireAuth } from './auth.js';
import {
  ARK_GAMES,
  arkDayKey,
  arkWeekStartIso,
  canChangeHideName,
  evaluateArkScore,
  hiddenBoardName,
  isArkGame,
  leaderboardName,
  parseArkScoreInput,
  type ArkGame,
} from './arkLogic.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_READY = 'PLCC Ark is not set up yet. Run supabase/migrations/awc_ark.sql in Supabase.';
const STAFF_ROLES = new Set([
  'SUPER_ADMIN', 'ADMIN', 'ADMIN_STAFF', 'PASTOR', 'FIRST_LADY', 'MINISTRY_LEADER', 'SUNDAY_SCHOOL_TEACHER', 'TEACHER',
]);
const MAX_SCORES_PER_HOUR = 60;

function first(v: unknown): string {
  if (Array.isArray(v)) return String(v[0] ?? '').trim();
  return String(v ?? '').trim();
}
function fail(res: any, status: number, code: string, error: string) {
  return res.status(status).json({ ok: false, code, error });
}
function isMissingSchema(err: any): boolean {
  return /does not exist|Could not find the (function|table)|schema cache/i.test(String(err?.message || err || ''));
}
function dbFail(res: any, err: any) {
  if (isMissingSchema(err)) return fail(res, 503, 'ark_unavailable', NOT_READY);
  console.error('[ark]', err?.message || err);
  return fail(res, 500, 'ark_error', 'Something went wrong in the Ark. Please try again.');
}

type Player = { id: string; name: string; initials: string; avatarUrl: string | null; isChild: boolean; self: boolean; hideName: boolean };
type Privacy = { hideName: boolean; updatedBy: string | null };

/** "Hide name on the boards" choices. Missing table (privacy SQL not run yet) = nobody hidden. */
async function loadPrivacy(supabase: any, ids: string[]): Promise<Map<string, Privacy>> {
  const out = new Map<string, Privacy>();
  if (!ids.length) return out;
  const { data, error } = await supabase
    .from('ark_player_privacy')
    .select('member_id, hide_name, updated_by')
    .in('member_id', ids);
  if (error) {
    if (!isMissingSchema(error)) console.warn('[ark] privacy', error.message);
    return out;
  }
  for (const r of data || []) {
    out.set(String(r.member_id), { hideName: r.hide_name === true, updatedBy: r.updated_by ? String(r.updated_by) : null });
  }
  return out;
}

/** The signed-in member, plus the children in their household and those they're a guardian of. */
async function loadPlayers(supabase: any, userId: string): Promise<{ selfId: string | null; players: Player[] }> {
  let selfId: string | null = null;
  const { data: link } = await supabase
    .from('user_member_links')
    .select('member_id')
    .eq('user_id', userId)
    .eq('status', 'verified')
    .maybeSingle();
  if (link?.member_id) selfId = String(link.member_id);
  if (!selfId) {
    const { data: same } = await supabase.from('members').select('id').eq('id', userId).maybeSingle();
    if (same?.id) selfId = String(same.id);
  }
  if (!selfId) return { selfId: null, players: [] };

  const ids = [selfId];
  const childIds = new Set<string>();
  const { data: mine } = await supabase
    .from('household_members')
    .select('household_id, relationship_type')
    .eq('member_id', selfId)
    .eq('status', 'active');
  const adultHouseholds = (mine || [])
    .filter((r: any) => !['child', 'dependent'].includes(String(r.relationship_type || '').toLowerCase()))
    .map((r: any) => String(r.household_id))
    .filter(Boolean);
  if (adultHouseholds.length === 1) {
    const { data: kids } = await supabase
      .from('household_members')
      .select('member_id')
      .eq('household_id', adultHouseholds[0])
      .eq('status', 'active')
      .in('relationship_type', ['child', 'dependent']);
    for (const k of kids || []) {
      if (k.member_id && String(k.member_id) !== selfId) {
        childIds.add(String(k.member_id));
        ids.push(String(k.member_id));
      }
    }
  }
  // Children this account is an active guardian of in the Vault (works across households).
  const { data: guarded, error: guardErr } = await supabase
    .from('guardian_relationships')
    .select('child_member_id')
    .eq('guardian_user_id', userId)
    .eq('status', 'active');
  if (guardErr && !isMissingSchema(guardErr)) console.warn('[ark] guardians', guardErr.message);
  for (const g of guarded || []) {
    const id = g?.child_member_id ? String(g.child_member_id) : '';
    if (id && id !== selfId && !childIds.has(id)) {
      childIds.add(id);
      ids.push(id);
    }
  }
  // Is the signed-in member themself a child in some household (a teen with their own login)?
  const selfIsChild = (mine || []).some((r: any) => ['child', 'dependent'].includes(String(r.relationship_type || '').toLowerCase()));

  const { data: people } = await supabase
    .from('members')
    .select('id, first_name, last_name, preferred_name, avatar_url')
    .in('id', ids);
  const byId = new Map<string, any>((people || []).map((p: any) => [String(p.id), p]));
  const privacy = await loadPrivacy(supabase, ids);
  const players: Player[] = ids
    .filter((id) => byId.has(id))
    .map((id) => {
      const p = byId.get(id);
      const shown = leaderboardName(p.preferred_name || p.first_name, p.last_name);
      const initials = `${String(p.preferred_name || p.first_name || '?')[0] || '?'}${String(p.last_name || '')[0] || ''}`.toUpperCase();
      return {
        id,
        name: shown,
        initials,
        avatarUrl: typeof p.avatar_url === 'string' && /^https:\/\//.test(p.avatar_url) ? p.avatar_url : null,
        isChild: id === selfId ? selfIsChild : childIds.has(id),
        self: id === selfId,
        hideName: privacy.get(id)?.hideName === true,
      };
    });
  return { selfId, players };
}

async function loadSettings(supabase: any) {
  const { data, error } = await supabase
    .from('ark_settings')
    .select('bucks_enabled, weekly_bucks_cap, hold_multiplier')
    .eq('id', true)
    .maybeSingle();
  if (error) throw error;
  return {
    bucksEnabled: data?.bucks_enabled !== false,
    weeklyCap: Number(data?.weekly_bucks_cap ?? 20),
    holdMultiplier: Number(data?.hold_multiplier ?? 3),
  };
}

/** Hand out last week's top-3 Bucks the first time anyone opens the Ark after the week ends. */
async function settleLastWeek(supabase: any) {
  const lastWeek = new Date(Date.parse(arkWeekStartIso()) - 7 * 86400000).toISOString();
  const { error } = await supabase.rpc('awc_ark_settle_week', { p_week_start: lastWeek });
  if (error && !isMissingSchema(error)) console.warn('[ark] settle week', error.message);
}

/** Bucks each child earned from playing the Ark this church week (top-3 prizes excluded). */
async function arkBucksThisWeek(supabase: any, childIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!childIds.length) return out;
  const { data, error } = await supabase
    .from('awc_bucks_ledger')
    .select('id, child_member_id, amount, reason_id')
    .in('child_member_id', childIds)
    .eq('kind', 'award')
    .like('reason_id', 'ark\\_%')
    .gte('created_at', arkWeekStartIso());
  if (error || !data?.length) return out;
  const ids = data.map((r: any) => r.id);
  const { data: corr } = await supabase.from('awc_bucks_corrections').select('award_id').in('award_id', ids);
  const corrected = new Set((corr || []).map((c: any) => String(c.award_id)));
  for (const r of data) {
    if (corrected.has(String(r.id)) || String(r.reason_id).startsWith('ark_top_')) continue;
    const k = String(r.child_member_id);
    out.set(k, (out.get(k) || 0) + Number(r.amount || 0));
  }
  return out;
}

async function bestScores(supabase: any, playerIds: string[]) {
  const out: Record<string, Partial<Record<ArkGame, number>>> = {};
  if (!playerIds.length) return out;
  const { data } = await supabase
    .from('ark_scores')
    .select('player_member_id, game, score')
    .in('player_member_id', playerIds)
    .eq('status', 'ok')
    .order('score', { ascending: false })
    .limit(2000);
  for (const r of data || []) {
    const p = String(r.player_member_id);
    out[p] = out[p] || {};
    const g = r.game as ArkGame;
    if (out[p][g] == null) out[p][g] = Number(r.score);
  }
  return out;
}

/** Top scores for a game: best score per player, this week or all time. */
async function board(supabase: any, game: ArkGame, period: 'week' | 'all', limit = 25) {
  let q = supabase
    .from('ark_scores')
    .select('player_member_id, score, created_at')
    .eq('game', game)
    .eq('status', 'ok')
    .order('score', { ascending: false })
    .limit(1500);
  if (period === 'week') q = q.gte('created_at', arkWeekStartIso());
  const { data, error } = await q;
  if (error) throw error;
  const seen = new Set<string>();
  const rows: Array<{ playerId: string; score: number }> = [];
  for (const r of data || []) {
    const id = String(r.player_member_id);
    if (seen.has(id)) continue;
    seen.add(id);
    rows.push({ playerId: id, score: Number(r.score) });
  }
  const top = rows.slice(0, limit);
  const ids = top.map((r) => r.playerId);
  const people = new Map<string, any>();
  if (ids.length) {
    const { data: m } = await supabase
      .from('members')
      .select('id, first_name, last_name, preferred_name, avatar_url')
      .in('id', ids);
    for (const p of m || []) people.set(String(p.id), p);
  }
  const privacy = await loadPrivacy(supabase, ids);
  return {
    all: rows,
    /** Real names; the caller swaps in "Player K." for hidden players outside the viewer's family. */
    entries: top.map((r, i) => {
      const p = people.get(r.playerId) || {};
      const firstName = p.preferred_name || p.first_name;
      const hidden = privacy.get(r.playerId)?.hideName === true;
      return {
        rank: i + 1,
        playerId: r.playerId,
        name: leaderboardName(firstName, p.last_name),
        initials: `${String(firstName || '?')[0] || '?'}${String(p.last_name || '')[0] || ''}`.toUpperCase(),
        avatarUrl: typeof p.avatar_url === 'string' && /^https:\/\//.test(p.avatar_url) ? p.avatar_url : null,
        score: r.score,
        hidden,
        hiddenAs: hiddenBoardName(firstName),
      };
    }),
  };
}

type Deps = {
  getSupabaseAdmin: () => any;
  requireAuth: (req: any, res: any, supabase: any) => Promise<{ user: { id: string } | null; role: string | null } | null>;
  now?: () => Date;
};
const DEFAULT_DEPS: Deps = { getSupabaseAdmin, requireAuth: requireAuth as Deps['requireAuth'] };

export async function handleArk(req: any, res: any, deps: Deps = DEFAULT_DEPS) {
  res.setHeader?.('Cache-Control', 'no-store');
  const supabase = deps.getSupabaseAdmin();
  if (!supabase) return fail(res, 503, 'unavailable', 'Service unavailable');
  const auth = await deps.requireAuth(req, res, supabase);
  if (!auth?.user) return;
  const userId = auth.user.id;
  const role = String(auth.role || '').toUpperCase();
  const action = first(req.query?.action || req.body?.action).toLowerCase();
  const method = String(req.method || 'GET').toUpperCase();
  const now = deps.now ? deps.now() : new Date();

  if (role === 'KIOSK') return fail(res, 403, 'not_authorized', 'Sign in with your own account to play.');

  try {
    // ---- who's playing ---------------------------------------------------------
    if (method === 'GET' && action === 'me') {
      const settings = await loadSettings(supabase);
      await settleLastWeek(supabase);
      const { players } = await loadPlayers(supabase, userId);
      if (!players.length) {
        return fail(res, 403, 'unlinked', 'Finish your PLCC Connect profile to play in the Ark.');
      }
      const kids = players.filter((p) => p.isChild).map((p) => p.id);
      const [bests, bucks] = await Promise.all([bestScores(supabase, players.map((p) => p.id)), arkBucksThisWeek(supabase, kids)]);
      return res.status(200).json({
        ok: true,
        settings: { bucksEnabled: settings.bucksEnabled, weeklyCap: settings.weeklyCap },
        players: players.map((p) => ({ ...p, bests: bests[p.id] || {}, bucksThisWeek: p.isChild ? bucks.get(p.id) || 0 : null })),
        isStaff: STAFF_ROLES.has(role),
      });
    }

    // ---- leaderboard -----------------------------------------------------------
    if (method === 'GET' && action === 'board') {
      const game = first(req.query?.game).toLowerCase();
      if (!isArkGame(game)) return fail(res, 400, 'invalid_game', 'Pick a game.');
      const period = first(req.query?.period) === 'all' ? 'all' : 'week';
      const result = await board(supabase, game, period);
      const { players } = await loadPlayers(supabase, userId);
      const mine = new Set(players.map((p) => p.id));
      const myRows = result.all
        .map((r, i) => ({ ...r, rank: i + 1 }))
        .filter((r) => mine.has(r.playerId));
      return res.status(200).json({
        ok: true,
        game,
        period,
        entries: result.entries.map(({ hiddenAs, ...e }) => {
          const isMine = mine.has(e.playerId);
          // Your own family always sees the real name; everyone else sees "Player K.".
          if (e.hidden && !isMine) {
            return { ...e, name: hiddenAs.name, initials: hiddenAs.initials, avatarUrl: null, mine: false };
          }
          return { ...e, mine: isMine };
        }),
        mine: myRows.map((r) => ({ playerId: r.playerId, rank: r.rank, score: r.score })),
        players: result.all.length,
      });
    }

    // ---- hide / show a player's name on the boards ------------------------------
    if (method === 'POST' && action === 'privacy') {
      const playerId = first(req.body?.playerId);
      if (!UUID_RE.test(playerId)) return fail(res, 400, 'invalid_player', 'Pick who to change.');
      if (typeof req.body?.hideName !== 'boolean') return fail(res, 400, 'invalid_choice', 'Choose show or hide.');
      const next: boolean = req.body.hideName;
      const { players } = await loadPlayers(supabase, userId);
      const player = players.find((p) => p.id === playerId);
      if (!player) return fail(res, 403, 'not_your_player', 'You can only change this for yourself or your own children.');
      const current = (await loadPrivacy(supabase, [playerId])).get(playerId) || null;
      if (!canChangeHideName({ playerIsSelf: player.self, playerIsChild: player.isChild, next, current, userId })) {
        return fail(res, 403, 'parent_choice', 'A parent hid your name. Ask them to change it.');
      }
      const { error } = await supabase
        .from('ark_player_privacy')
        .upsert({ member_id: playerId, hide_name: next, updated_by: userId, updated_at: now.toISOString() }, { onConflict: 'member_id' });
      if (error) {
        if (isMissingSchema(error)) {
          return fail(res, 503, 'ark_unavailable', 'This setting is not set up yet. Run supabase/migrations/awc_ark_privacy.sql in Supabase.');
        }
        throw error;
      }
      return res.status(200).json({ ok: true, playerId, hideName: next });
    }

    // ---- submit a score --------------------------------------------------------
    if (method === 'POST' && action === 'score') {
      const input = parseArkScoreInput(req.body);
      if (input.ok === false) return fail(res, 400, 'invalid_score', input.error);
      const { players } = await loadPlayers(supabase, userId);
      const player = players.find((p) => p.id === input.playerId);
      if (!player) return fail(res, 403, 'not_your_player', 'You can only play as yourself or your own children.');

      const hourAgo = new Date(now.getTime() - 3600000).toISOString();
      const { count } = await supabase
        .from('ark_scores')
        .select('id', { count: 'exact', head: true })
        .eq('player_member_id', player.id)
        .gte('created_at', hourAgo);
      if ((count || 0) >= MAX_SCORES_PER_HOUR) {
        return fail(res, 429, 'slow_down', 'That’s a lot of games! Take a short break and come back.');
      }

      const settings = await loadSettings(supabase);
      const { data: prevRows, error: prevErr } = await supabase
        .from('ark_scores')
        .select('score')
        .eq('player_member_id', player.id)
        .eq('game', input.game)
        .eq('status', 'ok')
        .order('score', { ascending: false })
        .limit(1);
      if (prevErr) throw prevErr;
      const previousBest = prevRows?.[0] ? Number(prevRows[0].score) : null;

      const dayStart = arkDayKey(now).startIso;
      const { count: todayCount } = await supabase
        .from('ark_scores')
        .select('id', { count: 'exact', head: true })
        .eq('player_member_id', player.id)
        .neq('status', 'removed')
        .gte('created_at', dayStart);

      const verdict = evaluateArkScore({
        game: input.game,
        score: input.score,
        previousBest,
        holdMultiplier: settings.holdMultiplier,
        durationSec: input.durationSec,
        isChild: player.isChild,
        bucksEnabled: settings.bucksEnabled,
        firstToday: (todayCount || 0) === 0,
      });

      const { data: saved, error: saveErr } = await supabase
        .from('ark_scores')
        .insert({
          player_member_id: player.id,
          played_by_user: userId,
          is_child: player.isChild,
          game: input.game,
          score: input.score,
          stats: input.stats,
          status: verdict.held ? 'held' : 'ok',
          status_note: verdict.held ? verdict.holdReason : null,
        })
        .select('id')
        .single();
      if (saveErr) throw saveErr;

      const earned: Array<{ label: string; amount: number }> = [];
      const entryIds: string[] = [];
      let arkWeek: number | null = null;
      let capped = false;
      for (const reason of verdict.bucks) {
        const key =
          reason === 'ark_first_game'
            ? `ark:first:${player.id}:${arkDayKey(now).key}`
            : `ark:pb:${saved.id}`;
        const { data: award, error: awardErr } = await supabase.rpc('awc_ark_award', {
          p_child_member_id: player.id,
          p_reason_id: reason,
          p_idempotency_key: key,
          p_for_user: userId,
        });
        if (awardErr) {
          if (!isMissingSchema(awardErr)) console.warn('[ark] award', awardErr.message);
          continue;
        }
        if (award?.ok && !award.duplicate) {
          earned.push({ label: String(award.reasonLabel || '').replace(/^PLCC Ark:\s*/i, ''), amount: Number(award.amount) });
          entryIds.push(String(award.entryId));
          if (award.arkWeek != null) arkWeek = Number(award.arkWeek);
        } else if (award?.code === 'ark_cap' || award?.code === 'weekly_cap') {
          capped = true;
        }
      }
      if (entryIds.length) {
        await supabase.from('ark_scores').update({ bucks_entry_ids: entryIds }).eq('id', saved.id);
      }

      const week = await board(supabase, input.game, 'week', 3);
      const rank = week.all.findIndex((r) => r.playerId === player.id);
      if (arkWeek == null && player.isChild) arkWeek = (await arkBucksThisWeek(supabase, [player.id])).get(player.id) || 0;

      return res.status(200).json({
        ok: true,
        scoreId: saved.id,
        status: verdict.held ? 'held' : 'ok',
        newBest: verdict.newBest,
        previousBest,
        weekRank: rank >= 0 ? rank + 1 : null,
        bucks: earned,
        bucksThisWeek: player.isChild ? arkWeek : null,
        weeklyCap: settings.weeklyCap,
        capped,
        bucksEnabled: settings.bucksEnabled,
      });
    }

    // ---- staff ---------------------------------------------------------------
    const isStaff = STAFF_ROLES.has(role);
    if (action === 'admin' || action === 'remove' || action === 'approve' || action === 'settings') {
      if (!isStaff) return fail(res, 403, 'not_authorized', 'Only church leaders can manage the Ark.');
    }

    if (method === 'GET' && action === 'admin') {
      const settings = await loadSettings(supabase);
      const weekStart = arkWeekStartIso();
      const { data: recent, error } = await supabase
        .from('ark_scores')
        .select('id, player_member_id, is_child, game, score, status, status_note, bucks_entry_ids, created_at')
        .order('created_at', { ascending: false })
        .limit(60);
      if (error) throw error;
      const { data: weekRows } = await supabase
        .from('ark_scores')
        .select('player_member_id, game')
        .gte('created_at', weekStart)
        .neq('status', 'removed')
        .limit(5000);
      const ids = Array.from(new Set((recent || []).map((r: any) => String(r.player_member_id))));
      const people = new Map<string, any>();
      if (ids.length) {
        const { data: m } = await supabase.from('members').select('id, first_name, last_name, preferred_name').in('id', ids);
        for (const p of m || []) people.set(String(p.id), p);
      }
      const entryIds = (recent || []).flatMap((r: any) => r.bucks_entry_ids || []);
      const amounts = new Map<string, { amount: number; label: string }>();
      if (entryIds.length) {
        const { data: led } = await supabase.from('awc_bucks_ledger').select('id, amount, reason_label').in('id', entryIds);
        for (const l of led || []) amounts.set(String(l.id), { amount: Number(l.amount), label: String(l.reason_label || '') });
      }
      const { data: weekBucks } = await supabase
        .from('awc_bucks_ledger')
        .select('amount')
        .eq('kind', 'award')
        .like('reason_id', 'ark\\_%')
        .gte('created_at', weekStart);
      const perGame = new Map<string, number>();
      for (const r of weekRows || []) perGame.set(r.game, (perGame.get(r.game) || 0) + 1);
      const most = Array.from(perGame.entries()).sort((a, b) => b[1] - a[1])[0];
      const canReverse = await supabase.rpc('awc_bucks_can_reverse', { p_user: userId });
      return res.status(200).json({
        ok: true,
        settings,
        canEditSettings: role === 'SUPER_ADMIN',
        canRemove: canReverse.data === true,
        stats: {
          playersThisWeek: new Set((weekRows || []).map((r: any) => String(r.player_member_id))).size,
          gamesThisWeek: (weekRows || []).length,
          bucksThisWeek: (weekBucks || []).reduce((n: number, r: any) => n + Number(r.amount || 0), 0),
          mostPlayed: most ? most[0] : null,
        },
        scores: (recent || []).map((r: any) => {
          const p = people.get(String(r.player_member_id)) || {};
          const bucks = (r.bucks_entry_ids || []).map((id: string) => amounts.get(String(id))).filter(Boolean);
          return {
            id: r.id,
            name: `${p.preferred_name || p.first_name || 'Member'} ${p.last_name || ''}`.trim(),
            isChild: Boolean(r.is_child),
            game: r.game,
            score: Number(r.score),
            status: r.status,
            note: r.status_note,
            bucks: bucks.reduce((n: number, b: any) => n + b.amount, 0),
            createdAt: r.created_at,
          };
        }),
      });
    }

    if (method === 'POST' && (action === 'remove' || action === 'approve')) {
      const scoreId = first(req.body?.scoreId);
      if (!UUID_RE.test(scoreId)) return fail(res, 400, 'invalid_score', 'That score was not found.');
      const { data: row, error } = await supabase
        .from('ark_scores')
        .select('id, player_member_id, is_child, game, score, status, bucks_entry_ids, created_at, played_by_user, stats')
        .eq('id', scoreId)
        .maybeSingle();
      if (error) throw error;
      if (!row) return fail(res, 404, 'not_found', 'That score was not found.');

      if (action === 'remove') {
        const note = String(req.body?.note || '').trim().slice(0, 200) || 'Ark score removed by a leader';
        if (row.status === 'removed') return res.status(200).json({ ok: true, already: true });
        const reversed: string[] = [];
        if ((row.bucks_entry_ids || []).length) {
          const allowed = await supabase.rpc('awc_bucks_can_reverse', { p_user: userId });
          if (allowed.data !== true) {
            return fail(res, 403, 'not_authorized', 'Only a Super Admin, Admin, Pastor or Ministry Leader can remove a score that earned PLCC Bucks.');
          }
          for (const entryId of row.bucks_entry_ids) {
            const { data: rev, error: revErr } = await supabase.rpc('awc_bucks_reverse', {
              p_entry_id: entryId,
              p_issued_by: userId,
              p_note: `PLCC Ark: ${note}`,
            });
            if (revErr) {
              console.warn('[ark] reverse', revErr.message);
              continue;
            }
            if (rev?.ok) reversed.push(String(entryId));
          }
        }
        const { error: upErr } = await supabase
          .from('ark_scores')
          .update({ status: 'removed', status_note: note, status_by: userId, status_at: now.toISOString() })
          .eq('id', row.id);
        if (upErr) throw upErr;
        return res.status(200).json({ ok: true, reversed: reversed.length });
      }

      // approve a held score: it counts again, and earns a personal-best award if it still is one
      if (row.status !== 'held') return res.status(200).json({ ok: true, already: true });
      const { error: upErr } = await supabase
        .from('ark_scores')
        .update({ status: 'ok', status_note: 'Checked by a leader', status_by: userId, status_at: now.toISOString() })
        .eq('id', row.id);
      if (upErr) throw upErr;
      let awarded = 0;
      if (row.is_child) {
        const { data: prev } = await supabase
          .from('ark_scores')
          .select('score')
          .eq('player_member_id', row.player_member_id)
          .eq('game', row.game)
          .eq('status', 'ok')
          .neq('id', row.id)
          .lt('created_at', row.created_at)
          .order('score', { ascending: false })
          .limit(1);
        const prevBest = prev?.[0] ? Number(prev[0].score) : null;
        if (prevBest != null && Number(row.score) > prevBest) {
          const { data: award } = await supabase.rpc('awc_ark_award', {
            p_child_member_id: row.player_member_id,
            p_reason_id: 'ark_personal_best',
            p_idempotency_key: `ark:pb:${row.id}`,
            p_for_user: userId,
          });
          if (award?.ok && !award.duplicate) {
            awarded = Number(award.amount) || 0;
            await supabase
              .from('ark_scores')
              .update({ bucks_entry_ids: [...(row.bucks_entry_ids || []), award.entryId] })
              .eq('id', row.id);
          }
        }
      }
      return res.status(200).json({ ok: true, awarded });
    }

    if (method === 'PATCH' && action === 'settings') {
      if (role !== 'SUPER_ADMIN') return fail(res, 403, 'not_authorized', 'Only a Super Admin can change Ark rules.');
      const patch: Record<string, any> = { updated_by: userId, updated_at: now.toISOString() };
      if (req.body?.bucksEnabled !== undefined) patch.bucks_enabled = Boolean(req.body.bucksEnabled);
      if (req.body?.weeklyCap !== undefined) {
        const cap = Math.floor(Number(req.body.weeklyCap));
        if (!Number.isFinite(cap) || cap < 0 || cap > 100) return fail(res, 400, 'invalid_cap', 'Weekly Ark Bucks must be 0 to 100.');
        patch.weekly_bucks_cap = cap;
      }
      if (req.body?.holdMultiplier !== undefined) {
        const m = Number(req.body.holdMultiplier);
        if (!Number.isFinite(m) || m < 1.5 || m > 20) return fail(res, 400, 'invalid_hold', 'Hold scores between 1.5× and 20× a best.');
        patch.hold_multiplier = Math.round(m * 10) / 10;
      }
      const { error } = await supabase.from('ark_settings').update(patch).eq('id', true);
      if (error) throw error;
      return res.status(200).json({ ok: true, settings: await loadSettings(supabase) });
    }

    return fail(res, 404, 'unknown_action', 'Unknown Ark request.');
  } catch (err: any) {
    return dbFail(res, err);
  }
}

export { ARK_GAMES };
