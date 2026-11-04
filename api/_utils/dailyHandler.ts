/**
 * Daily devotional for PLCC Connect (resource=daily).
 *
 *   GET  action=week&date=YYYY-MM-DD   → Mon–Sun containing that date (public; no sign-in needed)
 *   GET  action=admin&from=YYYY-MM-DD  → next 14 days, written vs starter (Pastor / Ministry Leader / Super Admin)
 *   POST action=save   { day, title, ref, verseText?, body, question?, prayer?, seriesTitle? }
 *   POST action=delete { day }          → that day goes back to the starter devotional
 *
 * Any day without a church-written devotional uses the built-in starter set
 * (dailyStarter.ts), so Daily is never empty. Morning reminders: sendDailyReminder().
 *
 * Tables: supabase/migrations/daily_devotionals.sql
 */
import { getSupabaseAdmin, requireAuth } from './auth.js';
import { starterFor } from './dailyStarter.js';

const EDIT_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'PASTOR', 'MINISTRY_LEADER']);
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const COLUMNS = 'day, title, verse_ref, verse_text, body, question, prayer, series_title, author_name, updated_at';

export type DevotionalDay = {
  day: string;
  source: 'church' | 'starter';
  title: string;
  ref: string;
  verseText: string | null;
  body: string;
  question: string | null;
  prayer: string | null;
  seriesTitle: string | null;
  authorName: string | null;
};

function q(req: any, key: string): string {
  const v = req.query?.[key];
  return String(Array.isArray(v) ? v[0] : v ?? '').trim();
}

