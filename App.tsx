import React, { createContext, useContext, useState, useMemo, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { AlertCircle, Home, Mail } from 'lucide-react';
import { Role, Section } from './types';
import { accountantHomePath, hasPermission, isAccountantRole, isKioskRole, kioskHomePath } from './lib/permissions';
import { supabase } from './lib/supabase';
import {
  clearAppAuthStorage,
  decideBootAuthFromSession,
  haltAuthPolling,
  hasRecoverableSession,
  isAuthLandingHash,
  isJwtAccessToken,
  mirrorAccessToken,
  registerUnrecoverableAuthHandler,
  resumeAuthPolling,
  signOutLocal,
} from './lib/authSession';
import {
  clearLocalUiPreview,
  enableLocalUiPreview,
  isLocalUiPreviewActive,
  LOCAL_UI_PREVIEW_PROFILE,
} from './lib/localUiPreview';
import RoleGate from './components/Auth/RoleGate';
import AppShell from './components/Layout/AppShell';
import DashboardPage from './pages/Dashboard';
import MembersPage from './pages/people/Members';
import ChurchProfilePage from './pages/churchProfile/App';
import HouseholdsPage from './pages/people/Households';
import TeamsPage from './pages/people/Teams';
import ImportPeoplePage from './pages/people/Import';
import ConnectCardsPage from './pages/people/ConnectCards';
import TeamApplicationsPage from './pages/people/TeamApplications';
import CardScannerPage from './pages/people/CardScanner';
import MyFamilyPage from './pages/family/MyFamily';
import FamilyHuddleJoinPage from './pages/family/FamilyHuddleJoin';
import KidsViewPage from './pages/family/KidsView';
import KidsBucksPage from './pages/events/KidsBucks';
import ArkScoresPage from './pages/events/ArkScores';
import AttendanceSessionsPage from './pages/attendance/AttendanceSessions';
import AttendanceSessionAttendancePage from './pages/attendance/AttendanceSessionAttendance';
import AttendanceDashboardPage from './pages/attendance/AttendanceDashboard';
import GivingInsightsPage from './pages/giving/Insights';
import TransactionsPage from './pages/giving/Transactions';
import BankDepositsPage from './pages/giving/BankDeposits';
import TaxDocumentsPage from './pages/giving/TaxDocuments';
import FundManagementPage from './pages/giving/FundManagement';
import FundraisersPage from './pages/giving/Fundraisers';
import GivingFormPage from './pages/giving/GivingForm';
import TextGivingPage from './pages/giving/TextGiving';
import GivingFormUrlPage from './pages/giving/GivingFormUrl';
import GiveOnlinePage from './pages/giving/GiveOnline';
import TagsManagerPage from './pages/tags/TagsManager';
import EventsOverview from './pages/events/Overview';
import EventsAttendees from './pages/events/Attendees';
import WhoCheckedInPage from './pages/events/WhoCheckedIn';
import EventsReports from './pages/events/Reports';
import EventsCheckIn from './pages/events/CheckIn';
import ScanInPage from './pages/ScanIn';
import PlanAVisit from './pages/people/PlanAVisit';
import KidsCheckInPage from './pages/events/KidsCheckIn';
import KidsKioskPage from './pages/events/KidsKiosk';
import KidsPlansPage from './pages/events/KidsPlans';
import FlyerSharePage from './pages/events/FlyerShare';
import DeskCheckInPage from './pages/events/DeskCheckIn';
import EventsAlerts from './pages/events/Alerts';
import EventsVolunteers from './pages/events/Volunteers';
import EventsServe from './pages/events/Serve';
import EventsSettings from './pages/events/Settings';
import FellowshipCookoutRsvp from './pages/events/FellowshipCookoutRsvp';
import CookoutRsvpsPage from './pages/events/CookoutRsvps';
import RsvpArchivePage from './pages/events/RsvpArchive';
import {
  MARRIEDS_DINNER_2026_EVENT_ID,
  THANKSGIVING_2026_EVENT_ID,
} from './api/_utils/fellowshipEventConfig';
import MemberSetupGuide from './pages/help/MemberSetupGuide';
import HowToVideosPage from './pages/help/HowToVideos';
import FormsManagerPage from './pages/forms/FormsManager';
import FormBuilderPage from './pages/forms/FormBuilder';
import PublicFormPage from './pages/forms/PublicForm';
import FormSubmissionsPage from './pages/forms/Submissions';
import FormExportsPage from './pages/forms/Exports';
import FollowUpTasksPage from './pages/followups/Tasks';
import FollowUpWorkflowsPage from './pages/followups/Workflows';
import FollowUpTemplatesPage from './pages/followups/Templates';
import VideoHubPage from './pages/community/VideoHub';
import PrayerWallPage from './pages/community/PrayerWall';
import PrayerWatchPage from './pages/community/PrayerWatch';
import WorshipToolsPage from './pages/community/WorshipTools';
import SermonManager from './pages/community/SermonManager';
import SermonNotesPage from './pages/community/SermonNotes';
import ChatPage from './pages/community/Chat';
import CommunityFeedPage from './pages/community/Feed';
import DMPage from './pages/community/DM';
import OpenAwcChat from './pages/community/OpenAwcChat';
import { CHAT_MOVED } from './lib/awcOne';
import GalleryPage from './pages/community/Gallery';
import CommunityVoicesPage from './pages/community/CommunityVoices';
import AdminUsersPage from './pages/admin/AdminUsers';
import VaultRepairPage from './pages/admin/VaultRepair';
import OrganizationSettingsPage from './pages/admin/OrganizationSettings';
import ReportsLibraryPage from './pages/admin/Reports';
import AuditLogPage from './pages/admin/AuditLog';
import SystemSettingsPage from './pages/admin/Settings';
import SecurityLogPage from './pages/admin/SecurityLog';
import PoliciesPage from './pages/admin/Policies';
import ServantKeeperIntegration from './pages/admin/ServantKeeperIntegration';
import ConsentManagement from './pages/admin/ConsentManagement';
import UserSettingsPage from './pages/settings/UserSettings';
import UserNotificationsPage from './pages/settings/UserNotifications';
import SettingsHub from './pages/settings/SettingsHub';
import ContactChurchPage from './pages/community/ContactChurch';
import LoginPortal from './pages/auth/LoginPortal';
import AwcOneLauncherPage from './pages/AwcOneLauncherPage';
import OnboardingProcess from './pages/auth/OnboardingProcess';
import Farewell from './pages/auth/Farewell';
import EmailCenterPage from './pages/communication/EmailCenter';
import AnnouncementsPage from './pages/communication/Announcements';
import DailyDevotionalsPage from './pages/community/DailyDevotionals';
import TreasuryLedgerPage from './pages/finance/Ledger';
import ExpenseTrackerPage from './pages/finance/ExpenseTracker';
import BudgetManagerPage from './pages/finance/BudgetManager';
import ActionQueuePage from './pages/finance/ActionQueue';
import CountingSessionPage from './pages/finance/CountingSession';
import StoreOrdersPage from './pages/store/StoreOrders';
import MinutesManagerPage from './pages/communication/MinutesManager';
import MinutesViewPage from './pages/communication/MinutesView';
import MorePage from './pages/More';

const DCB_URL = 'https://awc-digital-contribution-book.onrender.com/';

const RedirectToContributionBook: React.FC = () => {
  useEffect(() => {
    window.location.replace(DCB_URL);
  }, []);
  return (
    <div className="min-h-[40vh] flex items-center justify-center text-sm text-gray-500">
      Opening the Digital Contribution Book…
    </div>
  );
};

// Global Title Sync
const TitleManager = () => {
  const location = useLocation();
  useEffect(() => {
    const path = location.pathname.substring(1);
    if (!path || path === 'launcher' || path === 'login') {
      document.title = 'PLCC ONE';
      return;
    }
    const pageName = path.split('/').pop()?.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    document.title = `PLCC Vault | ${pageName}`;
  }, [location]);
  return null;
};

// --- NotFound Component ---
const NotFoundPage: React.FC = () => (
  <div className="min-h-[100dvh] bg-[#F9F9F7] flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-700">
    <div className="w-24 h-24 bg-burgundy/5 text-burgundy rounded-[2.5rem] flex items-center justify-center mb-8 shadow-inner border border-burgundy/10">
      <AlertCircle size={48} />
    </div>
    <div className="flex flex-col items-center mb-4">
      <span className="text-[10px] font-black text-gold uppercase tracking-[0.4em] mb-2">PLCC Admin Protocol</span>
      <h1 className="text-4xl font-black text-[#0d1a14] tracking-tighter">Route Not Found<span className="text-gold">.</span></h1>
    </div>
    <p className="text-gray-400 font-medium text-lg max-w-md mb-12 leading-relaxed">
      The system was unable to resolve the requested URL corridor.
    </p>
    <div className="flex flex-col sm:flex-row gap-4">
      <Link
        to="/dashboard"
        className="flex items-center justify-center gap-2 px-8 py-4 bg-burgundy text-gold font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl shadow-burgundy/20 hover:bg-burgundy-dark transition-all active:scale-95 border-b-4 border-gold/30"
      >
        <Home size={18} />
        Return to Dashboard
      </Link>
    </div>
  </div>
);

import { NavContext, NavContextType, useNav } from './lib/NavContext';
export { useNav };
export type { NavContextType };

const AuthBootScreen: React.FC = () => (
  <div
    className="min-h-screen flex items-center justify-center px-6"
    style={{ background: 'radial-gradient(140% 70% at 50% 35%, #213d30 0%, #182e24 45%, #0d1914 100%)' }}
  >
    <div className="text-center space-y-4">
      <img
        src="/images/awc-one/awc-one-seal.webp"
        alt="PLCC ONE"
        width={140}
        height={140}
        className="w-36 h-36 mx-auto drop-shadow-[0_8px_20px_rgba(0,0,0,0.5)]"
      />
      <div className="w-10 h-10 mx-auto rounded-full border-2 border-gold/30 border-t-gold animate-spin" aria-hidden />
      <p className="text-gold text-[11px] font-black uppercase tracking-[0.25em]">Checking sign-in…</p>
    </div>
  </div>
);

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, authReady, userRole } = useNav();
  const location = useLocation();

  if (!authReady) {
    return <AuthBootScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Path-level ACL (deep links cannot bypass Sidebar hiding)
  if (!hasPermission(userRole as Role, undefined, location.pathname)) {
    // Shared tablet: bounce denied routes to Kids Kiosk instead of a dead Access Denied page
    if (isKioskRole(userRole)) {
      return <Navigate to={kioskHomePath} replace />;
    }
    // Accountant: Fundraisers only
    if (isAccountantRole(userRole)) {
      return <Navigate to={accountantHomePath} replace />;
    }
    return (
      <AppShell>
        <RoleGate path={location.pathname}>{null}</RoleGate>
      </AppShell>
    );
  }

  return <>{children}</>;
};

