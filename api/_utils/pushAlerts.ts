/**
 * Phone alerts for PLCC Connect (web push).
 *
 * Members turn alerts on in PLCC Connect; Connect forwards the browser's push
 * subscription here (resource=push). Every member-facing inbox notification
 * (Canaan News, announcements, prayer requests, mentions, huddles, PLCC Bucks)
 * is also pushed to that person's phones, and staff can send a one-off alert
 * ("We're live", "RSVP closes Friday") from the Vault home page.
 *
 * Env: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:…).
 * Without them everything here is a quiet no-op.
 *
 *   GET  resource=push&action=status[&endpoint=…]  → { enabled, publicKey, subscribed, topics }
 *   POST resource=push&action=subscribe   { subscription, topics }
 *   POST resource=push&action=unsubscribe { endpoint }
 *   POST resource=push&action=test        → test alert to your own phones
 *   POST resource=push&action=broadcast   { title, body, url, saveToInbox } (Pastor / Ministry Leader / Super Admin)
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import { getSupabaseAdmin, requireAuth } from './auth.js';

/** 'chat' = new messages in PLCC Chat (only PLCC Chat subscribes to it). */
export type PushTopic = 'church' | 'prayer' | 'community' | 'daily' | 'chat';
export const PUSH_TOPICS: PushTopic[] = ['church', 'prayer', 'community', 'daily', 'chat'];
/** New phones get these; the 7 AM devotional reminder ('daily') is opt-in from the Daily page. */
export const DEFAULT_TOPICS: PushTopic[] = ['church', 'prayer', 'community'];

export type PushMessage = { title: string; body?: string | null; url?: string | null; tag?: string | null };

const BROADCAST_ROLES = new Set(['SUPER_ADMIN', 'PASTOR', 'MINISTRY_LEADER']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEND_TIMEOUT_MS = 8_000;
const CONCURRENCY = 25;
const OVERALL_BUDGET_MS = 25_000;
const MAX_FAILURES = 5;

/** Push services we accept subscriptions for (browser vendors only). */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^(?:[a-z0-9-]+\.)*push\.apple\.com$/,
  /^(?:[a-z0-9-]+\.)*push\.services\.mozilla\.com$/,
  /^(?:[a-z0-9-]+\.)*notify\.windows\.com$/,
];

let vapidReady: boolean | null = null;
export function pushConfigured(): boolean {
  if (vapidReady !== null) return vapidReady;
  const pub = String(process.env.VAPID_PUBLIC_KEY || '').trim();
  const priv = String(process.env.VAPID_PRIVATE_KEY || '').trim();
  const subject = String(process.env.VAPID_SUBJECT || 'mailto:admin@awcvault.org').trim();
  if (!pub || !priv) return (vapidReady = false);
  try {
    webpush.setVapidDetails(subject, pub, priv);
    vapidReady = true;
  } catch (err: any) {
    console.error('[Push] VAPID keys invalid:', err?.message || err);
    vapidReady = false;
  }
  return vapidReady;
}

/** Test hook: reset cached VAPID state after changing env. */
export function __resetPushConfigForTests() {
  vapidReady = null;
}

type Sender = (sub: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string) => Promise<unknown>;
let sender: Sender = (sub, payload) =>
  webpush.sendNotification(sub, payload, { TTL: 60 * 60 * 12, timeout: SEND_TIMEOUT_MS, urgency: 'high' });
export function __setPushSenderForTests(fn: Sender | null) {
  sender = fn || ((sub, payload) => webpush.sendNotification(sub, payload, { TTL: 60 * 60 * 12, timeout: SEND_TIMEOUT_MS, urgency: 'high' }));
}

// ---------------------------------------------------------------------------
// Which inbox notifications become phone alerts, and where a tap opens Connect.
// ---------------------------------------------------------------------------

/** Topic for an inbox notification type, or null when it is staff-only (no phone alert). */
export function topicForNotification(type: string): PushTopic | null {
  if (type === 'announcement' || type === 'celebration') return 'church';
  if (type === 'prayer') return 'prayer';
  if (type.startsWith('community_') || type === 'kids_bucks_award') return 'community';
  return null; // assignment, event_approval: Canaan staff work, not Connect
}

/** Connect path a tap opens. Never passes the raw Vault link through. */
export function connectUrlForNotification(type: string, link?: string | null): string {
  const path = String(link || '').split('?')[0].split('#')[0];
  if (type === 'announcement') return path === '/dashboard' ? '/?section=vault-news' : '/';
  if (type === 'celebration') return '/';
  if (type === 'prayer') return path === '/intercessors' || path === '/community/prayer-watch' ? '/intercessors' : '/prayer';
  return '/notifications';
}