export function validDay(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  if (!DAY_RE.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  if (y < 2020 || y > 2100) return null;
  return s;
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Monday of the week that holds `day`. */
export function mondayOf(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return addDays(day, -((dow + 6) % 7));
}

/** Today's date at the church (Africa/Kampala). */
export function churchToday(now = new Date()): { day: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Kampala',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
  return { day: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) };
}

function fromRow(r: any): DevotionalDay {
  return {
    day: String(r.day).slice(0, 10),
    source: 'church',
    title: String(r.title || ''),
    ref: String(r.verse_ref || ''),
    verseText: r.verse_text ? String(r.verse_text) : null,
    body: String(r.body || ''),
    question: r.question ? String(r.question) : null,
    prayer: r.prayer ? String(r.prayer) : null,
    seriesTitle: r.series_title ? String(r.series_title) : null,
    authorName: r.author_name ? String(r.author_name) : null,
  };
}

function fromStarter(day: string): DevotionalDay {
  const s = starterFor(day);
  return {
    day,
    source: 'starter',
    title: s.title,
    ref: s.ref,
    verseText: null,
    body: s.body,
    question: s.question,
    prayer: s.prayer,
    seriesTitle: null,
    authorName: null,
  };
}

function isMissingTable(err: any): boolean {
  const msg = String(err?.message || '').toLowerCase();
  return err?.code === '42P01' || err?.code === 'PGRST205' || (msg.includes('daily_devotionals') && (msg.includes('does not exist') || msg.includes('schema cache')));
}

/** Days from..from+count-1, church-written where they exist, starter otherwise. */
export async function loadDays(supabase: any, from: string, count: number): Promise<{ days: DevotionalDay[]; setupNeeded: boolean }> {
  const to = addDays(from, count - 1);
  const written = new Map<string, DevotionalDay>();
  let setupNeeded = false;
  if (supabase) {
    const { data, error } = await supabase.from('daily_devotionals').select(COLUMNS).gte('day', from).lte('day', to);
    if (error) {
      if (isMissingTable(error)) setupNeeded = true;
      else console.error('[daily] load failed:', error.message);
    }
    for (const r of data || []) written.set(String(r.day).slice(0, 10), fromRow(r));
  }
  const days: DevotionalDay[] = [];
  for (let i = 0; i < count; i++) {
    const d = addDays(from, i);
    days.push(written.get(d) || fromStarter(d));
  }
  return { days, setupNeeded };
}

function clean(raw: unknown, max: number): string {
  return String(raw ?? '').replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').trim().slice(0, max);
}

export function readDevotionalFields(body: any):
  | { ok: true; row: { day: string; title: string; verse_ref: string; verse_text: string | null; body: string; question: string | null; prayer: string | null; series_title: string | null } }
  | { ok: false; error: string } {
  const day = validDay(body?.day);
  if (!day) return { ok: false, error: 'Choose a date.' };
  const title = clean(body?.title, 120);
  const ref = clean(body?.ref, 80);
  const text = clean(body?.body, 4000);
  if (!title) return { ok: false, error: 'Add a title.' };
  if (!ref) return { ok: false, error: 'Add the Bible verse, like Psalm 23:1-3.' };
  if (text.length < 20) return { ok: false, error: 'Add the reflection (a few sentences).' };
  return {
    ok: true,
    row: {
      day,
      title,
      verse_ref: ref,
      verse_text: clean(body?.verseText, 1200) || null,
      body: text,
      question: clean(body?.question, 400) || null,
      prayer: clean(body?.prayer, 600) || null,
      series_title: clean(body?.seriesTitle, 120) || null,
    },
  };
}

export async function handleDaily(req: any, res: any) {
  const supabase = getSupabaseAdmin();
  const action = q(req, 'action').toLowerCase() || 'week';

  if (req.method === 'GET' && action === 'week') {
    res.setHeader('Cache-Control', 'public, max-age=120, s-maxage=300');
    const day = validDay(q(req, 'date')) || churchToday().day;
    const monday = mondayOf(day);
    const { days } = await loadDays(supabase, monday, 7);
    const seriesTitle = days.find((d) => d.seriesTitle)?.seriesTitle || null;
    return res.status(200).json({ ok: true, today: churchToday().day, monday, seriesTitle, days });
  }

  res.setHeader('Cache-Control', 'private, no-store');
  if (!supabase) return res.status(503).json({ ok: false, error: 'Daily devotionals are not available right now.' });
  const auth = await requireAuth(req, res, supabase);
  if (!auth?.user) return;
  const role = String(auth.role || '').toUpperCase();
  if (!EDIT_ROLES.has(role)) {
    return res.status(403).json({ ok: false, error: 'Only Pastor, Ministry Leader, and Super Admin can edit devotionals.' });
  }

  if (req.method === 'GET' && action === 'admin') {
    const from = validDay(q(req, 'from')) || churchToday().day;
    const { days, setupNeeded } = await loadDays(supabase, from, 14);
    return res.status(200).json({ ok: true, from, setupNeeded, days });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed.' });
  }
  const body = req.body && typeof req.body === 'object' ? req.body : {};

  if (action === 'save') {
    const parsed = readDevotionalFields(body);
    if ('error' in parsed) return res.status(400).json({ ok: false, error: parsed.error });
    const row = {
      ...parsed.row,
      author_id: auth.user.id,
      author_name: String((auth.user as any).name || (auth.user as any).email || '').slice(0, 120) || null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from('daily_devotionals').upsert(row, { onConflict: 'day' }).select(COLUMNS).single();
    if (error) {
      console.error('[daily] save failed:', error.message);
      return res.status(isMissingTable(error) ? 503 : 500).json({
        ok: false,
        error: isMissingTable(error) ? 'Run supabase/migrations/daily_devotionals.sql in Supabase first.' : 'Could not save. Please try again.',
      });
    }
    return res.status(200).json({ ok: true, day: fromRow(data) });
  }

  if (action === 'delete') {
    const day = validDay(body.day);
    if (!day) return res.status(400).json({ ok: false, error: 'Choose a date.' });
    const { error } = await supabase.from('daily_devotionals').delete().eq('day', day);
    if (error) return res.status(500).json({ ok: false, error: 'Could not remove it. Please try again.' });
    return res.status(200).json({ ok: true, day: fromStarter(day) });
  }

  return res.status(404).json({ ok: false, error: 'Unknown request.' });
}

/**
 * 7 AM church time: alert everyone who turned on the morning devotional reminder.
 * Called by the daily cron (twice, 11:00 and 12:00 UTC, so 7 AM works in summer and winter);
 * sends at most once per day.
 */
export async function sendDailyReminder(now = new Date()): Promise<{ sent: number; skipped?: string }> {
  const { day, hour } = churchToday(now);
  if (hour !== 7) return { sent: 0, skipped: `church hour is ${hour}` };
  const supabase = getSupabaseAdmin();
  if (!supabase) return { sent: 0, skipped: 'no database' };
  const { error } = await supabase.from('daily_devotional_reminders').insert({ day });
  if (error) return { sent: 0, skipped: String(error.code) === '23505' ? 'already sent today' : error.message };
  const { days } = await loadDays(supabase, day, 1);
  const today = days[0];
  const { pushToEveryone } = await import('./pushAlerts.js');
  const r = await pushToEveryone(supabase, 'daily', {
    title: `Today’s devotional: ${today.title}`,
    body: `${today.ref} · About 4 minutes. Start the day in the Word.`,
    url: '/daily',
    tag: `daily:${day}`,
  });
  await supabase.from('daily_devotional_reminders').update({ sent: r.sent }).eq('day', day);
  return { sent: r.sent };
}
