/**
 * PLCC issue log (ported from AWC Vault's chatIssues, Nov 19 2026) — a private
 * "who had problems, why, and how to fix it" feed for church leaders.
 * Ka Link and PLCC Tribes report here; the Issues page lives in both apps (Account → Issues).
 *
 *   POST community/issue-report  { area, code, status?, message?, channelId?, path?, source? }
 *        (source: chat-server | chat-app | connect-app — AWC Connect reports through its own bridge)
 *        AWC Chat (its server bridge and the app on people's phones) reports a failure
 *        a member actually hit: couldn't join a huddle, couldn't open a room, a crash.
 *        Stored in audit_logs (resource_type = 'awc_chat_issue'), never message content.
 *   GET  community/issues ?days=7          — owner only. Reports, huddle activity from
 *        phones, LiveKit join/leave (with LiveKit's reason) and Live Huddle audit events
 *        (start denied / started / ended), newest first, with names.
 *   GET  community/issues ?check=1         — { allowed } so AWC Chat can show the menu link.
 *
 * Owner = CHAT_ISSUES_OWNER_EMAILS / CHAT_ISSUES_OWNER_IDS (comma lists).
 * Defaults to the app owner's account when neither is set.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export const CHAT_ISSUE_RESOURCE = 'plcc_app_issue';
/** Server-side truth from LiveKit webhooks: every join / leave with LiveKit's reason. */
export const HUDDLE_EVENT_RESOURCE = 'plcc_huddle_event';
const DEFAULT_OWNER_EMAILS = ['jerlessm@gmail.com'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AREAS = new Set(['huddle', 'room', 'messages', 'signin', 'media', 'app', 'other']);
const SOURCES = new Set(['ka-link-server', 'ka-link-app', 'tribes-server', 'tribes-app', 'canaan']);
const CODE_RE = /^[a-z0-9_.:-]{1,64}$/i;
const MAX_ROWS = 4000;
const DEFAULT_ROWS = 2500;
const PAGE = 1000;

/**
 * Huddle activity the phone reports (not problems): joined, left, dropped and
 * came back, removed by a moderator, joined on another device, closed the app…
 * Shown on the Issues page's Huddles / People tabs.
 */
export const HUDDLE_ACTIVITY_CODES = new Set([
  'huddle_joined',
  'huddle_left',
  'huddle_reconnecting',
  'huddle_reconnected',
  'huddle_dropped',
  'huddle_auto_rejoin',
  'huddle_removed',
  'huddle_ended_for_all',
  'huddle_other_device',
  'huddle_app_closed',
  'huddle_keep_awake',
  'huddle_interrupted',
  'huddle_audio_resumed',
]);

export function isHuddleActivityCode(code: string): boolean {
  return HUDDLE_ACTIVITY_CODES.has(String(code || ''));
}

/** LiveKit DisconnectReason (protocol enum) → stable name. */
const LIVEKIT_REASONS = [
  'UNKNOWN_REASON',
  'CLIENT_INITIATED',
  'DUPLICATE_IDENTITY',
  'SERVER_SHUTDOWN',
  'PARTICIPANT_REMOVED',
  'ROOM_DELETED',
  'STATE_MISMATCH',
  'JOIN_FAILURE',
  'MIGRATION',
  'SIGNAL_CLOSE',
  'ROOM_CLOSED',
  'USER_UNAVAILABLE',
  'USER_REJECTED',
  'SIP_TRUNK_FAILURE',
  'CONNECTION_TIMEOUT',
  'MEDIA_FAILURE',
  'AGENT_ERROR',
];

export function liveKitReasonName(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number' || /^\d+$/.test(String(raw))) return LIVEKIT_REASONS[Number(raw)] || 'UNKNOWN_REASON';
  const s = String(raw).trim().toUpperCase();
  return /^[A-Z_]{1,40}$/.test(s) ? s : null;
}

/** Plain English for why someone left the call. */
export function describeLeaveReason(reason: string | null | undefined): string | null {
  const r = String(reason || '').toUpperCase();
  const map: Record<string, string> = {
    CLIENT_INITIATED: 'they hung up / the app closed the call',
    DUPLICATE_IDENTITY: 'they joined again from another phone or tab, which replaced this one',
    SERVER_SHUTDOWN: 'the call server restarted',
    PARTICIPANT_REMOVED: 'a moderator removed them',
    ROOM_DELETED: 'the Ka Link was ended for everyone',
    ROOM_CLOSED: 'the Ka Link was ended for everyone',
    STATE_MISMATCH: 'their phone and the call server got out of sync',
    JOIN_FAILURE: 'their phone never finished connecting',
    MIGRATION: 'the call moved servers',
    SIGNAL_CLOSE: 'their connection to the call server closed',
    CONNECTION_TIMEOUT: 'their phone stopped answering (lost signal, phone asleep, or the app was closed)',
    MEDIA_FAILURE: 'their audio/video connection failed',
    USER_UNAVAILABLE: 'their phone was unavailable',
    USER_REJECTED: 'they declined',
    UNKNOWN_REASON: 'no reason given',
  };
  return map[r] || (r ? r.toLowerCase().replace(/_/g, ' ') : null);
}

export type ChatIssueExtra = {
  line?: 'livekit' | 'daily';
  durationSec?: number;
  outageSec?: number;
  reason?: string;
  attempt?: number;
  keepAwake?: boolean;
  hidden?: boolean;
  net?: string;
  battery?: number;
  charging?: boolean;
};

/** Whitelist the few structured details a report may carry. Everything else is dropped. */
export function sanitizeIssueExtra(raw: any): ChatIssueExtra | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: ChatIssueExtra = {};
  const int = (v: unknown, max: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n) : undefined;
  };
  if (raw.line === 'livekit' || raw.line === 'daily') out.line = raw.line;
  const d = int(raw.durationSec, 172800);
  if (d !== undefined) out.durationSec = d;
  const o = int(raw.outageSec, 86400);
  if (o !== undefined) out.outageSec = o;
  const a = int(raw.attempt, 100);
  if (a !== undefined) out.attempt = a;
  const b = int(raw.battery, 100);
  if (b !== undefined) out.battery = b;
  if (typeof raw.keepAwake === 'boolean') out.keepAwake = raw.keepAwake;
  if (typeof raw.hidden === 'boolean') out.hidden = raw.hidden;
  if (typeof raw.charging === 'boolean') out.charging = raw.charging;
  const reason = String(raw.reason ?? '').trim();
  if (/^[A-Za-z0-9_.:-]{1,40}$/.test(reason)) out.reason = reason;
  const net = String(raw.net ?? '').trim().toLowerCase();
  if (/^[a-z0-9-]{1,20}$/.test(net)) out.net = net;
  return Object.keys(out).length ? out : null;
}