/** A broadcast link: a Connect path, or an https address (livestream, RSVP page). */
export function cleanAlertUrl(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return '/';
  if (s.length > 500) return null;
  if (/^\/(?!\/)[^\s\\]*$/.test(s)) return s;
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' || u.username || u.password) return null;
    return u.toString();
  } catch {
    return null;
  }
}

function clip(s: unknown, max: number): string {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function payloadFor(msg: PushMessage): string {
  return JSON.stringify({
    title: clip(msg.title, 80) || 'PLCC Connect',
    body: clip(msg.body, 180),
    url: msg.url || '/',
    tag: msg.tag || undefined,
  });
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

type SubRow = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string; failure_count: number };

async function deliver(supabase: SupabaseClient, rows: SubRow[], msg: PushMessage): Promise<{ sent: number; removed: number }> {
  const payload = payloadFor(msg);
  const started = Date.now();
  let sent = 0;
  let removed = 0;
  const gone: string[] = [];
  const failed: SubRow[] = [];
  const ok: string[] = [];

  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    if (Date.now() - started > OVERALL_BUDGET_MS) {
      console.warn('[Push] time budget reached; skipped', rows.length - i);
      break;
    }
    await Promise.all(
      rows.slice(i, i + CONCURRENCY).map(async (row) => {
        try {
          await sender({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, payload);
          sent += 1;
          ok.push(row.id);
        } catch (err: any) {
          const status = Number(err?.statusCode || 0);
          if (status === 404 || status === 410) gone.push(row.id);
          else failed.push(row);
        }
      })
    );
  }

  try {
    if (gone.length) {
      await supabase.from('push_subscriptions').delete().in('id', gone);
      removed += gone.length;
    }
    const dead = failed.filter((r) => r.failure_count + 1 >= MAX_FAILURES).map((r) => r.id);
    if (dead.length) {
      await supabase.from('push_subscriptions').delete().in('id', dead);
      removed += dead.length;
    }
    for (const r of failed.filter((r) => r.failure_count + 1 < MAX_FAILURES)) {
      await supabase.from('push_subscriptions').update({ failure_count: r.failure_count + 1 }).eq('id', r.id);
    }
    if (ok.length) {
      await supabase.from('push_subscriptions').update({ failure_count: 0, last_sent_at: new Date().toISOString() }).in('id', ok);
    }
  } catch (err: any) {
    console.error('[Push] bookkeeping failed:', err?.message || err);
  }
  return { sent, removed };
}

const SUB_COLUMNS = 'id, user_id, endpoint, p256dh, auth, failure_count';

/** Alert specific people (their phones that have this topic on). Never throws. */
export async function pushToUsers(
  supabase: SupabaseClient,
  userIds: string[],
  topic: PushTopic,
  msg: PushMessage
): Promise<{ sent: number; removed: number }> {
  if (!pushConfigured()) return { sent: 0, removed: 0 };
  const ids = [...new Set(userIds.filter((id) => UUID_RE.test(String(id || ''))))];
  if (!ids.length) return { sent: 0, removed: 0 };
  try {
    const rows: SubRow[] = [];
    for (let i = 0; i < ids.length; i += 300) {
      const { data, error } = await supabase
        .from('push_subscriptions')
        .select(SUB_COLUMNS)
        .in('user_id', ids.slice(i, i + 300))
        .contains('topics', [topic]);
      if (error) throw error;
      rows.push(...((data || []) as SubRow[]));
    }
    return await deliver(supabase, rows, msg);
  } catch (err: any) {
    console.error('[Push] to users failed:', err?.message || err);
    return { sent: 0, removed: 0 };
  }
}

/** Alert everyone with this topic on, except one person (the author). Never throws. */
export async function pushToEveryone(
  supabase: SupabaseClient,
  topic: PushTopic,
  msg: PushMessage,
  exceptUserId?: string | null
): Promise<{ sent: number; removed: number }> {
  if (!pushConfigured()) return { sent: 0, removed: 0 };
  try {
    const rows: SubRow[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from('push_subscriptions')
        .select(SUB_COLUMNS)
        .contains('topics', [topic])
        .order('created_at', { ascending: true })
        .range(from, from + 999);
      if (error) throw error;
      rows.push(...((data || []) as SubRow[]));
      if (!data || data.length < 1000) break;
    }
    const targets = exceptUserId ? rows.filter((r) => r.user_id !== exceptUserId) : rows;
    return await deliver(supabase, targets, msg);
  } catch (err: any) {
    console.error('[Push] to everyone failed:', err?.message || err);
    return { sent: 0, removed: 0 };
  }
}

/**
 * PLCC Chat: alert the people in a room (or, for open rooms, everyone with chat
 * alerts on), skipping the author and anyone who muted the room. Never throws.
 */
export async function pushChatAlert(
  supabase: SupabaseClient,
  target: { userIds: string[] } | { everyone: true },
  skipUserIds: Set<string>,
  msg: PushMessage
): Promise<{ sent: number; removed: number }> {
  if (!pushConfigured()) return { sent: 0, removed: 0 };
  try {
    const rows: SubRow[] = [];
    if ('userIds' in target) {
      const ids = [...new Set(target.userIds.filter((id) => UUID_RE.test(String(id || '')) && !skipUserIds.has(id)))];
      for (let i = 0; i < ids.length; i += 300) {
        const { data, error } = await supabase
          .from('push_subscriptions')
          .select(SUB_COLUMNS)
          .in('user_id', ids.slice(i, i + 300))
          .contains('topics', ['chat']);
        if (error) throw error;
        rows.push(...((data || []) as SubRow[]));
      }
    } else {
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from('push_subscriptions')
          .select(SUB_COLUMNS)
          .contains('topics', ['chat'])
          .order('created_at', { ascending: true })
          .range(from, from + 999);
        if (error) throw error;
        rows.push(...((data || []) as SubRow[]));
        if (!data || data.length < 1000) break;
      }
    }
    const targets = rows.filter((r) => !skipUserIds.has(r.user_id));
    if (!targets.length) return { sent: 0, removed: 0 };
    return await deliver(supabase, targets, msg);
  } catch (err: any) {
    console.error('[Push] chat alert failed:', err?.message || err);
    return { sent: 0, removed: 0 };
  }
}

