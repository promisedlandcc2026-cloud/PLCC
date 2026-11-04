import React, { useState, useEffect, useMemo } from 'react';
import { CHAT_MOVED } from '../../lib/awcOne';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ChevronsLeft, Cake, PartyPopper, ChevronDown } from 'lucide-react';
import { useNav } from '../../App';
import { SIMPLE_NAV_GROUPS, type SimpleNavLink } from '../../lib/simpleNav';
import { hasPermission } from '../../lib/permissions';
import { Role, Section } from '../../types';
import { fetchAuthorized } from '../../lib/api';
import { useVaultPoll } from '../../lib/useVaultPoll';
import { useFundraiserAccess } from '../../lib/fundraiserAccess';
import { usePrayerWatchAccess } from '../../lib/prayerWatch';

interface SidebarItemProps {
  item: SimpleNavLink;
  unreadCount?: number;
  communityFeedUnread?: number;
  onNavigate?: (section?: Section) => void;
  compact?: boolean;
}

const SidebarItem: React.FC<SidebarItemProps> = ({
  item,
  unreadCount = 0,
  communityFeedUnread = 0,
  onNavigate,
  compact,
}) => {
  const location = useLocation();

  const isActive = React.useMemo(() => {
    if (!item.path || item.href) return false;
    if (item.path.includes('?')) {
      const [itemPath, itemQuery] = item.path.split('?');
      if (location.pathname !== itemPath) return false;
      const itemParams = new URLSearchParams(itemQuery);
      const locationParams = new URLSearchParams(location.search);
      let allMatch = true;
      itemParams.forEach((value, key) => {
        if (locationParams.get(key) !== value) allMatch = false;
      });
      return allMatch;
    }
    // Community Feed badge item is active for /community/feed*
    if (item.path === '/community/feed') {
      return location.pathname === '/community/feed' || location.pathname.startsWith('/community/feed/');
    }
    return location.pathname === item.path && (!location.search || location.search === '?');
  }, [item.path, item.href, location.pathname, location.search]);

  const showChatBadge = item.path === '/community/chat' && unreadCount > 0 && !isActive;
  // Keep Community unread visible even on /community/feed so mentioned members
  // still see CONNECT → Community N until they clear inbox (unlike Chat hide-when-active).
  const showCommunityBadge =
    item.path === '/community/feed' && communityFeedUnread > 0;
  const communityBadgeLabel =
    communityFeedUnread > 99 ? '99+' : String(communityFeedUnread);

  const linkClassName = `
    flex items-center ${compact ? 'px-2.5 py-2 text-[13px] lg:py-1.5 lg:text-[13px]' : 'px-3 py-2.5 text-[14px] lg:px-3 lg:py-2 lg:text-[14px]'} font-semibold transition-all mb-0.5 rounded-xl relative
    ${isActive
      ? 'bg-[#1d372c]/5 text-[#1d372c] border-l-4 border-[#1d372c] font-bold shadow-sm'
      : 'text-gray-600 hover:text-burgundy hover:bg-gray-50'}
  `;

  const content = (
    <div className="flex items-center w-full min-w-0">
      {item.icon && (
        <span className={`mr-2.5 lg:mr-2 shrink-0 ${isActive ? 'text-[#1d372c]' : 'text-gray-500'}`}>
          {item.icon}
        </span>
      )}
      <span className="flex-1 truncate">{item.label}</span>
      {showChatBadge && (
        <span className="ml-2 w-5 h-5 bg-gold text-burgundy text-xs font-black rounded-full flex items-center justify-center shadow-md shrink-0">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
      {showCommunityBadge && (
        <span
          className="ml-2 min-w-[1.25rem] h-5 px-1.5 bg-burgundy text-white text-[10px] font-black rounded-full flex items-center justify-center shadow-md shrink-0"
          aria-label={`${communityFeedUnread} unread Community notifications`}
        >
          {communityBadgeLabel}
        </span>
      )}
    </div>
  );

  if (item.href) {
    return (
      <a
        href={item.href}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClassName}
        onClick={() => onNavigate?.(item.section)}
      >
        {content}
      </a>
    );
  }

  return (
    <Link
      to={item.path || '#'}
      className={linkClassName}
      onClick={() => onNavigate?.(item.section)}
    >
      {content}
    </Link>
  );
};

function itemMatchesLocation(item: SimpleNavLink, pathname: string, search: string): boolean {
  if (!item.path || item.href) return false;
  if (item.path.includes('?')) {
    const [itemPath, itemQuery] = item.path.split('?');
    if (pathname !== itemPath) return false;
    const itemParams = new URLSearchParams(itemQuery);
    const locationParams = new URLSearchParams(search);
    let allMatch = true;
    itemParams.forEach((value, key) => {
      if (locationParams.get(key) !== value) allMatch = false;
    });
    return allMatch;
  }
  const base = item.path.split('?')[0];
  if (!(pathname === base || pathname.startsWith(`${base}/`))) return false;
  // Bare path should not match when a query child is selected (e.g. ?eventId=)
  if (search && search !== '?') return false;
  return true;
}

function pathInItems(pathname: string, search: string, items: SimpleNavLink[]): boolean {
  return items.some((item) => {
    if (item.children?.length) {
      return pathInItems(pathname, search, item.children);
    }
    if (!item.path || item.href) return false;
    const base = item.path.split('?')[0];
    return pathname === base || pathname.startsWith(`${base}/`);
  });
}

function filterNavItems(items: SimpleNavLink[], role: Role): SimpleNavLink[] {
  return items
    .map((item) => {
      if (item.children?.length) {
        const children = filterNavItems(item.children, role);
        if (!children.length) return null;
        return { ...item, children };
      }
      if (!item.path && !item.href) return null;
      return hasPermission(role, item.section, item.path) ? item : null;
    })
    .filter(Boolean) as SimpleNavLink[];
}

const NestedNavItem: React.FC<{
  item: SimpleNavLink;
  unreadCount: number;
  communityFeedUnread: number;
  onNavigate?: (section?: Section) => void;
  compact?: boolean;
}> = ({ item, unreadCount, communityFeedUnread, onNavigate, compact }) => {
  const location = useLocation();
  const childActive = (item.children || []).some((c) =>
    itemMatchesLocation(c, location.pathname, location.search)
  );
  const [open, setOpen] = useState(childActive);

  useEffect(() => {
    if (childActive) setOpen(true);
  }, [childActive]);

  if (!item.children?.length) {
    return (
      <SidebarItem
        item={item}
        unreadCount={unreadCount}
        communityFeedUnread={communityFeedUnread}
        onNavigate={onNavigate}
        compact={compact}
      />
    );
  }

  return (
    <div className="mb-0.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center ${
          compact ? 'px-2.5 py-2 text-[13px] lg:py-1.5' : 'px-3 py-2.5 text-[14px] lg:px-3 lg:py-2'
        } font-semibold rounded-xl transition-all ${
          childActive
            ? 'bg-[#1d372c]/5 text-[#1d372c] font-bold'
            : 'text-gray-600 hover:text-burgundy hover:bg-gray-50'
        }`}
        aria-expanded={open}
      >
        {item.icon && (
          <span className={`mr-2.5 lg:mr-2 shrink-0 ${childActive ? 'text-[#1d372c]' : 'text-gray-500'}`}>
            {item.icon}
          </span>
        )}
        <span className="flex-1 truncate text-left">{item.label}</span>
        <ChevronDown
          size={14}
          className={`shrink-0 transition-transform duration-200 ${open ? 'rotate-0' : '-rotate-90'}`}
        />
      </button>
      {open && (
        <div className="mt-0.5 ml-3 pl-2 border-l border-black/[0.06] space-y-0.5">
          {item.children.map((child) => (
            <SidebarItem
              key={child.path || child.label}
              item={child}
              unreadCount={unreadCount}
              communityFeedUnread={communityFeedUnread}
              onNavigate={onNavigate}
              compact
            />
          ))}
        </div>
      )}
    </div>
  );
};

const Sidebar: React.FC = () => {
  const { setActiveSection, setIsSidebarOpen, userRole, isBirthdayToday, userId, isAuthenticated } = useNav();
  const [unreadCount, setUnreadCount] = useState(0);
  const [communityFeedUnread, setCommunityFeedUnread] = useState(0);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const location = useLocation();
  const navigate = useNavigate();

  // Fundraisers shows only for the listed roles or people with the Fundraiser access switch
  const fundraiserAccess = useFundraiserAccess(isAuthenticated ? userId : null, userRole);
  // Prayer Watch shows only for the Intercessor Channel's members and the prayer team
  const prayerWatchAccess = usePrayerWatchAccess(isAuthenticated ? userId : null, userRole);
  const visibleGroups = useMemo(
    () =>
      SIMPLE_NAV_GROUPS.map((group) => ({
        ...group,
        items: filterNavItems(group.items, userRole as Role).filter(
          (item) =>
            (item.path !== '/fundraisers' || fundraiserAccess.allowed) &&
            (item.path !== '/community/prayer-watch' || prayerWatchAccess.allowed)
        ),
      })).filter((group) => group.items.length > 0),
    [userRole, fundraiserAccess.allowed, prayerWatchAccess.allowed]
  );

  useEffect(() => {
    if (!isAuthenticated || !userId) {
      setUnreadCount(0);
      setCommunityFeedUnread(0);
    }
  }, [userId, isAuthenticated]);

  useVaultPoll(
    async () => {
      // After Chat moves to PLCC Chat, count by PLCC Chat's own read marks (no local timestamp).
      const lastRead = CHAT_MOVED ? '' : localStorage.getItem('last_chat_read') || '';
      const [chatRes, inboxRes] = await Promise.all([
        fetchAuthorized(
          `/api/vault?resource=community&subResource=chat&subResource=unread-count${lastRead ? `&since=${encodeURIComponent(lastRead)}` : ''}`
        ),
        fetchAuthorized('/api/vault?resource=notifications'),
      ]);
      if (chatRes.ok) {
        const data = await chatRes.json().catch(() => ({}));
        setUnreadCount(data.count || 0);
      } else {
        setUnreadCount(0);
      }
      if (inboxRes.ok) {
        const inbox = await inboxRes.json().catch(() => ({}));
        setCommunityFeedUnread(Number(inbox.communityFeedUnreadCount) || 0);
      } else {
        setCommunityFeedUnread(0);
      }
    },
    { intervalMs: 30_000, enabled: Boolean(isAuthenticated && userId), deps: [userId, location.pathname] }
  );

  useEffect(() => {
    if (location.pathname.startsWith('/community/chat')) {
      localStorage.setItem('last_chat_read', new Date().toISOString());
      setUnreadCount(0);
    }
  }, [location.pathname]);

  useEffect(() => {
    if (window.innerWidth < 1024) {
      setIsSidebarOpen(false);
    }
  }, [location.pathname, setIsSidebarOpen]);

  // Auto-expand collapsible groups that contain the current route
  useEffect(() => {
    setOpenGroups((prev) => {
      const next = { ...prev };
      for (const group of visibleGroups) {
        if (group.collapsible && pathInItems(location.pathname, location.search, group.items)) {
          next[group.id] = true;
        }
      }
      return next;
    });
  }, [location.pathname, visibleGroups]);

  const handleNavigate = (section?: Section) => {
    if (section) setActiveSection(section);
  };

  const isGroupOpen = (groupId: string, collapsible?: boolean) => {
    if (!collapsible) return true;
    if (openGroups[groupId] !== undefined) return openGroups[groupId];
    const group = visibleGroups.find((g) => g.id === groupId);
    return group ? pathInItems(location.pathname, location.search, group.items) : false;
  };

  const toggleGroup = (groupId: string) => {
    setOpenGroups((prev) => ({
      ...prev,
      [groupId]: !isGroupOpen(groupId, true),
    }));
  };

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex items-center justify-between px-4 lg:px-4 py-4 lg:py-3 border-b border-gray-50">
        <span className="text-xs font-black text-[#0d1a14] uppercase tracking-[0.2em]">
          Menu
        </span>
        <button
          onClick={() => setIsSidebarOpen(false)}
          className="p-1.5 text-gray-500 hover:text-burgundy hover:bg-gray-50 rounded-xl transition-all"
          aria-label="Close menu"
        >
          <ChevronsLeft size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <nav className="p-2.5 lg:p-2 space-y-3 lg:space-y-2.5">
          {visibleGroups.map((group) => {
            const open = isGroupOpen(group.id, group.collapsible);
            const activeInGroup = pathInItems(location.pathname, location.search, group.items);

            return (
              <div key={group.id}>
                {group.collapsible ? (
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.id)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 lg:py-1 mb-0.5 rounded-lg transition-colors ${
                      activeInGroup ? 'text-[#1d372c]' : 'text-gray-400 hover:text-gray-600'
                    }`}
                    aria-expanded={open}
                  >
                    <span className="text-[10px] font-black uppercase tracking-[0.18em]">
                      {group.label}
                    </span>
                    <ChevronDown
                      size={14}
                      className={`transition-transform duration-200 ${open ? 'rotate-0' : '-rotate-90'}`}
                    />
                  </button>
                ) : (
                  <p className="px-2.5 py-1.5 lg:py-1 mb-0.5 text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
                    {group.label}
                  </p>
                )}

                {open && (
                  <div className={`space-y-0.5 ${group.collapsible ? 'pl-0.5 border-l border-black/[0.04] ml-1.5' : ''}`}>
                    {group.items.map((item) => (
                      <NestedNavItem
                        key={item.path || item.label}
                        item={item}
                        unreadCount={unreadCount}
                        communityFeedUnread={communityFeedUnread}
                        onNavigate={handleNavigate}
                        compact={group.collapsible}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </div>

      <div className="p-3 lg:p-2.5 border-t border-gray-50 bg-gold-cream/10 space-y-3 lg:space-y-2.5">
        <div className="flex items-center space-x-2.5 p-2 bg-white/50 rounded-2xl border border-white shadow-sm">
          <div className="w-9 h-9 lg:w-8 lg:h-8 rounded-xl bg-[#1d372c] flex items-center justify-center text-[#C9A35A] font-bold text-sm shadow-lg">
            {userRole.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-black text-burgundy truncate uppercase tracking-tighter">Signed in</p>
            <p className="text-[11px] text-gray-600 font-bold uppercase tracking-widest">{userRole}</p>
          </div>
        </div>

        {isBirthdayToday ? (
          <div
            className="bg-burgundy p-3 lg:p-2.5 rounded-2xl border border-gold/40 flex items-start gap-2.5 shadow-xl animate-pulse ring-2 ring-gold/20 cursor-pointer"
            onClick={() => navigate('/dashboard')}
          >
            <PartyPopper size={16} className="text-gold shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-black text-gold leading-tight uppercase tracking-widest">
                Happy Birthday!
              </p>
              <p className="text-[11px] text-white/80 mt-1 uppercase tracking-tighter font-bold">Enjoy your special day</p>
            </div>
          </div>
        ) : (
          <div className="bg-white/80 p-3 lg:p-2.5 rounded-2xl border border-gold/10 flex items-start gap-2.5 shadow-sm hover:shadow-md transition-shadow">
            <Cake size={16} className="text-gold shrink-0 mt-0.5" />
            <div>
              <p className="text-sm lg:text-[13px] font-bold text-gray-600 leading-tight">
                Maintain your <Link to="/settings?tab=personal" className="text-burgundy hover:underline font-black">Profile</Link>
              </p>
              <p className="text-[11px] text-gray-500 mt-1 uppercase tracking-widest font-bold">Anniversary tracking</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Sidebar;
