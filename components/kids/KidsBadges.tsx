import React, { useEffect, useMemo, useState } from 'react';
import { CalendarCheck, Flame, Lock, Sparkles, Star, X, Zap, type LucideIcon } from 'lucide-react';
import type { KidsBadge, KidsBadgeCategory, KidsBadgeTier, KidsLevel } from '../../lib/parentDependentsClient';

type Tone = { ink: string; muted: string; card: string; accent: string; accentInk: string; track: string };

const TIER: Record<KidsBadgeTier, { ring: string; fill: string; label: string }> = {
  bronze: { ring: '#B8723C', fill: '#E9A86F', label: 'Bronze' },
  silver: { ring: '#7F8C99', fill: '#C3CCD5', label: 'Silver' },
  gold: { ring: '#C48A12', fill: '#F2C64B', label: 'Gold' },
  diamond: { ring: '#2F7FB8', fill: '#8CCAF0', label: 'Diamond' },
};

const ICON: Record<KidsBadgeCategory, LucideIcon> = {
  checkins: CalendarCheck,
  streak: Flame,
  points: Star,
  midweek: Zap,
};

const CLAY =
  '0 14px 28px rgba(40,40,80,.10), 0 2px 4px rgba(40,40,80,.06), inset 0 2px 0 rgba(255,255,255,.7), inset 0 -5px 0 rgba(40,40,80,.05)';

function shortDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function Medal({ badge, size = 64 }: { badge: KidsBadge; size?: number }) {
  const t = TIER[badge.tier];
  const Icon = ICON[badge.category];
  const on = badge.earned;
  return (
    <span
      className="relative rounded-full flex items-center justify-center shrink-0"
      style={{
        width: size,
        height: size,
        background: on ? t.fill : '#E7E5E2',
        border: `4px solid ${on ? t.ring : '#CFCAC4'}`,
        boxShadow: on
          ? '0 6px 12px rgba(40,40,80,.18), inset 0 3px 0 rgba(255,255,255,.55), inset 0 -4px 0 rgba(0,0,0,.12)'
          : 'inset 0 2px 4px rgba(0,0,0,.08)',
        color: on ? '#FFFFFF' : '#8E877F',
      }}
    >
      <Icon size={Math.round(size * 0.42)} aria-hidden />
      {!on ? (
        <span
          className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center"
          style={{ background: '#FFFFFF', color: '#6F6860', boxShadow: '0 2px 4px rgba(0,0,0,.15)' }}
        >
          <Lock size={12} aria-hidden />
        </span>
      ) : null}
    </span>
  );
}

function Bar({ value, max, tone }: { value: number; max: number; tone: Tone }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, Math.round((value / max) * 100))) : 100;
  return (
    <span className="block h-2.5 w-full rounded-full overflow-hidden" style={{ background: tone.track }}>
      <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: tone.accent }} />
    </span>
  );
}

export function KidsLevelBar({ level, tone }: { level: KidsLevel; tone: Tone }) {
  const span = level.nextLevelAt != null ? level.nextLevelAt - level.levelStart : 0;
  const into = level.points - level.levelStart;
  return (
    <section className="rounded-[24px] p-4 sm:p-5 flex items-center gap-4" style={{ background: tone.card, boxShadow: CLAY }}>
      <span
        className="w-14 h-14 rounded-2xl flex flex-col items-center justify-center shrink-0 font-black leading-none"
        style={{ background: tone.accent, color: tone.accentInk }}
        aria-hidden
      >
        <span className="text-[10px] uppercase tracking-wider opacity-90">Lvl</span>
        <span className="text-2xl">{level.level}</span>
      </span>
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <h2 className="text-lg font-black" style={{ color: tone.ink }}>
            Level {level.level} · {level.title}
          </h2>
          <span className="text-xs font-black" style={{ color: tone.muted }}>
            {level.nextLevelAt != null
              ? `${level.nextLevelAt - level.points} pts to Level ${level.level + 1}`
              : 'Top level reached!'}
          </span>
        </div>
        <Bar value={level.nextLevelAt != null ? into : 1} max={level.nextLevelAt != null ? span : 1} tone={tone} />
      </div>
    </section>
  );
}

