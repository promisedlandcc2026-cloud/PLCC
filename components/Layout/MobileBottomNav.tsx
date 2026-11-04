import React, { useState, useEffect } from 'react';
import { CHAT_MOVED } from '../../lib/awcOne';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Home,
  Heart,
  MessageSquare,
  Menu,
  Calendar,
} from 'lucide-react';
import { useNav } from '../../App';
import { Section } from '../../types';
import { vaultFetch } from '../../lib/api';
import { useVaultPoll } from '../../lib/useVaultPoll';

const MobileBottomNav: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { setActiveSection, setIsSidebarOpen, isSidebarOpen, userId } = useNav();
  const [unreadCount, setUnreadCount] = useState(0);
  const [huddleOpen, setHuddleOpen] = useState(false);

  useEffect(() => {
    const sync = () => setHuddleOpen(document.body.classList.contains('awc-huddle-open'));
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
  }, []);

  useVaultPoll(
    async () => {
      // After Chat moves to PLCC Chat, count by PLCC Chat's own read marks (no local timestamp).
      const lastRead = CHAT_MOVED ? '' : localStorage.getItem('last_chat_read') || '';
      const res = await vaultFetch(
        `/api/vault?resource=community&subResource=chat&subResource=unread-count${lastRead ? `&since=${encodeURIComponent(lastRead)}` : ''}`
      );
      if (!res.ok) return;
      const data = await res.json().catch(() => ({}));
      setUnreadCount(data.count || 0);
    },
    { intervalMs: 30_000, enabled: Boolean(userId), deps: [userId] }
  );

  useEffect(() => {
    if (location.pathname.startsWith('/community/chat')) {
      localStorage.setItem('last_chat_read', new Date().toISOString());
      setUnreadCount(0);
    }
  }, [location.pathname]);

  const navItems = [
    { label: 'Home', path: '/dashboard', icon: Home, section: Section.Dashboard },
    { label: 'Prayer', path: '/community/prayer-wall', icon: Heart, section: Section.Community },
    { label: 'Events', path: '/events/overview', icon: Calendar, section: Section.Events },
    { label: 'Chat', path: '/community/chat', icon: MessageSquare, section: Section.Community, hasBadge: true },
  ];

  const handleNavigate = (path: string, section: Section) => {
    setActiveSection(section);
    navigate(path);
  };

  // Live Huddle portals above the shell; hide so Join/Start is never covered on iPhone.
  if (huddleOpen) return null;

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-[70] px-3 pointer-events-none"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}
      aria-label="Primary"
    >
      <div className="pointer-events-auto mx-auto max-w-md h-16 rounded-2xl border border-burgundy/10 bg-white/95 backdrop-blur-xl shadow-[0_8px_30px_rgba(13, 26, 20,0.12)] flex items-stretch justify-between px-1.5">
        {navItems.map((item) => {
          const isActive =
            location.pathname === item.path ||
            (item.path !== '/dashboard' && location.pathname.startsWith(item.path));
          return (
            <button
              key={item.label}
              type="button"
              onClick={() => handleNavigate(item.path, item.section)}
              className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 rounded-xl transition-colors ${
                isActive ? 'text-burgundy' : 'text-gray-400 hover:text-burgundy/70'
              }`}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
            >
              <span
                className={`relative flex items-center justify-center w-9 h-9 rounded-xl transition-colors ${
                  isActive ? 'bg-burgundy text-gold' : 'bg-transparent'
                }`}
              >
                <item.icon size={20} strokeWidth={isActive ? 2.4 : 2} />
                {item.hasBadge && unreadCount > 0 && !isActive ? (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-gold text-burgundy text-[9px] font-black rounded-full flex items-center justify-center border border-white">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                ) : null}
              </span>
              <span
                className={`text-[9px] font-black uppercase tracking-[0.14em] leading-none ${
                  isActive ? 'opacity-100' : 'opacity-55'
                }`}
              >
                {item.label}
              </span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className={`flex-1 flex flex-col items-center justify-center gap-0.5 rounded-xl transition-colors ${
            isSidebarOpen ? 'text-burgundy' : 'text-gray-400 hover:text-burgundy/70'
          }`}
          aria-label="Menu"
          aria-expanded={isSidebarOpen}
        >
          <span
            className={`flex items-center justify-center w-9 h-9 rounded-xl transition-colors ${
              isSidebarOpen ? 'bg-burgundy text-gold' : 'bg-transparent'
            }`}
          >
            <Menu size={20} strokeWidth={isSidebarOpen ? 2.4 : 2} />
          </span>
          <span
            className={`text-[9px] font-black uppercase tracking-[0.14em] leading-none ${
              isSidebarOpen ? 'opacity-100' : 'opacity-55'
            }`}
          >
            Menu
          </span>
        </button>
      </div>
    </nav>
  );
};

export default MobileBottomNav;
