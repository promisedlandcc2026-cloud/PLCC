import React, { useEffect } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import MobileBottomNav from './MobileBottomNav';
import MediaNoticeModal from '../Consent/MediaNoticeModal';
import { useNav } from '../../App';
import { useLocation } from 'react-router-dom';
import { Section } from '../../types';

function sectionFromPath(pathname: string): Section {
  if (pathname === '/' || pathname.startsWith('/dashboard')) return Section.Dashboard;
  if (
    pathname.startsWith('/members') ||
    pathname.startsWith('/households') ||
    pathname.startsWith('/teams') ||
    pathname.startsWith('/people') ||
    pathname.startsWith('/family')
  ) {
    return Section.People;
  }
  if (pathname.startsWith('/finance')) return Section.Finance;
  if (pathname.startsWith('/store/orders')) return Section.Finance;
  if (
    pathname.startsWith('/giving') ||
    pathname.startsWith('/transactions') ||
    pathname.startsWith('/bank-deposits') ||
    pathname.startsWith('/tax-documents') ||
    pathname.startsWith('/fund-management') ||
    pathname.startsWith('/pledge-campaigns') ||
    pathname.startsWith('/fundraisers') ||
    pathname.startsWith('/giving-form') ||
    pathname.startsWith('/text-giving')
  ) {
    return Section.Giving;
  }
  if (pathname.startsWith('/tags')) return Section.Tags;
  if (pathname.startsWith('/attendance')) return Section.Attendance;
  if (pathname.startsWith('/events')) return Section.Events;
  if (pathname.startsWith('/elements/forms') || pathname.startsWith('/forms')) return Section.Forms;
  if (pathname.startsWith('/admin/consent-management')) return Section.Events;
  if (pathname.startsWith('/follow-ups')) return Section.FollowUps;
  if (pathname.startsWith('/community')) return Section.Community;
  if (pathname.startsWith('/communication')) return Section.Communication;
  if (
    pathname.startsWith('/more') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/settings') ||
    pathname.startsWith('/reports')
  ) {
    return Section.More;
  }
  return Section.Dashboard;
}

const SIDEBAR_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
const SIDEBAR_MS = 380;

const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isSidebarOpen, setIsSidebarOpen, setActiveSection } = useNav();
  const location = useLocation();

  const isDashboard = location.pathname === '/dashboard' || location.pathname === '/';
  const isKioskMode = location.pathname === '/events/kids-kiosk';
  // Full-height pages manage their own layout; shell spacer would push them under the topbar.
  const isFullHeightPage =
    location.pathname === '/community/chat' ||
    location.pathname.startsWith('/community/chat/') ||
    location.pathname === '/community/video' ||
    location.pathname === '/community/sermons' ||
    location.pathname === '/community/worship-tools';

  useEffect(() => {
    setActiveSection(sectionFromPath(location.pathname));
  }, [location.pathname, setActiveSection]);

  // Open by default on desktop; sync only when crossing the breakpoint
  useEffect(() => {
    if (isKioskMode) {
      setIsSidebarOpen(false);
      return;
    }
    const mq = window.matchMedia('(min-width: 1024px)');
    const apply = (isDesktop: boolean) => setIsSidebarOpen(isDesktop);
    apply(mq.matches);
    const onChange = (e: MediaQueryListEvent) => apply(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [setIsSidebarOpen, isKioskMode]);

  // Escape closes the panel
  useEffect(() => {
    if (!isSidebarOpen || isKioskMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsSidebarOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isSidebarOpen, setIsSidebarOpen, isKioskMode]);

  // Lock body scroll while the mobile drawer is open
  useEffect(() => {
    const isMobile = window.innerWidth < 1024;
    if (isSidebarOpen && isMobile && !isKioskMode) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [isSidebarOpen, isKioskMode]);

  // True kiosk: no top bar, sidebar, or bottom nav — camera fills the screen
  if (isKioskMode) {
    return (
      <div className="h-[100dvh] w-full bg-[#1a0008] text-white overflow-hidden">
        {children}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-white text-gray-900 overflow-hidden">
      <MediaNoticeModal />
      <Topbar />

      <div className="flex flex-1 overflow-hidden relative">
        {/* Backdrop — stays mounted so fade-out animates */}
        <div
          aria-hidden={!isSidebarOpen}
          className={`
            fixed inset-0 z-[90] bg-burgundy/25 backdrop-blur-sm lg:hidden
            transition-opacity
            ${isSidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}
          `}
          style={{ transitionDuration: `${SIDEBAR_MS}ms`, transitionTimingFunction: SIDEBAR_EASE }}
          onClick={() => setIsSidebarOpen(false)}
        />

        {/* Sliding panel — sits below the topbar */}
        <aside
          id="app-sidebar"
          aria-hidden={!isSidebarOpen}
          className={`
            fixed left-0 z-[100] w-72 lg:w-64 max-w-[85vw]
            top-16 md:top-20 bottom-0
            bg-white border-r border-gray-100
            will-change-transform
            ${isSidebarOpen
              ? 'translate-x-0 shadow-[0_0_60px_rgba(13, 26, 20,0.12)]'
              : '-translate-x-full shadow-none pointer-events-none'}
          `}
          style={{
            transitionProperty: 'transform, box-shadow',
            transitionDuration: `${SIDEBAR_MS}ms`,
            transitionTimingFunction: SIDEBAR_EASE,
          }}
        >
          <Sidebar />
        </aside>

        {/* Desktop spacer so content slides with the panel */}
        <div
          aria-hidden
          className={`hidden lg:block shrink-0 h-full ${isSidebarOpen ? 'w-64' : 'w-0'}`}
          style={{
            transitionProperty: 'width',
            transitionDuration: `${SIDEBAR_MS}ms`,
            transitionTimingFunction: SIDEBAR_EASE,
          }}
        />

        <main
          className={`
            flex-1 flex flex-col min-w-0 min-h-0 h-full relative overflow-x-hidden
            ${isFullHeightPage ? 'overflow-hidden' : 'overflow-y-auto scrolling-touch'}
            ${isDashboard ? 'bg-white' : 'bg-[#F9F9F7]'}
          `}
        >
          <div
            className={`w-full flex flex-col min-h-0 ${
              isFullHeightPage ? 'flex-1 h-full overflow-hidden' : ''
            }`}
          >
            {children}
            {/*
              Explicit spacer (not padding) so flex / min-h-full page roots still
              leave scroll room under the last card above the floating mobile nav.
              Skip on full-height Chat/Video shells — they size to the content area.
            */}
            {!isFullHeightPage ? (
              <div
                className="lg:hidden w-full shrink-0"
                style={{ height: 'var(--awc-mobile-nav-clearance)' }}
                aria-hidden
              />
            ) : null}
          </div>
        </main>
      </div>

      <MobileBottomNav />
    </div>
  );
};

export default AppShell;
