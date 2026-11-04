/**
 * Prayer Wall rules (Vault API, used by the Vault and PLCC Connect).
 *
 * - Prayer team (prayer.manage roles) sees everything, approves, hides and deletes.
 * - Signed-in members: their public prayers go straight on the wall (Published);
 *   private ones go to the Pastor (Confidential). Name and user come from the sign-in.
 * - Visitors (not signed in): public prayers wait for a leader (Vetting).
 * - Members only ever see Published, non-confidential prayers, plus their own.
 *
 * Who it is shared with (share_with):
 * - 'wall'         → Prayer Wall + Intercessors (default)
 * - 'intercessors' → Intercessors only (private; never on the wall; Pastor sees it too)
 * - 'pastor'       → Pastor only
 */

export const PRAYER_TEAM_ROLES = new Set([
    'SUPER_ADMIN',
    'ADMIN',
    'PASTOR',
    'FIRST_LADY',
    'SECRETARY',
    'STAFF',
    'MINISTRY_LEADER',
]);

export const PRAYER_CATEGORIES = ['Healing', 'Guidance', 'Praise', 'Family', 'Financial', 'Other'] as const;

export const PRAYER_CONTENT_MAX = 2000;
export const PRAYER_NAME_MAX = 80;

export function isPrayerTeam(role: string | null | undefined): boolean {
    return PRAYER_TEAM_ROLES.has(String(role || '').toUpperCase());
}

function cleanText(value: unknown, max: number): string {
    return String(value ?? '')
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
        .trim()
        .slice(0, max);
}

function pickCategory(value: unknown): string {
    const v = String(value ?? '').trim();
    return (PRAYER_CATEGORIES as readonly string[]).includes(v) ? v : 'Other';
}

function truthy(value: unknown): boolean {
    return value === true || value === 'true' || value === 1 || value === '1';
}

export type PrayerInsertResult =
    | { ok: true; row: Record<string, unknown> }
    | { ok: false; error: string };

/** Private if the sender asked for it (confidential flag or status Confidential). */
function wantsPrivate(body: Record<string, unknown>): boolean {
    return truthy(body.is_confidential) || truthy(body.confidential) || String(body.status || '') === 'Confidential';
}

export type PrayerShareWith = 'wall' | 'intercessors' | 'pastor';

/** Who the sender wants to share with. Old clients send only is_confidential (true = Pastor only). */
export function pickShareWith(body: Record<string, unknown> | null | undefined): PrayerShareWith {
    const b = body || {};
    const v = String(b.share_with ?? b.shareWith ?? '').trim().toLowerCase();
    if (v === 'wall' || v === 'intercessors' || v === 'pastor') return v;
    return wantsPrivate(b) ? 'pastor' : 'wall';
}

/** Status / confidential flags for a choice. Wall prayers from visitors still wait for review. */
function sharingFields(share: PrayerShareWith, wallStatus: 'Published' | 'Vetting') {
    return share === 'wall'
        ? { status: wallStatus, is_confidential: false, share_with: 'wall' }
        : { status: 'Confidential', is_confidential: true, share_with: share };
}

/** A signed-in member (not prayer team) posting a prayer. */
export function buildMemberPrayerInsert(
    body: Record<string, unknown> | null | undefined,
    user: { id: string; displayName: string }
): PrayerInsertResult {
    const b = body || {};
    const content = cleanText(b.content ?? b.request, PRAYER_CONTENT_MAX);
    if (!content) return { ok: false, error: 'Please write your prayer request.' };
    const share = pickShareWith(b);
    const anonymous = truthy(b.is_anonymous) || truthy(b.anonymous);
    const name = cleanText(user.displayName, PRAYER_NAME_MAX) || 'Member';
    return {
        ok: true,
        row: {
            user_id: user.id,
            member_name: anonymous ? 'Anonymous' : name,
            is_anonymous: anonymous,
            category: pickCategory(b.category),
            content,
            ...sharingFields(share, 'Published'),
        },
    };
}