const App: React.FC = () => {
  const [activeSection, setActiveSection] = useState<Section>(Section.Dashboard);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Do not treat stale awc_* keys as authenticated before live session reconciliation.
  const [userId, setUserId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<Role>(Role.PENDING);
  const [userBirthday, setUserBirthday] = useState('');
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userTitle, setUserTitle] = useState('');
  const [userAvatar, setUserAvatar] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [askAdminOpen, setAskAdminOpen] = useState(false);
  const [askAdminPrompt, setAskAdminPrompt] = useState<string | null>(null);

  const openAskAdmin = React.useCallback((prompt?: string) => {
    const trimmed = typeof prompt === 'string' ? prompt.trim() : '';
    setAskAdminPrompt(trimmed || null);
    setAskAdminOpen(true);
  }, []);

  const closeAskAdmin = React.useCallback(() => {
    setAskAdminOpen(false);
  }, []);

  const clearAskAdminPrompt = React.useCallback(() => {
    setAskAdminPrompt(null);
  }, []);

  const isBirthdayToday = useMemo(() => {
    try {
      if (!userBirthday) return false;
      const today = new Date();
      const bday = new Date(userBirthday);
      return today.getMonth() === bday.getMonth() && today.getDate() === bday.getDate();
    } catch { return false; }
  }, [userBirthday]);

  const clearLocalIdentity = React.useCallback(() => {
    clearAppAuthStorage();
    setIsAuthenticated(false);
    setUserId(null);
    setUserRole(Role.PENDING);
    setUserBirthday('');
    setUserName('');
    setUserEmail('');
    setUserTitle('');
    setUserAvatar('');
  }, []);

  const applyProfileFromLogin = React.useCallback((userData: any, sessionUserId: string) => {
    setUserId(sessionUserId);
    localStorage.setItem('awc_user_id', sessionUserId);

    if (userData?.name) {
      setUserName(userData.name);
      localStorage.setItem('awc_user_name', userData.name);
    } else {
      setUserName('');
      localStorage.removeItem('awc_user_name');
    }
    if (userData?.email) {
      setUserEmail(userData.email);
      localStorage.setItem('awc_user_email', userData.email);
    } else {
      setUserEmail('');
      localStorage.removeItem('awc_user_email');
    }
    if (userData?.role) {
      const normalizedRole = String(userData.role).toUpperCase() as Role;
      setUserRole(normalizedRole);
      localStorage.setItem('awc_user_role', normalizedRole);
    } else {
      setUserRole(Role.PENDING);
      localStorage.removeItem('awc_user_role');
    }
    if (userData?.title) {
      setUserTitle(userData.title);
      localStorage.setItem('awc_user_title', userData.title);
    } else {
      setUserTitle('');
      localStorage.removeItem('awc_user_title');
    }
    if (userData?.avatar_url) {
      setUserAvatar(userData.avatar_url);
      localStorage.setItem('awc_user_avatar', userData.avatar_url);
    } else {
      setUserAvatar('');
      localStorage.removeItem('awc_user_avatar');
    }
    if (userData?.birthday) {
      setUserBirthday(userData.birthday);
      localStorage.setItem('awc_user_birthday', userData.birthday);
    } else {
      setUserBirthday('');
      localStorage.removeItem('awc_user_birthday');
    }
  }, []);

  /**
   * Re-read role/profile from Vault users after Staff & Roles approval.
   * Cached awc_user_role alone stays PENDING until the next fresh login otherwise.
   */
  const refreshVaultProfileFromApi = React.useCallback(
    (accessToken: string, sessionUserId: string) => {
      void (async () => {
        try {
          const res = await fetch('/api/vault?resource=users&self=true', {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'x-user-id': sessionUserId,
            },
          });
          if (!res.ok) return;
          const data = await res.json();
          const dbUser = data?.users?.[0];
          if (!dbUser?.id || String(dbUser.id) !== sessionUserId) return;
          applyProfileFromLogin(
            {
              id: dbUser.id,
              email: dbUser.email,
              name: dbUser.name,
              role: dbUser.role,
              title: dbUser.title,
              avatar_url: dbUser.avatar_url,
              birthday: dbUser.birthday,
            },
            sessionUserId
          );
        } catch {
          /* keep mirrored cache on network failure */
        }
      })();
    },
    [applyProfileFromLogin]
  );

  const applyLocalUiPreview = React.useCallback(() => {
    enableLocalUiPreview();
    setIsAuthenticated(true);
    applyProfileFromLogin(LOCAL_UI_PREVIEW_PROFILE, LOCAL_UI_PREVIEW_PROFILE.id);
  }, [applyProfileFromLogin]);

  const hydrateFromSessionUser = React.useCallback((session: { access_token?: string; user?: any }) => {
    const decision = decideBootAuthFromSession(session);
    if (decision.authenticated === false) {
      clearLocalIdentity();
      return;
    }

    mirrorAccessToken(decision.accessToken);
    resumeAuthPolling();
    setIsAuthenticated(true);

    const sid = decision.userId;
    const cachedId = localStorage.getItem('awc_user_id');
    // Only reuse mirrored profile keys when they belong to this session user.
    if (cachedId && cachedId === sid) {
      setUserId(sid);
      setUserName(localStorage.getItem('awc_user_name') || '');
      setUserEmail(localStorage.getItem('awc_user_email') || session.user?.email || '');
      setUserRole((localStorage.getItem('awc_user_role') as Role) || Role.PENDING);
      setUserTitle(localStorage.getItem('awc_user_title') || '');
      setUserAvatar(localStorage.getItem('awc_user_avatar') || '');
      setUserBirthday(localStorage.getItem('awc_user_birthday') || '');
      refreshVaultProfileFromApi(decision.accessToken, sid);
      return;
    }

    // Different or missing cache — do not show a prior account's name/role.
    clearAppAuthStorage();
    mirrorAccessToken(decision.accessToken);
    const meta = session.user?.user_metadata || {};
    const nameFromMeta =
      meta.full_name ||
      meta.name ||
      [meta.first_name, meta.last_name].filter(Boolean).join(' ').trim() ||
      '';
    applyProfileFromLogin(
      {
        id: sid,
        email: session.user?.email || '',
        name: nameFromMeta,
        role: meta.role || Role.PENDING,
        title: meta.title || '',
        avatar_url: meta.avatar_url || '',
        birthday: meta.birthday || '',
      },
      sid
    );
    refreshVaultProfileFromApi(decision.accessToken, sid);
  }, [applyProfileFromLogin, clearLocalIdentity, refreshVaultProfileFromApi]);

  useEffect(() => {
    let cancelled = false;
    let markedReady = false;
    const markReady = () => {
      if (!cancelled && !markedReady) {
        markedReady = true;
        setAuthReady(true);
      }
    };

    registerUnrecoverableAuthHandler(() => {
      clearLocalIdentity();
    });

    if (!supabase) {
      if (isLocalUiPreviewActive()) {
        applyLocalUiPreview();
      } else {
        clearLocalIdentity();
      }
      markReady();
      return () => {
        cancelled = true;
        registerUnrecoverableAuthHandler(null);
      };
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === 'SIGNED_OUT' || (!session && event !== 'INITIAL_SESSION')) {
        haltAuthPolling();
        // Tab wake / multi-tab refresh races can emit a brief SIGNED_OUT even when
        // another tab (or recover) still has a valid session. Re-check before kick.
        void (async () => {
          await new Promise((r) => setTimeout(r, 450));
          if (cancelled) return;
          try {
            const { data } = await supabase.auth.getSession();
            if (hasRecoverableSession(data.session)) {
              clearLocalUiPreview();
              hydrateFromSessionUser(data.session!);
              markReady();
              return;
            }
          } catch {
            /* fall through to clear */
          }
          if (cancelled) return;
          if (isLocalUiPreviewActive()) {
            applyLocalUiPreview();
          } else {
            clearLocalIdentity();
            // Farewell (intentional logout) and login/help stay put.
            if (!isAuthLandingHash(window.location.hash)) {
              window.location.hash = '#/login';
            }
          }
          markReady();
        })();
        return;
      }
      if (
        event === 'SIGNED_IN' ||
        event === 'TOKEN_REFRESHED' ||
        event === 'USER_UPDATED' ||
        event === 'INITIAL_SESSION'
      ) {
        if (session && hasRecoverableSession(session)) {
          clearLocalUiPreview();
          if (event === 'TOKEN_REFRESHED' && session.access_token) {
            mirrorAccessToken(session.access_token);
          }
          hydrateFromSessionUser(session);
        } else if (event === 'INITIAL_SESSION') {
          if (isLocalUiPreviewActive()) applyLocalUiPreview();
          else {
            haltAuthPolling();
            clearLocalIdentity();
          }
        }
        markReady();
      }
    });

    // Boot reconciliation — live session is authoritative (stale awc_* ignored).
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        if (hasRecoverableSession(data.session)) {
          clearLocalUiPreview();
          hydrateFromSessionUser(data.session!);
        } else if (isLocalUiPreviewActive()) {
          applyLocalUiPreview();
        } else {
          // Re-check: user may have enabled preview while getSession was in flight.
          if (isLocalUiPreviewActive()) applyLocalUiPreview();
          else clearLocalIdentity();
        }
      } catch {
        if (!cancelled) {
          if (isLocalUiPreviewActive()) applyLocalUiPreview();
          else clearLocalIdentity();
        }
      } finally {
        markReady();
      }
    })();

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
      registerUnrecoverableAuthHandler(null);
    };
  }, [applyLocalUiPreview, clearLocalIdentity, hydrateFromSessionUser]);

  const login = (userData?: any) => {
    if (userData?.localPreview === true) {
      applyLocalUiPreview();
      return;
    }

    const tokenCandidate =
      (userData?.accessToken && isJwtAccessToken(userData.accessToken) && userData.accessToken) ||
      (isJwtAccessToken(localStorage.getItem('awc_auth_token')) && localStorage.getItem('awc_auth_token'));

    if (!tokenCandidate || !userData?.id) {
      console.warn('[auth] login ignored — requires live Supabase JWT + user id');
      return;
    }

    clearLocalUiPreview();
    mirrorAccessToken(String(tokenCandidate));
    resumeAuthPolling();
    setIsAuthenticated(true);
    applyProfileFromLogin(userData, String(userData.id));
  };

  const logout = () => {
    if (userName) localStorage.setItem('awc_last_user_name', userName);

    // Land on farewell before signOut so Chrome's in-flight 401 recovery cannot send us to #/login.
    window.location.hash = '#/farewell';
    haltAuthPolling();
    clearLocalUiPreview();
    clearLocalIdentity();

    // Local scope: Vault, Connect, and Chat share one Supabase project.
    void Promise.race([
      signOutLocal(),
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, 2500);
      }),
    ]);
  };

  const completeOnboarding = (data: { name: string; title: string }) => {
    setUserName(data.name.toUpperCase());
    setUserTitle(data.title);
    localStorage.setItem('awc_user_name', data.name.toUpperCase());
    localStorage.setItem('awc_user_title', data.title);
  };

  return (
    <NavContext.Provider value={{
      userId,
      setUserId,
      activeSection,
      setActiveSection,
      isSidebarOpen,
      setIsSidebarOpen,
      userRole,
      setUserRole,
      isBirthdayToday,
      userBirthday,
      setUserBirthday,
      userName,
      setUserName,
      userTitle,
      setUserTitle,
      userAvatar,
      setUserAvatar,
      isAuthenticated,
      authReady,
      login,
      logout,
      completeOnboarding,
      userEmail,
      setUserEmail,
      askAdminOpen,
      askAdminPrompt,
      openAskAdmin,
      closeAskAdmin,
      clearAskAdminPrompt,
    }}>
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <TitleManager />
        <Routes>
          {/* Authentication & Public */}
          <Route path="/login" element={<LoginPortal />} />
          <Route path="/family/huddle/join" element={<FamilyHuddleJoinPage />} />
          <Route path="/help/member-setup" element={<MemberSetupGuide />} />
          <Route path="/help/how-to-videos" element={<ProtectedRoute><AppShell><HowToVideosPage /></AppShell></ProtectedRoute>} />
          <Route path="/farewell" element={<Farewell />} />
          <Route path="/onboarding" element={<ProtectedRoute><OnboardingProcess /></ProtectedRoute>} />
          <Route path="/contact" element={<ContactChurchPage />} />

          {/* PLCC ONE launcher is the front door; the Vault dashboard lives at /dashboard */}
          <Route path="/" element={<ProtectedRoute><AwcOneLauncherPage /></ProtectedRoute>} />
          <Route path="/launcher" element={<ProtectedRoute><AwcOneLauncherPage /></ProtectedRoute>} />
          <Route path="/dashboard" element={<ProtectedRoute><AppShell><DashboardPage /></AppShell></ProtectedRoute>} />
          <Route path="/more" element={<ProtectedRoute><AppShell><MorePage /></AppShell></ProtectedRoute>} />

          {/* People Management */}
          <Route path="/family" element={<ProtectedRoute><AppShell><MyFamilyPage /></AppShell></ProtectedRoute>} />
          <Route path="/family/kids/:childId" element={<ProtectedRoute><KidsViewPage /></ProtectedRoute>} />
          <Route path="/members" element={<ProtectedRoute><AppShell><MembersPage /></AppShell></ProtectedRoute>} />
          <Route path="/church-profile" element={<ProtectedRoute><ChurchProfilePage /></ProtectedRoute>} />
          <Route path="/households" element={<ProtectedRoute><AppShell><HouseholdsPage /></AppShell></ProtectedRoute>} />
          <Route path="/households/:id" element={<ProtectedRoute><AppShell><HouseholdsPage /></AppShell></ProtectedRoute>} />
          <Route path="/teams" element={<ProtectedRoute><AppShell><TeamsPage /></AppShell></ProtectedRoute>} />
          <Route path="/people/card-scanner" element={<ProtectedRoute><AppShell><CardScannerPage /></AppShell></ProtectedRoute>} />
          <Route path="/people/connect-cards" element={<ProtectedRoute><AppShell><ConnectCardsPage /></AppShell></ProtectedRoute>} />
          <Route path="/people/team-applications" element={<ProtectedRoute><AppShell><TeamApplicationsPage /></AppShell></ProtectedRoute>} />
          <Route path="/people/import" element={<ProtectedRoute><AppShell><ImportPeoplePage /></AppShell></ProtectedRoute>} />

          {/* Treasury & Finance Team Workflow */}
          <Route path="/finance/ledger" element={<ProtectedRoute><AppShell><TreasuryLedgerPage /></AppShell></ProtectedRoute>} />
          <Route path="/finance/counting" element={<ProtectedRoute><AppShell><CountingSessionPage /></AppShell></ProtectedRoute>} />
          <Route path="/finance/expenses" element={<ProtectedRoute><AppShell><ExpenseTrackerPage /></AppShell></ProtectedRoute>} />
          <Route path="/finance/budgets" element={<ProtectedRoute><AppShell><BudgetManagerPage /></AppShell></ProtectedRoute>} />
          <Route path="/finance/approvals" element={<ProtectedRoute><AppShell><ActionQueuePage /></AppShell></ProtectedRoute>} />
          <Route path="/finance/contribution-manager" element={<ProtectedRoute><RedirectToContributionBook /></ProtectedRoute>} />
          <Route path="/store/orders" element={<ProtectedRoute><AppShell><StoreOrdersPage /></AppShell></ProtectedRoute>} />

          {/* Giving & Financials */}
          <Route path="/giving/insights" element={<ProtectedRoute><AppShell><GivingInsightsPage /></AppShell></ProtectedRoute>} />
          <Route path="/transactions" element={<ProtectedRoute><AppShell><TransactionsPage title="All Transactions" /></AppShell></ProtectedRoute>} />
          <Route path="/transactions/failed" element={<ProtectedRoute><AppShell><TransactionsPage title="Failed Transactions" /></AppShell></ProtectedRoute>} />
          <Route path="/transactions/refunds" element={<ProtectedRoute><AppShell><TransactionsPage title="Refunds" /></AppShell></ProtectedRoute>} />
          <Route path="/transactions/disputes" element={<ProtectedRoute><AppShell><TransactionsPage title="Disputes" /></AppShell></ProtectedRoute>} />
          <Route path="/transactions/export" element={<ProtectedRoute><AppShell><TransactionsPage title="Export Ledger" /></AppShell></ProtectedRoute>} />
          <Route path="/batch-giving/new" element={<ProtectedRoute><Navigate to="/finance/counting" replace /></ProtectedRoute>} />
          <Route path="/batch-giving/open" element={<ProtectedRoute><RedirectToContributionBook /></ProtectedRoute>} />
          <Route path="/batch-giving/closed" element={<ProtectedRoute><RedirectToContributionBook /></ProtectedRoute>} />
          <Route path="/batch-giving/reports" element={<ProtectedRoute><RedirectToContributionBook /></ProtectedRoute>} />
          <Route path="/batch-giving" element={<ProtectedRoute><RedirectToContributionBook /></ProtectedRoute>} />
          <Route path="/bank-deposits" element={<ProtectedRoute><AppShell><BankDepositsPage /></AppShell></ProtectedRoute>} />
          <Route path="/tax-documents" element={<ProtectedRoute><AppShell><TaxDocumentsPage /></AppShell></ProtectedRoute>} />
          <Route path="/fund-management" element={<ProtectedRoute><AppShell><FundManagementPage /></AppShell></ProtectedRoute>} />
          <Route path="/fundraisers" element={<ProtectedRoute><AppShell><FundraisersPage /></AppShell></ProtectedRoute>} />
          {/* Pledge Campaigns was replaced by Fundraisers (moved from DCB) */}
          <Route path="/pledge-campaigns" element={<Navigate to="/fundraisers" replace />} />
          <Route path="/giving-form" element={<ProtectedRoute><AppShell><GivingFormPage /></AppShell></ProtectedRoute>} />
          <Route path="/text-giving" element={<ProtectedRoute><AppShell><TextGivingPage /></AppShell></ProtectedRoute>} />
          <Route path="/giving-form-url" element={<ProtectedRoute><AppShell><GivingFormUrlPage /></AppShell></ProtectedRoute>} />
          <Route path="/giving" element={<ProtectedRoute><AppShell><GiveOnlinePage /></AppShell></ProtectedRoute>} />
          {/* Old cash form retired; its link now opens the Give page */}
          <Route path="/giving/donation-box" element={<Navigate to="/giving" replace />} />

          {/* Categorization & Tags */}
          <Route path="/tags" element={<ProtectedRoute><AppShell><TagsManagerPage /></AppShell></ProtectedRoute>} />

          {/* Attendance Sessions + Manual Check-In (no scanner) */}
          <Route path="/attendance/sessions" element={<ProtectedRoute><AppShell><AttendanceSessionsPage /></AppShell></ProtectedRoute>} />
          <Route path="/attendance/sessions/:sessionId/attendance" element={<ProtectedRoute><AppShell><AttendanceSessionAttendancePage /></AppShell></ProtectedRoute>} />
          <Route path="/attendance/dashboard" element={<ProtectedRoute><AppShell><AttendanceDashboardPage /></AppShell></ProtectedRoute>} />

          {/* Events & Check-In */}
          <Route path="/events/overview" element={<ProtectedRoute><AppShell><EventsOverview /></AppShell></ProtectedRoute>} />
          <Route path="/events/attendees" element={<ProtectedRoute><AppShell><EventsAttendees /></AppShell></ProtectedRoute>} />
          <Route path="/events/who-checked-in" element={<ProtectedRoute><AppShell><WhoCheckedInPage mode="general" /></AppShell></ProtectedRoute>} />
          <Route path="/events/kids-checked-in" element={<ProtectedRoute><AppShell><WhoCheckedInPage mode="kids" /></AppShell></ProtectedRoute>} />
          <Route path="/people/plan-a-visit" element={<ProtectedRoute><AppShell><PlanAVisit /></AppShell></ProtectedRoute>} />
          <Route path="/events/registrations" element={<Navigate to="/people/plan-a-visit" replace />} />
          <Route path="/events/reports" element={<ProtectedRoute><AppShell><EventsReports /></AppShell></ProtectedRoute>} />
          <Route path="/events/check-someone-in" element={<ProtectedRoute><AppShell><DeskCheckInPage /></AppShell></ProtectedRoute>} />
          <Route path="/events/check-in" element={<ProtectedRoute><AppShell><EventsCheckIn /></AppShell></ProtectedRoute>} />
          <Route path="/scan-in" element={<ProtectedRoute><AppShell><ScanInPage /></AppShell></ProtectedRoute>} />
          <Route path="/events/kids-checkin" element={<ProtectedRoute><AppShell><KidsCheckInPage /></AppShell></ProtectedRoute>} />
          <Route path="/events/kids-kiosk" element={<ProtectedRoute><AppShell><KidsKioskPage /></AppShell></ProtectedRoute>} />
          <Route path="/events/kids-plans" element={<ProtectedRoute><AppShell><KidsPlansPage /></AppShell></ProtectedRoute>} />
          <Route path="/events/kids-bucks" element={<ProtectedRoute><AppShell><KidsBucksPage /></AppShell></ProtectedRoute>} />
          <Route path="/events/ark" element={<ProtectedRoute><AppShell><ArkScoresPage /></AppShell></ProtectedRoute>} />
          <Route path="/events/flyer-share" element={<ProtectedRoute><AppShell><FlyerSharePage /></AppShell></ProtectedRoute>} />
          <Route path="/events/alerts" element={<ProtectedRoute><AppShell><EventsAlerts /></AppShell></ProtectedRoute>} />
          <Route path="/events/volunteers" element={<ProtectedRoute><AppShell><EventsVolunteers /></AppShell></ProtectedRoute>} />
          <Route path="/events/serve" element={<ProtectedRoute><AppShell><EventsServe /></AppShell></ProtectedRoute>} />
          <Route path="/events/settings" element={<ProtectedRoute><AppShell><EventsSettings /></AppShell></ProtectedRoute>} />

          {/* Custom Forms */}
          <Route path="/elements/forms" element={<ProtectedRoute><AppShell><FormsManagerPage /></AppShell></ProtectedRoute>} />
          <Route path="/elements/forms/builder/:formId" element={<ProtectedRoute><FormBuilderPage /></ProtectedRoute>} />
          <Route path="/forms/public/:formId" element={<PublicFormPage />} />
          <Route path="/fellowship-cookout" element={<FellowshipCookoutRsvp />} />
          {/* PLCC Grand Family Celebration 2026 (was Thanksgiving; old links keep working) */}
          <Route
            path="/thanksgiving-rsvp"
            element={<Navigate to={`/events/${THANKSGIVING_2026_EVENT_ID}/rsvp`} replace />}
          />
          <Route
            path="/grand-family-celebration-rsvp"
            element={<Navigate to={`/events/${THANKSGIVING_2026_EVENT_ID}/rsvp`} replace />}
          />
          <Route
            path="/marrieds-dinner-rsvp"
            element={<Navigate to={`/events/${MARRIEDS_DINNER_2026_EVENT_ID}/rsvp`} replace />}
          />
          <Route path="/events/:eventId/rsvp" element={<FellowshipCookoutRsvp />} />
          <Route path="/events/cookout-rsvps" element={<ProtectedRoute><AppShell><CookoutRsvpsPage /></AppShell></ProtectedRoute>} />
          <Route path="/events/rsvp-archive" element={<ProtectedRoute><AppShell><RsvpArchivePage /></AppShell></ProtectedRoute>} />
          <Route path="/forms/submissions" element={<ProtectedRoute><AppShell><FormSubmissionsPage /></AppShell></ProtectedRoute>} />
          <Route path="/forms/export" element={<ProtectedRoute><AppShell><FormExportsPage /></AppShell></ProtectedRoute>} />

          {/* Follow-Ups & Workflows */}
          <Route path="/follow-ups" element={<ProtectedRoute><AppShell><FollowUpTasksPage /></AppShell></ProtectedRoute>} />
          <Route path="/follow-ups/workflows" element={<ProtectedRoute><AppShell><FollowUpWorkflowsPage /></AppShell></ProtectedRoute>} />
          <Route path="/follow-ups/templates" element={<ProtectedRoute><AppShell><FollowUpTemplatesPage /></AppShell></ProtectedRoute>} />

          {/* Community Features */}
          <Route path="/community/feed" element={<ProtectedRoute><AppShell><CommunityFeedPage /></AppShell></ProtectedRoute>} />
          <Route path="/community/video" element={<ProtectedRoute><AppShell><VideoHubPage /></AppShell></ProtectedRoute>} />
          <Route path="/community/prayer-wall" element={<ProtectedRoute><AppShell><PrayerWallPage /></AppShell></ProtectedRoute>} />
          <Route path="/community/prayer-watch" element={<ProtectedRoute><AppShell><PrayerWatchPage /></AppShell></ProtectedRoute>} />
          <Route path="/community/sermon-notes" element={<ProtectedRoute><AppShell><SermonNotesPage /></AppShell></ProtectedRoute>} />
          <Route path="/community/sermons" element={<ProtectedRoute><AppShell><SermonManager /></AppShell></ProtectedRoute>} />
          <Route path="/community/worship-tools" element={<ProtectedRoute><AppShell><WorshipToolsPage /></AppShell></ProtectedRoute>} />
          {/* Chat moves to PLCC Chat when VITE_CHAT_MOVED=true; the old Vault chat stays at /community/chat-classic. */}
          <Route path="/community/chat" element={<ProtectedRoute><AppShell>{CHAT_MOVED ? <OpenAwcChat /> : <ChatPage />}</AppShell></ProtectedRoute>} />
          <Route path="/community/chat/dm" element={<ProtectedRoute><AppShell>{CHAT_MOVED ? <OpenAwcChat /> : <DMPage />}</AppShell></ProtectedRoute>} />
          <Route path="/community/chat-classic" element={<ProtectedRoute><AppShell><ChatPage /></AppShell></ProtectedRoute>} />
          <Route path="/community/chat-classic/dm" element={<ProtectedRoute><AppShell><DMPage /></AppShell></ProtectedRoute>} />
          <Route path="/community/gallery" element={<ProtectedRoute><AppShell><GalleryPage /></AppShell></ProtectedRoute>} />
          <Route path="/community/voices" element={<ProtectedRoute><AppShell><CommunityVoicesPage /></AppShell></ProtectedRoute>} />
          <Route path="/communication/emails" element={<ProtectedRoute><AppShell><EmailCenterPage /></AppShell></ProtectedRoute>} />
          <Route path="/community/daily-devotional" element={<ProtectedRoute><AppShell><DailyDevotionalsPage /></AppShell></ProtectedRoute>} />
          <Route path="/communication/announcements" element={<ProtectedRoute><AppShell><AnnouncementsPage /></AppShell></ProtectedRoute>} />
          <Route path="/communication/minutes" element={<ProtectedRoute><AppShell><MinutesManagerPage /></AppShell></ProtectedRoute>} />
          <Route path="/communication/minutes/:id" element={<ProtectedRoute><AppShell><MinutesViewPage /></AppShell></ProtectedRoute>} />

          {/* Administrative Settings */}
          <Route path="/admin/users" element={<ProtectedRoute><AppShell><AdminUsersPage /></AppShell></ProtectedRoute>} />
          <Route path="/admin/vault-repair" element={<ProtectedRoute><AppShell><VaultRepairPage /></AppShell></ProtectedRoute>} />
          <Route path="/admin/policies" element={<ProtectedRoute><AppShell><PoliciesPage /></AppShell></ProtectedRoute>} />
          <Route path="/admin/servant-keeper" element={<ProtectedRoute><AppShell><ServantKeeperIntegration /></AppShell></ProtectedRoute>} />
          <Route path="/admin/consent-management" element={<ProtectedRoute><AppShell><ConsentManagement /></AppShell></ProtectedRoute>} />
          <Route path="/admin/organization" element={<Navigate to="/settings?tab=organization" replace />} />
          <Route path="/reports" element={<ProtectedRoute><AppShell><ReportsLibraryPage /></AppShell></ProtectedRoute>} />
          <Route path="/admin/audit" element={<Navigate to="/settings?tab=audit" replace />} />
          <Route path="/admin/security-log" element={<Navigate to="/settings?tab=security-log" replace />} />
          <Route path="/settings/:tab?" element={<ProtectedRoute><AppShell><SettingsHub /></AppShell></ProtectedRoute>} />
          <Route path="/settings/user" element={<Navigate to="/settings?tab=personal" replace />} />
          <Route path="/notifications" element={<Navigate to="/settings?tab=notifications" replace />} />

          {/* Catch-all route for error handling */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Router>
    </NavContext.Provider>
  );
};

export default App;