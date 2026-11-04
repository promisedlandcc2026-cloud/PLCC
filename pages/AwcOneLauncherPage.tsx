import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { HelpCircle, LogOut } from 'lucide-react';
import { useNav } from '../lib/NavContext';
import { Section } from '../types';
import { firstNameOf, signedInAppUrl, takePendingApp, type AwcOneAppId } from '../lib/awcOne';
import { authedFetch } from '../lib/authedFetch';
import {
  AwcOneBackground,
  AwcOneFooter,
  AwcOneHeader,
  AwcOneScene,
  AwcOneTiles,
} from '../components/awcone/AwcOneChrome';

/**
 * PLCC ONE launcher — the home screen after signing in.
 * Every member and staff role sees all five apps; the Vault opens in place,
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
    <AwcOneBackground>
      <main className="mx-auto w-full max-w-[1360px] px-4 sm:px-8 pt-6 md:pt-8 flex flex-col">
        <div className="md:grid md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] md:items-center md:gap-8">
          <AwcOneHeader />
          <div className="mt-2 -mx-4 sm:-mx-8 md:mx-0 md:mt-0 md:rounded-[24px] md:overflow-hidden md:border-2 md:border-[#E4C98F]/70 md:shadow-[0_0_22px_rgba(255,190,70,0.45)]">
            <AwcOneScene className="h-[210px] sm:h-[260px] md:h-[260px]" />
          </div>
        </div>

        <div className="mt-3 md:mt-10">
          <AwcOneTiles onOpen={open} busyId={busyId} badges={{ chat: chatUnread }} />
        </div>

        {note ? (
          <p role="alert" className="mt-4 text-center text-sm font-bold text-[#FFE08A]">{note}</p>
        ) : null}

        <div className="mt-5 md:mt-8 flex flex-col md:flex-row md:items-center gap-3 md:gap-5 rounded-[30px] border-2 border-[#E4C98F] bg-[rgba(40,2,10,0.55)] shadow-[0_0_14px_rgba(255,190,70,0.4)] px-4 py-3 md:px-7 md:py-5">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <span className="relative w-11 h-11 shrink-0 text-[#E4C98F]">
              <svg width="38" height="38" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <circle cx="12" cy="7.5" r="4" />
                <path d="M3.5 21c.7-4.4 4.1-7 8.5-7s7.8 2.6 8.5 7z" />
              </svg>
              <span className="absolute right-0 bottom-0 w-[18px] h-[18px] rounded-full bg-[#22A350] border-2 border-white flex items-center justify-center">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              </span>
            </span>
            <span className="flex flex-col min-w-0">
              <span className="text-base md:text-xl font-extrabold truncate">
                Signed in{first ? ` as ${first}` : ' as an PLCC Member'}
              </span>
              <span className="text-[13px] md:text-base text-[#F3E3D0]">One account across all PLCC applications.</span>
            </span>
          </div>
          <div className="grid grid-cols-2 md:flex gap-2 md:gap-3">
            <Link
              to="/help/member-setup"
              className="min-h-[48px] px-5 rounded-full border-2 border-[#E4C98F] flex items-center justify-center gap-2 font-extrabold text-white hover:bg-white/10"
            >
              <HelpCircle size={20} className="text-[#E4C98F]" aria-hidden /> Help
            </Link>
            <button
              type="button"
              onClick={logout}
              className="min-h-[48px] px-5 rounded-full border-2 border-white/30 flex items-center justify-center gap-2 font-extrabold text-white hover:bg-white/10"
            >
              <LogOut size={20} aria-hidden /> Sign out
            </button>
          </div>
        </div>

        <AwcOneFooter />
      </main>
    </AwcOneBackground>
  );
};

export default AwcOneLauncherPage;
