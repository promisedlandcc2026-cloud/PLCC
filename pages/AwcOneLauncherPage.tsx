import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNav } from '../lib/NavContext';
import { Section } from '../types';
import { firstNameOf, signedInAppUrl, takePendingApp, type AwcOneAppId } from '../lib/awcOne';
import { authedFetch } from '../lib/authedFetch';
import {
  PLCC_CREAM,
  PlccAppCards,
  PlccFooter,
  PlccTopBar,
  PlccWelcomeBanner,
} from '../components/awcone/PlccOneShell';
import { PlccHomeExtras } from '../components/awcone/PlccHomeExtras';

/**
 * PLCC ONE launcher — the home screen after signing in.
 * Every member and staff role sees all four apps; the Vault opens in place,
 * the others open signed in through the one sign-on handoff.
 */
const AwcOneLauncherPage: React.FC = () => {
  const { userName, isAuthenticated, setActiveSection, logout } = useNav();
  const navigate = useNavigate();
  const [busyId, setBusyId] = useState<AwcOneAppId | null>(null);
  const [note, setNote] = useState('');
  const first = firstNameOf(userName);

  const open = async (id: AwcOneAppId) => {
    if (busyId) return;
    setNote('');
    if (id === 'vault') {
      setActiveSection(Section.Dashboard);
      navigate('/dashboard');
      return;
    }
    setBusyId(id);
    try {
      const url = await signedInAppUrl(id, isAuthenticated);
      window.location.assign(url);
      // If the browser stays on this page (blocked or slow), don't spin forever.
      window.setTimeout(() => setBusyId(null), 8000);
    } catch {
      setBusyId(null);
      setNote('That app did not open. Please try again.');
    }
  };

  // Coming back (Back button / swipe) can restore this page from the browser's cache
  // with the tile still spinning. Clear it whenever the page is shown again.
  useEffect(() => {
    const reset = () => setBusyId(null);
    const onShow = (e: PageTransitionEvent) => { if (e.persisted) reset(); };
    const onVisible = () => { if (document.visibilityState === 'visible') reset(); };
    window.addEventListener('pageshow', onShow);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('pageshow', onShow);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // Unread PLCC Chat messages on the Chat tile (same read marks PLCC Chat uses).
  const [chatUnread, setChatUnread] = useState(0);
  useEffect(() => {
    if (!isAuthenticated) return;
    let alive = true;
    const load = () =>
      authedFetch('/api/vault?resource=community&subResource=unread-count')
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (alive && d) setChatUnread(Math.max(0, Number(d.count) || 0));
        })
        .catch(() => undefined);
    void load();
    const t = window.setInterval(load, 60_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isAuthenticated]);

  // A tile tapped before signing in opens now.
  const pendingChecked = useRef(false);
  useEffect(() => {
    try { document.body.scrollTo(0, 0); window.scrollTo(0, 0); } catch { /* old browsers */ }
  }, []);
  useEffect(() => {
    if (pendingChecked.current || !isAuthenticated) return;
    pendingChecked.current = true;
    const pending = takePendingApp();
    if (pending) void open(pending);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  return (
    <div className="min-h-screen flex flex-col font-inter" style={{ background: PLCC_CREAM, color: '#16251f' }}>
      <PlccTopBar name={userName || first} onSignOut={logout} />
      <main className="flex-1 mx-auto w-full max-w-6xl px-4 sm:px-8 py-6 sm:py-10">
        <PlccWelcomeBanner first={first} />
        <h2 className="mt-10 mb-4 text-2xl font-semibold text-[#16251f]" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>
          Your apps
        </h2>
        <PlccAppCards onOpen={open} busyId={busyId} badges={{ chat: chatUnread }} />
        {note ? (
          <p role="alert" className="mt-4 text-center text-sm font-bold text-red-700">{note}</p>
        ) : null}
        <PlccHomeExtras enabled={isAuthenticated} />
      </main>
      <PlccFooter onSignOut={logout} />
    </div>
  );
};

export default AwcOneLauncherPage;
