import React, { useEffect, useState } from 'react';
import { BellRing, Radio, CalendarClock, Send } from 'lucide-react';
import { useNav } from '../../App';
import { fetchWithTimeout, getAuthHeaders } from '../../lib/api';

const SEND_ROLES = new Set(['SUPER_ADMIN', 'PASTOR', 'MINISTRY_LEADER']);
const LIVE_URL = 'https://www.youtube.com/@plccgracelove/live';

type Preset = { key: string; label: string; icon: React.ReactNode; title: string; body: string; url: string; inbox: boolean };

const PRESETS: Preset[] = [
  {
    key: 'live',
    label: "We're live",
    icon: <Radio className="w-4 h-4" />,
    title: "We're live!",
    body: 'Service is streaming now. Tap to join us.',
    url: LIVE_URL,
    inbox: false,
  },
  {
    key: 'rsvp',
    label: 'RSVP reminder',
    icon: <CalendarClock className="w-4 h-4" />,
    title: 'Grand Family Celebration RSVP closes Friday',
    body: "Let us know you're coming. Tap to RSVP in PLCC Connect.",
    url: '/events',
    inbox: true,
  },
];

/**
 * Staff: send a phone alert to everyone who turned on alerts in PLCC Connect.
 * Pastor, Ministry Leader, and Super Admin only (the server checks too).
 */
const SendAlertCard: React.FC = () => {
  const { userRole } = useNav();
  const canSend = SEND_ROLES.has(String(userRole || '').toUpperCase());
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('');
  const [inbox, setInbox] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!canSend) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetchWithTimeout('/api/vault?resource=push&action=status', { headers: await getAuthHeaders() }, 8_000);
        const d = await res.json().catch(() => ({}));
        if (alive) setEnabled(Boolean(d?.enabled));
      } catch {
        if (alive) setEnabled(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [canSend]);

  if (!canSend || enabled === null) return null;

  const usePreset = (p: Preset) => {
    setTitle(p.title);
    setBody(p.body);
    setUrl(p.url);
    setInbox(p.inbox);
    setNote(null);
    setConfirming(false);
  };

  const send = async () => {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetchWithTimeout(
        '/api/vault?resource=push&action=broadcast',
        {
          method: 'POST',
          headers: await getAuthHeaders(),
          body: JSON.stringify({ title: title.trim(), body: body.trim(), url: url.trim(), saveToInbox: inbox }),
        },
        45_000
      );
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d?.ok) {
        setNote({ ok: false, text: d?.error || 'The alert could not be sent. Please try again.' });
        return;
      }
      setNote({
        ok: true,
        text: d.sent === 1 ? 'Sent to 1 phone.' : `Sent to ${d.sent} phones.`,
      });
      setTitle('');
      setBody('');
      setUrl('');
      setConfirming(false);
    } catch {
      setNote({ ok: false, text: 'The alert could not be sent. Please try again.' });
    } finally {
      setBusy(false);
    }
  };

  const field =
    'w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-3 text-base text-slate-900 dark:text-white';

  return (
    <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        <BellRing className="w-5 h-5 text-burgundy dark:text-gold" />
        <h2 className="text-lg font-black text-slate-900 dark:text-white">Send an alert</h2>
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
        Goes to the phone of everyone who turned on alerts in PLCC Connect. Vault News posts already send an alert on their own.
      </p>

      {!enabled ? (
        <p className="text-sm text-amber-700 dark:text-amber-300">
          Phone alerts are not set up yet. Add the VAPID keys in Vercel and run push_subscriptions.sql, then reload.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => usePreset(p)}
                className="inline-flex items-center gap-2 rounded-xl border-2 border-burgundy/30 dark:border-gold/40 px-4 py-2.5 text-sm font-bold text-burgundy dark:text-gold hover:bg-burgundy/5"
              >
                {p.icon}
                {p.label}
              </button>
            ))}
          </div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
            Title
            <input className={`${field} mt-1`} maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="We're live!" />
          </label>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
            Message
            <textarea className={`${field} mt-1`} rows={2} maxLength={180} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Service is streaming now. Tap to join us." />
          </label>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
            Opens when tapped (optional)
            <input className={`${field} mt-1`} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… or /events" />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <input type="checkbox" className="w-5 h-5" checked={inbox} onChange={(e) => setInbox(e.target.checked)} />
            Also keep it in members' notifications
          </label>

          {confirming ? (
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void send()}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-burgundy text-white px-5 py-3.5 text-base font-bold disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                {busy ? 'Sending…' : 'Yes, send to everyone'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirming(false)}
                className="rounded-xl border border-slate-300 dark:border-slate-700 px-5 py-3.5 text-base font-semibold text-slate-700 dark:text-slate-200"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={!title.trim()}
              onClick={() => setConfirming(true)}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-burgundy text-white px-5 py-3.5 text-base font-bold disabled:opacity-40"
            >
              <Send className="w-4 h-4" />
              Send alert
            </button>
          )}
          {note ? (
            <p role="status" className={`text-sm font-semibold ${note.ok ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
              {note.text}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
};

export default SendAlertCard;