function list(value: string | undefined): string[] {
  return String(value || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Canaan roles that may read the issue log (same as the sign-in problems page). */
const ISSUE_VIEWER_ROLES = new Set(['SUPER_ADMIN', 'PASTOR', 'ADMIN']);

/**
 * Who may open Issues: the owner list (env, defaults to Jerless), Canaan's
 * Super Admin / Pastor / Admin, and Ka Link team admins.
 */
export async function canViewPlccIssues(
  supabase: SupabaseClient,
  user: { id?: string | null; email?: string | null; role?: string | null } | null | undefined
): Promise<boolean> {
  if (!user) return false;
  if (isChatIssuesOwner(user)) return true;
  if (ISSUE_VIEWER_ROLES.has(String(user.role || '').toUpperCase())) return true;
  if (!user.id) return false;
  try {
    const { data } = await supabase.from('ka_link_team').select('team_role').eq('user_id', user.id).maybeSingle();
    return (data as any)?.team_role === 'admin';
  } catch {
    return false;
  }
}

/** The owner list (by email or user id). */
export function isChatIssuesOwner(
  user: { id?: string | null; email?: string | null } | null | undefined,
  env: Record<string, string | undefined> = process.env
): boolean {
  if (!user) return false;
  const ids = list(env.CHAT_ISSUES_OWNER_IDS);
  const emailsSet = list(env.CHAT_ISSUES_OWNER_EMAILS);
  const emails = emailsSet.length || ids.length ? emailsSet : DEFAULT_OWNER_EMAILS;
  const id = String(user.id || '').trim().toLowerCase();
  const email = String(user.email || '').trim().toLowerCase();
  if (id && ids.includes(id)) return true;
  if (email && emails.includes(email)) return true;
  return false;
}

function clip(value: unknown, max: number): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  if (!s) return null;
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export type ChatIssueReport = {
  area: string;
  code: string;
  source: string;
  status: number | null;
  message: string | null;
  channelId: string | null;
  path: string | null;
  device: string | null;
  extra: ChatIssueExtra | null;
};

/** Validate an incoming report. Unknown fields are ignored; nothing here is trusted. */
export function parseChatIssueReport(body: any): { ok: true; report: ChatIssueReport } | { ok: false; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'Invalid report' };
  const area = String(body.area || '').toLowerCase();
  if (!AREAS.has(area)) return { ok: false, error: 'Invalid area' };
  const code = String(body.code || '').trim();
  if (!CODE_RE.test(code)) return { ok: false, error: 'Invalid code' };
  const source = SOURCES.has(String(body.source)) ? String(body.source) : 'ka-link-app';
  const statusNum = Number(body.status);
  const status = Number.isInteger(statusNum) && statusNum >= 0 && statusNum < 1000 ? statusNum : null;
  const cid = String(body.channelId || '').trim();
  return {
    ok: true,
    report: {
      area,
      code,
      source,
      status,
      message: clip(body.message, 300),
      channelId: UUID_RE.test(cid) ? cid : null,
      path: clip(body.path, 200),
      device: clip(body.device, 200),
      extra: sanitizeIssueExtra(body.extra),
    },
  };
}

/** How serious a report looks — drives the colour in the owner's view. */
export function chatIssueSeverity(r: Pick<ChatIssueReport, 'area' | 'code' | 'status'>): 'info' | 'warning' | 'critical' {
  if (isHuddleActivityCode(r.code)) return 'info';
  if (r.status !== null && r.status >= 500) return 'critical';
  if (/crash|timeout|unreachable|token_failed|connect_failed/i.test(r.code)) return 'critical';
  return 'warning';
}

// Per-instance rate limit so one stuck phone can't flood the log.
const buckets = new Map<string, number[]>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 40;
const MAX_ACTIVITY_PER_WINDOW = 80;
/** Problems and huddle activity have separate budgets so activity never crowds out a real problem. */
export function allowChatIssueReport(
  userId: string,
  now = Date.now(),
  kind: 'problem' | 'activity' = 'problem'
): boolean {
  const key = `${kind}:${userId}`;
  const max = kind === 'activity' ? MAX_ACTIVITY_PER_WINDOW : MAX_PER_WINDOW;
  const stamps = (buckets.get(key) || []).filter((t) => now - t < WINDOW_MS);
  if (stamps.length >= max) {
    buckets.set(key, stamps);
    return false;
  }
  stamps.push(now);
  buckets.set(key, stamps);
  if (buckets.size > 5000) buckets.clear();
  return true;
}

function parseDetails(raw: unknown): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === 'object') return raw as Record<string, any>;
  try {
    const v = JSON.parse(String(raw));
    return v && typeof v === 'object' ? v : { note: String(raw) };
  } catch {
    return { note: String(raw) };
  }
}

