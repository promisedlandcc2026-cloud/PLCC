import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, Megaphone, Newspaper, QrCode, Users } from 'lucide-react';
import { useNav } from '../../lib/NavContext';
import { eventsOverviewPath } from '../../lib/eventDate';
import { hasPermission } from '../../lib/permissions';
import { Role } from '../../types';
import SeasonParticles from '../Season/SeasonParticles';
import { usePublishedSeason } from '../Season/SeasonThemeProvider';

/** Supplied by the church as the approved Canaan home-page artwork. */
export const HOME_HERO_IMAGE_SRC = '/canaan-sunrise-road.png';
export const HOME_HERO_MOBILE_IMAGE_SRC = HOME_HERO_IMAGE_SRC;

export type HomeNextService = {
  id?: string;
  title: string;
  whenLabel: string;
  dateYmd?: string;
};

type Props = {
  greeting: string;
  userName: string;
  verseText?: string | null;
  verseReference?: string | null;
  nextService: HomeNextService | null;
};

/** Home-only redesign; existing routes, role checks, and seasonal effects remain in place. */
const HomeHeroBanner: React.FC<Props> = ({ greeting, userName, verseText, verseReference, nextService }) => {
  const navigate = useNavigate();
  const { userRole } = useNav();
  const { theme, showEffects } = usePublishedSeason();
  const role = String(userRole || '').toUpperCase() as Role;
  const canCheckIn = hasPermission(role, undefined, '/events/check-someone-in');
  const canSeeMembers = hasPermission(role, undefined, '/members');
  const canPost = ['SUPER_ADMIN', 'PASTOR', 'MINISTRY_LEADER'].includes(role);
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const actions = [
    ...(canCheckIn ? [{ label: 'Today’s check-ins', icon: QrCode, onClick: () => navigate('/events/check-someone-in') }] : []),
    ...(canSeeMembers ? [{ label: 'Members & households', icon: Users, onClick: () => navigate('/members') }] : []),
    ...(canPost ? [
      { label: 'Post Canaan News', icon: Newspaper, onClick: () => scrollTo('canaan-home-news') },
      { label: 'Send a Tribes alert', icon: Megaphone, onClick: () => scrollTo('canaan-home-alert') },
    ] : []),
  ];

  return (
    <div className="w-full max-w-6xl mx-auto px-4 md:px-8 pt-6 md:pt-9">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6 md:mb-8">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#49603a]">Promised Land Christian Center</p>
          <h1 className="mt-2 font-serif text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#102b1b]">{greeting}, {userName}</h1>
          {theme.greeting ? <p className="mt-2 text-sm font-semibold text-[#49603a]">{theme.greeting}</p> : null}
          {verseText ? <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#43584a]">“{verseText}”{verseReference ? <span className="ml-2 font-semibold">{verseReference}</span> : null}</p> : null}
        </div>
        {canCheckIn ? <button type="button" onClick={() => navigate('/events/check-someone-in')} className="inline-flex min-h-[48px] shrink-0 items-center justify-center gap-2 rounded-xl bg-[#082e1b] px-5 py-3 text-sm font-bold text-white hover:bg-[#16472b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b88929] focus-visible:ring-offset-2"><QrCode size={20} aria-hidden /> Open check-in</button> : null}
      </div>
      <div className={`grid grid-cols-1 gap-4 ${actions.length ? 'lg:grid-cols-[minmax(0,1.6fr)_minmax(280px,1fr)]' : ''}`}>
        <section aria-labelledby="home-service-title" className="relative isolate flex min-h-[260px] flex-col justify-end overflow-hidden rounded-2xl bg-[#082e1b] p-6 sm:min-h-[320px] sm:p-9 text-white">
          <img src={HOME_HERO_IMAGE_SRC} alt="" className="absolute inset-0 -z-20 h-full w-full object-cover object-center" />
          <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-[#062819]/95 via-[#062819]/70 to-[#062819]/10" />
          {showEffects ? <SeasonParticles effect={theme.effect} /> : null}
          <div className="relative z-10 max-w-sm">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#f1d284]">{nextService ? 'Next gathering' : 'Gather with us'}</p>
            <h2 id="home-service-title" className="mt-2 font-serif text-4xl sm:text-5xl font-bold leading-[1.05] tracking-tight">{nextService?.title || 'Church gatherings'}</h2>
            {nextService?.whenLabel ? <p className="mt-3 text-sm sm:text-base font-semibold text-white/95">{nextService.whenLabel}</p> : <p className="mt-3 text-sm text-white/90">See upcoming services and events.</p>}
            <button type="button" onClick={() => navigate(eventsOverviewPath(nextService?.dateYmd))} className="mt-5 inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[#e7bd57] bg-[#082e1b]/75 px-4 py-2 text-sm font-bold text-[#f8d77b] hover:bg-[#173e28] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"><CalendarDays size={18} className="mr-2" aria-hidden /> Service details</button>
          </div>
        </section>
        {actions.length ? <section aria-labelledby="home-actions-title" className="rounded-2xl border border-[#e0ded3] bg-[#fffcf6] p-5 sm:p-6">
          <h2 id="home-actions-title" className="font-serif text-2xl font-bold text-[#102b1b]">Staff actions</h2>
          <div className="mt-3 divide-y divide-[#e8e3d7]">
            {actions.map(({ label, icon: Icon, onClick }) => <button key={label} type="button" onClick={onClick} className="flex min-h-[56px] w-full items-center gap-3 rounded-lg px-1 py-2 text-left text-sm sm:text-base font-semibold text-[#173527] hover:bg-[#f1f2e9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b88929]"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e7ebdc] text-[#173527]"><Icon size={20} aria-hidden /></span><span>{label}</span></button>)}
          </div>
        </section> : null}
      </div>
    </div>
  );
};

export default HomeHeroBanner;
