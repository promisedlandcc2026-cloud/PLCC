import React, { useCallback, useEffect, useState } from 'react';
import { Camera, Loader2, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useNav } from '../../lib/NavContext';
import { getAuthHeaders, parseApiJson } from '../../lib/api';

/** Bump when notice copy changes materially so members re-acknowledge. */
export const MEDIA_NOTICE_VERSION = 'awc-media-notice-v1';

const SESSION_DISMISS_KEY = 'awc_media_notice_dismissed';

type MediaNoticePrefs = {
  acknowledgedAt?: string;
  version?: string;
};

/**
 * Congregation photography / media acknowledgment.
 * Acknowledge persists on the user; Deny / dismiss is session-only and reappears next login.
 */
const MediaNoticeModal: React.FC = () => {
  const { userId, userRole, isAuthenticated, authReady, login } = useNav();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [existingPrefs, setExistingPrefs] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);

  const role = String(userRole || '').toUpperCase();
  const isKiosk = role === 'KIOSK';

  const evaluate = useCallback(async () => {
    if (!authReady || !isAuthenticated || !userId || isKiosk) {
      setOpen(false);
      return;
    }
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(SESSION_DISMISS_KEY) === '1') {
      setOpen(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/vault?resource=users&self=true', { headers });
      const data = await parseApiJson<{ users?: any[] }>(res);
      const dbUser = data?.users?.[0];
      if (!dbUser?.id || String(dbUser.id) !== userId) {
        setOpen(false);
        return;
      }

      const prefs = (dbUser.notification_prefs && typeof dbUser.notification_prefs === 'object'
        ? dbUser.notification_prefs
        : {}) as Record<string, unknown>;
      setExistingPrefs(prefs);

      const media = (prefs.mediaNotice || {}) as MediaNoticePrefs;
      const onboarded = !!(prefs.onboarding as any)?.completedAt || !!(prefs.onboarding as any)?.path;
      const pending = String(dbUser.role || role || '').toUpperCase() === 'PENDING';

      // Wait until they are past onboarding / not stuck PENDING
      if (pending && !onboarded) {
        setOpen(false);
        return;
      }

      const acknowledged =
        !!media.acknowledgedAt &&
        (!media.version || media.version === MEDIA_NOTICE_VERSION);
      setOpen(!acknowledged);
    } catch {
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }, [authReady, isAuthenticated, userId, isKiosk, role]);

  useEffect(() => {
    void evaluate();
  }, [evaluate]);

  // Next sign-in in the same tab should re-prompt if they chose "Not now"
  useEffect(() => {
    if (!isAuthenticated) {
      try {
        sessionStorage.removeItem(SESSION_DISMISS_KEY);
      } catch {
        /* ignore */
      }
    }
  }, [isAuthenticated]);

  const dismissForSession = () => {
    try {
      sessionStorage.setItem(SESSION_DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  const acknowledge = async () => {
    if (!userId) return;
    setSaving(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const notification_prefs = {
        ...existingPrefs,
        mediaNotice: {
          acknowledgedAt: new Date().toISOString(),
          version: MEDIA_NOTICE_VERSION,
        },
      };
      const res = await fetch('/api/vault?resource=users', {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ id: userId, notification_prefs }),
      });
      const data = await parseApiJson<{ ok?: boolean; user?: any; error?: string }>(res);
      if (!res.ok) throw new Error(data?.error || `Could not save acknowledgment (${res.status})`);
      if (data?.user) login(data.user);
      try {
        sessionStorage.removeItem(SESSION_DISMISS_KEY);
      } catch {
        /* ignore */
      }
      setOpen(false);
    } catch (err: any) {
      setError(err?.message || 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!open || loading) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-[#0d1a14]/45 backdrop-blur-md animate-in fade-in duration-300"
      role="dialog"
      aria-modal="true"
      aria-labelledby="media-notice-title"
    >
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white rounded-[2rem] shadow-2xl border border-white/80 animate-in zoom-in-95 duration-300">
        <div className="h-1.5 bg-gradient-to-r from-burgundy via-gold to-burgundy" />

        <div className="p-6 md:p-8 space-y-5">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-burgundy/5 text-burgundy flex items-center justify-center shrink-0 border border-burgundy/10">
              <Camera size={22} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-burgundy/60 mb-1">
                Promised Land Christian Center
              </p>
              <h2 id="media-notice-title" className="text-xl md:text-2xl font-black text-[#0d1a14] tracking-tight leading-snug">
                Photography &amp; Media Notice
              </h2>
            </div>
          </div>

          <div className="rounded-2xl bg-amber-50/80 border border-amber-100 px-4 py-3 text-sm text-amber-950 font-medium leading-relaxed">
            By attending PLCC services and events on church premises, you acknowledge that Promised Land
            Christian Center may photograph or record during or after worship for ministry, outreach,
            and communication purposes. This may include children in public areas of the campus.
          </div>

          <div className="space-y-3 text-sm text-gray-600 font-medium leading-relaxed">
            <p>PLCC may use photographs and video for:</p>
            <ul className="list-disc pl-5 space-y-1.5 text-gray-500">
              <li>Church website and social media ministry outreach</li>
              <li>Internal newsletters and bulletins</li>
              <li>Event recaps and promotional materials</li>
              <li>Archival and historical documentation</li>
            </ul>
            <p>
              Published photos of children require appropriate parental consent under PLCC policy.
              Photography in children&apos;s ministry rooms is restricted to authorized media staff.
            </p>
            <p>
              If you or your family prefer not to appear in church photography, please submit a
              written opt-out request to the Church Office or contact the Administrator / Secretary
              at the front desk. Your preference will be noted in PLCC Canaan member record and shared
              with the Media Team.
            </p>
            <p className="text-xs text-gray-400">
              Full policy:{' '}
              <Link to="/admin/policies" className="text-burgundy font-semibold hover:underline">
                Photography &amp; Media Policy
              </Link>
            </p>
          </div>

          {error && (
            <p className="text-sm font-medium text-red-800 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-1">
            <button
              type="button"
              onClick={() => void acknowledge()}
              disabled={saving}
              className="flex-1 inline-flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-[#0d1a14] text-amber-100 text-sm font-bold hover:bg-[#14251d] transition-colors disabled:opacity-60"
            >
              {saving ? <Loader2 className="animate-spin" size={18} /> : <ShieldCheck size={18} />}
              I acknowledge
            </button>
            <button
              type="button"
              onClick={dismissForSession}
              disabled={saving}
              className="flex-1 py-3.5 px-4 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50 transition-colors disabled:opacity-60"
            >
              Not now
            </button>
          </div>
          <p className="text-[11px] text-center text-gray-400 font-medium">
            Choosing “Not now” closes this for the current visit. It will appear again the next time
            you sign in until you acknowledge.
          </p>
        </div>
      </div>
    </div>
  );
};

export default MediaNoticeModal;
