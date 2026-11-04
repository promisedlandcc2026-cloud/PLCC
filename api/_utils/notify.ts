import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin, verifyAuth } from './auth.js';

export type NotifyType =
  | 'announcement'
  | 'prayer'
  | 'assignment'
  | 'community_mention'
  | 'community_reply'
  | 'community_dm'
  | 'community_huddle_started'
  | 'community_feed_comment'
  | 'community_feed_mention_post'
  | 'community_feed_mention_comment'
  | 'event_approval'
  | 'kids_bucks_award'
  | 'celebration';

/** Community Feed inbox types (sidebar badge — excludes huddle/chat/system). */
export const COMMUNITY_FEED_INBOX_TYPES: NotifyType[] = [
  'community_feed_comment',
  'community_feed_mention_post',
  'community_feed_mention_comment',
];

/**
 * Phone alert for an inbox row. Loaded on demand: this file is also bundled
 * into the browser (shared helpers), and the push library is server-only.
 */
async function pushForNotification(...args: Parameters<typeof import('./pushAlerts.js').pushForNotification>): Promise<void> {
  try {
    const mod = await import('./pushAlerts.js');
    await mod.pushForNotification(...args);
  } catch (err: any) {
    console.error('[Notify] phone alert failed:', err?.message || err);
  }
}

export type NotifyPayload = {
  type: NotifyType;
  title: string;
  body?: string | null;
  link?: string | null;
  sourceId?: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function rowFromPayload(userId: string, payload: NotifyPayload) {
  return {
    user_id: userId,
    type: payload.type,
    title: payload.title,
    body: payload.body || null,
    link: payload.link || null,
    source_id: payload.sourceId && UUID_RE.test(payload.sourceId) ? payload.sourceId : null,
  };
}

/** Postgres unique_violation — safe to treat as idempotent success for huddle dedupe. */
export function isUniqueViolation(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (String(error.code || '') === '23505') return true;
  const msg = String(error.message || '').toLowerCase();
  return msg.includes('duplicate key') || msg.includes('unique constraint') || msg.includes('user_notifications_huddle_started_dedupe');
}

/**
 * Pure model of unique (user_id, type, source_id) for huddle-start rows.
 * Used by smokes to prove concurrent duplicate deliveries collapse to one row per recipient.
 */
export function mergeHuddleStartedNotifyRows(
  existing: { user_id: string; source_id: string }[],
  incoming: { user_id: string; source_id: string }[]
): { user_id: string; source_id: string }[] {
  const key = (r: { user_id: string; source_id: string }) => `${r.user_id}|${r.source_id}`;
  const seen = new Set(existing.map(key));
  const out = existing.map((r) => ({ user_id: r.user_id, source_id: r.source_id }));
  for (const row of incoming) {
    const k = key(row);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ user_id: row.user_id, source_id: row.source_id });
  }
  return out;
}

/**
 * Conflict-safe fan-out for community_huddle_started only.
 * Requires UUID source_id (room.sid session). Duplicate (user_id, type, source_id) → ignored.
 * Other notification types keep plain insert via notifyUser / notifyAllUsers.
 */
