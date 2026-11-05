import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ChevronDown,
  Flame,
  HandHeart,
  HelpCircle,
  Landmark,
  Loader2,
  LogOut,
  MessageCircle,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { AwcOneAppId } from '../../lib/awcOne';

export const PLCC_GREEN = '#1d372c';
export const PLCC_GREEN_DEEP = '#16251f';
export const PLCC_GOLD = '#C9A35A';
export const PLCC_CREAM = '#f6f1e6';
export const SANCTUARY_IMG = '/images/awc-one/sanctuary.webp';
export const WORDMARK_IMG = '/images/awc-one/awc-one-wordmark.webp';

const serif = { fontFamily: "'Fraunces', Georgia, serif" } as const;

/** Split sign-in screen: sanctuary photo on the left, cream form panel on the right. */
export const PlccLoginShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen lg:grid lg:grid-cols-2 font-inter" style={{ background: PLCC_CREAM, color: PLCC_GREEN_DEEP }}>
    <aside
      className="relative overflow-hidden h-[260px] sm:h-[320px] lg:h-auto lg:min-h-screen lg:sticky lg:top-0"
      style={{ background: PLCC_GREEN_DEEP }}
    >
      <img
        src={SANCTUARY_IMG}
        alt="Sanctuary with stained-glass windows"
        className="absolute inset-0 w-full h-full object-cover object-center"
        decoding="async"
      />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(22,37,31,0.82) 0%, rgba(22,37,31,0.25) 30%, rgba(22,37,31,0.2) 55%, rgba(22,37,31,0.92) 100%)',
        }}
      />
      <div className="relative z-10 h-full flex flex-col justify-between p-6 sm:p-10 lg:p-12">
        <img src={WORDMARK_IMG} alt="PLCC ONE" className="w-[150px] sm:w-[190px] h-auto" decoding="async" />
        <div>
          <p className="text-white text-2xl sm:text-3xl lg:text-[40px] leading-tight italic" style={serif}>
            Changing hearts. Transforming lives.
          </p>
          <p className="mt-2 text-sm sm:text-base font-bold tracking-wide" style={{ color: '#E4C98F' }}>
            Promised Land Christian Center
          </p>
        </div>
      </div>
    </aside>
    <main className="flex items-center justify-center px-6 py-10 sm:px-10 lg:py-16 lg:min-h-screen">
      <div className="w-full max-w-md">{children}</div>
    </main>
  </div>
);

export const PlccLoginHeading: React.FC = () => (
  <div className="mb-8">
    <p className="text-xs font-extrabold uppercase tracking-[0.22em]" style={{ color: PLCC_GOLD }}>
      Member access
    </p>
    <h1 className="mt-3 text-[34px] sm:text-[40px] leading-[1.1] font-semibold" style={{ ...serif, color: PLCC_GREEN_DEEP }}>
      Welcome to PLCC ONE
    </h1>
    <p className="mt-3 text-base text-[#16251f]/70">Sign in to access Chat, Canaan, Connect, Sanctum, and Tithe.</p>
  </div>
);

export const PLCC_INPUT =
  'w-full h-14 px-4 rounded-xl bg-white border border-[#16251f]/15 text-[#16251f] text-base font-medium ' +
  'placeholder:text-[#16251f]/35 outline-none focus:border-[#1d372c] focus:ring-2 focus:ring-[#1d372c]/15 ' +
  '[&:-webkit-autofill]:[-webkit-text-fill-color:#16251f]';

export const PLCC_PRIMARY_BTN =
  'w-full h-14 rounded-xl text-white text-base font-bold flex items-center justify-center gap-2 ' +
  'hover:brightness-110 active:scale-[0.99] transition disabled:opacity-60';

/* ── Launcher ─────────────────────────────────────────────────────────── */

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'P';
  const a = parts[0][0] || '';
  const b = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (a + b).toUpperCase();
}

