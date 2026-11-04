/**
 * Intercessors: their Community chat room (the channel named like "Intercessor Channel"),
 * who belongs (that room's members), the prayer list, and where new requests are sent.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { listMinistryRosterUserIds } from './communityMembership.js';
import { userCanAccessMinistryScope } from './communityChatSecurity.js';
import { notifyUser } from './notify.js';
import { getResend } from './deps.js';
import {
    buildIntercessorChatMessage,
    isIntercessorPrayer,
    isIntercessorsOnly,
    isPrayerTeam,
    pickIntercessorsRoom,
    PRAYER_CHAT_SENDER,
    toIntercessorListItem,
} from './prayerAccess.js';
import { vaultFrom } from './emailFrom.js';

const VAULT_ORIGIN = (process.env.VAULT_PUBLIC_ORIGIN || 'https://plcc-opal.vercel.app').replace(/\/+$/, '');

function escapeHtml(s: string): string {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export type IntercessorsRoom = { id: string; name: string; ministryId: string | null; visibility: string | null };

/** The Intercessors' chat room: the Community channel whose name mentions "intercess". */
export async function findIntercessorsRoom(supabase: SupabaseClient): Promise<IntercessorsRoom | null> {
    const { data, error } = await supabase
        .from('chat_channels')
        .select('id, name, ministry_id, visibility, created_at')
        .ilike('name', '%intercess%')
        .order('created_at', { ascending: true });
    if (error) {
        console.error('[Intercessors] room lookup failed:', error.message);
        return null;
    }
    const room = pickIntercessorsRoom(data || []);
    return room
        ? {
              id: String(room.id),
              name: String(room.name),
              ministryId: room.ministry_id ? String(room.ministry_id) : null,
              visibility: room.visibility ? String(room.visibility) : null,
          }
        : null;
}

/** Everyone in the room (its member list, plus the ministry roster when the room belongs to a ministry). */
export async function listIntercessorUserIds(supabase: SupabaseClient, room: IntercessorsRoom): Promise<string[]> {
    const ids = new Set<string>();
    const { data } = await supabase.from('chat_room_members').select('user_id').eq('channel_id', room.id);
    for (const r of data || []) if (r.user_id) ids.add(String(r.user_id));
    if (room.ministryId) for (const id of await listMinistryRosterUserIds(supabase, room.ministryId)) ids.add(id);
    return [...ids];
}

/** The room's members and the prayer team may open the prayer list. */
export async function canOpenIntercessorList(
    supabase: SupabaseClient,
    userId: string,
    role: string | null | undefined,
    room: IntercessorsRoom | null
): Promise<boolean> {
    if (isPrayerTeam(role)) return true;
    if (!room) return false;
    const { data } = await supabase
        .from('chat_room_members')
        .select('id')
        .eq('channel_id', room.id)
        .eq('user_id', userId)
        .limit(1);
    if ((data || []).length > 0) return true;
    if (room.ministryId) return userCanAccessMinistryScope(supabase, userId, room.ministryId, role);
    return false;
}

/** The head(s) of the room (its moderators) and the prayer team may mark prayers Answered. */
export async function canLeadIntercessors(
    supabase: SupabaseClient,
    userId: string,
    role: string | null | undefined,
    room: IntercessorsRoom | null
): Promise<boolean> {
    if (isPrayerTeam(role)) return true;
    if (!room) return false;
    const { data } = await supabase
        .from('chat_room_members')
        .select('id')
        .eq('channel_id', room.id)
        .eq('user_id', userId)
        .eq('role', 'moderator')
        .limit(1);
    return (data || []).length > 0;
}

/** First names for "Prayed by …" labels. */
export async function firstNamesFor(supabase: SupabaseClient, ids: string[]): Promise<Record<string, string>> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return {};
    const { data } = await supabase.from('users').select('id, name').in('id', unique);
    const out: Record<string, string> = {};
    for (const u of data || []) {
        const first = String(u.name || '').trim().split(/\s+/)[0];
        if (first) out[String(u.id)] = first;
    }
    return out;
}

type PrayerRow = {
    id?: unknown;
    member_name?: unknown;
    is_anonymous?: unknown;
    content?: unknown;
    status?: unknown;
    is_confidential?: unknown;
    category?: unknown;
    created_at?: unknown;
    share_with?: unknown;
};

/** Post the request into the Intercessors chat as "PLCC Prayer Requests". */
async function postToIntercessorsChat(supabase: SupabaseClient, channelId: string, prayer: PrayerRow): Promise<void> {
    const { error } = await supabase.from('chat_messages').insert({
        channel_id: channelId,
        content: buildIntercessorChatMessage(prayer as Record<string, unknown>),
        user_id: null,
        user_name: PRAYER_CHAT_SENDER,
        parent_id: null,
    });
    if (error) console.error('[Intercessors] chat post failed:', error.message);
}

