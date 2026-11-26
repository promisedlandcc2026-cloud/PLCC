/**
 * Pastor's Office — website requests and staff alerts.
 *
 *   GET  resource=pastors-office-website                  (public)  → pastors taking requests (names only)
 *   POST resource=pastors-office-website                  (public)  → a visitor's booking request from the website
 *   GET  resource=pastors-office-website&scope=office&officeId=…   (pastor/assistant) → website requests
 *   POST resource=pastors-office-website {action:'set_status',id,status}  (pastor/assistant)
 *
 * Every new request (website or member) alerts the office's pastor and assistants:
 * the Canaan bell, a phone alert, and an email. Alert text never contains names,
 * counselling details or messages — staff open Canaan to read the request.
 */
import { getSupabaseAdmin, verifyAuth } from '../auth.js';
import { toE164Intl } from '../ugPhone.js';
import { phoneLookupValues } from '../authPhone.js';
import { isValidTimeZone, parseOfficeInstant } from './workflow.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/;
const RESTRICTED = new Set(['PENDING', 'GUEST', 'KIOSK', 'ACCOUNTANT']);
export const WEBSITE_SERVICES = ['baptism', 'dedication', 'wedding', 'counseling', 'other'] as const;
export type WebsiteService = (typeof WEBSITE_SERVICES)[number];
const STATUSES = new Set(['new', 'contacted', 'closed']);
const CANAAN_ORIGIN = (process.env.VAULT_PUBLIC_ORIGIN || 'https://plcc-opal.vercel.app').replace(/\/+$/, '');
export const OFFICE_LINK = `${CANAAN_ORIGIN}/#/pastors-office`;

// ---------------------------------------------------------------------------
// Validation (pure, tested)
// ---------------------------------------------------------------------------

export type WebsiteRequestInput = {
  officeId: string | null;
  service: WebsiteService;
  fullName: string;
  phone: string | null;
  email: string | null;
  preferredStart: string | null;
  timeZone: string | null;
  message: string | null;
};

function text(raw: unknown, max: number): string {
  return String(raw ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);
}

/** Clean a phone into +E.164 (Uganda default), or null. */
export function cleanPhone(raw: unknown): string | null {
  const s = text(raw, 40);
  if (!s) return null;
  const e164 = toE164Intl(s);
  return e164 && /^\+\d{8,15}$/.test(e164) ? e164 : null;
}

export function cleanEmail(raw: unknown): string | null {
  const s = text(raw, 254).toLowerCase();
  return s && EMAIL.test(s) ? s : null;
}

export function parseWebsiteRequest(body: any): { ok: true; value: WebsiteRequestInput } | { ok: false; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'Invalid request.' };
  const fullName = text(body.fullName, 120);
  if (fullName.length < 2) return { ok: false, error: 'Please enter your name.' };
  const service = String(body.service || '') as WebsiteService;
  if (!WEBSITE_SERVICES.includes(service)) return { ok: false, error: 'Please choose what you need.' };
  const rawPhone = text(body.phone, 40);
  const rawEmail = text(body.email, 254);
  const phone = cleanPhone(rawPhone);
  const email = cleanEmail(rawEmail);
  if (rawPhone && !phone) return { ok: false, error: 'Please check your phone number.' };
  if (rawEmail && !email) return { ok: false, error: 'Please check your email address.' };
  if (!phone) return { ok: false, error: 'Please enter your phone number.' };
  if (!email) return { ok: false, error: 'Please enter your email address.' };
  let preferredStart: string | null = null;
  let timeZone: string | null = null;
  if (body.preferredStart) {
    if (parseOfficeInstant(body.preferredStart) === null) return { ok: false, error: 'Please check the preferred date and time.' };
    preferredStart = String(body.preferredStart);
    timeZone = isValidTimeZone(body.timeZone) ? String(body.timeZone) : 'Africa/Kampala';
  }
  const officeId = body.officeId ? String(body.officeId) : null;
  if (officeId && !UUID.test(officeId)) return { ok: false, error: 'Please choose a pastor.' };
  const message = text(body.message, 1000) || null;
  return { ok: true, value: { officeId, service, fullName, phone, email, preferredStart, timeZone, message } };
}

