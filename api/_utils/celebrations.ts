/**
 * Automatic birthday & wedding-anniversary greetings from the Pastor.
 *
 * Every morning at 7 AM (church time) the daily cron calls runCelebrationGreetings():
 *   - Adults with PLCC Connect → inbox notice + phone alert ("celebration"); Connect opens
 *     it as a birthday card with the church header and seal.
 *   - Anyone with an email (Connect or not) also gets the same card by email, with the seal,
 *     while "Email the card" is on (emailFallback).
 *   - Kids (child/dependent in a household) → their linked parents get the greeting.
 * Each person is greeted at most once per occasion per year (celebration_greetings).
 * Only Active members. Birthdays saved without a year (1904-MM-DD) work the same.
 * Feb 29 celebrates on Feb 28 in non-leap years.
 *
 * Staff (Pastor / Super Admin) see today's & this week's list on Vault Home,
 * can edit the wording, turn greetings on/off, send a test, or send today's now.
 *
 *   GET  resource=celebrations                    → { settings, today, upcoming, setupNeeded }
 *   POST resource=celebrations&action=settings    { settings }
 *   POST resource=celebrations&action=test        → preview to your own inbox/phone
 *   POST resource=celebrations&action=send-now    → send today's greetings now (never twice)
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { vaultFrom } from './emailFrom.js';

export const CELEBRATION_ROLES = new Set(['SUPER_ADMIN', 'PASTOR']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const KID_ROLES = new Set(['child', 'dependent']);
const MAX_TEXT = 500;

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export type CelebrationSettings = {
  enabled: boolean;
  emailFallback: boolean;
  signature: string;
  birthdayMessage: string;
  anniversaryMessage: string;
  kidBirthdayMessage: string;
  /** Personal paragraph under the birthday message. */
  birthdayNote: string;
  kidBirthdayNote: string;
  /** Add a birthday Bible verse (KJV), different for each person and year. */
  includeVerse: boolean;
};

export const DEFAULT_CELEBRATION_SETTINGS: CelebrationSettings = {
  enabled: true,
  emailFallback: true,
  signature: 'Pastor Grace & Kennedy Hiire',
  birthdayMessage: '{signature} and the entire PLCC Family would like to wish you a Happy and Blessed Birthday.',
  anniversaryMessage:
    'Happy anniversary, {name}! 💍 We thank God for your marriage and pray He keeps you close to Him and to each other. — {signature}',
  kidBirthdayMessage: '{signature} and the entire PLCC Family would like to wish {child} a Happy and Blessed Birthday.',
  birthdayNote:
    'You are a treasured part of our church family. Thank you for the faith, love and joy you bring to PLCC — we are better because you are here, and we are praying for you today.',
  kidBirthdayNote:
    '{child} is a precious gift from God to our church family. We love watching {child} grow, and we are praying that this new year is full of joy, good friends and God’s favor.',
  includeVerse: true,
};

const clip = (v: unknown, max: number, fallback: string) => {
  const s = String(v ?? '').replace(/\r\n/g, '\n').trim();
  return s ? s.slice(0, max) : fallback;
};

export function cleanCelebrationSettings(raw: unknown): CelebrationSettings {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_CELEBRATION_SETTINGS;
  return {
    enabled: typeof o.enabled === 'boolean' ? o.enabled : d.enabled,
    emailFallback: typeof o.emailFallback === 'boolean' ? o.emailFallback : d.emailFallback,
    signature: clip(o.signature, 60, d.signature),
    birthdayMessage: clip(o.birthdayMessage, MAX_TEXT, d.birthdayMessage),
    anniversaryMessage: clip(o.anniversaryMessage, MAX_TEXT, d.anniversaryMessage),
    kidBirthdayMessage: clip(o.kidBirthdayMessage, MAX_TEXT, d.kidBirthdayMessage),
    birthdayNote: typeof o.birthdayNote === 'string' ? String(o.birthdayNote).trim().slice(0, MAX_TEXT) : d.birthdayNote,
    kidBirthdayNote: typeof o.kidBirthdayNote === 'string' ? String(o.kidBirthdayNote).trim().slice(0, MAX_TEXT) : d.kidBirthdayNote,
    includeVerse: typeof o.includeVerse === 'boolean' ? o.includeVerse : d.includeVerse,
  };
}

