import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Bell,
  CalendarDays,
  ChevronDown,
  Flame,
  Globe2,
  HandHeart,
  HelpCircle,
  Home,
  Loader2,
  LogOut,
  MessageCircle,
  Search,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { AwcOneAppId } from '../../lib/awcOne';
import { authedFetch } from '../../lib/authedFetch';
import { formatEventWhenLabel } from '../../lib/eventDate';
import { upcoming, type HomeEvent } from './PlccHomeExtras';
import { PLCC_GOLD, PLCC_GREEN, PLCC_GREEN_DEEP, WORDMARK_IMG } from './PlccOneShell';

/**
 * PLCC ONE member home (Nov 2026 redesign).
 * Desktop: green sidebar + search bar + hero, featured card, app list, quick actions.
 * Phone: the same blocks stacked, under the existing PLCC top bar.
 */

export const HERO_IMG = '/images/awc-one/plcc-one-hero.webp';
export const CANAAN_IMG = '/images/awc-one/canaan-card.webp';

const serif = { fontFamily: "'Fraunces', Georgia, serif" } as const;
const GOLD_SOFT = '#E4C98F';

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

/* ── Apps shown on the home screen ───────────────────────────────────── */

export type HomeApp = { id: AwcOneAppId; name: string; tags: string; Icon: LucideIcon };

export const JORDAN: HomeApp = { id: 'chat', name: 'Jordan', tags: 'Messages • Prayer • Calls', Icon: MessageCircle };
export const TRIBES: HomeApp = { id: 'connect', name: 'Tribes', tags: 'Community • Events • Groups', Icon: Users };
export const SANCTUM: HomeApp = { id: 'sanctum', name: 'PLCC Sanctum', tags: 'Prayer Rooms • Live Prayer', Icon: Flame };
export const FIRSTFRUITS: HomeApp = { id: 'tithe', name: 'Firstfruits', tags: 'Tithe • Offerings • Coming soon', Icon: HandHeart };
export const CANAAN: HomeApp = { id: 'vault', name: 'Canaan', tags: 'Church Administration', Icon: Home };

/* ── Sidebar (desktop) ───────────────────────────────────────────────── */

type NavItem = { label: string; Icon: LucideIcon; onClick: () => void; active?: boolean };

export const PlccSidebar: React.FC<{ items: NavItem[] }> = ({ items }) => (
  <aside
    className="hidden lg:flex flex-col w-[264px] shrink-0 h-screen sticky top-0 overflow-hidden text-white"
    style={{ background: `linear-gradient(180deg, ${PLCC_GREEN} 0%, ${PLCC_GREEN_DEEP} 100%)` }}
  >
    <div className="px-7 pt-8 pb-6 text-center">
      <img src={WORDMARK_IMG} alt="PLCC ONE" className="mx-auto w-[170px] h-auto" decoding="async" />
      <p className="mt-3 text-[17px] leading-snug font-semibold text-white/90">
        Promised Land
        <br />
        Christian Center
      </p>
    </div>
    <nav aria-label="PLCC ONE" className="px-4 space-y-1.5">
      {items.map(({ label, Icon, onClick, active }) => (
        <button
          key={label}
          type="button"
          onClick={onClick}
          aria-current={active ? 'page' : undefined}
          className={`w-full flex items-center gap-3.5 px-4 h-12 rounded-xl text-[16px] font-semibold transition ${
            active ? 'text-[#16251f] shadow-md' : 'text-white/85 hover:bg-white/10'
          }`}
          style={active ? { background: `linear-gradient(90deg, ${GOLD_SOFT}, ${PLCC_GOLD})` } : undefined}
        >
          <Icon size={20} aria-hidden /> {label}
        </button>
      ))}
    </nav>
    <div className="mx-7 my-6 border-t border-white/15" />
    <p className="px-8 flex items-center gap-2.5 text-[15px] text-white/80">
      <Globe2 size={18} aria-hidden /> A Worldwide Church
    </p>
    <div className="flex-1" />
    <div className="relative h-40">
      <div
        aria-hidden
        className="absolute -left-10 -right-10 bottom-0 h-44 origin-bottom-left -skew-y-12"
        style={{ borderTop: `4px solid ${PLCC_GOLD}` }}
      >
        <KenteBand className="absolute inset-0" />
      </div>
    </div>
  </aside>
);

