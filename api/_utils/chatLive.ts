/**
 * Ka Link live updates + phone alerts.
 *
 * Instant messages: chat tables are server-only (RLS, no client policies), so
 * apps can't listen to the database. Instead the Vault broadcasts a tiny
 * "something changed" ping on a Supabase Realtime topic per room. The topic
 * name is an HMAC of the room id, handed out only to people who can open the
 * room (room-info), so others can't guess it. Pings carry ids only — the app
 * then reloads messages through the normal, access-checked API. The same topic
 * carries "typing…" between people in the room.
 *
 * Phone alerts: new messages are pushed (web push, topic 'chat') to the room's
 * people — or everyone with chat alerts on, for open rooms — minus the author
 * and anyone who muted the room.
 */
import { createHmac } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { pushChatAlert } from './pushAlerts.js';
import { normalizeVisibility } from './communityChatSecurity.js';

const BROADCAST_TIMEOUT_MS = 3_000;

function topicSecret(): string {
  return String(process.env.CHAT_REALTIME_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
}

/** Unguessable per-room Realtime topic. Empty when the server has no secret. */
export function chatRealtimeTopic(channelId: string, secret = topicSecret()): string {
  if (!secret || !channelId) return '';
  const mac = createHmac('sha256', secret).update(`awc-chat-room:${channelId}`).digest('hex').slice(0, 32);
  return `awc-chat-${mac}`;
}

type Fetch = typeof fetch;
let fetchImpl: Fetch = (input, init) => fetch(input, init);
export function __setChatLiveFetchForTests(fn: Fetch | null) {
  fetchImpl = fn || ((input, init) => fetch(input, init));
}

/** Ping everyone looking at this room ("message" | "deleted"). Never throws. */
export async function broadcastChatEvent(
  channelId: string,
  event: 'message' | 'deleted' | 'read',
  payload: Record<string, string>
): Promise<boolean> {
  return broadcastToTopic(chatRealtimeTopic(channelId), event, payload);
}

/** Ping one Realtime topic (a room, or a person's call inbox). Never throws. */
export async function broadcastToTopic(
  topic: string,
  event: string,
  payload: Record<string, string>
): Promise<boolean> {
  const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key || !topic) return false;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), BROADCAST_TIMEOUT_MS);
  try {
    const res = await fetchImpl(`${url}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ topic, event, payload, private: false }] }),
      signal: ctrl.signal,
    });
    return res.ok;
  } catch (err: any) {
    console.warn('[chat-live] broadcast failed:', err?.message || err);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Edits allowed for this long after sending (WhatsApp allows 15 min; members asked for more room). */
export const CHAT_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Pure: may this person edit this message now? Authors only, not deleted, within 24 hours. */
export function decideChatEdit(opts: {
  authorId: unknown;
  userId: string;
  createdAt: unknown;
  deletedAt: unknown;
  now?: number;
}): { ok: true } | { ok: false; status: number; error: string } {
  if (!opts.authorId || String(opts.authorId) !== String(opts.userId)) {
    return { ok: false, status: 403, error: 'You can only edit your own messages.' };
  }
  if (opts.deletedAt) return { ok: false, status: 400, error: 'That message was removed.' };
  const sent = new Date(String(opts.createdAt || '')).getTime();
  if (!Number.isFinite(sent) || (opts.now ?? Date.now()) - sent > CHAT_EDIT_WINDOW_MS) {
    return { ok: false, status: 400, error: 'Messages can only be edited within 24 hours.' };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Mutes
// ---------------------------------------------------------------------------

/** Users who muted this room right now (muted_until null = until they unmute). */
export async function mutedUserIds(supabase: SupabaseClient, channelId: string): Promise<Set<string>> {
  try {
    const { data, error } = await supabase
      .from('chat_room_mutes')
      .select('user_id, muted_until')
      .eq('channel_id', channelId);
    if (error) return new Set();
    const now = Date.now();
    return new Set(
      (data || [])
        .filter((r: any) => !r.muted_until || new Date(r.muted_until).getTime() > now)
        .map((r: any) => String(r.user_id))
    );
  } catch {
    return new Set();
  }
}

export async function isRoomMuted(supabase: SupabaseClient, channelId: string, userId: string): Promise<boolean> {
  return (await mutedUserIds(supabase, channelId)).has(userId);
}

export async function setRoomMuted(
  supabase: SupabaseClient,
  channelId: string,
  userId: string,
  muted: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (muted) {
    const { error } = await supabase
      .from('chat_room_mutes')
      .upsert({ channel_id: channelId, user_id: userId, muted_until: null }, { onConflict: 'user_id,channel_id' });
    if (error) {
      return {
        ok: false,
        error: /chat_room_mutes/.test(error.message)
          ? 'Run supabase/migrations/chat_live_alerts.sql in the Supabase SQL editor first.'
          : 'Could not mute this chat.',
      };
    }
    return { ok: true };
  }
  await supabase.from('chat_room_mutes').delete().eq('channel_id', channelId).eq('user_id', userId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Phone alerts
// ---------------------------------------------------------------------------

function participantIds(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      /* not JSON */
    }
  }
  return [];
}

/** Pure: alert text for a new message. */
export function chatAlertFor(opts: {
  channel: { id: string; name?: string | null; visibility?: string | null; type?: string | null };
  authorName: string;
  content: string;
}): { title: string; body: string; url: string; tag: string } {
  const vis = normalizeVisibility(opts.channel as any);
  const author = String(opts.authorName || 'Someone').trim() || 'Someone';
  const text = String(opts.content || '').replace(/\s+/g, ' ').trim() || 'New message';
  const isDm = vis === 'dm';
  return {
    title: isDm ? author : String(opts.channel.name || 'Ka Link'),
    body: isDm ? text : `${author}: ${text}`,
    url: `/community/chat/${opts.channel.id}`,
    // One alert per room on the phone; a new message replaces the previous one.
    tag: `chat:${opts.channel.id}`,
  };
}

/** Who should hear about a message in this room. 'everyone' for open rooms. */
export async function chatAlertAudience(
  supabase: SupabaseClient,
  channel: { id: string; participants?: unknown; visibility?: string | null; type?: string | null }
): Promise<{ userIds: string[] } | { everyone: true }> {
  const vis = normalizeVisibility(channel as any);
  if (vis === 'open') return { everyone: true };
  const ids = new Set(participantIds(channel.participants));
  if (vis !== 'dm') {
    const { data } = await supabase.from('chat_room_members').select('user_id').eq('channel_id', channel.id);
    for (const r of data || []) if ((r as any).user_id) ids.add(String((r as any).user_id));
  }
  return { userIds: [...ids] };
}

/** "@everyone" or "@all" as a word in the message. */
export function mentionsEveryone(content: string): boolean {
  return /(^|\s)@(everyone|all)(?![A-Za-z0-9_])/i.test(String(content || ''));
}

/** New message → phone alerts. Never throws. */
export async function alertChatMessage(
  supabase: SupabaseClient,
  opts: {
    channel: { id: string; name?: string | null; participants?: unknown; visibility?: string | null; type?: string | null };
    authorId: string;
    authorName: string;
    content: string;
    /** A room leader wrote @everyone: alert everyone in the room, even people who muted it. */
    everyone?: boolean;
  }
): Promise<void> {
  try {
    const audience = await chatAlertAudience(supabase, opts.channel);
    const skip = opts.everyone ? new Set<string>() : await mutedUserIds(supabase, opts.channel.id);
    skip.add(String(opts.authorId));
    const alert = chatAlertFor(opts);
    if (opts.everyone) alert.title = `📣 ${alert.title}`;
    await pushChatAlert(supabase, audience, skip, alert);
  } catch (err: any) {
    console.warn('[chat-live] alert failed:', err?.message || err);
  }
}

// ---------------------------------------------------------------------------
// Email fallback for direct messages
// ---------------------------------------------------------------------------

const KA_LINK_ORIGIN = String(process.env.KA_LINK_PUBLIC_ORIGIN || process.env.CHAT_PUBLIC_ORIGIN || 'https://plcc-chat.vercel.app').replace(/\/+$/, '');

function escapeHtml(s: string): string {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** A real inbox (phone sign-ins get a placeholder like …@phone.awcvault.invalid). */
export function emailableAddress(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  if (!/^[^\s@<>]+@[^\s@<>]+\.[A-Za-z]{2,}$/.test(s)) return null;
  if (/\.(invalid|test|example|local)$/i.test(s)) return null;
  return s;
}

/** Pure: the email for "X sent you a message". The message itself is never included (it's private). */
export function dmEmailFor(opts: { authorName: string; channelId: string; origin?: string }): { subject: string; html: string; text: string; url: string } {
  const author = String(opts.authorName || 'Someone').trim() || 'Someone';
  const url = `${(opts.origin || KA_LINK_ORIGIN).replace(/\/+$/, '')}/community/chat/${encodeURIComponent(opts.channelId)}`;
  const name = escapeHtml(author);
  const subject = `${author} sent you a message`;
  const text = `${author} sent you a message on PLCC Ka Link.\n\nOpen it: ${url}\n\nTip: turn on phone alerts in PLCC Ka Link (your profile → Phone alerts) to get these on your phone instead of by email.`;
  const html = `<!doctype html><html><body style="margin:0;background:#f6f1e7;font-family:Arial,Helvetica,sans-serif;color:#1c1a16">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fffdf8;border-radius:16px;padding:32px">
<tr><td style="font-size:12px;letter-spacing:2px;color:#9a7a3a;font-weight:bold">PLCC KA LINK</td></tr>
<tr><td style="padding-top:12px;font-size:22px;font-weight:bold">${name} sent you a message</td></tr>
<tr><td style="padding-top:8px;font-size:15px;line-height:1.5;color:#4a463e">Open PLCC Ka Link to read it and reply.</td></tr>
<tr><td style="padding-top:24px"><a href="${escapeHtml(url)}" style="background:#0d3b26;color:#f4eee2;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:bold;display:inline-block">Open the message</a></td></tr>
<tr><td style="padding-top:28px;font-size:12px;line-height:1.5;color:#7a756b">Tip: turn on phone alerts in PLCC Ka Link (your profile → Phone alerts) to get these on your phone instead of by email. On iPhone, add PLCC Ka Link to your Home Screen first.</td></tr>
</table><p style="font-size:11px;color:#9a958b;margin-top:16px">Promised Land Christian Center · Kira-Kitukutwe</p></td></tr></table></body></html>`;
  return { subject, html, text, url };
}

/**
 * Direct message → email the other person, but only when it would otherwise go unnoticed:
 *  - they have no phone alerts on (no 'chat' push subscription),
 *  - they haven't muted the chat,
 *  - and this is the first message they haven't read yet (one email per burst, not per message).
 * Never throws.
 */
export async function emailDmIfNoAlerts(
  supabase: SupabaseClient,
  opts: {
    channel: { id: string; participants?: unknown; visibility?: string | null; type?: string | null };
    authorId: string;
    authorName: string;
    messageId: string;
    send?: (msg: { to: string; subject: string; html: string; text: string }) => Promise<boolean>;
  }
): Promise<{ emailed: number }> {
  let emailed = 0;
  try {
    if (normalizeVisibility(opts.channel as any) !== 'dm') return { emailed };
    const muted = await mutedUserIds(supabase, opts.channel.id);
    const recipients = participantIds(opts.channel.participants).filter((id) => id && id !== String(opts.authorId) && !muted.has(id));
    if (!recipients.length) return { emailed };
    const send = opts.send ?? defaultDmEmailSender;
    for (const userId of recipients) {
      const { count: subs } = await supabase
        .from('push_subscriptions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .contains('topics', ['chat']);
      if ((subs ?? 0) > 0) continue; // phone alert already on its way

      const { data: read } = await supabase
        .from('chat_read_status')
        .select('last_read_at')
        .eq('user_id', userId)
        .eq('channel_id', opts.channel.id)
        .maybeSingle();
      let earlier = supabase
        .from('chat_messages')
        .select('id', { count: 'exact', head: true })
        .eq('channel_id', opts.channel.id)
        .neq('user_id', userId)
        .neq('id', opts.messageId)
        .is('deleted_at', null);
      if ((read as any)?.last_read_at) earlier = earlier.gt('created_at', (read as any).last_read_at);
      const { count: unreadBefore, error: unreadErr } = await earlier;
      if (unreadErr || (unreadBefore ?? 0) > 0) continue; // already told about this conversation

      const { data: user } = await supabase.from('users').select('email').eq('id', userId).maybeSingle();
      const to = emailableAddress((user as any)?.email);
      if (!to) continue;
      const mail = dmEmailFor({ authorName: opts.authorName, channelId: opts.channel.id });
      if (await send({ to, subject: mail.subject, html: mail.html, text: mail.text })) emailed += 1;
    }
  } catch (err: any) {
    console.warn('[chat-live] dm email failed:', err?.message || err);
  }
  return { emailed };
}

async function defaultDmEmailSender(msg: { to: string; subject: string; html: string; text: string }): Promise<boolean> {
  const { getResend } = await import('./deps.js');
  const { vaultFrom } = await import('./emailFrom.js');
  const resend = await getResend();
  if (!resend) return false;
  const { error } = await resend.emails.send({ from: vaultFrom('PLCC Ka Link'), to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text });
  if (error) {
    console.warn('[chat-live] dm email not sent:', error.message || error);
    return false;
  }
  return true;
}