/** A visitor (not signed in) sending a prayer from Connect. */
export function buildVisitorPrayerInsert(body: Record<string, unknown> | null | undefined): PrayerInsertResult {
    const b = body || {};
    // Bots fill every field; people never see this one.
    if (cleanText(b.website, 200)) return { ok: false, error: 'Could not send this request.' };
    const content = cleanText(b.content ?? b.request, PRAYER_CONTENT_MAX);
    if (!content) return { ok: false, error: 'Please write your prayer request.' };
    const name = cleanText(b.member_name ?? b.name, PRAYER_NAME_MAX);
    if (!name) return { ok: false, error: 'Please add your name.' };
    const share = pickShareWith(b);
    return {
        ok: true,
        row: {
            member_name: name,
            is_anonymous: false,
            category: pickCategory(b.category),
            content,
            ...sharingFields(share, 'Vetting'),
        },
    };
}

/** What a viewer may see. Prayer team: everything. Others: the public wall plus their own. */
export function filterPrayersForViewer<T extends Record<string, unknown>>(
    rows: T[],
    role: string | null | undefined,
    userId: string | null | undefined
): T[] {
    if (isPrayerTeam(role)) return rows;
    return rows.filter((r) => {
        if (userId && String(r.user_id || '') === String(userId)) return true;
        return String(r.status || '') === 'Published' && r.is_confidential !== true;
    });
}

/** Approve / hide / move a prayer: prayer team only. */
export function canChangePrayerStatus(role: string | null | undefined): boolean {
    return isPrayerTeam(role);
}

/** Delete: prayer team, or the person who posted it. */
export function canDeletePrayer(
    role: string | null | undefined,
    userId: string | null | undefined,
    row: { user_id?: unknown } | null | undefined
): boolean {
    if (isPrayerTeam(role)) return true;
    return !!userId && !!row && String(row.user_id || '') === String(userId);
}

// —— Intercessors —————————————————————————————————————————————————————————

/** The Intercessors' chat room: a channel whose name mentions "intercess" (never a DM). Oldest wins. */
export function pickIntercessorsRoom<T extends { id?: unknown; name?: unknown; visibility?: unknown }>(rooms: T[] | null | undefined): T | null {
    const list = (rooms || []).filter(
        (r) => /intercess/i.test(String(r?.name || '')) && String(r?.visibility || '') !== 'dm'
    );
    return list[0] || null;
}

/** Intercessors-only requests: private, never on the wall. */
export function isIntercessorsOnly(row: Record<string, unknown>): boolean {
    return String(row.share_with || '') === 'intercessors';
}

/** Requests the Intercessors pray over: wall + waiting for review + Intercessors-only; never Pastor-only. */
export function isIntercessorPrayer(row: Record<string, unknown>): boolean {
    if (isIntercessorsOnly(row)) return String(row.status || '') !== 'Archived';
    if (row.is_confidential === true) return false;
    const status = String(row.status || '');
    return status === 'Published' || status === 'Vetting';
}

/** Parse a from/to window; defaults to the last 14 days, max 120 days. */
export function parsePrayerListWindow(
    fromRaw: unknown,
    toRaw: unknown,
    now: Date = new Date()
): { from: Date; to: Date } {
    const day = 24 * 60 * 60 * 1000;
    const to = toRaw ? new Date(String(toRaw)) : now;
    const safeTo = Number.isNaN(to.getTime()) ? now : to;
    const from = fromRaw ? new Date(String(fromRaw)) : new Date(safeTo.getTime() - 14 * day);
    let safeFrom = Number.isNaN(from.getTime()) ? new Date(safeTo.getTime() - 14 * day) : from;
    if (safeFrom > safeTo) safeFrom = new Date(safeTo.getTime() - day);
    if (safeTo.getTime() - safeFrom.getTime() > 120 * day) safeFrom = new Date(safeTo.getTime() - 120 * day);
    return { from: safeFrom, to: safeTo };
}