export function KidsBadgeGrid({ badges, tone }: { badges: KidsBadge[]; tone: Tone }) {
  const earned = badges.filter((b) => b.earned).length;
  const next = useMemo(() => {
    const locked = badges.filter((b) => !b.earned);
    return locked.sort((a, b) => b.progress / b.goal - a.progress / a.goal)[0] || null;
  }, [badges]);
  const [open, setOpen] = useState<KidsBadge | null>(null);

  return (
    <section className="rounded-[28px] p-5 sm:p-6 space-y-5" style={{ background: tone.card, boxShadow: CLAY }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-black" style={{ color: tone.ink }}>
          My Badges
        </h2>
        <span className="text-xs font-black px-3 py-1.5 rounded-xl" style={{ background: tone.track, color: tone.ink }}>
          {earned} of {badges.length} earned
        </span>
      </div>

      {next ? (
        <div className="rounded-2xl p-4 flex items-center gap-4" style={{ background: tone.track }}>
          <Medal badge={next} size={56} />
          <div className="flex-1 min-w-0 space-y-1.5">
            <p className="text-[11px] font-black uppercase tracking-widest" style={{ color: tone.muted }}>
              Next up
            </p>
            <p className="font-black" style={{ color: tone.ink }}>
              {next.name} <span style={{ color: tone.muted }}>· {next.description}</span>
            </p>
            <Bar value={next.progress} max={next.goal} tone={tone} />
            <p className="text-xs font-bold" style={{ color: tone.muted }}>
              {next.progress} / {next.goal}
            </p>
          </div>
        </div>
      ) : (
        <p className="text-sm font-black" style={{ color: tone.ink }}>
          Every badge earned. Amazing!
        </p>
      )}

      <ul className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-3 sm:gap-4">
        {badges.map((b) => (
          <li key={b.id}>
            <button
              type="button"
              onClick={() => setOpen(b)}
              className="w-full min-h-[44px] flex flex-col items-center gap-2 rounded-2xl p-2 text-center hover:bg-black/[.03] focus:outline-none focus-visible:ring-2"
              aria-label={`${b.name}: ${b.earned ? `earned ${shortDate(b.earnedAt)}` : `${b.progress} of ${b.goal}`}`}
            >
              <Medal badge={b} />
              <span className="text-[12px] font-black leading-tight" style={{ color: b.earned ? tone.ink : tone.muted }}>
                {b.name}
              </span>
              {!b.earned ? (
                <span className="w-full max-w-[72px]">
                  <Bar value={b.progress} max={b.goal} tone={tone} />
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>

      {open ? <BadgeDialog badge={open} tone={tone} onClose={() => setOpen(null)} /> : null}
    </section>
  );
}

function BadgeDialog({ badge, tone, onClose }: { badge: KidsBadge; tone: Tone; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="badge-dialog-title"
        className="w-full max-w-sm rounded-[28px] p-6 flex flex-col items-center gap-3 text-center"
        style={{ background: tone.card, boxShadow: CLAY }}
        onClick={(e) => e.stopPropagation()}
      >
        <Medal badge={badge} size={96} />
        <p className="text-[11px] font-black uppercase tracking-widest" style={{ color: tone.muted }}>
          {TIER[badge.tier].label} badge
        </p>
        <h3 id="badge-dialog-title" className="text-2xl font-black" style={{ color: tone.ink }}>
          {badge.name}
        </h3>
        <p className="text-sm font-semibold" style={{ color: tone.muted }}>
          {badge.description}
        </p>
        {badge.earned ? (
          <p className="text-sm font-black" style={{ color: tone.ink }}>
            Earned {shortDate(badge.earnedAt)}
          </p>
        ) : (
          <div className="w-full space-y-1">
            <Bar value={badge.progress} max={badge.goal} tone={tone} />
            <p className="text-xs font-bold" style={{ color: tone.muted }}>
              {badge.progress} / {badge.goal} — keep going!
            </p>
          </div>
        )}
        <button
          type="button"
          autoFocus
          onClick={onClose}
          className="mt-2 min-h-[44px] px-6 rounded-2xl font-black"
          style={{ background: tone.accent, color: tone.accentInk }}
        >
          Close
        </button>
      </div>
    </div>
  );
}

/** Celebrates badges earned since this device last showed them. */
export function NewBadgeCelebration({ childId, badges, tone }: { childId: string; badges: KidsBadge[]; tone: Tone }) {
  const key = `awc-kids-badges-seen:${childId}`;
  const [fresh, setFresh] = useState<KidsBadge[]>([]);

  useEffect(() => {
    const earned = badges.filter((b) => b.earned);
    let seen: string[] = [];
    try {
      seen = JSON.parse(localStorage.getItem(key) || '[]');
      if (!Array.isArray(seen)) seen = [];
    } catch {
      seen = [];
    }
    setFresh(earned.filter((b) => !seen.includes(b.id)));
  }, [badges, key]);

  const dismiss = () => {
    try {
      localStorage.setItem(key, JSON.stringify(badges.filter((b) => b.earned).map((b) => b.id)));
    } catch {
      /* private mode — celebration may repeat, harmless */
    }
    setFresh([]);
  };

  useEffect(() => {
    if (!fresh.length) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && dismiss();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fresh.length]);

  if (!fresh.length) return null;
  const shown = fresh.slice(0, 3);
  const more = fresh.length - shown.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-badge-title"
        className="relative w-full max-w-md rounded-[32px] p-7 flex flex-col items-center gap-4 text-center overflow-hidden"
        style={{ background: tone.card, boxShadow: CLAY }}
      >
        <button
          type="button"
          aria-label="Close"
          onClick={dismiss}
          className="absolute top-3 right-3 w-11 h-11 rounded-xl flex items-center justify-center"
          style={{ color: tone.muted }}
        >
          <X size={18} aria-hidden />
        </button>
        <Sparkles size={28} aria-hidden style={{ color: tone.accent }} className="motion-safe:animate-pulse" />
        <h3 id="new-badge-title" className="text-2xl font-black" style={{ color: tone.ink }}>
          {fresh.length === 1 ? 'New badge unlocked!' : `${fresh.length} new badges unlocked!`}
        </h3>
        <div className="flex flex-wrap justify-center gap-5">
          {shown.map((b) => (
            <div key={b.id} className="flex flex-col items-center gap-2 w-24">
              <span className="motion-safe:animate-bounce">
                <Medal badge={b} size={76} />
              </span>
              <span className="text-sm font-black leading-tight" style={{ color: tone.ink }}>
                {b.name}
              </span>
            </div>
          ))}
        </div>
        {more > 0 ? (
          <p className="text-sm font-bold" style={{ color: tone.muted }}>
            +{more} more in My Badges
          </p>
        ) : null}
        <button
          type="button"
          autoFocus
          onClick={dismiss}
          className="min-h-[48px] px-8 rounded-2xl font-black"
          style={{ background: tone.accent, color: tone.accentInk }}
        >
          Awesome!
        </button>
      </div>
    </div>
  );
}