/** Plain-English title for a row in the owner's view. */
export function describeChatIssue(action: string, d: Record<string, any>): string {
  if (action === 'Live Huddle start denied') return "Tried to get into the Ka Link while nobody was on it — only a leader or moderator can start it";
  if (action === 'Live Huddle started') return 'Started the Ka Link';
  if (action === 'Live Huddle ended for everyone') return 'Ended the Ka Link for everyone';
  if (action === 'Live Huddle end denied') return "Tried to end the Ka Link for everyone but isn't allowed to";
  if (d.source === 'livekit') {
    if (d.event === 'joined') return 'Call server: joined the call';
    const why = describeLeaveReason(d.reason);
    return `Call server: left the call${why ? ` — ${why}` : ''}`;
  }
  const code = String(d.code || '');
  const x = (d.extra || {}) as ChatIssueExtra;
  const mins = (sec?: number) =>
    typeof sec === 'number' ? (sec < 60 ? `${sec}s` : `${Math.round(sec / 60)} min`) : null;
  const activity: Record<string, string> = {
    huddle_joined: x.attempt ? 'Rejoined the Ka Link' : 'Joined the Ka Link',
    huddle_left: `Tapped Leave${mins(x.durationSec) ? ` after ${mins(x.durationSec)}` : ''}`,
    huddle_reconnecting:
      x.reason === 'signal'
        ? `Connection to the call server blipped${x.hidden ? ' (app in background / screen locked)' : ''} — call audio usually keeps going`
        : x.reason === 'media'
          ? `Call audio cut out — reconnecting${x.hidden ? ' (app in background / screen locked)' : ''}`
          : 'Connection wobbled — phone is trying to reconnect',
    huddle_reconnected: `${x.reason === 'media' ? 'Call audio came back' : 'Connection came back'}${mins(x.outageSec) ? ` after ${mins(x.outageSec)}` : ''}`,
    huddle_dropped: `Dropped out of the call${x.reason ? ` (${describeLeaveReason(x.reason) || x.reason})` : ''} — rejoining automatically`,
    huddle_auto_rejoin: 'App rejoined them automatically',
    huddle_removed: 'Removed from the Ka Link by a moderator',
    huddle_ended_for_all: 'The Ka Link was ended for everyone while they were on it',
    huddle_other_device: 'Joined from another phone or tab — this one was replaced',
    huddle_app_closed: `Closed the app or the phone shut the page${mins(x.durationSec) ? ` after ${mins(x.durationSec)}` : ''}`,
    huddle_keep_awake: x.keepAwake ? 'Screen kept awake' : 'Screen could not be kept awake',
    huddle_join_stalled: 'Rejoining got stuck after coming back to the app — the app gave up and tried again',
    huddle_interrupted:
      x.reason === 'mic_ended' || x.reason === 'mic_taken'
        ? 'Audio paused — a phone call (or another app) took the microphone'
        : 'Audio paused — the phone stopped the huddle sound (usually a phone call)',
    huddle_audio_resumed: `Audio came back after the call${mins(x.outageSec) ? ` (${mins(x.outageSec)} later)` : ''}`,
  };
  if (activity[code]) return activity[code];
  const known: Record<string, string> = {
    huddle_not_started: 'Tried to join a Ka Link that had not been started yet',
    huddle_start_forbidden: 'Tried to join a Ka Link that had not been started yet',
    huddle_live_unknown: "Couldn't join — the call service didn't answer whether the huddle was live",
    huddle_token_failed: "Couldn't join — Canaan could not issue a call pass",
    huddle_forbidden: "Couldn't join — no access to this room's Ka Link",
    huddle_connect_failed: 'Got a call pass but the phone could not connect to the call',
    huddle_mic_denied: 'Joined, but the microphone was blocked on their phone',
    huddle_disconnected: 'Dropped out of the call and could not get back in',
    huddle_not_configured: 'Ka Link calls are not set up on Canaan',
    rate_limited: 'Too many join attempts in a minute',
    room_forbidden: "Couldn't open the room (no access)",
    room_not_found: "Couldn't open the room (not found)",
    room_load_failed: "Couldn't load the room's messages",
    send_failed: "A message didn't send",
    upload_failed: "A photo/voice note/file didn't upload",
    vault_unreachable: "The app couldn't reach Canaan (the church server)",
    upstream_timeout: 'Canaan (the church server) took too long to answer',
    signin_failed: "Couldn't sign in",
    app_crash: 'The app crashed on a screen',
    huddle_join_stalled: 'Rejoining got stuck after coming back to the app',
  };
  if (known[code]) return known[code];
  if (code.startsWith('huddle_join_')) return `Couldn't join the Ka Link${d.message ? ` — they saw: "${String(d.message)}"` : ''}`;
  return d.message ? String(d.message) : code || action;
}

