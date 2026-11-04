import React, { useCallback, useEffect, useState } from 'react';
import { Cake, Mail, Smartphone, Send, Settings2, UserX } from 'lucide-react';
import { useNav } from '../../App';
import { fetchWithTimeout, getAuthHeaders } from '../../lib/api';

const ROLES = new Set(['SUPER_ADMIN', 'PASTOR']);

type Row = {
  memberId: string;
  name: string;
  occasion: 'birthday' | 'anniversary';
  isKid: boolean;
  daysAway: number;
  reach: 'app' | 'email' | 'none';
  greeted: 'app' | 'email' | null;
};

type Settings = {
  enabled: boolean;
  emailFallback: boolean;
  signature: string;
  birthdayMessage: string;
  anniversaryMessage: string;
  kidBirthdayMessage: string;
  birthdayNote: string;
  kidBirthdayNote: string;
  includeVerse: boolean;
};

type Data = { setupNeeded: boolean; settings: Settings; today: Row[]; upcoming: Row[] };

function whenText(days: number) {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function occasionText(r: Row) {
  if (r.occasion === 'anniversary') return '💍 Anniversary';
  return r.isKid ? '🎈 Birthday (to parents)' : '🎂 Birthday';
}

function Reach({ r }: { r: Row }) {
  if (r.greeted) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 px-2.5 py-1 text-xs font-bold">
        ✓ Greeted {r.greeted === 'email' ? 'by email' : 'in Connect'}
      </span>
    );
  }
  if (r.reach === 'app') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-xs font-bold text-slate-600 dark:text-slate-300">
        <Smartphone className="w-3.5 h-3.5" /> Connect
      </span>
    );
  }
  if (r.reach === 'email') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-xs font-bold text-slate-600 dark:text-slate-300">
        <Mail className="w-3.5 h-3.5" /> Email
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 px-2.5 py-1 text-xs font-bold">
      <UserX className="w-3.5 h-3.5" /> No app or email
    </span>
  );
}

/**
 * Vault Home — today's & this week's birthdays and anniversaries, with the
 * Pastor's automatic greeting (7 AM). Pastor & Super Admin only (server checks too).
 */
