import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Bell,
  CalendarDays,
  ChevronDown,
  Flag,
  Flame,
  Globe2,
  HandHeart,
  HelpCircle,
  Home,
  Loader2,
  LogOut,
  Menu,
  MessageCircle,
  Search,
  ShieldAlert,
  Users,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { AwcOneAppId } from '../../lib/awcOne';
import { authedFetch } from '../../lib/authedFetch';
import { formatEventWhenLabel } from '../../lib/eventDate';
import { upcoming, type HomeEvent } from './PlccHomeExtras';
import { openReport } from '../../lib/report';
import { PLCC_GOLD, PLCC_GREEN, PLCC_GREEN_DEEP, WORDMARK_IMG } from './PlccOneShell';

/**
 * PLCC ONE member home.
 * Desktop: green sidebar, top bar with search, full-bleed welcome banner, then a
 * centred content column (featured card, app list, next gathering, quick actions).
 * Phone/tablet: green top bar with a menu drawer and the same blocks stacked.
 */

export const HERO_IMG = '/images/awc-one/plcc-one-hero.webp';
/** Right-hand (globe + kente) part of the banner, for the phone banner with live text. */
export const HERO_GLOBE_IMG = '/images/awc-one/plcc-one-hero-globe.webp';
/** Canaan artwork without the baked-in button; the whole card is the link. */
export const CANAAN_IMG = '/images/awc-one/canaan-card.webp';

const serif = { fontFamily: "'Fraunces', Georgia, serif" } as const;
const GOLD_SOFT = '#E4C98F';
const FOCUS =
  'focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#C9A35A]';
const LIFT =
  'transition-all duration-200 hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0';

/** Kente-style diamond band (inline SVG, no image request). */
const KENTE_BG =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 48 48'%3E" +
  "%3Crect width='48' height='48' fill='%2316251f'/%3E" +
  "%3Cpath d='M24 2 46 24 24 46 2 24Z' fill='%23C9A35A'/%3E" +
  "%3Cpath d='M24 10 38 24 24 38 10 24Z' fill='%23b2361f'/%3E" +
  "%3Cpath d='M24 17 31 24 24 31 17 24Z' fill='%23227a45'/%3E" +
  "%3Cpath d='M24 21 27 24 24 27 21 24Z' fill='%23E4C98F'/%3E%3C/svg%3E\")";