export type ChatIssueRow = {
  id: string;
  at: string;
  kind: 'problem' | 'activity';
  severity: string;
  area: string;
  code: string;
  title: string;
  message: string | null;
  status: number | null;
  source: string | null;
  path: string | null;
  device: string | null;
  userId: string | null;
  userName: string | null;
  channelId: string | null;
  channelName: string | null;
  extra: ChatIssueExtra | null;
  /** What to do about it (sign-in problems carry Canaan's own advice). */
  fix?: string | null;
};

/** Owner view: reports + huddle audit trail, with names filled in. */
export async function listChatIssues(
  supabase: SupabaseClient,
  opts: { days?: number; limit?: number } = {}
): Promise<ChatIssueRow[]> {
  const days = Math.min(Math.max(Number(opts.days) || 7, 1), 90);
  const limit = Math.min(Math.max(Number(opts.limit) || DEFAULT_ROWS, 1), MAX_ROWS);
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const rows: any[] = [];
  // PostgREST caps each response at 1000 rows — page through.
  for (let from = 0; from < limit; from += PAGE) {
    const to = Math.min(from + PAGE, limit) - 1;
    const { data, error } = await supabase
      .from('audit_logs')
      .select('id, created_at, user_id, action, details, resource_type, resource_id, severity')
      .gte('created_at', since)
      .or(
        `resource_type.eq.${CHAT_ISSUE_RESOURCE},resource_type.eq.${HUDDLE_EVENT_RESOURCE},and(resource_type.eq.chat_channel,action.ilike.*huddle*)`
      )
      .order('created_at', { ascending: false })
      .range(from, to);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < to - from + 1) break;
  }

  const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
  const channelIds = [...new Set(rows.map((r) => r.resource_id).filter((v) => v && UUID_RE.test(v)))];
  const names = new Map<string, string>();
  const rooms = new Map<string, string>();
  if (userIds.length) {
    const { data: users } = await supabase.from('users').select('id, name, email').in('id', userIds);
    (users || []).forEach((u: any) => names.set(u.id, String(u.name || u.email || '').trim() || 'Member'));
  }
  if (channelIds.length) {
    const { data: chans } = await supabase.from('chat_channels').select('id, name').in('id', channelIds);
    (chans || []).forEach((c: any) => rooms.set(c.id, String(c.name || 'Room')));
  }

  // Hide the meeting-minutes recorder (LiveKit egress) logged as a person before the webhook ignored it.
  const isRecorderRow = (r: any) => /^EG_[A-Za-z0-9]+$/.test(String(parseDetails(r.details)?.identity || ''));
  const out = rows.filter((r) => !isRecorderRow(r)).map((r): ChatIssueRow => {
    const d = parseDetails(r.details);
    const isReport = r.resource_type === CHAT_ISSUE_RESOURCE;
    const isServer = r.resource_type === HUDDLE_EVENT_RESOURCE;
    const code = isServer
      ? `lk_${d.event === 'joined' ? 'joined' : 'left'}`
      : isReport
        ? String(d.code || '')
        : String(r.action);
    const isActivity = isServer || (isReport && isHuddleActivityCode(code));
    const isProblem = !isActivity && (isReport || /denied/i.test(String(r.action)));
    const cid = r.resource_id && UUID_RE.test(r.resource_id) ? String(r.resource_id) : null;
    const extra = isServer
      ? sanitizeIssueExtra({ reason: d.reason, durationSec: d.durationSec })
      : sanitizeIssueExtra(d.extra);
    return {
      id: String(r.id),
      at: String(r.created_at),
      kind: isProblem ? 'problem' : 'activity',
      severity: String(r.severity || (isProblem ? 'warning' : 'info')),
      area: isReport ? String(d.area || 'other') : 'huddle',
      code,
      title: describeChatIssue(String(r.action), d),
      message: d.message ? String(d.message) : null,
      status: typeof d.status === 'number' ? d.status : null,
      source: isServer ? 'livekit' : isReport ? String(d.source || '') : 'vault',
      path: d.path ? String(d.path) : null,
      device: d.device ? String(d.device) : null,
      userId: r.user_id || null,
      userName: r.user_id ? names.get(r.user_id) || (d.name ? String(d.name) : null) : d.name ? String(d.name) : null,
      channelId: cid,
      channelName: cid ? rooms.get(cid) || null : null,
      extra,
    };
  });

  // Sign-in problems (Canaan's own log) — so Issues shows everyone who had trouble, in one place.
  try {
    const { SIGN_IN_FAILURE_LABELS, isSignInFailureReason } = await import('./signInFailures.js');
    const { data: fails } = await supabase
      .from('sign_in_failures')
      .select('id, created_at, app, method, identifier_masked, user_id, reason, detail, user_agent')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(1000);
    const missing = [...new Set((fails || []).map((f: any) => f.user_id).filter((id: any) => id && !names.has(id)))];
    if (missing.length) {
      const { data: users } = await supabase.from('users').select('id, name, email').in('id', missing);
      (users || []).forEach((u: any) => names.set(u.id, String(u.name || u.email || '').trim() || 'Member'));
    }
    for (const f of (fails || []) as any[]) {
      if (!isSignInFailureReason(f.reason)) continue;
      const label = SIGN_IN_FAILURE_LABELS[f.reason as keyof typeof SIGN_IN_FAILURE_LABELS];
      const app = String(f.app || 'canaan');
      out.push({
        id: `signin-${f.id}`,
        at: String(f.created_at),
        kind: 'problem',
        severity: f.reason === 'app_crash' || f.reason === 'server_unreachable' ? 'critical' : 'warning',
        area: f.reason === 'app_crash' ? 'app' : 'signin',
        code: f.reason === 'app_crash' ? 'app_crash' : `signin_${f.reason}`,
        title: f.reason === 'app_crash' ? 'The app crashed on a screen' : `Couldn't sign in — ${label.label.toLowerCase()}`,
        message: f.detail ? String(f.detail) : null,
        status: null,
        source: app === 'tribes' ? 'tribes-app' : app === 'ka-link' ? 'ka-link-app' : 'canaan',
        path: null,
        device: f.user_agent ? String(f.user_agent).slice(0, 200) : null,
        userId: f.user_id || null,
        userName: f.user_id ? names.get(f.user_id) || null : f.identifier_masked ? `Number ${f.identifier_masked}` : null,
        channelId: null,
        channelName: null,
        extra: null,
        fix: label.fix,
      });
    }
  } catch (err: any) {
    console.warn('[issues] sign-in problems skipped', err?.message || err);
  }
  return out.sort((x, y) => (x.at < y.at ? 1 : x.at > y.at ? -1 : 0));
}

