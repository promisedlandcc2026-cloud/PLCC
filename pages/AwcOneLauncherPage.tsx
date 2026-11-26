import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNav } from '../lib/NavContext';
import { Section } from '../types';
import { BIBLE_URL, SANCTUM_URL, firstNameOf, signedInAppUrl, takePendingApp, type AwcOneAppId } from '../lib/awcOne';
import { authedFetch } from '../lib/authedFetch';
import { BookOpen, CalendarDays, Flag, Globe2, HandHeart, Headphones, Heart, HelpCircle, Home, ShieldAlert, UserPlus, Users } from 'lucide-react';
import { Role } from '../types';
import { openReport } from '../lib/report';
import { ReportHost } from '../components/common/ReportModal';
import { PLCC_CREAM, PlccFooter } from '../components/awcone/PlccOneShell';
import { hasPermission } from '../lib/permissions';
import { PlccHomeExtras } from '../components/awcone/PlccHomeExtras';
import {
  BibleFeature,
  CANAAN,
  CanaanFeature,
  FIRSTFRUITS,
  JORDAN,
  NextGathering,
  PlccAppList,
  PlccDesktopBar,
  PlccHero,
  PlccMobileBar,
  PlccMobileDrawer,
  PlccQuickActions,
  PlccSidebar,
  SANCTUM,
  SanctumFeature,
  TRIBES,
  type NavItem,
  type QuickAction,
  type SearchItem,
} from '../components/awcone/PlccOneHome';