export async function notifyHuddleStartedUsers(
  supabase: SupabaseClient,
  userIds: string[],
  payload: Omit<NotifyPayload, 'type'> & { sourceId: string }
): Promise<{ attempted: number; inserted: number; conflicts: number }> {
  const sourceId = String(payload.sourceId || '').trim();
  const title = String(payload.title || '').trim();
  let attempted = 0;
  let inserted = 0;
  let conflicts = 0;
  if (!sourceId || !UUID_RE.test(sourceId) || !title) {
    return { attempted, inserted, conflicts };
  }

  const uniqueIds = [
    ...new Set((userIds || []).map((id) => String(id || '').trim()).filter((id) => UUID_RE.test(id))),
  ];

  const insertedIds: string[] = [];
  for (const userId of uniqueIds) {
    attempted += 1;
    const row = rowFromPayload(userId, {
      type: 'community_huddle_started',
      title,
      body: payload.body,
      link: payload.link,
      sourceId,
    });
    try {
      const { error } = await supabase.from('user_notifications').insert([row]);
      if (!error) {
        inserted += 1;
        insertedIds.push(userId);
        continue;
      }
      if (isUniqueViolation(error)) {
        conflicts += 1;
        continue;
      }
      console.error('[Notify] huddle-start insert failed:', error.message);
    } catch (err: any) {
      console.error('[Notify] huddle-start insert error:', err?.message || err);
    }
  }

  // Phone alert only for people who got a new inbox row (duplicates stay quiet).
  await pushForNotification(supabase, { userIds: insertedIds }, { ...payload, type: 'community_huddle_started', title, sourceId });
  return { attempted, inserted, conflicts };
}

/** One inbox row. Never throws — notification failures must not block the original save. */
export async function notifyUser(
  supabase: SupabaseClient,
  userId: string | null | undefined,
  payload: NotifyPayload
): Promise<void> {
  if (!userId || !UUID_RE.test(userId) || !payload.title?.trim()) return;
  try {
    const { error } = await supabase.from('user_notifications').insert([rowFromPayload(userId, payload)]);
    if (error) console.error('[Notify] insert failed:', error.message);
    else await pushForNotification(supabase, { userIds: [userId] }, payload);
  } catch (err: any) {
    console.error('[Notify] insert error:', err?.message || err);
  }
}

/** Fan-out to every app user except the actor (and orphaned invite rows). */
export async function notifyAllUsers(
  supabase: SupabaseClient,
  payload: NotifyPayload,
  exceptUserId?: string | null,
  opts: { push?: boolean } = {}
): Promise<void> {
  try {
    const { data: users, error } = await supabase.from('users').select('id, email');
    if (error) {
      console.error('[Notify] list users failed:', error.message);
      return;
    }
    const skip = new Set(
      [exceptUserId].filter((id): id is string => Boolean(id && UUID_RE.test(id)))
    );
    const ids = (users || [])
      .filter((u: any) => {
        if (!u?.id || skip.has(u.id)) return false;
        const email = String(u.email || '').toLowerCase();
        if (email.startsWith('orphaned+') && email.endsWith('@awc-vault.local')) return false;
        return true;
      })
      .map((u: any) => u.id as string);

    const chunk = 400;
    for (let i = 0; i < ids.length; i += chunk) {
      const slice = ids.slice(i, i + chunk).map((id) => rowFromPayload(id, payload));
      const { error: insertErr } = await supabase.from('user_notifications').insert(slice);
      if (insertErr) console.error('[Notify] fan-out insert failed:', insertErr.message);
    }
    if (opts.push !== false) {
      await pushForNotification(supabase, { everyoneExcept: exceptUserId || null }, payload);
    }
  } catch (err: any) {
    console.error('[Notify] fan-out error:', err?.message || err);
  }
}

/**
 * Follow-ups store assigned_to_id on members (or sometimes a users id).
 * Resolve to a users.id so the inbox can receive the row.
 */
export async function resolveAssigneeUserId(
  supabase: SupabaseClient,
  assignedToId: string | null | undefined
): Promise<string | null> {
  if (!assignedToId || !UUID_RE.test(assignedToId)) return null;

  const { data: byUserId } = await supabase.from('users').select('id').eq('id', assignedToId).maybeSingle();
  if (byUserId?.id) return byUserId.id;

  const { data: member } = await supabase
    .from('members')
    .select('id, email')
    .eq('id', assignedToId)
    .maybeSingle();
  if (!member) return null;

  const email = String(member.email || '').trim();
  if (!email) return null;

  const { data: byEmail } = await supabase.from('users').select('id').ilike('email', email).maybeSingle();
  return byEmail?.id || null;
}

