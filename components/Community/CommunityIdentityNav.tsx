/**
 * PLCC Community Phase 4A.1 — shared Community identity + Feed|Chat subnav.
 * Navigation only. Does not own Chat/Huddle behavior or query-param processing.
 */
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MessageSquare, Newspaper } from 'lucide-react';
import AskAdminTitleLink from '../common/AskAdminTitleLink';

export type CommunityIdentityActive = 'feed' | 'chat';
export type CommunityIdentityVariant = 'full' | 'compact';

type Props = {
  active: CommunityIdentityActive;
  /** `full` for Feed page; `compact` for dense Chat layout. */
  variant?: CommunityIdentityVariant;
};

const tabBase =
  'flex-1 min-w-0 inline-flex items-center justify-center gap-1.5 sm:gap-2 rounded-lg font-black uppercase tracking-widest focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-1';
const tabActive = 'bg-burgundy text-gold shadow-sm';
const tabInactive =
  'text-burgundy/70 hover:text-burgundy underline-offset-4 hover:underline';

const CommunityIdentityNav: React.FC<Props> = ({ active, variant = 'full' }) => {
  const location = useLocation();
  const compact = variant === 'compact';

  /** Preserve ?channel=&huddle=1 when already on the Chat channels page. */
  const chatTo =
    location.pathname === '/community/chat'
      ? { pathname: '/community/chat', search: location.search }
      : '/community/chat';

  const feedTo = '/community/feed';

  const subnav = (
    <nav
      className={`flex w-full rounded-xl bg-burgundy/5 p-1 border border-burgundy/10 ${compact ? 'max-w-xs sm:max-w-sm' : ''}`}
      aria-label="Community sections"
      data-community-subnav="true"
    >
      <Link
        to={feedTo}
        aria-current={active === 'feed' ? 'page' : undefined}
        className={`${tabBase} ${compact ? 'h-9 text-[9px] sm:text-[10px] px-2' : 'h-11 text-[10px] sm:text-[11px] px-3'} ${
          active === 'feed' ? tabActive : tabInactive
        }`}
        data-community-nav="feed"
      >
        <Newspaper size={compact ? 12 : 14} aria-hidden className="shrink-0" />
        <span>Feed</span>
        {active === 'feed' ? <span className="sr-only">(current)</span> : null}
      </Link>
      <Link
        to={chatTo}
        aria-current={active === 'chat' ? 'page' : undefined}
        className={`${tabBase} ${compact ? 'h-9 text-[9px] sm:text-[10px] px-2' : 'h-11 text-[10px] sm:text-[11px] px-3'} ${
          active === 'chat' ? tabActive : tabInactive
        }`}
        data-community-nav="chat"
      >
        <MessageSquare size={compact ? 12 : 14} aria-hidden className="shrink-0" />
        <span>Chat</span>
        {active === 'chat' ? <span className="sr-only">(current)</span> : null}
      </Link>
    </nav>
  );

  if (compact) {
    return (
      <header
        className="shrink-0 border-b border-burgundy/10 bg-[#FDFDFB] px-3 sm:px-4 py-2"
        data-community-identity="true"
        data-community-identity-variant="compact"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 flex flex-wrap items-center gap-2">
            <div className="min-w-0">
              <p className="text-[13px] sm:text-sm font-black text-burgundy tracking-tight leading-tight">
                PLCC COMMUNITY
              </p>
              <p className="text-[9px] font-black uppercase tracking-[0.14em] text-gold truncate">
                Connect • Encourage • Fellowship
              </p>
            </div>
            <AskAdminTitleLink />
          </div>
          {subnav}
        </div>
      </header>
    );
  }

  return (
    <header className="space-y-4" data-community-identity="true" data-community-identity-variant="full">
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl sm:text-3xl font-black text-burgundy tracking-tight">PLCC COMMUNITY</h1>
          <AskAdminTitleLink />
        </div>
        <p className="text-[11px] sm:text-[12px] font-black uppercase tracking-[0.18em] text-gold">
          Connect • Encourage • Fellowship
        </p>
        <p className="text-[13px] text-gray-500 font-medium leading-relaxed max-w-xl">
          A place for the PLCC family to share, encourage one another, celebrate what God is doing, and
          stay connected throughout the week.
        </p>
      </div>
      {subnav}
    </header>
  );
};

export default CommunityIdentityNav;