/** What the printed list shows for one request. */
export function toIntercessorListItem(row: Record<string, unknown>) {
    const anonymous = row.is_anonymous === true;
    return {
        id: String(row.id || ''),
        name: anonymous ? 'Anonymous' : String(row.member_name || 'Anonymous').trim() || 'Anonymous',
        category: String(row.category || 'Other'),
        content: String(row.content || ''),
        createdAt: String(row.created_at || ''),
        onWall: String(row.status || '') === 'Published',
        privateToIntercessors: isIntercessorsOnly(row),
        prayedAt: row.intercessor_prayed_at ? String(row.intercessor_prayed_at) : null,
        answeredAt: row.answered_at ? String(row.answered_at) : null,
    };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PrayerMark = { action: 'prayed' | 'answered'; id: string; value: boolean };

/** Prayer Watch marks: "Prayed" (any intercessor) and "Answered" (the head / prayer team). */
export function parsePrayerMark(body: unknown): PrayerMark | null {
    if (!body || typeof body !== 'object') return null;
    const b = body as Record<string, unknown>;
    const action = String(b.action || '');
    if (action !== 'prayed' && action !== 'answered') return null;
    const id = String(b.id || '');
    if (!UUID_RE.test(id)) return null;
    if (typeof b.value !== 'boolean') return null;
    return { action, id, value: b.value };
}

/** Columns a mark writes. */
export function prayerMarkPatch(mark: PrayerMark, userId: string, now: Date = new Date()): Record<string, unknown> {
    const at = mark.value ? now.toISOString() : null;
    const by = mark.value ? userId : null;
    return mark.action === 'prayed'
        ? { intercessor_prayed_at: at, intercessor_prayed_by: by }
        : { answered_at: at, answered_by: by };
}

/** Missing Prayer Watch columns (setup SQL not run yet). */
export function isMissingPrayerWatchColumn(message: unknown): boolean {
    return /(intercessor_prayed_|answered_)(at|by)/i.test(String(message || '')) && /column|schema cache/i.test(String(message || ''));
}

/** Sender name for prayer requests posted into the Intercessors chat. */
export const PRAYER_CHAT_SENDER = 'PLCC Prayer Requests';

/** The chat message the Intercessors see for a new shared request. */
export function buildIntercessorChatMessage(row: Record<string, unknown>): string {
    const item = toIntercessorListItem(row);
    const lines = [`New prayer request from ${item.name}`];
    if (item.category && item.category !== 'Other') lines[0] += ` (${item.category})`;
    lines.push('', item.content);
    if (item.privateToIntercessors) lines.push('', 'Private to the Intercessors. Not on the Prayer Wall. Please keep it in this room.');
    else if (!item.onWall) lines.push('', 'Sent by a visitor. Not on the Prayer Wall yet.');
    return lines.join('\n').slice(0, 4000);
}

/** An Intercessors-only request can never be moved onto the public wall. */
export function canPublishPrayer(row: Record<string, unknown> | null | undefined): boolean {
    return !row || !isIntercessorsOnly(row);
}

/** Prayer team posting from the Vault: honor share_with, keep their other fields. */
export function applyTeamSharing(body: Record<string, unknown>): Record<string, unknown> {
    const raw = String(body.share_with ?? '').trim().toLowerCase();
    if (raw !== 'wall' && raw !== 'intercessors' && raw !== 'pastor') {
        delete body.share_with;
        return body;
    }
    body.share_with = raw;
    if (raw !== 'wall') {
        body.status = 'Confidential';
        body.is_confidential = true;
    } else if (!String(body.status || '').trim()) {
        // The prayer team's own wall requests go straight on the wall (no self-approval step).
        body.status = 'Published';
        body.is_confidential = false;
    }
    return body;
}

/** The share_with column is missing (setup SQL not run yet). */
export function isMissingShareWithColumn(message: unknown): boolean {
    return /share_with/i.test(String(message || '')) && /column|schema cache/i.test(String(message || ''));
}
