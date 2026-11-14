import { getSupabaseAdmin, requireAuth } from '../_utils/auth.js';
import { getResend } from '../_utils/deps.js';
import { vaultFrom } from '../_utils/emailFrom.js';

/**
 * POST /api/vault?resource=report
 * (PLCC Connect reaches this through its /api/report bridge.)
 *
 * Three kinds of report, all emailed to REPORT_NOTIFY_EMAILS
 * (comma-separated list, set in Vercel env):
 *   - kind: 'problem' — app issue in PLCC Chat / Canaan / Connect / Sanctum, with screenshots
 *   - kind: 'safety'  — harassment, impersonating a leader, asking for / sending money, scams
 *   - kind: 'content' — Report on a specific message, post, prayer request or profile
 */

const APPS: Record<string, string> = {
  chat: 'PLCC Chat',
  canaan: 'PLCC Canaan',
  connect: 'PLCC Connect',
  sanctum: 'PLCC Sanctum',
};

const SOURCE_APPS = new Set(['canaan', 'connect']);

const CONTENT_TYPE_LABEL: Record<string, string> = {
  chat_message: 'Chat message',
  dm_message: 'Private message',
  feed_post: 'Feed post',
  feed_comment: 'Feed comment',
  prayer_request: 'Prayer request',
  profile: 'Member profile',
};

const REASON_LABEL: Record<string, string> = {
  spam: 'Spam or scam',
  harassment: 'Harassment or bullying',
  impersonation: 'Pretending to be a pastor, leader or member',
  money: 'Asking for money',
  inappropriate: 'Inappropriate or offensive',
  false_info: 'False information',
  safety: 'Someone may be unsafe',
  other: 'Something else',
};

const PROBLEM_LABEL: Record<string, string> = {
  huddle: 'Live Huddle (audio / video)',
  messages: 'Chat or messages',
  notifications: 'Not getting phone alerts',
  login: 'Signing in or account',
  giving: 'Giving, tithes or payments',
  events: 'Events, RSVP or check-in',
  profile: 'Profile or household',
  slow: 'Slow, stuck or not loading',
  bug: 'Something is broken / error',
  idea: 'Suggestion',
  other: 'Other',
};

const MAX_ANSWERS = 15;

/** Follow-up answers from the dropdown flow: [{ q, a }]. */
function parseAnswers(raw: unknown): { q: string; a: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAX_ANSWERS)
    .map((x: any) => ({ q: clip(x?.q, 150), a: clip(x?.a, 500) }))
    .filter((x) => x.q && x.a);
}

const SAFETY_LABEL: Record<string, string> = {
  harassment: 'Harassment, bullying or threats',
  impersonation: 'Pretending to be a pastor, apostle, leader or member',
  money_request: 'Asking for money',
  money_send: 'Asking me to send or transfer money / pay a fee',
  pin: 'Asking for my mobile money PIN or code',
  scam: 'Scam (fake link, prize, investment, job, account details)',
  inappropriate: 'Unwanted sexual or inappropriate messages',
  other: 'Something else',
};

const IMPERSONATED_LABEL: Record<string, string> = {
  apostle: 'The Apostle',
  pastor: 'A pastor',
  bishop: 'A bishop',
  elder: 'An elder',
  minister: 'A minister or ministry leader',
  deacon: 'A deacon',
  staff: 'Church staff or office',
  member: 'Another member',
  other: 'Someone else',
};

const WHERE_LABEL: Record<string, string> = {
  chat: 'PLCC Chat',
  canaan: 'PLCC Canaan',
  connect: 'PLCC Connect',
  sanctum: 'PLCC Sanctum',
  whatsapp: 'WhatsApp',
  call_sms: 'Phone call or SMS',
  social: 'Facebook / social media',
  in_person: 'In person',
  other: 'Somewhere else',
};

// ---------- screenshots ----------
const MAX_SHOTS = 3;
const MAX_SHOT_BYTES = 1_500_000;
const MAX_TOTAL_BYTES = 3_500_000;
const SHOT_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

type Attachment = { filename: string; content: Buffer };

