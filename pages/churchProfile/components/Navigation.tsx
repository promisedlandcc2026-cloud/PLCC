import React, { useEffect, useRef, useState } from 'react';
import {
  Bell,
  Check,
  ChevronDown,
  Loader2,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  Sparkles,
  User,
} from 'lucide-react';
import { useNav } from '../../../lib/NavContext';
import { fetchAuthorized } from '../../../lib/api';
import { useVaultPoll } from '../../../lib/useVaultPoll';
import Sidebar from '../../../components/Layout/Sidebar';
import NotificationDrawer from '../../../components/Admin/NotificationDrawer';
import { useChurch } from '../context/ChurchContext';
import { isUnchangedSampleProfile } from '../lib/realProfiles';
import { AvatarDisplay } from './AvatarDisplay';
import { AskAdminDrawer } from './AskAdminDrawer';

const SIDEBAR_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
const SIDEBAR_MS = 380;

export const Navigation: React.FC = () => {
  const {
    currentUser,
    switchCurrentUser,
    members,
    navigateToMemberProfile,
    setIsEditProfileOpen,
    toggleMemberOnlineStatus,
    selfProfileState,
  } = useChurch();
  const { isSidebarOpen, setIsSidebarOpen, userId, isAuthenticated, logout } = useNav();

  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [isAskAdminOpen, setIsAskAdminOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const profileMenuRef = useRef<HTMLDivElement>(null);
  const loadUnreadRef = useRef<() => void>(() => {});
  const profileReady = selfProfileState === 'linked' && Boolean(currentUser);
  const initial = profileReady
    ? String(currentUser.preferredName || currentUser.fullName || 'A').charAt(0).toUpperCase()
    : 'A';

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (profileMenuRef.current && !profileMenuRef.current.contains(target)) setIsProfileOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !userId) {
      setUnreadCount(0);
      setIsNotificationOpen(false);
    }
  }, [isAuthenticated, userId]);

  const pollUserIdRef = useRef(userId);
  pollUserIdRef.current = userId;
  useEffect(() => {
    setUnreadCount(0);
  }, [userId]);

  const pollEnabled = Boolean(isAuthenticated && userId);
  const triggerUnread = useVaultPoll(
    async () => {
      const uid = userId;
      const res = await fetchAuthorized('/api/vault?resource=notifications');
      const data = await res.json().catch(() => ({}));
      if (pollUserIdRef.current !== uid) return;
      if (res.ok && data.ok) setUnreadCount(Number(data.unreadCount) || 0);
      else setUnreadCount(0);
    },
    { intervalMs: 60_000, enabled: pollEnabled, deps: [userId] }
  );
  loadUnreadRef.current = triggerUnread;

  useEffect(() => {
    if (!pollEnabled) return;
    window.addEventListener('focus', triggerUnread);
    return () => window.removeEventListener('focus', triggerUnread);
  }, [pollEnabled, triggerUnread]);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const apply = (isDesktop: boolean) => setIsSidebarOpen(isDesktop);
    apply(mq.matches);
    const onChange = (e: MediaQueryListEvent) => apply(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [setIsSidebarOpen]);

  useEffect(() => {
    if (!isSidebarOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsSidebarOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isSidebarOpen, setIsSidebarOpen]);

  useEffect(() => {
    const isMobile = window.innerWidth < 1024;
    if (!isSidebarOpen || !isMobile) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isSidebarOpen]);

  return (
    <>
      <header className="sticky top-0 z-[110] w-full h-16 md:h-20 bg-white border-b border-gray-100 flex items-center px-4 md:px-8 shrink-0">
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-3 mr-3 text-gray-400 hover:bg-gray-50 hover:text-burgundy rounded-xl active:scale-90 transition-all min-h-[44px] min-w-[44px]"
            aria-label={isSidebarOpen ? 'Close menu' : 'Open menu'}
            aria-controls="app-sidebar"
            aria-expanded={isSidebarOpen}
          >
            <Menu size={24} />
          </button>

          <button
            type="button"
            onClick={() => navigateToMemberProfile(currentUser.id)}
            className="flex items-center gap-2.5 md:gap-3 cursor-pointer group active:scale-95 transition-all"
          >
            <img
              src="/images/awc-logo.png"
              alt="Promised Land Christian Center"
              className="h-9 w-9 md:h-11 md:w-11 rounded-full object-contain shrink-0 ring-1 ring-burgundy/10 bg-white shadow-sm"
              width={44}
              height={44}
            />
            <span className="font-black text-lg md:text-xl tracking-tighter text-ink whitespace-nowrap">
              PLCC <span className="text-burgundy">VAULT</span>
            </span>
          </button>
        </div>

        <div className="flex-1" />

        <div className="flex items-center space-x-2 md:space-x-4 ml-auto">
          <div className="relative z-[120]">
            <button
              type="button"
              data-notification-trigger="true"
              onClick={() => {
                setIsNotificationOpen((open) => !open);
                setIsProfileOpen(false);
              }}
              className="flex items-center justify-center w-11 h-11 md:w-12 md:h-12 rounded-2xl bg-white border border-gray-100 text-gray-400 hover:text-burgundy hover:bg-gray-50 transition-all active:scale-90 relative"
              aria-label="Notifications"
              aria-expanded={isNotificationOpen}
            >
              <Bell size={20} />
              {unreadCount > 0 && (
                <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-red-500 rounded-full border border-white" />
              )}
            </button>
            <NotificationDrawer
              isOpen={isNotificationOpen}
              onClose={() => {
                setIsNotificationOpen(false);
                loadUnreadRef.current();
              }}
              onInboxChange={() => loadUnreadRef.current()}
              userId={userId}
            />
          </div>

          <button
            type="button"
            onClick={() => setIsAskAdminOpen(true)}
            className="flex items-center justify-center w-11 h-11 md:w-auto md:px-5 md:h-12 rounded-2xl bg-burgundy/5 border border-burgundy/10 text-burgundy hover:bg-burgundy hover:text-gold transition-all active:scale-90 group"
            aria-label="Ask Admin"
          >
            <Sparkles size={20} className="text-gold group-hover:animate-pulse" />
            <span className="text-xs font-black uppercase tracking-widest ml-3 hidden md:inline">Ask Admin</span>
          </button>

          <div className="relative" ref={profileMenuRef}>
            <button
              type="button"
              onClick={() => {
                setIsProfileOpen(!isProfileOpen);
                setIsNotificationOpen(false);
              }}
              className="flex items-center p-1 rounded-2xl bg-burgundy text-white shadow-lg shadow-burgundy/20 active:scale-95 transition-all min-h-[44px] border-b-2 border-gold/40"
              aria-label="Profile menu"
            >
              <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-white/10 flex items-center justify-center text-gold font-black">
                {initial}
              </div>
              <ChevronDown size={14} className="mx-2 text-gold opacity-60 hidden sm:block" />
            </button>

            {isProfileOpen && (
              <div className="absolute top-full right-0 mt-4 w-[300px] md:w-[380px] bg-white border border-gray-100 rounded-[2.5rem] shadow-[0_30px_100px_rgba(0,0,0,0.15)] p-6 z-[150]">
                <div className="flex items-center gap-4 px-2 mb-4">
                  <div className="w-14 h-14 rounded-2xl bg-burgundy flex items-center justify-center text-gold font-black text-xl shadow-lg border border-gold/20">
                    {initial}
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-lg font-black text-ink uppercase tracking-tight leading-none truncate">
                      {profileReady ? currentUser.fullName : 'Member'}
                    </h4>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1.5 flex items-center gap-2">
                      <ShieldCheck size={12} className="text-gold" />
                      {String(currentUser.role || 'MEMBER').replaceAll('_', ' ')}
                    </p>
                  </div>
                </div>

                <div className="h-px bg-gray-50 mx-2" />

                <div className="space-y-1 mt-3">
                  <button
                    type="button"
                    onClick={() => {
                      navigateToMemberProfile(currentUser.id);
                      setIsProfileOpen(false);
                    }}
                    className="w-full flex items-center text-left gap-4 p-4 rounded-2xl hover:bg-gold-cream transition-all group"
                  >
                    <div className="w-10 h-10 bg-white border border-gray-100 rounded-xl flex items-center justify-center text-gray-300 group-hover:text-gold shadow-sm">
                      <User size={20} />
                    </div>
                    <div>
                      <p className="text-[13px] font-black text-ink uppercase tracking-tight">My Profile</p>
                      <p className="text-[10px] text-gray-400 font-medium">Open your member profile</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditProfileOpen(true);
                      setIsProfileOpen(false);
                    }}
                    className="w-full flex items-center text-left gap-4 p-4 rounded-2xl hover:bg-burgundy/5 transition-all group"
                  >
                    <div className="w-10 h-10 bg-white border border-gray-100 rounded-xl flex items-center justify-center text-gray-300 group-hover:text-burgundy shadow-sm">
                      <Settings size={20} />
                    </div>
                    <div>
                      <p className="text-[13px] font-black text-ink uppercase tracking-tight">Edit Profile</p>
                      <p className="text-[10px] text-gray-400 font-medium">Update your details</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleMemberOnlineStatus(currentUser.id)}
                    className="w-full flex items-center justify-between text-left gap-4 p-4 rounded-2xl hover:bg-gray-50"
                  >
                    <div>
                      <p className="text-[13px] font-black text-ink uppercase tracking-tight">Status</p>
                      <p className="text-[10px] text-gray-400 font-medium">
                        {currentUser.isOnline ? 'You are online' : 'You are offline'}
                      </p>
                    </div>
                    <span
                      className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-lg ${
                        currentUser.isOnline ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {currentUser.isOnline ? 'Online' : 'Offline'}
                    </span>
                  </button>
                </div>

                {profileReady && (
                <>
                <div className="h-px bg-gray-50 mx-2 my-3" />

                <p className="px-2 text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
                  Switch profile
                </p>
                <div className="space-y-0.5 max-h-48 overflow-y-auto">
                  {members.filter((member) => !isUnchangedSampleProfile(member)).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        switchCurrentUser(m.id);
                        setIsProfileOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-xl flex items-center justify-between ${
                        m.id === currentUser.id
                          ? 'bg-burgundy/5 text-burgundy font-semibold'
                          : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <AvatarDisplay
                          name={m.fullName}
                          avatarUrl={m.avatarUrl}
                          size="xs"
                          showOnlineStatus
                          isOnline={m.isOnline}
                        />
                        <span className="truncate text-xs font-semibold">{m.fullName}</span>
                      </div>
                      {m.id === currentUser.id && <Check className="w-3.5 h-3.5 text-burgundy shrink-0" />}
                    </button>
                  ))}
                </div>
                </>
                )}

                <div className="h-px bg-gray-50 mx-2 my-3" />

                <button
                  type="button"
                  disabled={isLoggingOut}
                  onClick={() => {
                    if (isLoggingOut) return;
                    setIsLoggingOut(true);
                    setIsProfileOpen(false);
                    logout();
                  }}
                  className="w-full flex items-center gap-4 p-4 rounded-2xl hover:bg-red-50 text-red-600 transition-all group disabled:opacity-60"
                >
                  <div className="w-10 h-10 bg-white border border-red-100 rounded-xl flex items-center justify-center group-hover:bg-red-500 group-hover:text-white transition-all shadow-sm">
                    {isLoggingOut ? <Loader2 size={20} className="animate-spin" /> : <LogOut size={20} />}
                  </div>
                  <p className="text-[13px] font-black uppercase tracking-widest">
                    {isLoggingOut ? 'Signing out…' : 'Terminate Session'}
                  </p>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

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

      <AskAdminDrawer isOpen={isAskAdminOpen} onClose={() => setIsAskAdminOpen(false)} />
    </>
  );
};
