import React, { useState, useEffect, useRef } from 'react';
import { VaultSearch } from './VaultSearch';
import {
  Menu,
  ChevronDown,
  ChevronRight,
  LogOut,
  Lock,
  Sparkles,
  Bell,
  Loader2,
  User,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNav } from '../../App';
import AssistantDrawer from '../AI/AssistantDrawer';
import NotificationDrawer from '../Admin/NotificationDrawer';
import LegalModal from '../Modals/LegalModal';
import { fetchAuthorized } from '../../lib/api';
import { useVaultPoll } from '../../lib/useVaultPoll';

/** "SUPER_ADMIN" → "Super Admin", "FIRST_LADY" → "First Lady" (never show raw role codes). */
const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  ADMIN_STAFF: 'Admin Staff',
  PASTOR: 'Pastor',
  FIRST_LADY: 'First Lady',
  FINANCE: 'Finance',
  SECRETARY: 'Secretary',
  ASST_SECRETARY: 'Assistant Secretary',
  MINISTRY_LEADER: 'Ministry Leader',
  SUNDAY_SCHOOL_TEACHER: 'Sunday School Teacher',
  WORSHIP_TEAM: 'Worship Team',
  MEMBER: 'Member',
  GUEST: 'Guest',
};
export function friendlyRole(role: unknown): string {
  const raw = String(role || '').trim().toUpperCase();
  if (!raw) return 'Member';
  return (
    ROLE_LABELS[raw] ||
    raw
      .toLowerCase()
      .split('_')
      .filter(Boolean)
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join(' ')
  );
}