/** Roles that moderate every Ka Link (mirrors BROAD_CHAT_ADMIN_ROLES on the server). */
const LEADER_ROLES = new Set<string>(['SUPER_ADMIN', 'PASTOR', 'ADMIN', 'ADMIN_STAFF', 'FIRST_LADY', 'SECRETARY', 'ASST_SECRETARY']);

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
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const open = async (id: AwcOneAppId, nextPath?: string) => {
    if (busyId) return;
    setNote('');
    if (id === 'vault') {
      setActiveSection(Section.Dashboard);
      navigate('/dashboard');
      return;
    }
    if (id === 'sanctum') {
      // Moderator Control Room (served by PLCC Sanctum) opens in its own tab so PLCC ONE stays open.
      // Sanctum has its own sign-in, so there's no handoff to wait for (and no popup blocker).
      // (No 'noopener' flag: with it, window.open always returns null and we couldn't tell a block.)
      const tab = window.open(SANCTUM_URL, '_blank');
      if (tab) tab.opener = null;
      else window.location.assign(SANCTUM_URL);
      return;
    }
    setBusyId(id);
    try {
      const url = await signedInAppUrl(id, isAuthenticated, nextPath);
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

  // Unread Ka Link messages on the Chat tile (same read marks Ka Link uses).
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

  // Sanctum (overflow Room Schedule) is for moderators only (Nov 25 2026).
  const [modRight, setModRight] = useState(false);
  const [canAdmit, setCanAdmit] = useState(false);
  useEffect(() => {
    if (!isAuthenticated) return;
    let alive = true;
    authedFetch('/api/vault?resource=community&subResource=my-ka-link-rights')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive) return;
        setModRight(d?.moderator === true);
        setCanAdmit(d?.admissions === true);
      })
      .catch(() => undefined);
    return () => { alive = false; };
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

  const role = userRole as Role;
  const isStaff = !MEMBER_ROLES.has(String(userRole || ''));
  /** Same check the router uses, so nothing here offers a page the user can't open. */
  const can = (path: string) => hasPermission(role, undefined, path);
  const canCanaan = can('/dashboard');
  const go = (path: string) => {
    if (path === '/dashboard') setActiveSection(Section.Dashboard);
    navigate(path);
  };

  // Church leaders always moderate (same list Ka Link uses); others need the Ka Link "Mod" right.
  const isModerator = modRight || LEADER_ROLES.has(String(userRole || '').toUpperCase());
  const sanctumTile = isModerator ? [SANCTUM] : [];
  const listApps = isStaff
    ? [JORDAN, TRIBES, ...sanctumTile, FIRSTFRUITS]
    : [JORDAN, TRIBES, ...sanctumTile, FIRSTFRUITS, ...(canCanaan ? [{ ...CANAAN, tags: 'My church account' }] : [])];

  const quick: QuickAction[] = [
    ...(can('/events/overview') ? [{ label: 'View Calendar', Icon: CalendarDays, run: () => go('/events/overview') }] : []),
    ...(can('/community/prayer-wall') ? [{ label: 'Prayer Wall', Icon: Heart, run: () => go('/community/prayer-wall') }] : []),
    ...(canAdmit || role === Role.SUPER_ADMIN ? [{ label: 'Admit new members', Icon: UserPlus, run: () => navigate('/admit-members') }] : []),
    { label: 'Find a Group', Icon: Users, run: () => void open('connect') },
    { label: 'Get Support', Icon: Headphones, run: () => openReport({ kind: 'problem' }) },
  ];

  const searchItems: SearchItem[] = [
    ...[JORDAN, TRIBES, ...sanctumTile, FIRSTFRUITS]
      .map((a) => ({ label: a.name, hint: a.soon ? `${a.tags} • Coming soon` : a.tags, run: () => void open(a.id) })),
    ...(canCanaan ? [{ label: 'Canaan', hint: 'Church administration', run: () => go('/dashboard') }] : []),
    ...quick.map((q) => ({ label: q.label, hint: 'Quick action', run: q.run })),
    { label: 'Bible', hint: 'Read the Word in Luganda, Kiswahili, English and more', run: () => window.open(BIBLE_URL, '_blank', 'noopener') },
    ...(can('/giving') ? [{ label: 'Giving', hint: 'Give and tithe: MTN, Airtel, Sendwave', run: () => go('/giving') }] : []),
    ...(can('/notifications') ? [{ label: 'Notifications', hint: 'Alerts and messages', run: () => go('/notifications') }] : []),
    { label: 'Report a problem', hint: 'Something not working in an app', run: () => openReport({ kind: 'problem' }) },
    { label: 'Report a safety concern', hint: 'Harassment, scams, impersonation', run: () => openReport({ kind: 'safety' }) },
    ...(can('/help/member-setup') ? [{ label: 'Help', hint: 'Member setup and how-to videos', run: () => go('/help/member-setup') }] : []),
  ];

  const sideNav: NavItem[] = [
    { label: 'Home', Icon: Home, active: true, onClick: () => window.scrollTo({ top: 0, behavior: 'smooth' }) },
    { label: 'Community', Icon: Users, onClick: () => void open('connect') },
    // Live prayer happens in Ka Link's Live Huddles; PLCC Sanctum is the overflow room (its own tile).
    { label: 'Live prayer', Icon: Globe2, onClick: () => void open('chat', '/live') },
    { label: 'Bible', Icon: BookOpen, onClick: () => window.open(BIBLE_URL, '_blank', 'noopener') },
    ...(can('/giving') ? [{ label: 'Giving', Icon: HandHeart, onClick: () => go('/giving') }] : []),
    ...(can('/help/member-setup')
      ? [{ label: 'Help & Support', Icon: HelpCircle, onClick: () => go('/help/member-setup') }]
      : []),
    { label: 'Report a Problem', Icon: Flag, onClick: () => openReport({ kind: 'problem' }) },
    { label: 'Report a Concern', Icon: ShieldAlert, onClick: () => openReport({ kind: 'safety' }) },
  ];

  const displayName = userName || first;

  return (
    <div className="min-h-screen lg:flex font-inter overflow-x-clip" style={{ background: PLCC_CREAM, color: '#16251f' }}>
      <PlccSidebar items={sideNav} />
      <PlccMobileDrawer open={menuOpen} onClose={closeMenu} items={sideNav} />
      <div className="flex-1 min-w-0 flex flex-col min-h-screen">
        <PlccMobileBar name={displayName} onMenu={() => setMenuOpen(true)} onSignOut={logout} />
        <PlccDesktopBar name={displayName} items={searchItems} onSignOut={logout} />
        <PlccHero />
        <main className="relative z-10 flex-1 mx-auto w-full max-w-[1180px] 2xl:max-w-[1320px] px-4 sm:px-8 lg:px-10 pt-2 pb-8 lg:-mt-6 space-y-5">
          <div className="grid gap-5 xl:grid-cols-[1.42fr_1fr] xl:items-stretch">
            <div className="space-y-5">
              {isStaff && canCanaan ? (
                <CanaanFeature onOpen={() => setActiveSection(Section.Dashboard)} />
              ) : (
                // Members join live prayer in Ka Link; a full room moves them to the overflow automatically.
                <SanctumFeature onOpen={() => void open('chat', '/live')} busy={busyId === 'chat'} />
              )}
              <NextGathering enabled={isAuthenticated} />
            </div>
            <PlccAppList apps={listApps} onOpen={(id) => void open(id)} busyId={busyId} badges={{ chat: chatUnread }} />
          </div>
          {note ? (
            <p role="alert" className="text-center text-sm font-bold text-red-700">{note}</p>
          ) : null}
          <BibleFeature href={BIBLE_URL} />
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