export function KenteBand({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return <div aria-hidden className={className} style={{ backgroundImage: KENTE_BG, backgroundSize: '32px 32px', ...style }} />;
}

/* ── Apps ─────────────────────────────────────────────────────────────── */

export type HomeApp = { id: AwcOneAppId; name: string; tags: string; Icon: LucideIcon; soon?: boolean };

export const JORDAN: HomeApp = { id: 'chat', name: 'Jordan', tags: 'Messages • Prayer • Calls', Icon: MessageCircle };
export const TRIBES: HomeApp = { id: 'connect', name: 'Tribes', tags: 'Community • Events • Groups', Icon: Users };
export const SANCTUM: HomeApp = { id: 'sanctum', name: 'PLCC Sanctum', tags: 'Prayer Rooms • Live Prayer', Icon: Flame };
export const FIRSTFRUITS: HomeApp = { id: 'tithe', name: 'Firstfruits', tags: 'Tithe • Offerings', Icon: HandHeart, soon: true };
export const CANAAN: HomeApp = { id: 'vault', name: 'Canaan', tags: 'Church Administration', Icon: Home };

/* ── Navigation (sidebar + phone drawer share the same items) ─────────── */

export type NavItem = { label: string; Icon: LucideIcon; onClick: () => void; active?: boolean };

const NavList: React.FC<{ items: NavItem[]; onPicked?: () => void }> = ({ items, onPicked }) => (
  <ul className="space-y-1.5">
    {items.map(({ label, Icon, onClick, active }) => (
      <li key={label}>
        <button
          type="button"
          onClick={() => {
            onPicked?.();
            onClick();
          }}
          aria-current={active ? 'page' : undefined}
          className={`w-full flex items-center gap-3.5 pl-4 pr-3 h-12 rounded-xl text-[16px] font-semibold text-left transition-colors motion-reduce:transition-none ${FOCUS} ${
            active
              ? 'text-[#16251f] shadow-[0_6px_18px_rgba(201,163,90,0.35)]'
              : 'text-white/85 hover:bg-white/10 hover:text-white'
          }`}
          style={active ? { background: `linear-gradient(90deg, ${GOLD_SOFT}, ${PLCC_GOLD})` } : undefined}
        >
          <Icon size={20} className="shrink-0" aria-hidden />
          <span className="truncate">{label}</span>
        </button>
      </li>
    ))}
  </ul>
);

const SidebarBrand: React.FC = () => (
  <div className="text-center">
    <img src={WORDMARK_IMG} alt="PLCC ONE" width={170} height={64} className="mx-auto w-[170px] h-auto" decoding="async" />
    <p className="mt-3 text-[17px] leading-snug font-semibold text-white/90">
      Promised Land
      <br />
      Christian Center
    </p>
  </div>
);

export const PlccSidebar: React.FC<{ items: NavItem[] }> = ({ items }) => (
  <aside
    className="hidden lg:flex flex-col w-[264px] shrink-0 h-screen sticky top-0 overflow-hidden text-white"
    style={{ background: `linear-gradient(180deg, ${PLCC_GREEN} 0%, ${PLCC_GREEN_DEEP} 100%)` }}
  >
    <div className="px-7 pt-8 pb-6">
      <SidebarBrand />
    </div>
    <nav aria-label="PLCC ONE" className="px-4 overflow-y-auto">
      <NavList items={items} />
    </nav>
    <div className="mx-7 my-6 border-t border-white/15" />
    <p className="px-8 flex items-center gap-2.5 text-[15px] text-white/80">
      <Globe2 size={18} aria-hidden /> A Worldwide Church
    </p>
    <div className="flex-1 min-h-6" />
    {/* Decorative band: hidden on short screens so it never covers the menu. */}
    <div className="relative h-40 shrink-0 [@media(max-height:720px)]:hidden" aria-hidden>
      <div
        className="absolute -left-10 -right-10 bottom-0 h-44 origin-bottom-left -skew-y-12"
        style={{ borderTop: `4px solid ${PLCC_GOLD}` }}
      >
        <KenteBand className="absolute inset-0" />
      </div>
    </div>
  </aside>
);

/** Phone/tablet menu: a slide-in drawer with the same items as the sidebar. */
export const PlccMobileDrawer: React.FC<{ open: boolean; onClose: () => void; items: NavItem[] }> = ({
  open,
  onClose,
  items,
}) => {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="lg:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="PLCC ONE menu">
      <button type="button" aria-label="Close menu" onClick={onClose} className="absolute inset-0 bg-black/45" tabIndex={-1} />
      <div
        className="absolute left-0 top-0 bottom-0 w-[82vw] max-w-[300px] flex flex-col text-white shadow-2xl"
        style={{ background: `linear-gradient(180deg, ${PLCC_GREEN} 0%, ${PLCC_GREEN_DEEP} 100%)` }}
      >
        <div className="flex justify-end p-3">
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className={`w-11 h-11 rounded-full flex items-center justify-center hover:bg-white/10 ${FOCUS}`}
          >
            <X size={22} aria-hidden />
          </button>
        </div>
        <div className="px-6 pb-6">
          <SidebarBrand />
        </div>
        <nav aria-label="PLCC ONE" className="px-4 overflow-y-auto">
          <NavList items={items} onPicked={onClose} />
        </nav>
        <p className="mt-6 px-8 flex items-center gap-2.5 text-[15px] text-white/80">
          <Globe2 size={18} aria-hidden /> A Worldwide Church
        </p>
        <div className="flex-1" />
        <KenteBand className="h-16 shrink-0" style={{ borderTop: `4px solid ${PLCC_GOLD}` }} />
      </div>
    </div>
  );
};