function parseScreenshots(raw: unknown): { ok: true; files: Attachment[] } | { ok: false; error: string } {
  if (raw == null) return { ok: true, files: [] };
  if (!Array.isArray(raw)) return { ok: false, error: 'Screenshots were not in the right format' };
  if (raw.length > MAX_SHOTS) return { ok: false, error: `Please attach up to ${MAX_SHOTS} screenshots` };
  const files: Attachment[] = [];
  let total = 0;
  for (let i = 0; i < raw.length; i++) {
    const s: any = raw[i] || {};
    const ext = SHOT_TYPES[String(s.type || '')];
    const data = String(s.data || '');
    if (!ext || !data || !/^[A-Za-z0-9+/=]+$/.test(data)) {
      return { ok: false, error: 'One of the screenshots could not be read. Please try a different picture.' };
    }
    const buf = Buffer.from(data, 'base64');
    if (buf.length === 0 || buf.length > MAX_SHOT_BYTES) {
      return { ok: false, error: 'One of the screenshots is too large. Please try a smaller picture.' };
    }
    total += buf.length;
    if (total > MAX_TOTAL_BYTES) return { ok: false, error: 'The screenshots are too large together. Please send fewer.' };
    files.push({ filename: `screenshot-${i + 1}.${ext}`, content: buf });
  }
  return { ok: true, files };
}

// ---------- helpers ----------
const recent = new Map<string, number[]>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 8;

function throttled(key: string): boolean {
  const now = Date.now();
  const list = (recent.get(key) || []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= MAX_PER_WINDOW) {
    recent.set(key, list);
    return true;
  }
  list.push(now);
  recent.set(key, list);
  return false;
}

function clip(v: unknown, max: number): string {
  return String(v ?? '').trim().slice(0, max);
}