export async function notifyFollowUpAssignee(
  supabase: SupabaseClient,
  followUp: { id?: string; assigned_to_id?: string | null; notes?: string | null }
): Promise<void> {
  const userId = await resolveAssigneeUserId(supabase, followUp?.assigned_to_id);
  if (!userId) return;
  const notes = String(followUp.notes || '').replace(/\s+/g, ' ').trim();
  await notifyUser(supabase, userId, {
    type: 'assignment',
    title: 'You have a follow-up assignment',
    body: notes || 'Open Follow-Ups to see the task.',
    link: '/follow-ups',
    sourceId: followUp.id || null,
  });
}

async function inboxUserId(supabase: SupabaseClient, req: any): Promise<string | null> {
  const auth = await verifyAuth(req, supabase);
  if (!auth.user) return null;
  // Canonical public.users.id (verifyAuth already ran resolveAppUser).
  return auth.user.id;
}

/**
 * Compatibility empty-inbox only when the notifications table is genuinely missing.
 * Do NOT treat arbitrary query errors (RLS, constraints, timeouts) as empty success.
 */
export function isInboxSchemaMissingError(err: { message?: string; code?: string } | null | undefined): boolean {
  const msg = String(err?.message || '').toLowerCase();
  const code = String(err?.code || '');
  if (code === '42P01' || code === 'PGRST205') return true; // undefined_table / schema cache miss
  if (!msg.includes('user_notifications')) return false;
  return (
    msg.includes('does not exist') ||
    msg.includes('schema cache') ||
    msg.includes('could not find the table') ||
    msg.includes('could not find the relation')
  );
}

export async function handleNotifications(req: any, res: any) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) return res.status(503).json({ ok: false, error: 'Supabase Admin not initialized' });

  const userId = await inboxUserId(supabaseAdmin, req);
  if (!userId) return res.status(401).json({ ok: false, error: 'Unauthorized: valid Bearer token required' });

  try {
    if (req.method === 'GET') {
      const { count: unreadCount, error: countErr } = await supabaseAdmin
        .from('user_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .is('read_at', null);
      if (countErr) throw countErr;

      const { count: communityFeedUnreadCount, error: feedCountErr } = await supabaseAdmin
        .from('user_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .is('read_at', null)
        .in('type', COMMUNITY_FEED_INBOX_TYPES);
      if (feedCountErr) throw feedCountErr;

      const { data, error } = await supabaseAdmin
        .from('user_notifications')
        .select('id, type, title, body, link, source_id, read_at, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;

      return res.status(200).json({
        ok: true,
        notifications: data || [],
        unreadCount: unreadCount || 0,
        communityFeedUnreadCount: communityFeedUnreadCount || 0,
      });
    }

    if (req.method === 'PATCH') {
      const body = req.body || {};
      const now = new Date().toISOString();

      if (body.mark_all_read) {
        const { error } = await supabaseAdmin
          .from('user_notifications')
          .update({ read_at: now })
          .eq('user_id', userId)
          .is('read_at', null);
        if (error) throw error;
        return res.status(200).json({ ok: true });
      }

      const id = String(body.id || '').trim();
      if (!UUID_RE.test(id)) {
        return res.status(400).json({ ok: false, error: 'Notification id is required' });
      }

      const { data, error } = await supabaseAdmin
        .from('user_notifications')
        .update({ read_at: now })
        .eq('id', id)
        .eq('user_id', userId)
        .select('id, read_at')
        .maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ ok: false, error: 'Notification not found' });
      return res.status(200).json({ ok: true, notification: data });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (err: any) {
    if (isInboxSchemaMissingError(err)) {
      return res.status(200).json({
        ok: true,
        notifications: [],
        unreadCount: 0,
        communityFeedUnreadCount: 0,
        warning: 'Inbox is not ready yet — run create_user_notifications.sql.',
      });
    }
    console.error('[Notifications] Error:', err?.message || err, err?.code || '');
    return res.status(500).json({ ok: false, error: 'Unable to load notifications' });
  }
}