// ---------------------------------------------------------------------------
// Making it personal: a note, years with PLCC, and a birthday verse (KJV)
// ---------------------------------------------------------------------------

export const BIRTHDAY_VERSES: { text: string; ref: string }[] = [
  { text: 'The LORD bless thee, and keep thee: the LORD make his face shine upon thee, and be gracious unto thee.', ref: 'Numbers 6:24–25' },
  { text: 'For I know the thoughts that I think toward you, saith the LORD, thoughts of peace, and not of evil, to give you an expected end.', ref: 'Jeremiah 29:11' },
  { text: 'This is the day which the LORD hath made; we will rejoice and be glad in it.', ref: 'Psalm 118:24' },
  { text: 'I will praise thee; for I am fearfully and wonderfully made: marvellous are thy works.', ref: 'Psalm 139:14' },
  { text: 'Grant thee according to thine own heart, and fulfil all thy counsel.', ref: 'Psalm 20:4' },
  { text: 'I thank my God upon every remembrance of you.', ref: 'Philippians 1:3' },
  { text: 'Beloved, I wish above all things that thou mayest prosper and be in health, even as thy soul prospereth.', ref: '3 John 1:2' },
  { text: 'His compassions fail not. They are new every morning: great is thy faithfulness.', ref: 'Lamentations 3:22–23' },
  { text: 'Thou crownest the year with thy goodness.', ref: 'Psalm 65:11' },
  { text: 'The LORD shall preserve thy going out and thy coming in from this time forth, and even for evermore.', ref: 'Psalm 121:8' },
];

export const KID_VERSES: { text: string; ref: string }[] = [
  { text: 'And Jesus increased in wisdom and stature, and in favour with God and man.', ref: 'Luke 2:52' },
  { text: 'I will praise thee; for I am fearfully and wonderfully made.', ref: 'Psalm 139:14' },
  { text: 'Suffer little children, and forbid them not, to come unto me: for of such is the kingdom of heaven.', ref: 'Matthew 19:14' },
  { text: 'Lo, children are an heritage of the LORD.', ref: 'Psalm 127:3' },
  { text: 'The LORD bless thee, and keep thee.', ref: 'Numbers 6:24' },
];

/** Same person gets a different verse each year; same day always gives the same one. */
export function pickVerse(memberId: string, year: number, kid: boolean): { text: string; ref: string } {
  const list = kid ? KID_VERSES : BIRTHDAY_VERSES;
  let h = year;
  for (const ch of memberId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return list[h % list.length];
}

/** Whole years since they joined PLCC (joined_on), or 0. */
export function yearsWithAwc(joinedOn: unknown, today: { year: number; month: number; day: number }): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(joinedOn || ''));
  if (!m) return 0;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1900) return 0;
  let years = today.year - y;
  if (today.month < mo || (today.month === mo && today.day < d)) years -= 1;
  return Math.max(0, years);
}

/** Message + personal note (+ years with PLCC) + verse, as paragraphs. */
export function birthdayBody(
  settings: CelebrationSettings,
  opts: { name?: string; child?: string; memberId: string; year: number; joinedYears?: number }
): string {
  const kid = Boolean(opts.child);
  const vars = { name: opts.name, child: opts.child, signature: settings.signature };
  const parts = [fillTemplate(kid ? settings.kidBirthdayMessage : settings.birthdayMessage, vars)];
  let note = fillTemplate(kid ? settings.kidBirthdayNote : settings.birthdayNote, vars);
  const y = opts.joinedYears || 0;
  if (!kid && y >= 1) {
    note = `${note}${note ? ' ' : ''}Thank you for ${y === 1 ? 'your first year' : `${y} years`} of worshipping with us.`;
  }
  if (note) parts.push(note);
  if (settings.includeVerse) {
    const v = pickVerse(opts.memberId, opts.year, kid);
    parts.push(`“${v.text}” — ${v.ref}`);
  }
  return parts.join('\n\n');
}