/** Phone alert for an inbox notification (used by notify.ts). Never throws. */
export async function pushForNotification(
  supabase: SupabaseClient,
  target: { userIds: string[] } | { everyoneExcept: string | null },
  n: { type: string; title: string; body?: string | null; link?: string | null; sourceId?: string | null }
): Promise<void> {
  const topic = topicForNotification(n.type);
  if (!topic || !pushConfigured()) return;
  const msg: PushMessage = {
    title: n.title,
    body: n.body,
    url: connectUrlForNotification(n.type, n.link),
    tag: n.sourceId ? `${n.type}:${n.sourceId}` : n.type,
  };
  if ('userIds' in target) await pushToUsers(supabase, target.userIds, topic, msg);
  else await pushToEveryone(supabase, topic, msg, target.everyoneExcept);
}

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

export function validEndpoint(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  if (!s || s.length > 1000) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' || u.username || u.password) return null;
    const host = u.hostname.toLowerCase();
    return PUSH_HOSTS.some((re) => re.test(host)) ? u.toString() : null;
  } catch {
    return null;
  }
}

const KEY_RE = /^[A-Za-z0-9_-]+=*$/;
export function parseSubscription(raw: any): { endpoint: string; p256dh: string; auth: string } | null {
  const endpoint = validEndpoint(raw?.endpoint);
  const p256dh = String(raw?.keys?.p256dh || '').trim();
  const auth = String(raw?.keys?.auth || '').trim();
  if (!endpoint) return null;
  if (!KEY_RE.test(p256dh) || p256dh.length < 80 || p256dh.length > 120) return null;
  if (!KEY_RE.test(auth) || auth.length < 16 || auth.length > 40) return null;
  return { endpoint, p256dh, auth };
}

export function cleanTopics(raw: unknown): PushTopic[] {
  if (!Array.isArray(raw)) return [...DEFAULT_TOPICS];
  const set = new Set(raw.map((t) => String(t)).filter((t): t is PushTopic => (PUSH_TOPICS as string[]).includes(t)));
  // PLCC Chat phones subscribe to chat messages only (church alerts already go to Connect).
  if (set.size === 1 && set.has('chat')) return ['chat'];
  set.add('church'); // church alerts are the reason to turn this on; always included
  return PUSH_TOPICS.filter((t) => set.has(t));
}

function q(req: any, key: string): string {
  const v = req.query?.[key];
  return String(Array.isArray(v) ? v[0] : v ?? '').trim();
}

