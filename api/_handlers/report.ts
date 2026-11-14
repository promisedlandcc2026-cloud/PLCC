import { getSupabaseAdmin, requireAuth } from '../_utils/auth.js';
import { getResend } from '../_utils/deps.js';
import { vaultFrom } from '../_utils/emailFrom.js';

/**
 * POST /api/vault?resource=report
 *
 * Two kinds of report, both emailed to REPORT_NOTIFY_EMAILS
 * (comma-separated list, set in Vercel env):
 *   - kind: 'problem'  — "Report a problem" from the profile menu
 *   - kind: 'content'  — Report on a chat message, DM, feed post, prayer request or profile
 */

const CONTENT_TYPES = new Set(['chat_message', 'dm_message', 'feed_post', 'feed_comment', 'prayer_request', 'profile']);
const CONTENT_TYPE_LABEL: Record<string, string> = {
  chat_message: 'Chat message',
  dm_message: 'Private message',
  feed_post: 'Feed post',
  feed_comment: 'Feed comment',
  prayer_request: 'Prayer request',
  profile: 'Member profile',
};

const REASONS = new Set(['spam', 'harassment', 'inappropriate', 'false_info', 'safety', 'other']);
const REASON_LABEL: Record<string, string> = {
  spam: 'Spam or scam',
  harassment: 'Harassment or bullying',
  inappropriate: 'Inappropriate or offensive',
  false_info: 'False information',
  safety: 'Someone may be unsafe',
  other: 'Something else',
};

const PROBLEM_CATEGORIES = new Set(['bug', 'login', 'huddle', 'giving', 'slow', 'idea', 'other']);
const PROBLEM_LABEL: Record<string, string> = {
  bug: 'Something is broken',
  login: 'Sign-in or account',
  huddle: 'Live Huddle / audio / video',
  giving: 'Giving',
  slow: 'Slow or not loading',
  idea: 'Suggestion',
  other: 'Other',
};

// Light per-instance throttle so one person can't flood the inbox.
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
  const kind = body.kind === 'content' ? 'content' : body.kind === 'problem' ? 'problem' : '';
  if (!kind) return res.status(400).json({ ok: false, error: 'kind must be "problem" or "content"' });

  const reporterId = String(auth.user?.id || '');
  if (throttled(reporterId)) {
    return res
      .status(429)
      .json({ ok: false, error: 'You have sent several reports recently. Please wait a few minutes.' });
  }

  const reporterName = clip(auth.user?.name, 120) || 'Unknown';
  const reporterEmail = clip(auth.user?.email, 200);
  const details = clip(body.details, 4000);
  const pageUrl = safePageUrl(body.pageUrl);
  const userAgent = clip(body.userAgent || req.headers?.['user-agent'], 400);
  const screen = clip(body.screen, 40);
  const when = new Date().toLocaleString('en-GB', { timeZone: 'Africa/Kampala' }) + ' (Kampala)';

  let subject: string;
  let heading: string;
  let rows: string;

  if (kind === 'problem') {
    const category = PROBLEM_CATEGORIES.has(body.category) ? body.category : 'other';
    if (!details) return res.status(400).json({ ok: false, error: 'Please describe the problem' });
    heading = 'Problem report from PLCC Canaan';
    subject = `PLCC Canaan problem: ${PROBLEM_LABEL[category]} — ${reporterName}`;
    rows = [
      row('Category', PROBLEM_LABEL[category]),
      row('What happened', details),
      row('Reported by', reporterName),
      row('Email', reporterEmail),
      row('Role', clip(auth.role, 60)),
      row('Page', pageUrl),
      row('Device', userAgent),
      row('Screen', screen),
      row('When', when),
    ].join('');
  } else {
    const contentType = CONTENT_TYPES.has(body.contentType) ? body.contentType : '';
    if (!contentType) return res.status(400).json({ ok: false, error: 'Unknown content type' });
    const reason = REASONS.has(body.reason) ? body.reason : 'other';
    const label = CONTENT_TYPE_LABEL[contentType];
    heading = `${label} reported in PLCC Canaan`;
    subject = `PLCC Canaan report: ${label} — ${REASON_LABEL[reason]}`;
    rows = [
      row('Type', label),
      row('Reason', REASON_LABEL[reason]),
      row('Reporter note', details),
      row('Posted by', clip(body.authorName, 120)),
      row('Author ID', clip(body.authorId, 80)),
      row('Content', clip(body.contentPreview, 1500)),
      row('Where', clip(body.context, 200)),
      row('Item ID', clip(body.contentId, 80)),
      row('Reported by', reporterName),
      row('Reporter email', reporterEmail),
      row('Page', pageUrl),
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
      <table style="border-collapse:collapse;font-size:14px">${rows}</table>
      <p style="margin-top:20px;font-size:13px"><a href="${esc(appUrl())}">Open PLCC Canaan</a></p>
    </div>`;

  try {
    const { data, error } = await resend.emails.send({
      from: vaultFrom('PLCC Canaan Reports'),
      to,
      subject: subject.slice(0, 200),
      html,
      ...(reporterEmail ? { reply_to: reporterEmail } : {}),
    } as any);
    if (error) throw new Error(error.message || 'Send failed');
    return res.status(200).json({ ok: true, id: data?.id });
  } catch (err: any) {
    console.error('[report] send failed', err);
    return res.status(502).json({ ok: false, error: 'Could not send the report. Please try again.' });
  }
};
