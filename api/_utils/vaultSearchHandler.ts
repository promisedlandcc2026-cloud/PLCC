/**
 * Vault-wide search — GET /api/vault?resource=vault-search&q=…
 * Members (only for roles that may see the People roster), events (approved only)
 * and Serve opportunities. Pages are matched in the browser from the menu the
 * person can already see.
 */
import { getSupabaseAdmin, requireAuth } from './auth.js';
import { canViewPeopleRoster } from './peopleRosterLogic.js';
import { normalizeEventStatus } from './eventApprovalLogic.js';

const LIMIT = 8;

/** Words to search for: letters, numbers, @ . - ' only (safe inside PostgREST filters). */
export function searchTerms(q: unknown): string[] {
  return String(q ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}@.\-' ]+/gu, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^[.'-]+|[.'-]+$/g, ''))
    .filter((w) => w.length >= 2)
    .slice(0, 4);
}

/** Every word must appear somewhere in the text. */
export function matchesAll(text: string, terms: string[]): boolean {
  const t = text.toLowerCase();
  return terms.every((w) => t.includes(w));
}

function orFilter(cols: string[], terms: string[]): string {
  return terms.flatMap((w) => cols.map((c) => `${c}.ilike.%${w}%`)).join(',');
}

export async function handleVaultSearch(req: any, res: any) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Use GET' });
  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(503).json({ ok: false, error: 'Not configured' });
  const auth = await requireAuth(req, res, supabase);
  if (!auth) return;

  const terms = searchTerms(req.query?.q);
  if (!terms.length) return res.status(200).json({ ok: true, members: [], events: [], serve: [] });

  const role = String(auth.role || '').toUpperCase();
  const showMembers = canViewPeopleRoster(role);

  const [memRes, evRes, svRes] = await Promise.all([
    showMembers
      ? supabase
          .from('members')
          .select('id, first_name, last_name, email, phone')
          .or(orFilter(['first_name', 'last_name', 'email'], terms))
          .limit(40)
      : Promise.resolve({ data: [] }),
    supabase
      .from('events')
      .select('id, name, date, time, location, status')
      .or(orFilter(['name', 'location'], terms))
      .order('date', { ascending: false })
      .limit(40),
    supabase
      .from('serve_opportunities')
      .select('id, title, role_label, location, starts_at, status')
      .or(orFilter(['title', 'role_label', 'location'], terms))
      .order('starts_at', { ascending: false })
      .limit(40),
  ]);

  const members = ((memRes as any).data || [])
    .map((m: any) => {
      const name = [m.first_name, m.last_name].filter(Boolean).join(' ').trim() || m.email || 'Member';
      return { id: String(m.id), name, sub: m.email || m.phone || null, hay: `${name} ${m.email || ''}` };
    })
    .filter((m: any) => matchesAll(m.hay, terms))
    .slice(0, LIMIT)
    .map(({ hay, ...m }: any) => m);

  const today = new Date().toISOString().slice(0, 10);
  const events = ((evRes as any).data || [])
    .filter((e: any) => normalizeEventStatus(e.status) === 'approved')
    .filter((e: any) => matchesAll(`${e.name || ''} ${e.location || ''}`, terms))
    // Upcoming first, then the most recent past ones.
    .sort((a: any, b: any) => {
      const ua = String(a.date || '') >= today;
      const ub = String(b.date || '') >= today;
      if (ua !== ub) return ua ? -1 : 1;
      return ua ? String(a.date).localeCompare(String(b.date)) : String(b.date).localeCompare(String(a.date));
    })
    .slice(0, LIMIT)
    .map((e: any) => ({ id: String(e.id), title: String(e.name || 'Event'), date: e.date || null, time: e.time || null, location: e.location || null }));

  const serve = ((svRes as any).data || [])
    .filter((o: any) => matchesAll(`${o.title || ''} ${o.role_label || ''} ${o.location || ''}`, terms))
    .slice(0, LIMIT)
    .map((o: any) => ({ id: String(o.id), title: String(o.title || 'Serve'), roleLabel: o.role_label || null, startsAt: o.starts_at || null, status: o.status || 'open' }));

  return res.status(200).json({ ok: true, members, events, serve });
}