export async function handlePush(req: any, res: any) {
  res.setHeader('Cache-Control', 'private, no-store');
  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(503).json({ ok: false, error: 'Alerts are not available right now.' });
  const auth = await requireAuth(req, res, supabase);
  if (!auth?.user) return;
  const userId = String(auth.user.id);
  const action = q(req, 'action').toLowerCase();
  const enabled = pushConfigured();

  if (req.method === 'GET' && (action === 'status' || !action)) {
    const endpoint = validEndpoint(q(req, 'endpoint'));
    let subscribed = false;
    let topics: PushTopic[] = [];
    if (endpoint) {
      const { data } = await supabase
        .from('push_subscriptions')
        .select('topics')
        .eq('endpoint', endpoint)
        .eq('user_id', userId)
        .maybeSingle();
      if (data) {
        subscribed = true;
        topics = cleanTopics(data.topics);
      }
    }
    const role = String(auth.role || '').toUpperCase();
    return res.status(200).json({
      ok: true,
      enabled,
      publicKey: enabled ? String(process.env.VAPID_PUBLIC_KEY || '').trim() : null,
      subscribed,
      topics,
      canBroadcast: BROADCAST_ROLES.has(role),
    });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed.' });
  }
  if (!enabled) return res.status(503).json({ ok: false, error: 'Phone alerts are not set up yet.' });
  const body = req.body && typeof req.body === 'object' ? req.body : {};

  if (action === 'subscribe') {
    const sub = parseSubscription(body.subscription);
    if (!sub) return res.status(400).json({ ok: false, error: 'This phone could not be set up for alerts.' });
    const topics = cleanTopics(body.topics);
    const { count } = await supabase
      .from('push_subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);
    if ((count || 0) >= 10) {
      // Keep the newest 9 devices; a person rarely has more.
      const { data: old } = await supabase
        .from('push_subscriptions')
        .select('id')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit((count || 0) - 9);
      if (old?.length) await supabase.from('push_subscriptions').delete().in('id', old.map((r: any) => r.id));
    }
    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        user_id: userId,
        endpoint: sub.endpoint,
        p256dh: sub.p256dh,
        auth: sub.auth,
        topics,
        user_agent: clip(req.headers?.['user-agent'], 200) || null,
        failure_count: 0,
      },
      { onConflict: 'endpoint' }
    );
    if (error) {
      console.error('[Push] subscribe failed:', error.message);
      const missing = /push_subscriptions/.test(error.message) && /does not exist|schema cache/i.test(error.message);
      return res.status(missing ? 503 : 500).json({
        ok: false,
        error: missing ? 'Phone alerts need one setup step in PLCC Canaan (push_subscriptions.sql).' : 'Could not turn on alerts. Please try again.',
      });
    }
    return res.status(200).json({ ok: true, subscribed: true, topics });
  }

  if (action === 'unsubscribe') {
    const endpoint = validEndpoint(body.endpoint);
    if (endpoint) await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint).eq('user_id', userId);
    return res.status(200).json({ ok: true, subscribed: false });
  }

  if (action === 'test') {
    const r = await pushToUsers(supabase, [userId], 'church', {
      title: 'Alerts are on',
      body: 'This is how PLCC Connect alerts will look. God bless!',
      url: '/',
      tag: 'test',
    });
    return res.status(200).json({ ok: true, sent: r.sent });
  }

  if (action === 'broadcast') {
    const role = String(auth.role || '').toUpperCase();
    if (!BROADCAST_ROLES.has(role)) {
      return res.status(403).json({ ok: false, error: 'Only Pastor, Ministry Leader, and Super Admin can send alerts.' });
    }
    const title = clip(body.title, 80);
    const message = clip(body.body, 180);
    const url = cleanAlertUrl(body.url);
    if (!title) return res.status(400).json({ ok: false, error: 'Add a title.' });
    if (!url) return res.status(400).json({ ok: false, error: 'The link must start with https:// or /.' });
    const r = await pushToEveryone(supabase, 'church', { title, body: message, url, tag: `alert:${Date.now()}` });
    if (body.saveToInbox === true) {
      const { notifyAllUsers } = await import('./notify.js');
      await notifyAllUsers(supabase, { type: 'announcement', title, body: message || null, link: null }, null, { push: false });
    }
    const { count } = await supabase.from('push_subscriptions').select('id', { count: 'exact', head: true });
    return res.status(200).json({ ok: true, sent: r.sent, devices: count ?? r.sent });
  }

  return res.status(404).json({ ok: false, error: 'Unknown request.' });
}