const Topbar: React.FC = () => {
  const {
    isSidebarOpen,
    setIsSidebarOpen,
    userRole,
    logout,
    userName,
    userId,
    isAuthenticated,
    askAdminOpen,
    openAskAdmin,
    closeAskAdmin,
    userEmail,
  } = useNav() as ReturnType<typeof useNav> & { userEmail?: string };
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Legal Modal State
  const [isLegalModalOpen, setIsLegalModalOpen] = useState(false);
  const [legalModalTab, setLegalModalTab] = useState<'privacy' | 'terms'>('privacy');
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const profileMenuRef = useRef<HTMLDivElement>(null);
  const loadUnreadRef = useRef<() => void>(() => {});
  const navigate = useNavigate();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) setIsProfileOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsProfileOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, []);

  // Stop notification polling and close drawer when auth is invalid.
  useEffect(() => {
    if (!isAuthenticated || !userId) {
      setUnreadCount(0);
      setIsNotificationOpen(false);
    }
  }, [isAuthenticated, userId]);

  // Key unread polling to active userId so Jerless → Sheevon cannot keep a stale badge.
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

  return (
    <header className="relative z-[110] w-full h-16 md:h-20 bg-white border-b border-gray-100 flex items-center px-4 md:px-8 shrink-0">
      <div className="flex items-center">
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="p-3 mr-3 text-gray-400 hover:bg-gray-50 hover:text-burgundy rounded-xl active:scale-90 transition-all min-h-[44px] min-w-[44px]"
          aria-label={isSidebarOpen ? 'Close menu' : 'Open menu'}
          aria-controls="app-sidebar"
          aria-expanded={isSidebarOpen}
        >
          <Menu size={24} />
        </button>

        <div className="flex items-center gap-2.5 md:gap-3 md:mr-4 lg:mr-10 cursor-pointer group active:scale-95 transition-all" onClick={() => navigate('/dashboard')}>
          <img
            src="/images/awc-logo.png"
            alt="Promised Land Christian Center"
            className="h-9 w-9 md:h-11 md:w-11 rounded-full object-contain shrink-0 ring-1 ring-[#1d372c]/10 bg-white shadow-sm"
            width={44}
            height={44}
            decoding="async"
          />
          <span className="font-black text-lg md:text-xl tracking-tighter text-[#0d1a14] whitespace-nowrap">
            PLCC <span className="text-burgundy">VAULT</span>
          </span>
        </div>
      </div>

      <VaultSearch />

      <div className="flex items-center space-x-2 md:space-x-4 ml-auto">
        <div className="relative z-[120]">
          <button
            type="button"
            data-notification-trigger="true"
            onClick={() => setIsNotificationOpen((open) => !open)}
            className="flex items-center justify-center w-11 h-11 md:w-12 md:h-12 rounded-2xl bg-white border border-gray-100 text-gray-400 hover:text-burgundy hover:bg-gray-50 transition-all active:scale-90 group relative"
            aria-label="Notifications"
            aria-haspopup="dialog"
            aria-expanded={isNotificationOpen}
          >
            <Bell size={20} />
            {unreadCount > 0 && (
              <span className="absolute top-3 right-3 w-2 h-2 bg-red-500 rounded-full border border-white" />
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
          onClick={() => openAskAdmin()}
          className="flex items-center justify-center w-11 h-11 md:w-auto md:px-5 md:h-12 rounded-2xl bg-burgundy/5 border border-burgundy/10 text-burgundy hover:bg-burgundy hover:text-gold transition-all active:scale-90 group"
          aria-label="Ask Admin"
        >
          <Sparkles size={20} className="text-gold group-hover:animate-pulse" />
          <span className="text-xs font-black uppercase tracking-widest ml-3 hidden md:inline">Ask Admin</span>
        </button>

        <div className="relative" ref={profileMenuRef}>
          <button
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            className="flex items-center p-1 rounded-2xl bg-burgundy text-white shadow-lg shadow-burgundy/20 active:scale-95 transition-all min-h-[44px] border-b-2 border-gold/40"
            aria-label="Account menu"
            aria-haspopup="menu"
            aria-expanded={isProfileOpen}
          >
            <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-white/10 flex items-center justify-center text-gold font-black">
              {userName.charAt(0)}
            </div>
            <ChevronDown size={14} className="mx-2 text-gold opacity-60 hidden sm:block" />
          </button>

          {isProfileOpen && (
            <>
              {/* Phone: dim the page; tap outside closes (desktop uses the outside-click handler) */}
              <div
                className="sm:hidden fixed inset-0 z-[140] bg-black/30 animate-in fade-in duration-200"
                aria-hidden
                onClick={() => setIsProfileOpen(false)}
              />
              <div
                role="menu"
                aria-label="Account"
                className={[
                  // Phone: bottom sheet
                  'fixed inset-x-0 bottom-0 z-[150] rounded-t-3xl pb-[max(1rem,env(safe-area-inset-bottom))] animate-in slide-in-from-bottom duration-200',
                  // Desktop: compact dropdown
                  'sm:absolute sm:inset-x-auto sm:bottom-auto sm:top-full sm:right-0 sm:mt-3 sm:w-[320px] sm:rounded-2xl sm:pb-0 sm:animate-in sm:fade-in sm:zoom-in-95',
                  'bg-white border border-gray-100 shadow-[0_20px_60px_rgba(0,0,0,0.15)] overflow-hidden',
                ].join(' ')}
              >
                <div className="sm:hidden flex justify-center pt-2.5" aria-hidden>
                  <span className="h-1.5 w-10 rounded-full bg-gray-200" />
                </div>

                {/* Who's signed in */}
                <div className="flex items-center gap-3.5 px-5 pt-4 pb-4 sm:pt-5">
                  <div className="w-12 h-12 shrink-0 rounded-2xl bg-burgundy flex items-center justify-center text-gold font-bold text-lg">
                    {userName.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-[#0d1a14] leading-tight truncate">{userName}</p>
                    <p className="text-sm text-gray-500 mt-0.5">{friendlyRole(userRole)}</p>
                    {userEmail ? <p className="text-xs text-gray-400 mt-0.5 truncate">{userEmail}</p> : null}
                  </div>
                </div>

                <div className="h-px bg-gray-100" />

                <div className="p-2">
                  {[
                    { label: 'My profile', icon: User, to: '/church-profile' },
                    { label: 'Account & security', icon: Lock, to: '/settings/user' },
                  ].map(({ label, icon: Icon, to }) => (
                    <button
                      key={to}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        navigate(to);
                        setIsProfileOpen(false);
                      }}
                      className="w-full flex items-center gap-3.5 min-h-[52px] px-3 rounded-xl text-left hover:bg-gray-50 active:bg-gray-100 transition-colors"
                    >
                      <Icon size={20} className="text-gray-500 shrink-0" aria-hidden />
                      <span className="flex-1 text-[15px] font-medium text-gray-800">{label}</span>
                      <ChevronRight size={18} className="text-gray-300" aria-hidden />
                    </button>
                  ))}
                </div>

                <div className="h-px bg-gray-100" />

                <div className="p-2">
                  <button
                    type="button"
                    role="menuitem"
                    disabled={isLoggingOut}
                    onClick={() => {
                      if (isLoggingOut) return;
                      setIsLoggingOut(true);
                      setIsProfileOpen(false);
                      logout();
                    }}
                    className="w-full flex items-center gap-3.5 min-h-[52px] px-3 rounded-xl text-left text-gray-800 hover:bg-red-50 hover:text-red-700 active:bg-red-100 transition-colors disabled:opacity-60"
                  >
                    {isLoggingOut ? (
                      <Loader2 size={20} className="animate-spin shrink-0" aria-hidden />
                    ) : (
                      <LogOut size={20} className="shrink-0 text-gray-500" aria-hidden />
                    )}
                    <span className="text-[15px] font-medium">{isLoggingOut ? 'Signing out…' : 'Sign out'}</span>
                  </button>
                </div>

                <div className="flex items-center justify-center gap-2 px-5 pb-3.5 pt-1 text-xs text-gray-400">
                  <button
                    type="button"
                    onClick={() => {
                      setLegalModalTab('privacy');
                      setIsLegalModalOpen(true);
                      setIsProfileOpen(false);
                    }}
                    className="px-1.5 py-1.5 hover:text-burgundy hover:underline underline-offset-2"
                  >
                    Privacy
                  </button>
                  <span aria-hidden>·</span>
                  <button
                    type="button"
                    onClick={() => {
                      setLegalModalTab('terms');
                      setIsLegalModalOpen(true);
                      setIsProfileOpen(false);
                    }}
                    className="px-1.5 py-1.5 hover:text-burgundy hover:underline underline-offset-2"
                  >
                    Terms
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      <AssistantDrawer isOpen={askAdminOpen} onClose={closeAskAdmin} />
      <LegalModal
        isOpen={isLegalModalOpen}
        onClose={() => setIsLegalModalOpen(false)}
        initialTab={legalModalTab}
      />
    </header>
  );
};

export default Topbar;