/**
 * LiveKit webhook participant_joined / participant_left → one audit row.
 * Server truth: recorded even when the member's phone died or lost signal.
 * Returns null for anything that isn't a huddle join/leave.
 */
export function buildLiveKitHuddleAudit(opts: {
  eventName: string;
  channelId: string | null;
  roomSid?: string | null;
  participant?: { identity?: string; name?: string; joinedAt?: unknown; disconnectReason?: unknown } | null;
  createdAt?: unknown;
}): {
  userId: string | null;
  action: string;
  details: Record<string, any>;
  resourceType: string;
  resourceId: string;
  severity: 'info' | 'warning';
} | null {
  const ev = String(opts.eventName || '');
  if (ev !== 'participant_joined' && ev !== 'participant_left') return null;
  if (!opts.channelId || !UUID_RE.test(opts.channelId)) return null;
  const p = opts.participant || {};
  const identity = String(p.identity || '').trim();
  if (!identity) return null;
  // The meeting-minutes recorder (LiveKit egress, EG_…) is not a person.
  if (/^EG_[A-Za-z0-9]+$/.test(identity)) return null;
  const joined = ev === 'participant_joined';
  const toSec = (v: unknown) => {
    const n = Number(typeof v === 'bigint' ? Number(v) : v);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n > 1e12 ? Math.round(n / 1000) : Math.round(n);
  };
  const joinedAt = toSec(p.joinedAt);
  const at = toSec(opts.createdAt) || Math.round(Date.now() / 1000);
  const reason = joined ? null : liveKitReasonName(p.disconnectReason);
  const durationSec = !joined && joinedAt && at >= joinedAt ? at - joinedAt : null;
  const quiet = ['CLIENT_INITIATED', 'ROOM_DELETED', 'ROOM_CLOSED', 'PARTICIPANT_REMOVED', null];
  return {
    userId: UUID_RE.test(identity) ? identity : null,
    action: `LiveKit: ${ev}`,
    details: {
      source: 'livekit',
      event: joined ? 'joined' : 'left',
      reason,
      durationSec,
      name: clip(p.name, 120),
      identity: UUID_RE.test(identity) ? null : clip(identity, 80),
      roomSid: clip(opts.roomSid, 64),
    },
    resourceType: HUDDLE_EVENT_RESOURCE,
    resourceId: opts.channelId,
    severity: quiet.includes(reason) ? 'info' : 'warning',
  };
}

