import { createContext, useContext } from 'react';
import { Role, Section } from '../types';

export interface NavContextType {
  userId: string | null;
  setUserId: (id: string) => void;
  activeSection: Section;
  setActiveSection: (section: Section) => void;
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
  userRole: Role;
  setUserRole: (role: Role) => void;
  isBirthdayToday: boolean;
  userBirthday: string;
  setUserBirthday: (date: string) => void;
  userName: string;
  setUserName: (name: string) => void;
  userTitle: string;
  setUserTitle: (title: string) => void;
  userAvatar: string;
  setUserAvatar: (url: string) => void;
  /** Live Supabase session is present and usable. */
  isAuthenticated: boolean;
  /** False until boot getSession / INITIAL_SESSION completes. */
  authReady: boolean;
  login: (userData?: any) => void;
  logout: () => void;
  completeOnboarding: (data: { name: string; title: string }) => void;
  userEmail: string;
  setUserEmail: (email: string) => void;
  /** Ask Admin drawer open (topbar + page title links). */
  askAdminOpen: boolean;
  /** One-shot how-to question to auto-send when the drawer opens. */
  askAdminPrompt: string | null;
  openAskAdmin: (prompt?: string) => void;
  closeAskAdmin: () => void;
  clearAskAdminPrompt: () => void;
}

export const NavContext = createContext<NavContextType | undefined>(undefined);

export const useNav = () => {
  const context = useContext(NavContext);
  if (!context) throw new Error('useNav must be used within a NavProvider');
  return context;
};