/* ── Profile menu (shared by both top bars) ───────────────────────────── */

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'P';
  return ((parts[0][0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

const ProfileMenu: React.FC<{ name: string; onSignOut: () => void; onDark?: boolean }> = ({ name, onSignOut, onDark }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const first = name.trim().split(/\s+/)[0] || 'Member';
  return (
    <div ref={ref} className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${first}`}
        className={`flex items-center gap-2 rounded-full pl-1 pr-2.5 py-1 ${onDark ? 'text-white hover:bg-white/10' : 'hover:bg-[#16251f]/5'} ${FOCUS}`}
      >
        <span
          className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-extrabold"
          style={onDark ? { background: GOLD_SOFT, color: PLCC_GREEN_DEEP } : { background: PLCC_GREEN, color: '#fff' }}
        >
          {initialsOf(name || first)}
        </span>
        <ChevronDown size={16} className={onDark ? 'opacity-80' : 'text-[#16251f]/70'} aria-hidden />
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 mt-2 w-64 rounded-xl bg-white shadow-xl border border-[#16251f]/10 py-1.5 z-40">
          <p className="px-4 pt-1.5 pb-2 text-xs font-bold text-[#16251f]/50 truncate">Signed in as {first}</p>
          <Link
            role="menuitem"
            to="/help/member-setup"
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-[#16251f] hover:bg-[#f6f1e6] focus:bg-[#f6f1e6] outline-none"
          >
            <HelpCircle size={16} aria-hidden /> Help
          </Link>
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              setOpen(false);
              openReport({ kind: 'problem' });
            }}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-[#16251f] hover:bg-[#f6f1e6] focus:bg-[#f6f1e6] outline-none"
          >
            <Flag size={16} aria-hidden /> Report a problem
          </button>
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              setOpen(false);
              openReport({ kind: 'safety' });
            }}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-[#16251f] hover:bg-red-50 focus:bg-red-50 outline-none"
          >
            <ShieldAlert size={16} className="text-red-600" aria-hidden /> Report harassment or a scam
          </button>
          <div className="my-1 border-t border-[#16251f]/10" />
          <button
            role="menuitem"
            type="button"
            onClick={onSignOut}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-[#16251f] hover:bg-[#f6f1e6] focus:bg-[#f6f1e6] outline-none"
          >
            <LogOut size={16} aria-hidden /> Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
};

/* ── Phone/tablet top bar ─────────────────────────────────────────────── */

export const PlccMobileBar: React.FC<{ name: string; onMenu: () => void; onSignOut: () => void }> = ({
  name,
  onMenu,
  onSignOut,
}) => (
  <header className="lg:hidden sticky top-0 z-30" style={{ background: PLCC_GREEN_DEEP }}>
    <div className="px-2 sm:px-6 h-16 flex items-center justify-between gap-2">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onMenu}
          aria-label="Open menu"
          className={`w-11 h-11 rounded-full flex items-center justify-center text-white hover:bg-white/10 ${FOCUS}`}
        >
          <Menu size={24} aria-hidden />
        </button>
        <img src={WORDMARK_IMG} alt="PLCC ONE" width={120} height={44} className="h-11 w-auto" decoding="async" />
      </div>
      <ProfileMenu name={name} onSignOut={onSignOut} onDark />
    </div>
  </header>
);

/* ── Desktop top bar with search ──────────────────────────────────────── */

export type SearchItem = { label: string; hint: string; run: () => void };

export const PlccDesktopBar: React.FC<{
  name: string;
  items: SearchItem[];
  onSignOut: () => void;
}> = ({ name, items, onSignOut }) => {
  const navigate = useNavigate();
  const listId = useId();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return items.filter((i) => `${i.label} ${i.hint}`.toLowerCase().includes(t)).slice(0, 7);
  }, [q, items]);
  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    if (!q) return;
    const close = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setQ('');
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [q]);

  const pick = (m: SearchItem) => {
    setQ('');
    m.run();
  };
  const showList = q.trim().length > 0;

  return (
    <div className="hidden lg:flex items-center justify-between gap-6 px-8 h-[76px] border-b border-[#16251f]/10 bg-[#fbf8f1]/95 backdrop-blur sticky top-0 z-30">
      <div ref={wrapRef} className="relative w-full max-w-md">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#16251f]/45 pointer-events-none" aria-hidden />
        <input
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && matches[active] ? `${listId}-${active}` : undefined}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, Math.max(matches.length - 1, 0)));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === 'Enter' && matches[active]) {
              e.preventDefault();
              pick(matches[active]);
            } else if (e.key === 'Escape') {
              setQ('');
            }
          }}
          placeholder="Search PLCC ONE…"
          aria-label="Search PLCC ONE apps and pages"
          className="w-full h-11 pl-11 pr-4 rounded-full bg-white border border-[#16251f]/15 text-[15px] text-[#16251f] placeholder:text-[#16251f]/45 outline-none focus:border-[#1d372c] focus:ring-2 focus:ring-[#C9A35A]/40"
        />
        {showList ? (
          <ul id={listId} role="listbox" aria-label="Search results" className="absolute left-0 right-0 mt-2 rounded-2xl bg-white shadow-xl border border-[#16251f]/10 py-1.5 z-40">
            {matches.length ? (
              matches.map((m, i) => (
                <li
                  key={m.label}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(m)}
                  className={`px-4 py-2.5 cursor-pointer ${i === active ? 'bg-[#f6f1e6]' : ''}`}
                >
                  <span className="block font-bold text-[#16251f]">{m.label}</span>
                  <span className="block text-sm text-[#16251f]/60">{m.hint}</span>
                </li>
              ))
            ) : (
              <li role="option" aria-selected={false} aria-disabled className="px-4 py-3 text-sm text-[#16251f]/60">
                No results found for “{q.trim()}”.
              </li>
            )}
          </ul>
        ) : null}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/notifications')}
          aria-label="Notifications"
          className={`w-11 h-11 rounded-full flex items-center justify-center text-[#16251f] hover:bg-[#16251f]/5 ${FOCUS}`}
        >
          <Bell size={22} aria-hidden />
        </button>
        <ProfileMenu name={name} onSignOut={onSignOut} />
      </div>
    </div>
  );
};

/* ── Welcome banner ───────────────────────────────────────────────────── */

const HERO_ALT = 'Welcome to PLCC ONE — Promised Land Christian Center. One family. Many nations. One purpose.';

/**
 * Full-bleed banner.
 * ≥640px: the approved artwork edge to edge (cropped only at the bottom on very wide
 * screens, anchored left so the embedded text is never cut).
 * <640px: live text on the left with the globe artwork on the right, so the
 * welcome message stays readable instead of shrinking with the image.
 */
export const PlccHero: React.FC = () => (
  <section aria-label="Welcome to PLCC ONE" className="relative">
    <div className="hidden sm:block relative w-full overflow-hidden bg-[#f3e6cc] aspect-[2169/689] lg:aspect-auto lg:h-[clamp(260px,calc((100vw-264px)/3.5),470px)]">
      <img
        src={HERO_IMG}
        alt={HERO_ALT}
        width={2169}
        height={689}
        fetchPriority="high"
        decoding="async"
        className="absolute inset-0 w-full h-full object-cover object-[0%_12%]"
      />
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-b from-transparent to-[#f6f1e6]" />
    </div>

    <div className="sm:hidden relative overflow-hidden h-[220px]" style={{ background: 'linear-gradient(120deg,#fbf3e2 0%,#f4dfb6 60%,#e9c98d 100%)' }}>
      <img
        src={HERO_GLOBE_IMG}
        alt=""
        width={1089}
        height={689}
        fetchPriority="high"
        decoding="async"
        className="absolute right-0 top-0 h-full w-auto max-w-none object-cover"
        style={{ transform: 'translateX(28%)' }}
      />
      <div aria-hidden className="absolute inset-0" style={{ background: 'linear-gradient(90deg,#fbf3e2 0%,rgba(251,243,226,0.92) 48%,rgba(251,243,226,0) 78%)' }} />
      <div className="relative z-10 h-full flex flex-col justify-center pl-5 pr-[30%]">
        <h1 className="text-[#1d372c] text-[31px] leading-[1.02] font-bold tracking-[-0.01em]" style={serif}>
          Welcome to
          <br />
          PLCC ONE
        </h1>
        <p className="mt-2 text-[10px] leading-[1.35] font-extrabold uppercase tracking-[0.18em]" style={{ color: '#a98a45' }}>
          Promised Land
          <br />
          Christian Center
        </p>
        <p className="mt-1.5 text-[13.5px] leading-snug italic font-semibold text-[#1d372c]">
          One family. Many nations.
          <br />
          One purpose.
        </p>
        <span aria-hidden className="mt-2.5 block w-12 h-[3px] rounded-full" style={{ background: PLCC_GOLD }} />
      </div>
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-b from-transparent to-[#f6f1e6]" />
    </div>
  </section>
);

/* ── Featured cards ───────────────────────────────────────────────────── */

/** The whole card is one link to Canaan (no nested controls). */
export const CanaanFeature: React.FC<{ onOpen: () => void }> = ({ onOpen }) => (
  <Link
    to="/dashboard"
    onClick={onOpen}
    aria-label="Open Canaan — church administration"
    className={`group relative block w-full overflow-hidden rounded-[22px] cursor-pointer shadow-[0_10px_30px_rgba(22,37,31,0.18)] hover:shadow-[0_18px_44px_rgba(201,163,90,0.38)] ring-1 ring-[#C9A35A]/30 hover:ring-[#C9A35A]/70 ${LIFT} ${FOCUS}`}
    style={{ background: PLCC_GREEN_DEEP }}
  >
    <img src={CANAAN_IMG} alt="" width={1892} height={791} decoding="async" className="block w-full h-auto" />
    <span
      aria-hidden
      className="absolute left-[30%] bottom-[11%] sm:bottom-[16%] inline-flex items-center gap-1.5 sm:gap-2 h-7 sm:h-9 2xl:h-10 px-3 sm:px-4 2xl:px-5 rounded-full text-[12px] sm:text-[14px] 2xl:text-[15px] font-bold text-[#16251f] shadow-[0_6px_18px_rgba(0,0,0,0.35)] group-hover:gap-3 transition-all motion-reduce:transition-none"
      style={{ background: 'linear-gradient(180deg, #FAD86B 0%, #EDB23A 100%)' }}
    >
      Open Canaan <ArrowRight className="w-3.5 h-3.5 sm:w-[17px] sm:h-[17px]" />
    </span>
  </Link>
);

/** Members' featured card: the prayer rooms (they don't use Canaan's admin tools). */
export const SanctumFeature: React.FC<{ onOpen: () => void; busy: boolean }> = ({ onOpen, busy }) => (
  <button
    type="button"
    onClick={onOpen}
    disabled={busy}
    aria-label="Open PLCC Sanctum prayer rooms"
    className={`group relative w-full overflow-hidden rounded-[22px] p-7 sm:p-9 text-left text-white min-h-[220px] flex flex-col justify-center cursor-pointer shadow-[0_10px_30px_rgba(22,37,31,0.18)] hover:shadow-[0_18px_44px_rgba(201,163,90,0.35)] disabled:opacity-80 ${LIFT} ${FOCUS}`}
    style={{ background: `linear-gradient(120deg, ${PLCC_GREEN_DEEP} 0%, ${PLCC_GREEN} 55%, #6b5a24 100%)` }}
  >
    <Flame size={130} className="absolute -right-4 -bottom-6 opacity-15" style={{ color: GOLD_SOFT }} aria-hidden />
    <span className="text-xs font-extrabold uppercase tracking-[0.22em]" style={{ color: GOLD_SOFT }}>
      PLCC Sanctum
    </span>
    <span className="mt-2 text-[30px] sm:text-[38px] leading-tight font-semibold" style={serif}>
      Step into the Promised Land
    </span>
    <span className="mt-1 text-white/80">Live prayer rooms for the whole PLCC family, wherever you are.</span>
    <span
      aria-hidden
      className="mt-5 self-start inline-flex items-center gap-2 h-11 px-5 rounded-full font-bold text-[#16251f] group-hover:gap-3 transition-all motion-reduce:transition-none"
      style={{ background: `linear-gradient(90deg, ${GOLD_SOFT}, ${PLCC_GOLD})` }}
    >
      {busy ? <Loader2 size={18} className="animate-spin" /> : null}
      Join the prayer room <ArrowRight size={18} />
    </span>
  </button>
);

/* ── App list ─────────────────────────────────────────────────────────── */

export const PlccAppList: React.FC<{
  apps: HomeApp[];
  onOpen: (id: AwcOneAppId) => void;
  busyId: AwcOneAppId | null;
  badges?: Partial<Record<AwcOneAppId, number>>;
}> = ({ apps, onOpen, busyId, badges }) => (
  <nav aria-label="PLCC apps" className="h-full">
    <ul className="h-full grid gap-4 auto-rows-fr md:grid-cols-2 xl:grid-cols-1">
      {apps.map(({ id, name, tags, Icon, soon }) => {
        const busy = busyId === id;
        const badge = badges?.[id];
        return (
          <li key={id} className="min-h-[92px]">
            <button
              type="button"
              onClick={() => onOpen(id)}
              disabled={busy}
              aria-label={`Open ${name}${soon ? ' (coming soon)' : ''}${badge ? `, ${badge} unread` : ''}`}
              className={`group relative w-full h-full flex items-center gap-4 rounded-[20px] bg-white border border-[#16251f]/10 pl-5 pr-4 py-4 text-left cursor-pointer shadow-[0_1px_2px_rgba(22,37,31,0.05)] hover:border-[#C9A35A]/60 hover:shadow-[0_12px_30px_rgba(22,37,31,0.10)] disabled:opacity-70 ${LIFT} ${FOCUS}`}
            >
              <span aria-hidden className="absolute left-0 top-5 bottom-5 w-[3px] rounded-r-full bg-[#C9A35A] opacity-0 group-hover:opacity-100 transition-opacity" />
              <span
                className="relative w-14 h-14 shrink-0 rounded-2xl flex items-center justify-center ring-1 ring-[#1d372c]/5 group-hover:ring-[#C9A35A]/50 transition"
                style={{ background: '#e7efe9', color: PLCC_GREEN }}
              >
                {busy ? <Loader2 size={26} className="animate-spin" aria-hidden /> : <Icon size={26} strokeWidth={1.9} aria-hidden />}
                {badge ? (
                  <span
                    aria-hidden
                    className="absolute -top-1.5 -right-1.5 min-w-[22px] h-[22px] px-1 rounded-full text-white text-[11px] font-extrabold flex items-center justify-center ring-2 ring-white"
                    style={{ background: '#b2361f' }}
                  >
                    {badge > 99 ? '99+' : badge}
                  </span>
                ) : null}
              </span>
              <span className="flex-1 min-w-0">
                <span className="flex items-center gap-2">
                  <span className="text-[21px] sm:text-[22px] leading-tight font-bold text-[#16251f] truncate" style={serif}>
                    {name}
                  </span>
                  {soon ? (
                    <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide bg-[#f6eedc] text-[#8a6d2c]">
                      Soon
                    </span>
                  ) : null}
                </span>
                <span className="block mt-1 text-[14px] sm:text-[15px] leading-snug text-[#16251f]/65">{tags}</span>
              </span>
              <span
                aria-hidden
                className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center bg-[#e7efe9] text-[#1d372c] group-hover:bg-[#C9A35A] group-hover:text-[#16251f] transition-colors motion-reduce:transition-none"
              >
                <ArrowRight size={19} />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  </nav>
);

/* ── Next gathering (real event data only) ────────────────────────────── */

export const NextGathering: React.FC<{ enabled: boolean }> = ({ enabled }) => {
  const navigate = useNavigate();
  const [next, setNext] = useState<HomeEvent | null | undefined>(undefined);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    authedFetch('/api/vault?resource=events')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive) setNext(upcoming(d)[0] ?? null);
      })
      .catch(() => {
        if (alive) setNext(null);
      });
    return () => {
      alive = false;
    };
  }, [enabled]);

  return (
    <section
      aria-label="Next gathering"
      className="relative overflow-hidden rounded-[20px] bg-white border border-[#16251f]/10 shadow-[0_1px_2px_rgba(22,37,31,0.05)] flex items-stretch"
    >
      <KenteBand className="w-2.5 shrink-0" style={{ backgroundSize: '22px 22px' }} />
      <div className="flex-1 min-w-0 flex flex-wrap items-center gap-4 p-4 sm:p-5">
        <span className="w-12 h-12 sm:w-14 sm:h-14 shrink-0 rounded-2xl flex items-center justify-center text-white" style={{ background: PLCC_GREEN }}>
          <CalendarDays size={24} aria-hidden />
        </span>
        <div className="flex-1 min-w-[160px]">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em]" style={{ color: '#8a6d2c' }}>
            Next gathering
          </p>
          {next === undefined ? (
            <p className="mt-1 h-6 w-48 max-w-full rounded bg-[#16251f]/5 animate-pulse motion-reduce:animate-none" aria-label="Loading" />
          ) : next ? (
            <>
              <p className="mt-0.5 text-[19px] font-bold text-[#16251f] truncate" style={serif}>{next.title}</p>
              <p className="text-sm text-[#16251f]/65">
                {formatEventWhenLabel(next)}
                {next.location ? ` · ${next.location}` : ''}
              </p>
            </>
          ) : (
            <p className="mt-0.5 text-[16px] sm:text-[17px] font-semibold text-[#16251f]/70">No gatherings on the calendar yet.</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => navigate('/events/overview')}
          className={`inline-flex items-center gap-2 h-11 px-5 rounded-full text-white font-bold hover:brightness-110 ${FOCUS}`}
          style={{ background: PLCC_GREEN }}
        >
          {next ? 'Details' : 'Calendar'} <ArrowRight size={18} aria-hidden />
        </button>
      </div>
    </section>
  );
};

/* ── Bible (opens the reader on the church website) ───────────────────── */

export const BIBLE_LEFT_IMG = '/images/awc-one/bible-left.webp';
export const BIBLE_RIGHT_IMG = '/images/awc-one/bible-right.webp';

export const BibleFeature: React.FC<{ href: string }> = ({ href }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener"
    aria-label="Open the Bible (opens the church website in a new tab)"
    className={`group relative isolate block overflow-hidden rounded-[22px] text-white shadow-[0_10px_30px_rgba(22,37,31,0.18)] hover:shadow-[0_18px_44px_rgba(201,163,90,0.32)] ${LIFT} ${FOCUS}`}
    style={{ background: '#063220' }}
  >
    <img src={BIBLE_LEFT_IMG} alt="" width={700} height={724} decoding="async" className="absolute inset-y-0 left-0 -z-10 h-full w-auto max-w-none" />
    <img src={BIBLE_RIGHT_IMG} alt="" width={1352} height={724} decoding="async" className="absolute inset-y-0 right-0 -z-10 hidden h-full w-auto max-w-none sm:block" />
    <div className="flex flex-col gap-4 px-6 py-7 sm:flex-row sm:items-center sm:justify-between sm:px-10 sm:py-8 sm:pl-[clamp(140px,16vw,220px)]">
      <div className="max-w-xl">
        <p className="text-xs font-extrabold uppercase tracking-[0.22em]" style={{ color: GOLD_SOFT }}>The Bible</p>
        <p className="mt-1 text-[30px] sm:text-[36px] leading-tight font-light" style={serif}>Read the Word</p>
        <p className="mt-1 text-[15px] leading-snug text-white/80">
          Luganda, Kiswahili, English and more. Compare two languages verse by verse and share a verse on WhatsApp.
        </p>
      </div>
      <span
        aria-hidden
        className="shrink-0 self-start sm:self-center inline-flex items-center gap-2 h-11 px-5 rounded-full font-bold text-[#16251f] group-hover:gap-3 transition-all motion-reduce:transition-none"
        style={{ background: `linear-gradient(90deg, ${GOLD_SOFT}, ${PLCC_GOLD})` }}
      >
        Open the Bible <ArrowRight size={18} />
      </span>
    </div>
  </a>
);

/* ── Quick actions ────────────────────────────────────────────────────── */

export type QuickAction = { label: string; Icon: LucideIcon; run: () => void };

export const PlccQuickActions: React.FC<{ actions: QuickAction[] }> = ({ actions }) => (
  <section aria-labelledby="plcc-quick-actions" className="rounded-[20px] bg-white/70 border border-[#16251f]/10 p-4 sm:p-5 flex flex-col xl:flex-row xl:items-center gap-4">
    <h2 id="plcc-quick-actions" className="flex items-center gap-2 text-[19px] font-bold text-[#16251f] xl:pr-5 xl:border-r xl:border-[#16251f]/10 shrink-0">
      <Zap size={22} style={{ color: PLCC_GOLD }} fill={PLCC_GOLD} aria-hidden /> Quick Actions
    </h2>
    <div className={`grid grid-cols-2 ${actions.length >= 4 ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-3 flex-1`}>
      {actions.map(({ label, Icon, run }) => (
        <button
          key={label}
          type="button"
          onClick={run}
          className={`flex items-center justify-center gap-2 sm:gap-2.5 min-h-[56px] px-2 sm:px-3 rounded-2xl bg-white border border-[#16251f]/10 text-[14px] sm:text-[15px] font-semibold whitespace-nowrap text-[#16251f] hover:border-[#C9A35A]/60 hover:shadow-[0_10px_30px_rgba(22,37,31,0.10)] ${LIFT} ${FOCUS}`}
        >
          <Icon size={20} className="shrink-0" style={{ color: PLCC_GREEN }} aria-hidden /> {label}
        </button>
      ))}
    </div>
  </section>
);