const CelebrationsCard: React.FC = () => {
  const { userRole } = useNav();
  const allowed = ROLES.has(String(userRole || '').toUpperCase());
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetchWithTimeout('/api/vault?resource=celebrations', { headers: await getAuthHeaders() }, 20_000);
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d?.ok) throw new Error(d?.error || 'Could not load celebrations.');
      setData(d);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Could not load celebrations.');
    }
  }, []);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  if (!allowed) return null;

  const post = async (action: string, body: unknown, label: string) => {
    setBusy(label);
    setNote(null);
    try {
      const res = await fetchWithTimeout(
        `/api/vault?resource=celebrations&action=${action}`,
        { method: 'POST', headers: await getAuthHeaders(), body: JSON.stringify(body ?? {}) },
        60_000
      );
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d?.ok) throw new Error(d?.error || 'Something went wrong. Please try again.');
      return d;
    } catch (e: any) {
      setNote({ ok: false, text: e?.message || 'Something went wrong. Please try again.' });
      return null;
    } finally {
      setBusy(null);
    }
  };

  const save = async (next: Settings, message = 'Saved.') => {
    const d = await post('settings', { settings: next }, 'save');
    if (d) {
      setNote({ ok: true, text: message });
      setEditing(false);
      await load();
    }
  };

  const sendNow = async () => {
    const d = await post('send-now', {}, 'send');
    if (!d) return;
    if (d.skippedReason) setNote({ ok: false, text: d.skippedReason === 'greetings are off' ? 'Greetings are turned off.' : 'Run celebration_greetings.sql first.' });
    else setNote({ ok: true, text: d.sent ? `Sent ${d.sent} greeting${d.sent === 1 ? '' : 's'}.` : 'Everyone reachable has already been greeted today.' });
    await load();
  };

  const field =
    'w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-3 text-base text-slate-900 dark:text-white';
  const label = 'block text-xs font-bold uppercase tracking-wider text-slate-500';
  const s = data?.settings;

  return (
    <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3 mb-1">
        <div className="flex items-center gap-2">
          <Cake className="w-5 h-5 text-burgundy dark:text-gold" />
          <h2 className="text-lg font-black text-slate-900 dark:text-white">Today's celebrations</h2>
        </div>
        {s && !data?.setupNeeded ? (
          <button
            type="button"
            onClick={() => { setDraft(s); setEditing((v) => !v); setNote(null); }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200"
          >
            <Settings2 className="w-4 h-4" /> {editing ? 'Close' : 'Edit message'}
          </button>
        ) : null}
      </div>

      {error ? <p className="text-sm text-red-700 dark:text-red-400">{error}</p> : null}
      {!data && !error ? <p className="text-sm text-slate-500">Loading…</p> : null}

      {data ? (
        <>
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
            {data.setupNeeded
              ? 'Automatic greetings are not set up yet. Run celebration_greetings.sql in Supabase, then reload.'
              : s?.enabled
                ? `A greeting from ${s.signature} goes out automatically at 7 AM — in PLCC Connect (with a phone alert)${s.emailFallback ? ', plus the same card by email' : ''}. Kids' birthdays go to their parents.`
                : 'Automatic greetings are turned off.'}
          </p>

          {editing && draft ? (
            <div className="space-y-3 mb-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-4">
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                <input type="checkbox" className="w-5 h-5" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />
                Send greetings automatically every morning
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                <input type="checkbox" className="w-5 h-5" checked={draft.emailFallback} onChange={(e) => setDraft({ ...draft, emailFallback: e.target.checked })} />
                Also email the card (with the church seal) to members who have an email
              </label>
              <label className={label}>
                Signed by
                <input className={`${field} mt-1`} maxLength={60} value={draft.signature} onChange={(e) => setDraft({ ...draft, signature: e.target.value })} placeholder="e.g. Pastor Grace & Kennedy Hiire" />
              </label>
              <label className={label}>
                Birthday message
                <textarea className={`${field} mt-1`} rows={3} maxLength={500} value={draft.birthdayMessage} onChange={(e) => setDraft({ ...draft, birthdayMessage: e.target.value })} />
              </label>
              <label className={label}>
                Personal note under the birthday message
                <textarea className={`${field} mt-1`} rows={3} maxLength={500} value={draft.birthdayNote ?? ''} onChange={(e) => setDraft({ ...draft, birthdayNote: e.target.value })} placeholder="Leave empty for no note" />
                <span className="mt-1 block text-xs font-normal text-slate-500">If we know when they joined PLCC, “Thank you for 12 years of worshipping with us.” is added.</span>
              </label>
              <label className={label}>
                Wedding anniversary message
                <textarea className={`${field} mt-1`} rows={3} maxLength={500} value={draft.anniversaryMessage} onChange={(e) => setDraft({ ...draft, anniversaryMessage: e.target.value })} />
              </label>
              <label className={label}>
                Kids' birthday message (sent to parents)
                <textarea className={`${field} mt-1`} rows={3} maxLength={500} value={draft.kidBirthdayMessage} onChange={(e) => setDraft({ ...draft, kidBirthdayMessage: e.target.value })} />
              </label>
              <label className={label}>
                Personal note for kids' birthdays
                <textarea className={`${field} mt-1`} rows={3} maxLength={500} value={draft.kidBirthdayNote ?? ''} onChange={(e) => setDraft({ ...draft, kidBirthdayNote: e.target.value })} placeholder="Leave empty for no note" />
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                <input type="checkbox" className="w-5 h-5" checked={draft.includeVerse !== false} onChange={(e) => setDraft({ ...draft, includeVerse: e.target.checked })} />
                Add a birthday Bible verse (KJV) — a different one for each person, every year
              </label>
              <p className="text-xs text-slate-500">
                Use <code>{'{name}'}</code> for the person's first name, <code>{'{child}'}</code> for the child's name, and <code>{'{signature}'}</code> for who it's from.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void save(draft)}
                  className="flex-1 rounded-xl bg-burgundy text-white px-5 py-3.5 text-base font-bold disabled:opacity-50"
                >
                  {busy === 'save' ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={async () => {
                    if (await post('settings', { settings: draft }, 'save')) {
                      const t = await post('test', { occasion: 'birthday' }, 'test');
                      if (t) {
                        const parts = ['Saved. A test greeting is in your Connect notifications (bell).'];
                        parts.push(t.phoneAlerts ? 'A phone alert was sent too.' : 'No phone alert: turn on alerts in Connect on your phone to get one.');
                        parts.push(t.emailed ? `The card was emailed to ${t.emailed} (check Promotions/Spam too).` : `The card was not emailed: ${t.emailError || 'unknown problem'}.`);
                        setNote({ ok: !t.emailError, text: parts.join(' ') });
                      }
                      await load();
                    }
                  }}
                  className="rounded-xl border border-slate-300 dark:border-slate-700 px-5 py-3.5 text-base font-semibold text-slate-700 dark:text-slate-200"
                >
                  {busy === 'test' ? 'Sending…' : 'Save & send me a test'}
                </button>
              </div>
            </div>
          ) : null}

          {data.today.length === 0 ? (
            <p className="text-sm text-slate-500 mb-3">No birthdays or anniversaries today.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800 mb-3">
              {data.today.map((r) => (
                <li key={`${r.memberId}-${r.occasion}`} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 dark:text-white truncate">{r.name}</p>
                    <p className="text-xs text-slate-500">{occasionText(r)}</p>
                  </div>
                  <Reach r={r} />
                </li>
              ))}
            </ul>
          )}

          {!data.setupNeeded && data.today.some((r) => !r.greeted && r.reach !== 'none') ? (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void sendNow()}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-burgundy text-white px-5 py-3.5 text-base font-bold disabled:opacity-50 mb-3"
            >
              <Send className="w-4 h-4" />
              {busy === 'send' ? 'Sending…' : "Send today's greetings now"}
            </button>
          ) : null}

          {data.upcoming.length > 0 ? (
            <details className="group">
              <summary className="cursor-pointer text-sm font-bold text-burgundy dark:text-gold">
                Coming up this week ({data.upcoming.length})
              </summary>
              <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
                {data.upcoming.map((r) => (
                  <li key={`${r.memberId}-${r.occasion}`} className="py-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 dark:text-white truncate">{r.name}</p>
                      <p className="text-xs text-slate-500">{occasionText(r)} · {whenText(r.daysAway)}</p>
                    </div>
                    <Reach r={r} />
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          {note ? (
            <p role="status" className={`mt-3 text-sm font-semibold ${note.ok ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
              {note.text}
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
};

export default CelebrationsCard;