/** Email the head(s) of the Intercessors: the moderators of their chat room (e.g. Olivia). */
async function emailIntercessorLeaders(supabase: SupabaseClient, channelId: string, prayer: PrayerRow): Promise<void> {
    const { data: mods } = await supabase
        .from('chat_room_members')
        .select('user_id')
        .eq('channel_id', channelId)
        .eq('role', 'moderator');
    const ids = (mods || []).map((m: any) => m.user_id).filter(Boolean);
    if (ids.length === 0) return;
    const { data: users } = await supabase.from('users').select('email').in('id', ids);
    const to = (users || [])
        .map((u: any) => String(u.email || '').trim())
        .filter((e: string) => e.includes('@') && !/@phone\.awcvault\.invalid$/i.test(e));
    if (to.length === 0) return;
    const resend = await getResend();
    if (!resend) {
        console.warn('[Intercessors] email skipped: RESEND_API_KEY not set');
        return;
    }
    const item = toIntercessorListItem(prayer as Record<string, unknown>);
    const listUrl = `${VAULT_ORIGIN}/#/community/prayer-watch`;
    const html = `
      <h2 style="margin:0 0 8px">New prayer request</h2>
      <p style="margin:0 0 4px"><strong>From:</strong> ${escapeHtml(item.name)}${item.category && item.category !== 'Other' ? ` · ${escapeHtml(item.category)}` : ''}</p>
      <blockquote style="margin:12px 0;padding:12px 16px;border-left:4px solid #1d372c;background:#f8f5f2;white-space:pre-wrap">${escapeHtml(item.content)}</blockquote>
      ${item.privateToIntercessors
        ? '<p style="color:#1d372c;font-weight:bold">Private to the Intercessors. Not on the Prayer Wall. Please keep it confidential.</p>'
        : item.onWall ? '' : '<p style="color:#555">Sent by a visitor. Not on the Prayer Wall yet.</p>'}
      <p><a href="${escapeHtml(listUrl)}">Open the Intercessors Prayer Watch in the Vault</a> to pray through every request, join the Live Huddle, and print the list for Tuesday and Friday.</p>
    `;
    const { error } = await resend.emails.send({
        from: vaultFrom('Promised Land Christian Center'),
        to,
        subject: `${item.privateToIntercessors ? 'Private prayer request' : 'Prayer request'} from ${item.name} — PLCC Intercessors`,
        html,
    });
    if (error) console.error('[Intercessors] email failed:', (error as any).message || error);
}

/**
 * A new shared request (wall or waiting for review) reaches the Intercessors:
 * - posted in their chat room ("Intercessor Channel") as "PLCC Prayer Requests",
 * - emailed to the head(s) of the Intercessors (chat moderators),
 * - visitor requests (not on the wall yet) also get an in-app notification to each intercessor
 *   (wall requests already notify the whole church).
 * Pastor-only requests never go here. Never throws.
 */
export async function sendPrayerToIntercessors(
    supabase: SupabaseClient,
    prayer: PrayerRow,
    exceptUserId?: string | null
): Promise<void> {
    try {
        if (!isIntercessorPrayer(prayer as Record<string, unknown>)) return;
        const room = await findIntercessorsRoom(supabase);
        if (!room) return;
        await postToIntercessorsChat(supabase, room.id, prayer);
        await emailIntercessorLeaders(supabase, room.id, prayer);
        // Wall prayers already notify the whole church; visitor and Intercessors-only ones notify the room.
        if (String(prayer.status || '') !== 'Vetting' && !isIntercessorsOnly(prayer as Record<string, unknown>)) return;
        const roster = await listIntercessorUserIds(supabase, room);
        const item = toIntercessorListItem(prayer as Record<string, unknown>);
        const snippet = item.content.replace(/\s+/g, ' ').trim();
        for (const uid of roster) {
            if (exceptUserId && uid === exceptUserId) continue;
            await notifyUser(supabase, uid, {
                type: 'prayer',
                title: 'New prayer request for the Intercessors',
                body: snippet ? `${item.name}: ${snippet.length > 140 ? `${snippet.slice(0, 139)}…` : snippet}` : `${item.name} sent a prayer request.`,
                link: '/community/prayer-watch',
                sourceId: prayer.id ? String(prayer.id) : null,
            });
        }
    } catch (err: any) {
        console.error('[Intercessors] send failed:', err?.message || err);
    }
}
