/**
 * Light chat reloads (Nov 28, 2026, before the Dec 6 Ka Link launch).
 *
 * Every phone in a room hears every new message. Before this, each phone then
 * reloaded the whole conversation (every message, every photo link re-signed).
 * Now a phone asks only for what changed:
 *   ids=a,b,c   the messages named in live pings (new, edited, reacted, removed…)
 *   after=ISO   messages sent at or after this time (catch-up after a gap)
 *   limit=N     only the latest N messages (first open)
 * With no params the endpoint returns the whole room, exactly as before.
 */
export const CHAT_PAGE_MAX_IDS = 50;
export const CHAT_PAGE_MAX_LIMIT = 200;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ChatMessagesPage =
  | { ok: true; ids: string[] | null; after: string | null; limit: number | null; partial: boolean }
  | { ok: false; error: string };

function one(v: unknown): string {
  if (Array.isArray(v)) return String(v[0] ?? '').trim();
  return v == null ? '' : String(v).trim();
}

/** Pure: read ids / after / limit from the query. */
export function parseChatMessagesPageQuery(query: Record<string, unknown> | null | undefined): ChatMessagesPage {
  const q = query || {};
  let ids: string[] | null = null;
  let after: string | null = null;
  let limit: number | null = null;

  const rawIds = one(q.ids);
  if (rawIds) {
    const list = [...new Set(rawIds.split(',').map((s) => s.trim()).filter(Boolean))];
    if (list.length > CHAT_PAGE_MAX_IDS) return { ok: false, error: `At most ${CHAT_PAGE_MAX_IDS} ids` };
    if (list.some((id) => !UUID_RE.test(id))) return { ok: false, error: 'ids must be message ids' };
    ids = list;
  }

  const rawAfter = one(q.after);
  if (rawAfter) {
    const t = Date.parse(rawAfter);
    if (!Number.isFinite(t)) return { ok: false, error: 'after must be a date' };
    after = new Date(t).toISOString();
  }

  const rawLimit = one(q.limit);
  if (rawLimit) {
    const n = Number(rawLimit);
    if (!Number.isInteger(n) || n < 1 || n > CHAT_PAGE_MAX_LIMIT) {
      return { ok: false, error: `limit must be 1–${CHAT_PAGE_MAX_LIMIT}` };
    }
    limit = n;
  }

  return { ok: true, ids, after, limit, partial: Boolean(ids || after) };
}