/** Route handler for issue-report / issues. */
export async function handleChatIssues(
  chatType: string,
  req: any,
  res: any,
  ctx: {
    supabase: SupabaseClient;
    user: { id: string; email?: string | null; role?: string | null };
    logAudit: (row: any) => Promise<void>;
  }
) {
  if (chatType === 'issue-report') {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });
    const parsed = parseChatIssueReport(req.body);
    if (parsed.ok === false) return res.status(400).json({ ok: false, error: parsed.error });
    const r = parsed.report;
    const bucket = isHuddleActivityCode(r.code) ? 'activity' : 'problem';
    if (!allowChatIssueReport(ctx.user.id, Date.now(), bucket)) return res.status(200).json({ ok: true, dropped: true });
    await ctx.logAudit({
      userId: ctx.user.id,
      action: `PLCC app issue: ${r.code}`,
      details: {
        area: r.area,
        code: r.code,
        source: r.source,
        status: r.status,
        message: r.message,
        path: r.path,
        device: r.device,
        extra: r.extra,
      },
      resourceType: CHAT_ISSUE_RESOURCE,
      resourceId: r.channelId || undefined,
      severity: chatIssueSeverity(r),
      req,
    });
    return res.status(200).json({ ok: true });
  }

  // issues (GET)
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'GET only' });
  const allowed = await canViewPlccIssues(ctx.supabase, ctx.user);
  if (String(req.query?.check || '') === '1') return res.status(200).json({ ok: true, allowed });
  if (!allowed) return res.status(403).json({ ok: false, error: 'Forbidden' });
  const issues = await listChatIssues(ctx.supabase, {
    days: Number(req.query?.days) || 7,
    limit: Number(req.query?.limit) || DEFAULT_ROWS,
  });
  return res.status(200).json({ ok: true, issues });
}