// ---------------------------------------------------------------------------
// Spam brakes for the public form (per server instance)
// ---------------------------------------------------------------------------

const hits = new Map<string, { start: number; count: number }>();
const PER_IP = 5;
const PER_IP_WINDOW_MS = 10 * 60_000;
let globalHits = { start: 0, count: 0 };
const GLOBAL_PER_HOUR = 120;

export function websiteRateLimited(ip: string, now = Date.now()): boolean {
  if (now - globalHits.start > 3_600_000) globalHits = { start: now, count: 0 };
  globalHits.count += 1;
  if (globalHits.count > GLOBAL_PER_HOUR) return true;
  const row = hits.get(ip);
  if (!row || now - row.start > PER_IP_WINDOW_MS) {
    hits.set(ip, { start: now, count: 1 });
    return false;
  }
  row.count += 1;
  return row.count > PER_IP;
}
export function __resetWebsiteRateForTests() {
  hits.clear();
  globalHits = { start: 0, count: 0 };
}

function visitorIp(req: any): string {
  // The website's server forwards the visitor's address; otherwise the caller's.
  const fwd = String(req.headers?.['x-plcc-visitor-ip'] || req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || String(req.socket?.remoteAddress || 'unknown');
}

// ---------------------------------------------------------------------------
// Staff alerts: Canaan bell + phone alert + email
// ---------------------------------------------------------------------------

export type OfficeAlert = { source: 'website' | 'member'; requestId?: string | null };

export function alertCopy(alert: OfficeAlert): { title: string; body: string } {
  return alert.source === 'website'
    ? { title: 'New Pastor’s Office request', body: 'A request came in from the church website. Open Pastor’s Office in Canaan to view it.' }
    : { title: 'New Pastor’s Office request', body: 'A member sent a request through Tribes. Open Pastor’s Office in Canaan to view it.' };
}

/** Pastor + active assistants of one office (or of every office when officeId is null). */
export async function officeStaffIds(admin: any, officeId: string | null): Promise<string[]> {
  let offices = admin.from('pastoral_offices').select('id,pastor_user_id');
  if (officeId) offices = offices.eq('id', officeId);
  let assistants = admin
    .from('pastoral_office_assignments')
    .select('user_id')
    .eq('office_role', 'PASTORS_ASSISTANT')
    .is('revoked_at', null);
  if (officeId) assistants = assistants.eq('office_id', officeId);
  const [o, a] = await Promise.all([offices, assistants]);
  const ids = new Set<string>();
  for (const row of o.data || []) if (row?.pastor_user_id) ids.add(String(row.pastor_user_id));
  for (const row of a.data || []) if (row?.user_id) ids.add(String(row.user_id));
  return [...ids].filter((id) => UUID.test(id));
}

/** Never throws: a failed alert must not fail a saved request. */
export async function alertOfficeStaff(admin: any, officeId: string | null, alert: OfficeAlert, skipUserId?: string | null): Promise<void> {
  try {
    const ids = (await officeStaffIds(admin, officeId)).filter((id) => id !== skipUserId);
    if (!ids.length) return;
    const { title, body } = alertCopy(alert);
    const sourceId = alert.requestId && UUID.test(alert.requestId) ? alert.requestId : null;
    const jobs: Promise<unknown>[] = [];
    // 1) Canaan bell (website requests; member requests already get it from the database outbox).
    if (alert.source === 'website') {
      jobs.push(
        admin
          .from('user_notifications')
          .insert(ids.map((user_id) => ({ user_id, type: 'assignment', title, body, link: '/pastors-office', source_id: sourceId })))
          .then(({ error }: any) => error && console.error('[PastorsOffice] bell failed:', error.message))
      );
    }
    // 2) Phone alert (Tribes and Ka Link phones). Same tag, so a phone with both shows it once.
    jobs.push(
      (async () => {
        const { pushToUsers } = await import('../pushAlerts.js');
        const msg = { title, body, url: OFFICE_LINK, tag: `pastors-office-${sourceId || Date.now()}` };
        await pushToUsers(admin, ids, 'church', msg);
        await pushToUsers(admin, ids, 'chat', msg);
      })().catch((err: any) => console.error('[PastorsOffice] phone alert failed:', err?.message || err))
    );
    // 3) Email.
    jobs.push(
      (async () => {
        const { data } = await admin.from('users').select('email').in('id', ids);
        const { isPhonePlaceholderEmail } = await import('../authPhone.js');
        const to: string[] = [...new Set<string>((data || []).map((r: any) => String(r?.email || '').trim().toLowerCase()))].filter(
          (e: string) => EMAIL.test(e) && !isPhonePlaceholderEmail(e)
        );
        if (!to.length) return;
        const { getResend } = await import('../deps.js');
        const resend = await getResend();
        if (!resend) return;
        const { vaultFrom } = await import('../emailFrom.js');
        const { error } = await resend.emails.send({
          from: vaultFrom('PLCC Pastor’s Office'),
          to,
          subject: title,
          html: `<p>${body}</p><p><a href="${OFFICE_LINK}">Open Pastor’s Office</a></p><p style="color:#667;font-size:12px">For privacy, details are only shown in Canaan.</p>`,
          text: `${body}\n\n${OFFICE_LINK}\n\nFor privacy, details are only shown in Canaan.`,
        });
        if (error) console.error('[PastorsOffice] email failed:', error.message || error);
      })().catch((err: any) => console.error('[PastorsOffice] email failed:', err?.message || err))
    );
    await Promise.all(jobs);
  } catch (err: any) {
    console.error('[PastorsOffice] alert failed:', err?.message || err);
  }
}

/** Does this phone/email belong to an existing PLCC account? */
async function matchAccount(admin: any, phone: string | null, email: string | null): Promise<string | null> {
  try {
    if (email) {
      const { data } = await admin.from('users').select('id').ilike('email', email).limit(1);
      if (data?.[0]?.id) return String(data[0].id);
    }
    if (phone) {
      const values = phoneLookupValues(phone);
      const [a, b] = await Promise.all([
        admin.from('users').select('id').eq('verified_phone', phone).limit(1),
        admin.from('users').select('id').in('phone', values).limit(1),
      ]);
      const id = a.data?.[0]?.id || b.data?.[0]?.id;
      if (id) return String(id);
    }
  } catch {
    /* matching is a hint only */
  }
  return null;
}

async function staffOfficeRole(admin: any, userId: string, officeId: string): Promise<'PASTOR' | 'PASTORS_ASSISTANT' | null> {
  const [owner, assistant] = await Promise.all([
    admin.from('pastoral_offices').select('id').eq('id', officeId).eq('pastor_user_id', userId).maybeSingle(),
    admin.from('pastoral_office_assignments').select('office_id').eq('office_id', officeId).eq('user_id', userId).eq('office_role', 'PASTORS_ASSISTANT').is('revoked_at', null).maybeSingle(),
  ]);
  if (owner.error || assistant.error) throw new Error('office check failed');
  return owner.data ? 'PASTOR' : assistant.data ? 'PASTORS_ASSISTANT' : null;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handleWebsitePastoralRequests(req: any, res: any, injected?: { admin: any; verify: typeof verifyAuth }) {
  res.setHeader('Cache-Control', 'private, no-store');
  const admin = injected?.admin || getSupabaseAdmin();
  if (!admin) return res.status(503).json({ ok: false, error: 'Pastor’s Office is unavailable.' });
  const scope = String(req.query?.scope || '');
  const staffCall = scope === 'office' || (req.method === 'POST' && req.body?.action === 'set_status');

  try {
    if (staffCall) {
      const auth = await (injected?.verify || verifyAuth)(req, admin);
      if (auth.unavailable) return res.status(503).json({ ok: false, error: 'Sign-in verification unavailable.' });
      if (!auth.user) return res.status(401).json({ ok: false, error: 'Please sign in.' });
      if (!auth.role || RESTRICTED.has(String(auth.role).toUpperCase())) return res.status(403).json({ ok: false, error: 'Office access is not available.' });

      if (req.method === 'GET') {
        const officeId = String(req.query?.officeId || '');
        if (!UUID.test(officeId)) return res.status(400).json({ ok: false, error: 'Invalid office.' });
        const role = await staffOfficeRole(admin, auth.user.id, officeId);
        if (!role) return res.status(403).json({ ok: false, error: 'Office access is not assigned.' });
        const { data, error } = await admin
          .from('pastoral_website_requests')
          .select('id,office_id,service,full_name,phone,email,preferred_start,preferred_zone,message,status,created_at,matched:users!pastoral_website_requests_matched_user_id_fkey(name)')
          .or(`office_id.eq.${officeId},office_id.is.null`)
          .order('created_at', { ascending: false })
          .limit(100);
        if (error) return res.status(503).json({ ok: false, error: 'Could not load website requests.' });
        // Assistants don't see counselling messages (same rule as member requests).
        const rows = (data || []).map((r: any) => (role === 'PASTOR' || r.service !== 'counseling' ? r : { ...r, message: null }));
        return res.status(200).json({ ok: true, requests: rows });
      }

      const id = String(req.body?.id || '');
      const status = String(req.body?.status || '');
      if (!UUID.test(id) || !STATUSES.has(status)) return res.status(400).json({ ok: false, error: 'Invalid update.' });
      const { data: row, error: rowErr } = await admin.from('pastoral_website_requests').select('id,office_id').eq('id', id).maybeSingle();
      if (rowErr) return res.status(503).json({ ok: false, error: 'Could not update the request.' });
      if (!row) return res.status(404).json({ ok: false, error: 'Request not found.' });
      const allowed = row.office_id
        ? await staffOfficeRole(admin, auth.user.id, row.office_id)
        : (await officeStaffIds(admin, null)).includes(auth.user.id);
      if (!allowed) return res.status(403).json({ ok: false, error: 'Office access is not assigned.' });
      const { error } = await admin
        .from('pastoral_website_requests')
        .update({ status, handled_by: auth.user.id, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) return res.status(503).json({ ok: false, error: 'Could not update the request.' });
      return res.status(200).json({ ok: true });
    }

    // ---------- Public ----------
    if (req.method === 'GET') {
      const { data, error } = await admin.from('pastoral_offices').select('id,users!pastoral_offices_pastor_user_id_fkey(name)');
      if (error) return res.status(503).json({ ok: false, error: 'Could not load pastors.' });
      const offices = (data || []).map((row: any) => ({
        id: row.id,
        pastorName: (Array.isArray(row.users) ? row.users[0]?.name : row.users?.name) || 'Pastoral office',
      }));
      return res.status(200).json({ ok: true, offices });
    }
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed.' });
    // Hidden "website" field: people never fill it, bots do. Pretend it worked.
    if (String(req.body?.website || '').trim()) return res.status(200).json({ ok: true });
    if (websiteRateLimited(visitorIp(req))) return res.status(429).json({ ok: false, error: 'Too many requests. Please try again later or WhatsApp the church.' });
    const parsed = parseWebsiteRequest(req.body);
    if ('error' in parsed) return res.status(400).json({ ok: false, error: parsed.error });
    const v = parsed.value;

    let officeId = v.officeId;
    if (officeId) {
      const { data } = await admin.from('pastoral_offices').select('id').eq('id', officeId).maybeSingle();
      if (!data) officeId = null;
    } else {
      const { data } = await admin.from('pastoral_offices').select('id').limit(2);
      if ((data || []).length === 1) officeId = String(data[0].id);
    }
    const matched = await matchAccount(admin, v.phone, v.email);
    const { data: inserted, error } = await admin
      .from('pastoral_website_requests')
      .insert({
        office_id: officeId,
        service: v.service,
        full_name: v.fullName,
        phone: v.phone,
        email: v.email,
        preferred_start: v.preferredStart,
        preferred_zone: v.timeZone,
        message: v.message,
        matched_user_id: matched,
      })
      .select('id')
      .single();
    if (error) {
      console.error('[PastorsOffice] website insert failed:', error.message);
      return res.status(503).json({ ok: false, error: 'Could not send your request. Please WhatsApp or call the church.' });
    }
    await alertOfficeStaff(admin, officeId, { source: 'website', requestId: inserted?.id });
    return res.status(200).json({ ok: true });
  } catch {
    return res.status(503).json({ ok: false, error: 'Pastor’s Office is temporarily unavailable.' });
  }
}
