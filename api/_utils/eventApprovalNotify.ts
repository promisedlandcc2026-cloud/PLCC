/**
 * Vault + Resend notifications for event calendar approval.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getResend } from './deps.js';
import { notifyUser } from './notify.js';
import { eventApprovalDeepLink } from './eventApprovalLogic.js';
import { vaultFrom } from './emailFrom.js';

export type EventNotifyPayload = {
  id?: string;
  name?: string;
  date?: string;
  time?: string;
  location?: string;
  type?: string;
  department?: string | null;
  status?: string;
  rejection_reason?: string | null;
};

function escapeHtml(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function sendEventEmails(opts: {
  to: string[];
  subject: string;
  html: string;
}): Promise<{ sent: boolean; reason?: string }> {
  const recipients = opts.to.map((e) => e.trim()).filter(Boolean);
  if (recipients.length === 0) {
    return { sent: false, reason: 'No recipient emails' };
  }
  const resend = await getResend();
  if (!resend) {
    return { sent: false, reason: 'Email service unavailable (RESEND_API_KEY)' };
  }
  const { error } = await resend.emails.send({
    from: vaultFrom('Promised Land Christian Center'),
    to: recipients,
    subject: opts.subject,
    html: opts.html,
  });
  if (error) {
    console.error('[eventApprovalNotify]', error);
    return { sent: false, reason: error.message || 'Failed to send email' };
  }
  return { sent: true };
}

/** Notify configured approvers that a ministry submitted a dated event. */
export async function notifyEventApproversOfSubmit(
  supabase: SupabaseClient,
  approverUserIds: string[],
  event: EventNotifyPayload
): Promise<void> {
  const name = event.name || 'Untitled event';
  const date = event.date || '—';
  const dept = event.department || event.type || 'Ministry';
  const link = eventApprovalDeepLink();
  const title = 'Event approval needed';
  const body = `${dept} requested “${name}” on ${date}. Review in Events.`;

  for (const userId of approverUserIds) {
    await notifyUser(supabase, userId, {
      type: 'event_approval',
      title,
      body,
      link: '/events/overview?pending=1',
      sourceId: event.id || null,
    });
  }

  try {
    const { data: users } = await supabase
      .from('users')
      .select('id, email')
      .in('id', approverUserIds);
    const emails = (users || [])
      .map((u: any) => String(u.email || '').trim())
      .filter((e: string) => e.includes('@'));

    const html = `
      <h2>Event approval needed</h2>
      <p>A ministry submitted a calendar event for review.</p>
      <ul>
        <li><strong>Event:</strong> ${escapeHtml(name)}</li>
        <li><strong>Date:</strong> ${escapeHtml(date)}</li>
        <li><strong>Time:</strong> ${escapeHtml(event.time || '—')}</li>
        <li><strong>Location:</strong> ${escapeHtml(event.location || '—')}</li>
        <li><strong>Department:</strong> ${escapeHtml(dept)}</li>
      </ul>
      <p><a href="${escapeHtml(link)}">Open pending requests in PLCC Vault</a></p>
    `;
    await sendEventEmails({
      to: emails,
      subject: `PLCC Vault: approve “${name}” (${date})`,
      html,
    });
  } catch (err: any) {
    console.error('[eventApprovalNotify] submit email failed:', err?.message || err);
  }
}

/** Notify submitter that their event was approved or rejected. */
export async function notifyEventSubmitterOfDecision(
  supabase: SupabaseClient,
  submitterUserId: string | null | undefined,
  event: EventNotifyPayload,
  decision: 'approve' | 'reject'
): Promise<void> {
  if (!submitterUserId) return;
  const name = event.name || 'Your event';
  const date = event.date || '';
  const approved = decision === 'approve';
  const title = approved ? 'Event approved' : 'Event not approved';
  const body = approved
    ? `“${name}”${date ? ` on ${date}` : ''} is on the calendar.`
    : `“${name}” was not approved${event.rejection_reason ? `: ${event.rejection_reason}` : '.'}`;

  await notifyUser(supabase, submitterUserId, {
    type: 'event_approval',
    title,
    body,
    link: '/events/overview',
    sourceId: event.id || null,
  });

  try {
    const { data: user } = await supabase
      .from('users')
      .select('email')
      .eq('id', submitterUserId)
      .maybeSingle();
    const email = String(user?.email || '').trim();
    if (!email.includes('@')) return;

    const link = eventApprovalDeepLink().replace('?pending=1', '');
    const html = approved
      ? `
        <h2>Your event was approved</h2>
        <p><strong>${escapeHtml(name)}</strong>${date ? ` on ${escapeHtml(date)}` : ''} is now on the PLCC calendar.</p>
        <p><a href="${escapeHtml(link)}">Open Events calendar</a></p>
      `
      : `
        <h2>Your event was not approved</h2>
        <p><strong>${escapeHtml(name)}</strong> was not added to the public calendar.</p>
        ${event.rejection_reason ? `<p><strong>Reason:</strong> ${escapeHtml(event.rejection_reason)}</p>` : ''}
        <p><a href="${escapeHtml(link)}">Open Events calendar</a></p>
      `;
    await sendEventEmails({
      to: [email],
      subject: approved
        ? `PLCC Vault: “${name}” approved`
        : `PLCC Vault: “${name}” not approved`,
      html,
    });
  } catch (err: any) {
    console.error('[eventApprovalNotify] decision email failed:', err?.message || err);
  }
}

/** Load configured approver UUIDs from DB + EVENT_APPROVER_USER_IDS env. */
export async function loadEventApproverUserIds(supabase: SupabaseClient): Promise<string[]> {
  const fromEnv = String(process.env.EVENT_APPROVER_USER_IDS || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

  let fromDb: string[] = [];
  try {
    const { data } = await supabase
      .from('event_approver_config')
      .select('user_ids')
      .eq('id', 1)
      .maybeSingle();
    if (Array.isArray(data?.user_ids)) {
      fromDb = data.user_ids.map((id: any) => String(id));
    }
  } catch (err: any) {
    console.warn('[eventApprovalNotify] could not load event_approver_config:', err?.message || err);
  }

  // Also include SUPER_ADMIN / PASTOR / ADMIN users as fallback when config empty
  let roleFallback: string[] = [];
  if (fromDb.length === 0 && fromEnv.length === 0) {
    try {
      const { data } = await supabase
        .from('users')
        .select('id')
        .in('role', ['SUPER_ADMIN', 'PASTOR', 'ADMIN']);
      roleFallback = (data || []).map((u: any) => String(u.id));
    } catch {
      /* ignore */
    }
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of [...fromDb, ...fromEnv, ...roleFallback]) {
    const key = id.toLowerCase();
    if (!/^[0-9a-f-]{36}$/i.test(id) || seen.has(key)) continue;
    seen.add(key);
    out.push(id);
  }
  return out;
}