export function fillTemplate(template: string, vars: { name?: string; child?: string; signature: string }): string {
  return template
    .replace(/\{name\}/gi, vars.name || 'friend')
    .replace(/\{child\}/gi, vars.child || 'your child')
    .replace(/\{signature\}/gi, vars.signature)
    .trim();
}

// ---------------------------------------------------------------------------
// Dates (church time)
// ---------------------------------------------------------------------------

/** Today in Africa/Kampala as { year, month, day, iso }. */
export function churchDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Kampala',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value || 0);
  const year = get('year');
  const month = get('month');
  const day = get('day');
  return { year, month, day, hour: get('hour'), iso: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` };
}

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** Month/day of a saved date ("1904-04-28", "1985-04-28T00:00:00Z"), or null. */
export function monthDayOf(value: unknown): { month: number; day: number } | null {
  const m = String(value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { month, day };
}

/** Days from `today` until the next occurrence of month/day (0 = today). Feb 29 → Feb 28. */
export function daysUntil(md: { month: number; day: number }, today: { year: number; month: number; day: number }): number {
  const base = Date.UTC(today.year, today.month - 1, today.day);
  for (const y of [today.year, today.year + 1]) {
    const day = md.month === 2 && md.day === 29 && !isLeap(y) ? 28 : md.day;
    const t = Date.UTC(y, md.month - 1, day);
    if (t >= base) return Math.round((t - base) / 86_400_000);
  }
  return 366;
}

// ---------------------------------------------------------------------------
// Planning (pure)
// ---------------------------------------------------------------------------

export type CelebrationMember = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  preferred_name?: string | null;
  email?: string | null;
  status?: string | null;
  birthday?: string | null;
  anniversary?: string | null;
  anniversary_kind?: string | null;
  joined_on?: string | null;
};

export type CelebrationWorld = {
  members: CelebrationMember[];
  /** member_id → verified Connect user ids */
  userIdsByMember: Map<string, string[]>;
  /** child member_id → parent user ids (guardians + household adults with Connect) */
  parentUserIdsByChild: Map<string, string[]>;
  /** child member_id → parent member ids (household adults), for email fallback */
  parentMemberIdsByChild: Map<string, string[]>;
  kidMemberIds: Set<string>;
};

export type Occasion = 'birthday' | 'anniversary';
export type Delivery =
  | { kind: 'app'; userIds: string[]; emails?: string[] }
  | { kind: 'email'; emails: string[] }
  | { kind: 'none' };

export type PlannedGreeting = {
  memberId: string;
  name: string;
  fullName: string;
  occasion: Occasion;
  isKid: boolean;
  daysAway: number;
  title: string;
  body: string;
  delivery: Delivery;
};

export function isActiveMember(m: CelebrationMember): boolean {
  return String(m.status ?? 'active').trim().toLowerCase() === 'active';
}

export function greetName(m: CelebrationMember): string {
  return String(m.preferred_name || '').trim() || String(m.first_name || '').trim() || String(m.last_name || '').trim() || 'friend';
}

function fullName(m: CelebrationMember): string {
  const pref = String(m.preferred_name || '').trim();
  const real = [m.first_name, m.last_name].map((s) => String(s || '').trim()).filter(Boolean).join(' ');
  return pref || real || 'PLCC member';
}

const validEmail = (e: unknown) => {
  const s = String(e || '').trim().toLowerCase();
  return EMAIL_RE.test(s) ? s : null;
};

/** Wedding anniversaries only; an anniversary saved before types existed counts too. */
export function greetsAnniversary(kind: unknown): boolean {
  const k = String(kind ?? '').trim().toLowerCase();
  return k === '' || k === 'wedding';
}

/**
 * Everyone celebrating in the next `windowDays` days (0 = today only), with the
 * message and how it would reach them.
 */
export function planCelebrations(
  world: CelebrationWorld,
  settings: CelebrationSettings,
  today: { year: number; month: number; day: number },
  windowDays = 0
): PlannedGreeting[] {
  const out: PlannedGreeting[] = [];
  const membersById = new Map(world.members.map((m) => [m.id, m]));

  for (const m of world.members) {
    if (!UUID_RE.test(m.id) || !isActiveMember(m)) continue;
    const isKid = world.kidMemberIds.has(m.id);
    const name = greetName(m);

    const occasions: Occasion[] = [];
    const bday = monthDayOf(m.birthday);
    if (bday && daysUntil(bday, today) <= windowDays) occasions.push('birthday');
    const ann = monthDayOf(m.anniversary);
    if (!isKid && ann && greetsAnniversary(m.anniversary_kind) && daysUntil(ann, today) <= windowDays) occasions.push('anniversary');

    for (const occasion of occasions) {
      const md = occasion === 'birthday' ? bday! : ann!;
      let delivery: Delivery = { kind: 'none' };
      let title: string;
      let body: string;

      if (isKid) {
        title = `Happy birthday to ${name}! 🎂`;
        body = birthdayBody(settings, { child: name, memberId: m.id, year: today.year });
        const parents = [...new Set(world.parentUserIdsByChild.get(m.id) || [])].filter((id) => UUID_RE.test(id));
        const emails = settings.emailFallback
          ? [...new Set((world.parentMemberIdsByChild.get(m.id) || [])
            .map((pid) => membersById.get(pid))
            .filter((p): p is CelebrationMember => Boolean(p && isActiveMember(p)))
            .map((p) => validEmail(p.email))
            .filter((e): e is string => Boolean(e)))]
          : [];
        if (parents.length) delivery = emails.length ? { kind: 'app', userIds: parents, emails } : { kind: 'app', userIds: parents };
        else if (emails.length) delivery = { kind: 'email', emails };
      } else {
        const wedding = String(m.anniversary_kind || '').toLowerCase() === 'wedding';
        title = occasion === 'birthday' ? `Happy birthday, ${name}! 🎂` : `Happy ${wedding ? 'wedding ' : ''}anniversary, ${name}! 💍`;
        body =
          occasion === 'birthday'
            ? birthdayBody(settings, { name, memberId: m.id, year: today.year, joinedYears: yearsWithAwc(m.joined_on, today) })
            : fillTemplate(settings.anniversaryMessage, { name, signature: settings.signature });
        const users = [...new Set(world.userIdsByMember.get(m.id) || [])].filter((id) => UUID_RE.test(id));
        const email = settings.emailFallback ? validEmail(m.email) : null;
        if (users.length) delivery = email ? { kind: 'app', userIds: users, emails: [email] } : { kind: 'app', userIds: users };
        else if (email) delivery = { kind: 'email', emails: [email] };
      }

      out.push({ memberId: m.id, name, fullName: fullName(m), occasion, isKid, daysAway: daysUntil(md, today), title, body, delivery });
    }
  }

  return out.sort((a, b) => a.daysAway - b.daysAway || a.fullName.localeCompare(b.fullName));
}

// ---------------------------------------------------------------------------
// Loading (database)
// ---------------------------------------------------------------------------

async function loadAll<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < 20_000; from += 1000) {
    const { data, error } = await query(from, from + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function loadCelebrationWorld(supabase: SupabaseClient): Promise<CelebrationWorld> {
  const base = 'id, first_name, last_name, preferred_name, email, status, birthday, anniversary';
  let members: CelebrationMember[];
  try {
    members = await loadAll<CelebrationMember>((a, b) =>
      supabase.from('members').select(`${base}, anniversary_kind, joined_on`).order('id').range(a, b)
    );
  } catch {
    // anniversary_kind not added yet (Connect celebrations SQL) — treat every anniversary as unspecified.
    members = await loadAll<CelebrationMember>((a, b) =>
      supabase.from('members').select(base).order('id').range(a, b)
    );
  }

  const [links, homes, guardians] = await Promise.all([
    loadAll<any>((a, b) => supabase.from('user_member_links').select('user_id, member_id').eq('status', 'verified').range(a, b)),
    loadAll<any>((a, b) => supabase.from('household_members').select('household_id, member_id, relationship_type').eq('status', 'active').range(a, b)),
    loadAll<any>((a, b) => supabase.from('guardian_relationships').select('guardian_user_id, child_member_id').eq('status', 'active').range(a, b)).catch(() => []),
  ]);

  const userIdsByMember = new Map<string, string[]>();
  for (const l of links) {
    const mid = String(l.member_id || '');
    const uid = String(l.user_id || '');
    if (!UUID_RE.test(mid) || !UUID_RE.test(uid)) continue;
    userIdsByMember.set(mid, [...(userIdsByMember.get(mid) || []), uid]);
  }

  return buildFamilies(members, userIdsByMember, homes, guardians);
}

/** Exported for tests: works out kids and their parents from household rows. */
export function buildFamilies(
  members: CelebrationMember[],
  userIdsByMember: Map<string, string[]>,
  homes: { household_id: string; member_id: string; relationship_type?: string | null }[],
  guardians: { guardian_user_id: string; child_member_id: string }[]
): CelebrationWorld {
  const kidMemberIds = new Set<string>();
  const adultsByHome = new Map<string, string[]>();
  const kidHomes = new Map<string, string[]>();
  for (const h of homes) {
    const hid = String(h.household_id || '');
    const mid = String(h.member_id || '');
    if (!hid || !UUID_RE.test(mid)) continue;
    if (KID_ROLES.has(String(h.relationship_type || '').toLowerCase())) {
      kidMemberIds.add(mid);
      kidHomes.set(mid, [...(kidHomes.get(mid) || []), hid]);
    } else {
      adultsByHome.set(hid, [...(adultsByHome.get(hid) || []), mid]);
    }
  }

  const parentMemberIdsByChild = new Map<string, string[]>();
  const parentUserIdsByChild = new Map<string, string[]>();
  for (const [kid, hids] of kidHomes) {
    const adults = [...new Set(hids.flatMap((hid) => adultsByHome.get(hid) || []))].filter((id) => id !== kid);
    parentMemberIdsByChild.set(kid, adults);
    parentUserIdsByChild.set(kid, adults.flatMap((a) => userIdsByMember.get(a) || []));
  }
  for (const g of guardians) {
    const kid = String(g.child_member_id || '');
    const uid = String(g.guardian_user_id || '');
    if (!UUID_RE.test(kid) || !UUID_RE.test(uid)) continue;
    kidMemberIds.add(kid);
    parentUserIdsByChild.set(kid, [...(parentUserIdsByChild.get(kid) || []), uid]);
  }

  return { members, userIdsByMember, parentUserIdsByChild, parentMemberIdsByChild, kidMemberIds };
}

export async function loadCelebrationSettings(supabase: SupabaseClient): Promise<{ settings: CelebrationSettings; setupNeeded: boolean }> {
  const { data, error } = await supabase.from('organization_settings').select('celebration_settings').eq('id', 1).maybeSingle();
  if (error) return { settings: DEFAULT_CELEBRATION_SETTINGS, setupNeeded: true };
  return { settings: cleanCelebrationSettings((data as any)?.celebration_settings), setupNeeded: false };
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

const VAULT_ORIGIN = (process.env.VAULT_PUBLIC_ORIGIN || 'https://plcc-vault.vercel.app').replace(/\/+$/, '');
/** The church seal, hosted with the Vault so email apps can load it. */
export const CHURCH_SEAL_URL = `${VAULT_ORIGIN}/images/awc-seal.png`;

/** Body paragraphs for the email; a closing “verse” — Ref line is set apart in gold italics. */
function emailParagraphs(body: string): string {
  return body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p, i) =>
      /^“[\s\S]+” — /.test(p)
        ? `<p style="font-size:16px;line-height:1.6;margin:22px 0 0;padding-top:18px;border-top:1px solid #E7D7C1;color:#8A6D3B;font-style:italic">${escapeHtml(p)}</p>`
        : `<p style="font-size:${i === 0 ? 18 : 16}px;line-height:1.65;margin:${i === 0 ? 0 : '14px 0 0'};white-space:pre-line">${escapeHtml(p)}</p>`
    )
    .join('\n      ');
}

/** Birthday / anniversary card: church header with the seal, then the Pastor's message. */
export function greetingEmailHtml(title: string, body: string): string {
  return `<div style="background:#F4ECE2;padding:24px 12px">
  <div style="font-family:Georgia,'Times New Roman',serif;max-width:520px;margin:0 auto;background:#FFFDF9;border-radius:18px;overflow:hidden;color:#2B1A1F;border:1px solid #E7D7C1">
    <div style="background:#0e1914;padding:26px 24px 22px;text-align:center">
      <img src="${CHURCH_SEAL_URL}" width="92" height="92" alt="Promised Land Christian Center" style="display:block;margin:0 auto 12px;width:92px;height:92px;border-radius:50%" />
      <p style="margin:0;font-size:22px;color:#FFFFFF;letter-spacing:.5px">Promised Land Christian Center</p>
      <p style="margin:6px 0 0;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#E9C979">Where Everybody Is Somebody</p>
    </div>
    <div style="padding:30px 26px 32px;text-align:center">
      <h1 style="font-size:28px;margin:0 0 16px;color:#15281f;font-weight:normal">${escapeHtml(title)}</h1>
      ${emailParagraphs(body)}
    </div>
  </div>
</div>`;
}

async function insertCelebrationNotices(supabase: SupabaseClient, userIds: string[], title: string, body: string) {
  const rows = (type: string) => userIds.map((user_id) => ({ user_id, type, title, body, link: '/', source_id: null }));
  let { error } = await supabase.from('user_notifications').insert(rows('celebration'));
  // Inbox type list not widened yet → fall back to a church announcement.
  if (error && (String(error.code) === '23514' || /type_check/i.test(String(error.message || '')))) {
    ({ error } = await supabase.from('user_notifications').insert(rows('announcement')));
  }
  if (error) throw error;
  try {
    const { pushToUsers, pushConfigured } = await import('./pushAlerts.js');
    if (pushConfigured()) await pushToUsers(supabase, userIds, 'church', { title, body, url: '/notifications?open=celebration', tag: `celebration:${title}` });
  } catch (err: any) {
    console.error('[celebrations] phone alert failed:', err?.message || err);
  }
}

async function sendGreetingEmail(emails: string[], title: string, body: string) {
  const { getResend } = await import('./deps.js');
  const resend = await getResend();
  if (!resend) throw new Error('email not configured');
  for (const to of emails) {
    const { error } = await resend.emails.send({
      from: vaultFrom('Promised Land Christian Center'),
      to,
      subject: title.replace(/[^\p{L}\p{N}\s,!'’.-]/gu, '').trim() || 'A blessing from PLCC',
      html: greetingEmailHtml(title, body),
      text: body,
      // A fresh id on every card stops Gmail from grouping it with an earlier one and
      // hiding the repeated header and message behind "•••".
      headers: { 'X-Entity-Ref-ID': `awc-celebration-${Date.now()}-${Math.random().toString(36).slice(2, 10)}` },
    } as any);
    if (error) throw new Error(String((error as any).message || error));
  }
}

export type SendResult = { planned: number; sent: number; skipped: number; failed: number; skippedReason?: string };

/** Sends today's greetings. Safe to call many times a day: each one goes out once per year. */
export async function sendTodaysGreetings(
  supabase: SupabaseClient,
  opts: { now?: Date; force?: boolean } = {}
): Promise<SendResult> {
  const today = churchDate(opts.now);
  const { settings, setupNeeded } = await loadCelebrationSettings(supabase);
  if (setupNeeded) return { planned: 0, sent: 0, skipped: 0, failed: 0, skippedReason: 'run celebration_greetings.sql' };
  if (!settings.enabled && !opts.force) return { planned: 0, sent: 0, skipped: 0, failed: 0, skippedReason: 'greetings are off' };

  const plan = planCelebrations(await loadCelebrationWorld(supabase), settings, today, 0);
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const g of plan) {
    if (g.delivery.kind === 'none') {
      skipped++;
      continue;
    }
    // Claim it first so two runs can never both send.
    const { error: claimErr } = await supabase.from('celebration_greetings').insert({
      member_id: g.memberId,
      occasion: g.occasion,
      greet_year: today.year,
      channel: g.delivery.kind,
      recipients: g.delivery.kind === 'app' ? g.delivery.userIds.length : g.delivery.emails.length,
    });
    if (claimErr) {
      if (String(claimErr.code) === '23505') skipped++;
      else failed++;
      continue;
    }
    try {
      if (g.delivery.kind === 'app') {
        await insertCelebrationNotices(supabase, g.delivery.userIds, g.title, g.body);
        // Same card by email too; the Connect greeting already went, so an email problem is only logged.
        if (g.delivery.emails?.length) {
          await sendGreetingEmail(g.delivery.emails, g.title, g.body).catch((err: any) =>
            console.error('[celebrations] card email failed:', err?.message || err)
          );
        }
      } else await sendGreetingEmail(g.delivery.emails, g.title, g.body);
      sent++;
    } catch (err: any) {
      failed++;
      console.error('[celebrations] send failed:', err?.message || err);
      // Let a later run (or "Send now") try again.
      await supabase.from('celebration_greetings').delete()
        .eq('member_id', g.memberId).eq('occasion', g.occasion).eq('greet_year', today.year);
    }
  }
  return { planned: plan.length, sent, skipped, failed };
}

/** Daily cron entry point: only at 7 AM church time. */
export async function runCelebrationGreetings(supabase: SupabaseClient | null, now = new Date()): Promise<SendResult> {
  if (!supabase) return { planned: 0, sent: 0, skipped: 0, failed: 0, skippedReason: 'no database' };
  const { hour } = churchDate(now);
  if (hour !== 7) return { planned: 0, sent: 0, skipped: 0, failed: 0, skippedReason: `church hour is ${hour}` };
  return sendTodaysGreetings(supabase, { now });
}

// ---------------------------------------------------------------------------
// Staff API
// ---------------------------------------------------------------------------

type StaffRow = {
  memberId: string;
  name: string;
  occasion: Occasion;
  isKid: boolean;
  daysAway: number;
  reach: 'app' | 'email' | 'none';
  greeted: 'app' | 'email' | null;
};

export function staffRows(plan: PlannedGreeting[], greeted: Map<string, 'app' | 'email'>): StaffRow[] {
  return plan.map((g) => ({
    memberId: g.memberId,
    name: g.fullName,
    occasion: g.occasion,
    isKid: g.isKid,
    daysAway: g.daysAway,
    reach: g.delivery.kind,
    greeted: g.daysAway === 0 ? greeted.get(`${g.memberId}:${g.occasion}`) || null : null,
  }));
}

export async function handleCelebrations(req: any, res: any) {
  const { getSupabaseAdmin, requireAuth } = await import('./auth.js');
  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(503).json({ ok: false, error: 'Celebrations are not available right now.' });
  const auth = await requireAuth(req, res, supabase);
  if (!auth?.user) return;
  if (!CELEBRATION_ROLES.has(String(auth.role || '').toUpperCase())) {
    return res.status(403).json({ ok: false, error: 'Only the Pastor and Super Admins can manage celebrations.' });
  }
  const action = String((Array.isArray(req.query?.action) ? req.query.action[0] : req.query?.action) || '').toLowerCase();

  try {
    if (req.method === 'GET') {
      const today = churchDate();
      const { settings, setupNeeded } = await loadCelebrationSettings(supabase);
      const plan = planCelebrations(await loadCelebrationWorld(supabase), settings, today, 7);
      const greeted = new Map<string, 'app' | 'email'>();
      if (!setupNeeded) {
        const { data } = await supabase.from('celebration_greetings').select('member_id, occasion, channel').eq('greet_year', today.year);
        for (const r of (data || []) as any[]) greeted.set(`${r.member_id}:${r.occasion}`, r.channel === 'email' ? 'email' : 'app');
      }
      const rows = staffRows(plan, greeted);
      return res.status(200).json({
        ok: true,
        setupNeeded,
        settings,
        today: rows.filter((r) => r.daysAway === 0),
        upcoming: rows.filter((r) => r.daysAway > 0),
      });
    }

    if (req.method === 'POST' && action === 'settings') {
      const settings = cleanCelebrationSettings(req.body?.settings ?? req.body);
      const { data: row } = await supabase.from('organization_settings').select('id').eq('id', 1).maybeSingle();
      const write = row
        ? supabase.from('organization_settings').update({ celebration_settings: settings, updated_at: new Date().toISOString() }).eq('id', 1)
        : supabase.from('organization_settings').upsert({ id: 1, celebration_settings: settings, updated_at: new Date().toISOString() });
      const { error } = await write;
      if (error) {
        if (/celebration_settings/i.test(String(error.message || ''))) {
          return res.status(409).json({ ok: false, error: 'Run celebration_greetings.sql in Supabase first.' });
        }
        throw error;
      }
      return res.status(200).json({ ok: true, settings });
    }

    if (req.method === 'POST' && action === 'test') {
      const { settings } = await loadCelebrationSettings(supabase);
      const kind = String(req.body?.occasion || 'birthday');
      // Greet the tester by their church record's name, like a real greeting (not "Brother").
      const { data: link } = await supabase
        .from('user_member_links')
        .select('member:members(first_name, last_name, preferred_name)')
        .eq('user_id', String(auth.user.id))
        .eq('status', 'verified')
        .limit(1)
        .maybeSingle();
      const me = (link as any)?.member as CelebrationMember | undefined;
      const fromAccount = String(auth.user.name || '')
        .replace(/^(brother|bro\.?|sister|sis\.?|pastor|elder|deacon|minister|rev\.?|dr\.?)\s+/i, '')
        .trim()
        .split(/\s+/)[0];
      const name = me ? greetName({ id: '', ...me }) : fromAccount || 'friend';
      const body =
        kind === 'anniversary'
          ? fillTemplate(settings.anniversaryMessage, { name, signature: settings.signature })
          : kind === 'kid'
            ? birthdayBody(settings, { child: 'Joshua', memberId: String(auth.user.id), year: churchDate().year })
            : birthdayBody(settings, { name, memberId: String(auth.user.id), year: churchDate().year });
      const title = kind === 'anniversary' ? `Happy anniversary, ${name}! 💍` : kind === 'kid' ? 'Happy birthday to Joshua! 🎂' : `Happy birthday, ${name}! 🎂`;
      await insertCelebrationNotices(supabase, [String(auth.user.id)], `(Test) ${title}`, body);
      // Also email the card to the person testing, so they can see it with the seal.
      let emailed: string | null = null;
      let emailError: string | null = null;
      const myEmail = validEmail(auth.user.email);
      if (!settings.emailFallback) emailError = 'emailing the card is turned off';
      else if (!myEmail) emailError = 'your account has no email address';
      else {
        try {
          await sendGreetingEmail([myEmail], title, body);
          emailed = myEmail;
        } catch (err: any) {
          emailError = String(err?.message || err || 'email failed').slice(0, 160);
          console.error('[celebrations] test email failed:', emailError);
        }
      }
      const { count: phones } = await supabase
        .from('push_subscriptions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', String(auth.user.id));
      return res.status(200).json({ ok: true, emailed, emailError, phoneAlerts: (phones || 0) > 0 });
    }

    if (req.method === 'POST' && action === 'send-now') {
      return res.status(200).json({ ok: true, ...(await sendTodaysGreetings(supabase, { force: false })) });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (err: any) {
    console.error('[celebrations]', err?.message || err);
    return res.status(500).json({ ok: false, error: 'Celebrations could not be loaded. Please try again.' });
  }
}