export const PlccTopBar: React.FC<{ name: string; onSignOut: () => void }> = ({ name, onSignOut }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const first = name.trim().split(/\s+/)[0] || 'Member';
  return (
    <header style={{ background: PLCC_GREEN_DEEP }}>
      <div className="mx-auto max-w-6xl px-4 sm:px-8 h-[72px] flex items-center justify-between">
        <img src={WORDMARK_IMG} alt="PLCC ONE" className="h-12 sm:h-14 w-auto" decoding="async" />
        <div ref={ref} className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={open}
            className="flex items-center gap-2.5 rounded-full pl-1 pr-3 py-1 text-white hover:bg-white/10 transition"
          >
            <span
              className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-extrabold"
              style={{ background: '#E4C98F', color: PLCC_GREEN_DEEP }}
            >
              {initialsOf(name || first)}
            </span>
            <span className="font-bold text-[15px] hidden sm:inline">{first}</span>
            <ChevronDown size={16} className="opacity-80" aria-hidden />
          </button>
          {open ? (
            <div
              role="menu"
              className="absolute right-0 mt-2 w-48 rounded-xl bg-white shadow-xl border border-[#16251f]/10 py-1.5 z-20"
            >
              <Link
                role="menuitem"
                to="/help/member-setup"
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-[#16251f] hover:bg-[#f6f1e6]"
              >
                <HelpCircle size={16} aria-hidden /> Help
              </Link>
              <button
                role="menuitem"
                type="button"
                onClick={onSignOut}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-[#16251f] hover:bg-[#f6f1e6]"
              >
                <LogOut size={16} aria-hidden /> Sign out
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
};

export const PlccWelcomeBanner: React.FC<{ first: string }> = ({ first }) => (
  <section
    className="relative overflow-hidden rounded-[24px] grid md:grid-cols-[1.1fr_1fr] min-h-[220px]"
    style={{ background: PLCC_GREEN }}
  >
    <div className="relative z-10 p-7 sm:p-10 flex flex-col justify-center">
      <p className="text-xs font-extrabold uppercase tracking-[0.22em]" style={{ color: '#E4C98F' }}>
        Member home
      </p>
      <h1 className="mt-3 text-white text-[34px] sm:text-[44px] leading-[1.08] font-semibold" style={serif}>
        Welcome{first ? `, ${first}` : ''}.
      </h1>
      <p className="mt-2 text-white/75 text-base sm:text-lg">Choose an app to get started.</p>
    </div>
    <div className="relative h-[160px] md:h-auto">
      <img
        src={SANCTUARY_IMG}
        alt=""
        className="absolute inset-0 w-full h-full object-cover object-[center_40%]"
        decoding="async"
      />
      <div
        aria-hidden
        className="absolute inset-0 hidden md:block"
        style={{ background: `linear-gradient(90deg, ${PLCC_GREEN} 0%, rgba(29,55,44,0) 45%)` }}
      />
      <div
        aria-hidden
        className="absolute inset-0 md:hidden"
        style={{ background: `linear-gradient(180deg, ${PLCC_GREEN} 0%, rgba(29,55,44,0) 40%)` }}
      />
    </div>
  </section>
);

const APP_CARDS: { id: AwcOneAppId; name: string; blurb: string; Icon: LucideIcon }[] = [
  { id: 'chat', name: 'PLCC Chat', blurb: 'Messages and live calls', Icon: MessageCircle },
  { id: 'vault', name: 'PLCC Canaan', blurb: 'Church administration', Icon: Landmark },
  { id: 'connect', name: 'PLCC Connect', blurb: 'Members and community', Icon: Users },
  { id: 'sanctum', name: 'PLCC Sanctum', blurb: 'Corporate prayer rooms', Icon: Flame },
  { id: 'tithe', name: 'PLCC Tithe', blurb: 'Giving and contributions', Icon: HandHeart },
];

export const PlccAppCards: React.FC<{
  onOpen: (id: AwcOneAppId) => void;
  busyId?: AwcOneAppId | null;
  badges?: Partial<Record<AwcOneAppId, number>>;
}> = ({ onOpen, busyId, badges }) => (
  <nav aria-label="PLCC apps" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
    {APP_CARDS.map(({ id, name, blurb, Icon }) => {
      const busy = busyId === id;
      const badge = badges?.[id];
      return (
        <button
          key={id}
          type="button"
          onClick={() => onOpen(id)}
          disabled={busy}
          aria-label={`Open ${name}`}
          className="group relative text-left rounded-2xl bg-white border border-[#16251f]/10 p-5 sm:p-6 shadow-[0_1px_2px_rgba(22,37,31,0.04)] hover:shadow-[0_10px_30px_rgba(22,37,31,0.10)] hover:-translate-y-0.5 transition-all disabled:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d372c] flex lg:flex-col gap-4 lg:gap-5 items-center lg:items-start"
        >
          <span className="relative w-12 h-12 shrink-0 rounded-xl flex items-center justify-center" style={{ background: '#e3ece6', color: PLCC_GREEN }}>
            {busy ? <Loader2 size={22} className="animate-spin" aria-hidden /> : <Icon size={22} aria-hidden />}
            {badge ? (
              <span
                aria-label={`${badge} unread`}
                className="absolute -top-2 -right-2 min-w-[22px] h-[22px] px-1 rounded-full text-white text-[11px] font-extrabold flex items-center justify-center"
                style={{ background: PLCC_GOLD }}
              >
                {badge > 99 ? '99+' : badge}
              </span>
            ) : null}
          </span>
          <span className="flex-1 min-w-0 w-full flex items-end justify-between gap-3">
            <span className="min-w-0">
              <span className="block text-[17px] font-extrabold text-[#16251f]">{name}</span>
              <span className="block mt-0.5 text-sm text-[#16251f]/60">{blurb}</span>
            </span>
            <ArrowRight
              size={20}
              className="shrink-0 text-[#1d372c] group-hover:translate-x-1 transition-transform"
              aria-hidden
            />
          </span>
        </button>
      );
    })}
  </nav>
);

export const PlccFooter: React.FC<{ onSignOut?: () => void }> = ({ onSignOut }) => (
  <footer className="border-t border-[#16251f]/10">
    <div className="mx-auto max-w-6xl px-4 sm:px-8 py-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <p className="font-extrabold text-[#16251f]">Promised Land Christian Center</p>
        <p className="italic text-sm" style={{ ...serif, color: '#a98a45' }}>
          Changing Hearts. Transforming Lives.
        </p>
      </div>
      <div className="flex items-center gap-6 text-sm font-bold text-[#16251f]">
        <Link to="/help/member-setup" className="inline-flex items-center gap-1.5 hover:underline underline-offset-4">
          <HelpCircle size={16} aria-hidden /> Help
        </Link>
        {onSignOut ? (
          <button type="button" onClick={onSignOut} className="inline-flex items-center gap-1.5 hover:underline underline-offset-4">
            <LogOut size={16} aria-hidden /> Sign out
          </button>
        ) : null}
      </div>
    </div>
  </footer>
);
