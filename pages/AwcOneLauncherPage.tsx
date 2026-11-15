import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNav } from '../lib/NavContext';
import { Section } from '../types';
import { firstNameOf, signedInAppUrl, takePendingApp, type AwcOneAppId } from '../lib/awcOne';
import { authedFetch } from '../lib/authedFetch';
import { CalendarDays, Globe2, HandHeart, Headphones, Heart, HelpCircle, Home, Users } from 'lucide-react';
import { Role } from '../types';
import { openReport } from '../lib/report';
import { ReportHost } from '../components/common/ReportModal';
import { PLCC_CREAM, PlccFooter, PlccTopBar } from '../components/awcone/PlccOneShell';
import { PlccHomeExtras } from '../components/awcone/PlccHomeExtras';
import {
  CANAAN,
  CanaanFeature,
  FIRSTFRUITS,
  JORDAN,
  NextGathering,
  PlccAppList,
  PlccDesktopBar,
  PlccHero,
  PlccQuickActions,
  PlccSidebar,
  SANCTUM,
  SanctumFeature,
  TRIBES,
  type QuickAction,
  type SearchItem,
} from '../components/awcone/PlccOneHome';

/** Member-side roles: they get the prayer rooms as the featured card instead of Canaan. */
const MEMBER_ROLES = new Set<string>([
  Role.GUEST, Role.MEMBER, Role.PARENT, Role.TEACHER, Role.YOUTH, Role.PENDING, Role.USER,
]);

/**
 * PLCC ONE launcher — the home screen after signing in.
 * Staff see Canaan (church administration) as the featured card; members see
 * the Sanctum prayer rooms there and Canaan in the app list. Canaan opens in
 * place; the others open signed in through the one sign-on handoff.
 */
const AwcOneLauncherPage: React.FC = () => {
  const { userName, userRole, isAuthenticated, setActiveSection, logout } = useNav();
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

  // Unread Jordan messages on the Chat tile (same read marks Jordan uses).
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

  const isStaff = !MEMBER_ROLES.has(String(userRole || ''));
  const listApps = isStaff ? [JORDAN, TRIBES, SANCTUM, FIRSTFRUITS] : [JORDAN, TRIBES, FIRSTFRUITS, { ...CANAAN, tags: 'My church account' }];

  const quick: QuickAction[] = [
    { label: 'View Calendar', Icon: CalendarDays, run: () => navigate('/events/overview') },
    { label: 'Prayer Wall', Icon: Heart, run: () => navigate('/community/prayer-wall') },
    { label: 'Find a Group', Icon: Users, run: () => void open('connect') },
    { label: 'Get Support', Icon: Headphones, run: () => openReport({ kind: 'problem' }) },
  ];

  const searchItems: SearchItem[] = [
    ...[JORDAN, TRIBES, SANCTUM, FIRSTFRUITS, CANAAN].map((a) => ({
      label: a.name,
      hint: a.tags,
      run: () => void open(a.id),
    })),
    ...quick.map((q) => ({ label: q.label, hint: 'Quick action', run: q.run })),
    { label: 'Giving', hint: 'Give, tithe, MTN, Airtel, Sendwave', run: () => navigate('/giving') },
    { label: 'Notifications', hint: 'Alerts and messages', run: () => navigate('/notifications') },
    { label: 'Report a safety concern', hint: 'Harassment, scams, impersonation', run: () => openReport({ kind: 'safety' }) },
    { label: 'Help', hint: 'Member setup and how-to videos', run: () => navigate('/help/member-setup') },
  ];

  const sideNav = [
    { label: 'Home', Icon: Home, active: true, onClick: () => window.scrollTo({ top: 0, behavior: 'smooth' }) },
    { label: 'Community', Icon: Users, onClick: () => void open('connect') },
    { label: 'Prayer', Icon: Globe2, onClick: () => void open('sanctum') },
    { label: 'Giving', Icon: HandHeart, onClick: () => navigate('/giving') },
    { label: 'Help & Support', Icon: HelpCircle, onClick: () => navigate('/help/member-setup') },
  ];

  return (
    <div className="min-h-screen lg:flex font-inter" style={{ background: PLCC_CREAM, color: '#16251f' }}>
      <PlccSidebar items={sideNav} />
      <div className="flex-1 min-w-0 flex flex-col min-h-screen">
        <div className="lg:hidden">
          <PlccTopBar name={userName || first} onSignOut={logout} />
        </div>
        <PlccDesktopBar name={userName || first} items={searchItems} onSignOut={logout} />
        <main className="flex-1 mx-auto w-full max-w-[1180px] px-4 sm:px-8 py-5 sm:py-8 space-y-5">
          <PlccHero />
          <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr] items-start">
            <div className="space-y-5">
              {isStaff ? (
                <CanaanFeature onOpen={() => void open('vault')} busy={busyId === 'vault'} />
              ) : (
                <SanctumFeature onOpen={() => void open('sanctum')} busy={busyId === 'sanctum'} />
              )}
              <NextGathering enabled={isAuthenticated} />
            </div>
            <PlccAppList apps={listApps} onOpen={(id) => void open(id)} busyId={busyId} badges={{ chat: chatUnread }} />
          </div>
          {note ? (
            <p role="alert" className="text-center text-sm font-bold text-red-700">{note}</p>
          ) : null}
          <PlccQuickActions actions={quick} />
          <PlccHomeExtras enabled={isAuthenticated} />
        </main>
        <PlccFooter onSignOut={logout} />
      </div>
      <ReportHost />
    </div>
  );
};

export default AwcOneLauncherPage;