function pick(map: Record<string, string>, v: unknown, fallback = ''): string {
  const k = String(v ?? '');
  return Object.prototype.hasOwnProperty.call(map, k) ? k : fallback;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function row(label: string, value: string): string {
  if (!value) return '';
  return `<tr><td style="padding:6px 12px 6px 0;color:#6b7280;vertical-align:top;white-space:nowrap">${esc(label)}</td><td style="padding:6px 0;color:#111827;white-space:pre-wrap">${esc(value)}</td></tr>`;
}

function recipients(): string[] {
  return String(process.env.REPORT_NOTIFY_EMAILS || '')
    .split(',')
    .map((e) => e.trim())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
}

function appUrl(): string {
  return (process.env.VITE_APP_URL || 'https://plcc-opal.vercel.app').replace(/\/$/, '');
}

function safePageUrl(v: unknown): string {
  const s = clip(v, 500);
  return /^https?:\/\//i.test(s) ? s : '';
}

function safeJson(s: string): any {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

export const handleReport = async (req: any, res: any) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) return res.status(503).json({ ok: false, error: 'Supabase Admin not initialized' });

  const auth = await requireAuth(req, res, supabaseAdmin);
  if (!auth) return;

  const body = typeof req.body === 'string' ? safeJson(req.body) : req.body || {};
  const kind = ['problem', 'safety', 'content'].includes(body.kind) ? (body.kind as string) : '';
  if (!kind) return res.status(400).json({ ok: false, error: 'Unknown report type' });

  const shots = parseScreenshots(body.screenshots);
  if (shots.ok === false) return res.status(400).json({ ok: false, error: (shots as { error: string }).error });

  const reporterId = String(auth.user?.id || '');
  if (throttled(reporterId)) {
    return res
      .status(429)
      .json({ ok: false, error: 'You have sent several reports recently. Please wait a few minutes.' });
  }

  const reporterName = clip(auth.user?.name, 120) || 'Unknown';
  const reporterEmail = clip(auth.user?.email, 200);
  const reporterPhone = clip(body.reporterPhone, 40);
  const details = clip(body.details, 4000);
  const pageUrl = safePageUrl(body.pageUrl);
  const userAgent = clip(body.userAgent || req.headers?.['user-agent'], 400);
  const screen = clip(body.screen, 40);
  const sourceApp = SOURCE_APPS.has(String(body.sourceApp)) ? APPS[String(body.sourceApp)] : APPS.canaan;
  const when = new Date().toLocaleString('en-GB', { timeZone: 'Africa/Kampala' }) + ' (Kampala)';
  const shotNote = shots.files.length ? `${shots.files.length} attached` : '';

  const reporterRows = [
    row('Reported by', reporterName),
    row('Reporter email', reporterEmail),
    row('Reporter phone', reporterPhone),
    row('Role', clip(auth.role, 60)),
    row('Sent from', sourceApp),
    row('Page', pageUrl),
  ].join('');

  let subject: string;
  let heading: string;
  let banner = '';
  let rows: string;

  if (kind === 'problem') {
    const app = pick(APPS, body.app, 'canaan');
    const category = pick(PROBLEM_LABEL, body.category, 'other');
    const answers = parseAnswers(body.answers);
    if (!details && answers.length === 0) return res.status(400).json({ ok: false, error: 'Please describe the problem' });
    heading = `Problem report: ${APPS[app]}`;
    subject = `[${APPS[app]}] ${PROBLEM_LABEL[category]} — ${reporterName}`;
    rows = [
      row('App', APPS[app]),
      row('Category', PROBLEM_LABEL[category]),
      ...answers.map((x) => row(x.q, x.a)),
      row('More details', details),
      row('Screenshots', shotNote),
      reporterRows,
      row('Device', userAgent),
      row('Screen', screen),
      row('When', when),
    ].join('');
  } else if (kind === 'safety') {
    const category = pick(SAFETY_LABEL, body.category, '');
    if (!category) return res.status(400).json({ ok: false, error: 'Please choose what happened' });
    if (!details) return res.status(400).json({ ok: false, error: 'Please describe what happened' });
    const impersonated = pick(IMPERSONATED_LABEL, body.impersonated, '');
    const where = pick(WHERE_LABEL, body.where, '');
    const moneySent = body.moneySent === 'yes' ? 'Yes' : body.moneySent === 'no' ? 'No' : '';
    const askMoney = moneySent === 'Yes' || category === 'money_request' || category === 'money_send' || category === 'pin' || category === 'scam';
    heading = 'SAFETY REPORT — please review promptly';
    subject = `⚠️ PLCC safety report: ${SAFETY_LABEL[category]}${moneySent === 'Yes' ? ' — MONEY SENT' : ''}`;
    if (moneySent === 'Yes') {
      banner = `<p style="background:#fef2f2;border:1px solid #fecaca;color:#991b1b;padding:10px 12px;border-radius:8px;margin:0 0 14px;font-weight:bold">The member says they already sent money. Contact them quickly.</p>`;
    }
    rows = [
      row('What happened', SAFETY_LABEL[category]),
      row('Pretending to be', impersonated ? IMPERSONATED_LABEL[impersonated] : ''),
      row('Name they used', clip(body.offenderName, 120)),
      row('Their phone / username / link', clip(body.offenderContact, 200)),
      row('Where it happened', where ? WHERE_LABEL[where] : ''),
      row('When it happened', clip(body.happenedAt, 80)),
      row('Money sent?', askMoney ? moneySent || 'Not answered' : moneySent),
      row('Amount / how sent', clip(body.moneyDetails, 200)),
      row('Details', details),
      row('Screenshots', shotNote),
      reporterRows,
      row('Device', userAgent),
      row('When reported', when),
    ].join('');
  } else {
    const contentType = pick(CONTENT_TYPE_LABEL, body.contentType, '');
    if (!contentType) return res.status(400).json({ ok: false, error: 'Unknown content type' });
    const reason = pick(REASON_LABEL, body.reason, 'other');
    const label = CONTENT_TYPE_LABEL[contentType];
    const urgent = ['impersonation', 'money', 'harassment', 'safety'].includes(reason);
    heading = `${label} reported`;
    subject = `${urgent ? '⚠️ ' : ''}PLCC report: ${label} — ${REASON_LABEL[reason]}`;
    rows = [
      row('Type', label),
      row('Reason', REASON_LABEL[reason]),
      row('Reporter note', details),
      row('Posted by', clip(body.authorName, 120)),
      row('Author ID', clip(body.authorId, 80)),
      row('Content', clip(body.contentPreview, 1500)),
      row('Where', clip(body.context, 200)),
      row('Item ID', clip(body.contentId, 80)),
      row('Screenshots', shotNote),
      reporterRows,
      row('When', when),
    ].join('');
  }

  const to = recipients();
  if (to.length === 0) {
    console.error('[report] REPORT_NOTIFY_EMAILS not set; report not sent', { kind, reporterId });
    return res.status(503).json({ ok: false, error: 'Reports inbox is not set up yet. Please tell an administrator.' });
  }

  const resend = await getResend();
  if (!resend) {
    console.error('[report] RESEND_API_KEY not set; report not sent', { kind, reporterId });
    return res.status(503).json({ ok: false, error: 'Email service unavailable. Please try again later.' });
  }

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px">
      <h2 style="color:#7a1f2b;margin:0 0 12px">${esc(heading)}</h2>
      ${banner}
      <table style="border-collapse:collapse;font-size:14px">${rows}</table>
      <p style="margin-top:20px;font-size:13px"><a href="${esc(appUrl())}">Open PLCC Canaan</a></p>
    </div>`;

  try {
    const { data, error } = await resend.emails.send({
      from: vaultFrom('PLCC Reports'),
      to,
      subject: subject.slice(0, 200),
      html,
      ...(reporterEmail ? { reply_to: reporterEmail } : {}),
      ...(shots.files.length ? { attachments: shots.files } : {}),
    } as any);
    if (error) throw new Error(error.message || 'Send failed');
    return res.status(200).json({ ok: true, id: data?.id });
  } catch (err: any) {
    console.error('[report] send failed', err?.message || err);
    return res.status(502).json({ ok: false, error: 'Could not send the report. Please try again.' });
  }
};