/* ── Search + top bar (desktop) ──────────────────────────────────────── */

export type SearchItem = { label: string; hint: string; run: () => void };

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'P';
  return ((parts[0][0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export const PlccDesktopBar: React.FC<{
  name: string;
  items: SearchItem[];
  onSignOut: () => void;
}> = ({ name, items, onSignOut }) => {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menu]);

  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return items.filter((i) => `${i.label} ${i.hint}`.toLowerCase().includes(t)).slice(0, 6);
  }, [q, items]);

  return (
    <div className="hidden lg:flex items-center justify-between gap-6 px-8 h-[76px] border-b border-[#16251f]/10 bg-[#fbf8f1]/90 backdrop-blur sticky top-0 z-20">
      <div className="relative w-full max-w-md">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#16251f]/45" aria-hidden />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && matches[0]) {
              matches[0].run();
              setQ('');
            }
            if (e.key === 'Escape') setQ('');
          }}
          placeholder="Search PLCC ONE…"
          aria-label="Search PLCC ONE"
          className="w-full h-11 pl-11 pr-4 rounded-full bg-white border border-[#16251f]/12 text-[15px] outline-none focus:border-[#1d372c] focus:ring-2 focus:ring-[#1d372c]/15"
        />
        {q.trim() ? (
          <ul className="absolute left-0 right-0 mt-2 rounded-2xl bg-white shadow-xl border border-[#16251f]/10 py-1.5 z-30">
            {matches.length ? (
              matches.map((m) => (
                <li key={m.label}>
                  <button
                    type="button"
                    onClick={() => {
                      m.run();
                      setQ('');
                    }}
                    className="w-full text-left px-4 py-2.5 hover:bg-[#f6f1e6]"
                  >
                    <span className="block font-bold text-[#16251f]">{m.label}</span>
                    <span className="block text-sm text-[#16251f]/55">{m.hint}</span>
                  </button>
                </li>
              ))
            ) : (
              <li className="px-4 py-3 text-sm text-[#16251f]/55">Nothing found for “{q.trim()}”.</li>
            )}
          </ul>
        ) : null}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/notifications')}
          aria-label="Notifications"
          className="w-11 h-11 rounded-full flex items-center justify-center text-[#16251f] hover:bg-[#16251f]/5"
        >
          <Bell size={22} aria-hidden />
        </button>
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenu((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menu}
            className="flex items-center gap-2 rounded-full pl-1 pr-2.5 py-1 hover:bg-[#16251f]/5"
          >
            <span
              className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-extrabold text-white"
              style={{ background: PLCC_GREEN }}
            >
              {initialsOf(name)}
            </span>
            <ChevronDown size={16} className="text-[#16251f]/70" aria-hidden />
          </button>
          {menu ? (
            <div role="menu" className="absolute right-0 mt-2 w-48 rounded-xl bg-white shadow-xl border border-[#16251f]/10 py-1.5">
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
    </div>
  );
};

/* ── Hero ─────────────────────────────────────────────────────────────── */

export const PlccHero: React.FC = () => (
  <section className="relative overflow-hidden rounded-[24px] bg-[#f3e6cc]">
    <img
      src={HERO_IMG}
      alt="Welcome to PLCC ONE — Promised Land Christian Center. One family. Many nations. One purpose."
      className="block w-full h-auto"
      decoding="async"
    />
  </section>
);

/* ── Featured cards ───────────────────────────────────────────────────── */

export const CanaanFeature: React.FC<{ onOpen: () => void; busy: boolean }> = ({ onOpen, busy }) => (
  <button
    type="button"
    onClick={onOpen}
    disabled={busy}
    aria-label="Open Canaan, church administration"
    className="group relative block w-full overflow-hidden rounded-[24px] shadow-[0_10px_30px_rgba(22,37,31,0.18)] hover:shadow-[0_16px_40px_rgba(22,37,31,0.25)] hover:-translate-y-0.5 transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d372c]"
    style={{ background: PLCC_GREEN_DEEP }}
  >
    <img src={CANAAN_IMG} alt="" className="block w-full h-auto" decoding="async" />
    {busy ? (
      <span className="absolute inset-0 flex items-center justify-center bg-black/30">
        <Loader2 size={32} className="animate-spin text-white" aria-hidden />
      </span>
    ) : null}
  </button>
);

/** Members' featured card: the prayer rooms, since they don't use Canaan's admin tools. */
export const SanctumFeature: React.FC<{ onOpen: () => void; busy: boolean }> = ({ onOpen, busy }) => (
  <section
    className="relative overflow-hidden rounded-[24px] p-7 sm:p-9 text-white min-h-[220px] flex flex-col justify-center"
    style={{ background: `linear-gradient(120deg, ${PLCC_GREEN_DEEP} 0%, ${PLCC_GREEN} 55%, #6b5a24 100%)` }}
  >
    <Flame size={120} className="absolute -right-4 -bottom-6 opacity-15" style={{ color: GOLD_SOFT }} aria-hidden />
    <p className="text-xs font-extrabold uppercase tracking-[0.22em]" style={{ color: GOLD_SOFT }}>
      PLCC Sanctum
    </p>
    <h2 className="mt-2 text-[30px] sm:text-[38px] leading-tight font-semibold" style={serif}>
      Step into the Promised Land
    </h2>
    <p className="mt-1 text-white/75">Live prayer rooms for the whole PLCC family, wherever you are.</p>
    <button
      type="button"
      onClick={onOpen}
      disabled={busy}
      className="mt-5 self-start inline-flex items-center gap-2 h-11 px-5 rounded-full font-bold text-[#16251f] hover:brightness-105 disabled:opacity-70"
      style={{ background: `linear-gradient(90deg, ${GOLD_SOFT}, ${PLCC_GOLD})` }}
    >
      {busy ? <Loader2 size={18} className="animate-spin" aria-hidden /> : null}
      Join the prayer room <ArrowRight size={18} aria-hidden />
    </button>
  </section>
);

/* ── App list ─────────────────────────────────────────────────────────── */

export const PlccAppList: React.FC<{
  apps: HomeApp[];
  onOpen: (id: AwcOneAppId) => void;
  busyId: AwcOneAppId | null;
  badges?: Partial<Record<AwcOneAppId, number>>;
}> = ({ apps, onOpen, busyId, badges }) => (
  <nav aria-label="PLCC apps" className="flex flex-col gap-4">
    {apps.map(({ id, name, tags, Icon }) => {
      const busy = busyId === id;
      const badge = badges?.[id];
      return (
        <button
          key={id}
          type="button"
          onClick={() => onOpen(id)}
          disabled={busy}
          aria-label={`Open ${name}`}
          className="group flex items-center gap-4 sm:gap-5 rounded-[20px] bg-white border border-[#16251f]/10 px-5 py-4 sm:py-5 text-left shadow-[0_1px_2px_rgba(22,37,31,0.04)] hover:shadow-[0_10px_30px_rgba(22,37,31,0.10)] hover:-translate-y-0.5 transition-all disabled:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d372c]"
        >
          <span className="relative w-14 h-14 shrink-0 rounded-2xl flex items-center justify-center" style={{ background: '#e3ece6', color: PLCC_GREEN }}>
            {busy ? <Loader2 size={26} className="animate-spin" aria-hidden /> : <Icon size={28} aria-hidden />}
            {badge ? (
              <span
                aria-label={`${badge} unread`}
                className="absolute -top-2 -right-2 min-w-[22px] h-[22px] px-1 rounded-full text-white text-[11px] font-extrabold flex items-center justify-center"
                style={{ background: '#b2361f' }}
              >
                {badge > 99 ? '99+' : badge}
              </span>
            ) : null}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[21px] sm:text-[23px] font-bold text-[#16251f]" style={serif}>
              {name}
            </span>
            <span className="block mt-0.5 text-[14px] sm:text-[15px] text-[#16251f]/60 truncate">{tags}</span>
          </span>
          <span className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center bg-[#e3ece6] text-[#1d372c] group-hover:translate-x-0.5 transition-transform">
            <ArrowRight size={20} aria-hidden />
          </span>
        </button>
      );
    })}
  </nav>
);

/* ── Next gathering (real event data) ─────────────────────────────────── */

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
      .catch(() => alive && setNext(null));
    return () => {
      alive = false;
    };
  }, [enabled]);

  return (
    <section className="relative overflow-hidden rounded-[20px] bg-white border border-[#16251f]/10 shadow-[0_1px_2px_rgba(22,37,31,0.04)] flex items-stretch">
      <KenteBand className="w-3 shrink-0" style={{ backgroundSize: '24px 24px' }} />
      <div className="flex-1 flex flex-col sm:flex-row sm:items-center gap-4 p-5">
        <span className="w-14 h-14 shrink-0 rounded-2xl flex items-center justify-center text-white" style={{ background: PLCC_GREEN }}>
          <CalendarDays size={26} aria-hidden />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em]" style={{ color: '#a98a45' }}>
            Next gathering
          </p>
          {next === undefined ? (
            <p className="mt-1 h-6 w-48 rounded bg-[#16251f]/5 animate-pulse" aria-label="Loading" />
          ) : next ? (
            <>
              <p className="mt-0.5 text-[19px] font-bold text-[#16251f] truncate" style={serif}>{next.title}</p>
              <p className="text-sm text-[#16251f]/60">
                {formatEventWhenLabel(next)}
                {next.location ? ` · ${next.location}` : ''}
              </p>
            </>
          ) : (
            <p className="mt-0.5 text-[17px] font-semibold text-[#16251f]/70">No gatherings on the calendar yet.</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => navigate('/events/overview')}
          className="self-start sm:self-center inline-flex items-center gap-2 h-11 px-5 rounded-full text-white font-bold hover:brightness-110"
          style={{ background: PLCC_GREEN }}
        >
          {next ? 'Details' : 'Calendar'} <ArrowRight size={18} aria-hidden />
        </button>
      </div>
    </section>
  );
};

/* ── Quick actions ────────────────────────────────────────────────────── */

export type QuickAction = { label: string; Icon: LucideIcon; run: () => void };

export const PlccQuickActions: React.FC<{ actions: QuickAction[] }> = ({ actions }) => (
  <section className="rounded-[20px] bg-white/70 border border-[#16251f]/10 p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center gap-4">
    <h2 className="flex items-center gap-2 text-[19px] font-bold text-[#16251f] lg:pr-5 lg:border-r lg:border-[#16251f]/10 shrink-0">
      <Zap size={22} style={{ color: PLCC_GOLD }} fill={PLCC_GOLD} aria-hidden /> Quick Actions
    </h2>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 flex-1">
      {actions.map(({ label, Icon, run }) => (
        <button
          key={label}
          type="button"
          onClick={run}
          className="flex items-center justify-center gap-2.5 h-14 rounded-2xl bg-white border border-[#16251f]/10 text-[15px] font-semibold text-[#16251f] hover:shadow-[0_10px_30px_rgba(22,37,31,0.10)] hover:-translate-y-0.5 transition-all"
        >
          <Icon size={20} style={{ color: PLCC_GREEN }} aria-hidden /> {label}
        </button>
      ))}
    </div>
  </section>
);
