import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import QRCode from 'react-qr-code';
import { ChevronLeft, Flame, Loader2, QrCode, Star, Trophy } from 'lucide-react';
import {
  fetchKidsView,
  KIDS_THEME_OPTIONS,
  ParentDependentError,
  updateParentDependent,
  type KidsTheme,
  type KidsViewData,
} from '../../lib/parentDependentsClient';
import { KidsBadgeGrid, KidsLevelBar, NewBadgeCelebration } from '../../components/kids/KidsBadges';
import BucksPrizeShop from '../../components/kids/BucksPrizeShop';
import BucksWalletCard from '../../components/kids/BucksWalletCard';

/* ------------------------------------------------------------------ */
/* Themes — same layout, two palettes + mascots (matches the mockup). */
/* ------------------------------------------------------------------ */

type Palette = {
  page: string;
  card: string;
  ink: string;
  muted: string;
  hero: string;
  heroLabel: string;
  accent: string;
  accentInk: string;
  bar: string;
  stats: Array<{ bg: string; chip: string }>;
  qrCard: string;
  qrInk: string;
  qrMuted: string;
  cheer: string;
  cheerInk: string;
  pill: string;
  pillInk: string;
};

const PALETTES: Record<KidsTheme, Palette> = {
  soft_garden: {
    page: '#F6F1EA',
    card: '#FFFFFF',
    ink: '#2B2540',
    muted: '#5E5478',
    hero: '#FBE1DA',
    heroLabel: '#8A3E28',
    accent: '#6E4FC2',
    accentInk: '#FFFFFF',
    bar: '#CDBEF0',
    stats: [
      { bg: '#EEE8FA', chip: '#8B6FD6' },
      { bg: '#E1F2E6', chip: '#3E9A66' },
      { bg: '#FFF0DC', chip: '#D9822B' },
    ],
    qrCard: '#E7DEF7',
    qrInk: '#2B2540',
    qrMuted: '#3B3355',
    cheer: '#FCEFC7',
    cheerInk: '#4A3F1E',
    pill: '#F3EEFB',
    pillInk: '#5B3FA8',
  },
  adventure: {
    page: '#EAF1F5',
    card: '#FFFFFF',
    ink: '#18263A',
    muted: '#4A5D75',
    hero: '#D7E9F7',
    heroLabel: '#1F5A99',
    accent: '#C9541E',
    accentInk: '#FFFFFF',
    bar: '#A9C6E0',
    stats: [
      { bg: '#FFE2C7', chip: '#C9541E' },
      { bg: '#D9EEDF', chip: '#2F8A5B' },
      { bg: '#E3EEF8', chip: '#1F5A99' },
    ],
    qrCard: '#1E3A5F',
    qrInk: '#FFFFFF',
    qrMuted: '#DCE7F3',
    cheer: '#FFE2C7',
    cheerInk: '#5A3415',
    pill: '#E3EEF8',
    pillInk: '#1F5A99',
  },
};

const CLAY =
  '0 14px 28px rgba(40,40,80,.10), 0 2px 4px rgba(40,40,80,.06), inset 0 2px 0 rgba(255,255,255,.7), inset 0 -5px 0 rgba(40,40,80,.05)';
const CHIP =
  '0 6px 12px rgba(40,40,80,.16), inset 0 2px 0 rgba(255,255,255,.55), inset 0 -4px 0 rgba(0,0,0,.10)';

/* KJV (public domain) — rotates by week of the year. */
const VERSES: Array<{ text: string; ref: string }> = [
  { text: 'This is the day which the Lord hath made; we will rejoice and be glad in it.', ref: 'Psalm 118:24' },
  { text: 'Be strong and of a good courage… for the Lord thy God is with thee whithersoever thou goest.', ref: 'Joshua 1:9' },
  { text: 'I can do all things through Christ which strengtheneth me.', ref: 'Philippians 4:13' },
  { text: 'Thy word is a lamp unto my feet, and a light unto my path.', ref: 'Psalm 119:105' },
  { text: 'Children, obey your parents in the Lord: for this is right.', ref: 'Ephesians 6:1' },
  { text: 'The Lord is my shepherd; I shall not want.', ref: 'Psalm 23:1' },
  { text: 'Be ye kind one to another, tenderhearted, forgiving one another.', ref: 'Ephesians 4:32' },
  { text: 'What time I am afraid, I will trust in thee.', ref: 'Psalm 56:3' },
];

function verseOfTheWeek() {
  const now = new Date();
  const start = Date.UTC(now.getUTCFullYear(), 0, 1);
  const week = Math.floor((now.getTime() - start) / (7 * 86_400_000));
  return VERSES[week % VERSES.length];
}

function shortDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function Mascot({ theme }: { theme: KidsTheme }) {
  if (theme === 'adventure') {
    return (
      <svg width="150" height="150" viewBox="0 0 170 170" aria-hidden="true" className="shrink-0">
        <path d="M10 150 L55 85 L80 115 L110 65 L160 150 Z" fill="#9FC2DE" />
        <path d="M110 65 L98 82 L106 80 L112 88 L120 80 Z" fill="#FFFFFF" />
        <g fill="#E7843A">
          {[
            [85, 58], [62, 66], [108, 66], [52, 88], [118, 88],
            [58, 112], [112, 112], [72, 128], [98, 128], [85, 132],
          ].map(([cx, cy]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="13" />
          ))}
        </g>
        <circle cx="64" cy="66" r="7" fill="#F6C690" />
        <circle cx="106" cy="66" r="7" fill="#F6C690" />
        <circle cx="85" cy="96" r="32" fill="#F6C690" />
        <circle cx="74" cy="90" r="4" fill="#18263A" />
        <circle cx="96" cy="90" r="4" fill="#18263A" />
        <ellipse cx="85" cy="106" rx="12" ry="9" fill="#FBE2C4" />
        <path d="M80 101h10l-5 5z" fill="#6B3A10" />
        <path d="M85 106v3M79 111q6 5 12 0" stroke="#6B3A10" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="150" height="150" viewBox="0 0 170 170" aria-hidden="true" className="shrink-0">
      <ellipse cx="85" cy="158" rx="52" ry="7" fill="#E9C3B8" />
      <g fill="#FFFFFF">
        {[
          [55, 95, 26], [85, 80, 30], [115, 95, 26], [62, 122, 26],
          [108, 122, 26], [85, 128, 28], [70, 62, 18], [100, 62, 18],
        ].map(([cx, cy, r]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />
        ))}
      </g>
      <ellipse cx="85" cy="104" rx="30" ry="27" fill="#5C4A6E" />
      <ellipse cx="52" cy="98" rx="14" ry="8" fill="#5C4A6E" transform="rotate(-25 52 98)" />
      <ellipse cx="118" cy="98" rx="14" ry="8" fill="#5C4A6E" transform="rotate(25 118 98)" />
      <circle cx="75" cy="100" r="4.5" fill="#FFFFFF" />
      <circle cx="95" cy="100" r="4.5" fill="#FFFFFF" />
      <circle cx="76" cy="101" r="2.2" fill="#2B2540" />
      <circle cx="96" cy="101" r="2.2" fill="#2B2540" />
      <path d="M78 114q7 6 14 0" stroke="#FFFFFF" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function cheerFor(theme: KidsTheme, streak: number): { title: string; body: string } {
  if (streak >= 4) {
    return theme === 'adventure'
      ? { title: 'Unstoppable!', body: `${streak} weeks in a row. Keep climbing!` }
      : { title: "You're doing great!", body: `${streak} weeks in a row. Keep shining!` };
  }
  if (streak >= 1) {
    return theme === 'adventure'
      ? { title: 'On the trail!', body: 'Check in next week to grow your streak.' }
      : { title: 'Nice work!', body: 'Check in next week to grow your streak.' };
  }
  return theme === 'adventure'
    ? { title: 'Adventure awaits!', body: 'Check in this Sunday to start a streak.' }
    : { title: 'We miss you!', body: 'Check in this Sunday to start a streak.' };
}

export default function KidsViewPage() {
  const { childId = '' } = useParams<{ childId: string }>();
  const [data, setData] = useState<KidsViewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [themeBusy, setThemeBusy] = useState(false);
  const [themeError, setThemeError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchKidsView(childId));
    } catch (err) {
      setError(err instanceof ParentDependentError ? err.message : 'Could not load Kids View.');
    } finally {
      setLoading(false);
    }
  }, [childId]);

  useEffect(() => {
    void load();
  }, [load]);

  const theme: KidsTheme = data?.child.theme || 'soft_garden';
  const p = PALETTES[theme];
  const verse = useMemo(verseOfTheWeek, []);

  const changeTheme = async (next: KidsTheme) => {
    if (!data || next === theme || themeBusy) return;
    setThemeBusy(true);
    setThemeError(null);
    const prev = data;
    setData({ ...data, child: { ...data.child, theme: next } });
    try {
      await updateParentDependent({ childId: data.child.id, kidsTheme: next });
    } catch (err) {
      setData(prev);
      setThemeError(err instanceof ParentDependentError ? err.message : 'Could not change the theme.');
    } finally {
      setThemeBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center gap-2 text-gray-500" style={{ background: p.page }}>
        <Loader2 className="animate-spin" size={20} aria-hidden />
        Loading Kids View…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen p-6 flex flex-col items-center justify-center gap-4" style={{ background: p.page }}>
        <p className="text-sm font-semibold text-rose-800">{error || 'Child not found.'}</p>
        <Link to="/family" className="text-sm font-bold underline text-burgundy">
          Back to My Family
        </Link>
      </div>
    );
  }

  const { child, stats, weeklyPoints, card, badges, level, bucks } = data;
  const tone = { ink: p.ink, muted: p.muted, card: p.card, accent: p.accent, accentInk: p.accentInk, track: p.pill };
  const maxWeek = Math.max(10, ...weeklyPoints.map((w) => w.points));
  const cheer = cheerFor(theme, stats.weekStreak);
  const statCards = [
    { label: 'Week Streak', value: String(stats.weekStreak), sub: stats.weekStreak === 1 ? 'week in a row' : 'weeks in a row', Icon: Flame },
    { label: 'My Points', value: String(stats.lifetimePoints), sub: `+${stats.pointsThisWeek} this week`, Icon: Star },
    { label: 'Check-ins', value: String(stats.totalCheckins), sub: `Last: ${shortDate(stats.lastCheckinAt)}`, Icon: Trophy },
  ];

  return (
    <div className="min-h-screen p-3 sm:p-6" style={{ background: p.page, color: p.ink }}>
      <div className="max-w-6xl mx-auto space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <Link
              to="/family"
              className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-widest"
              style={{ color: p.muted }}
            >
              <ChevronLeft size={14} aria-hidden />
              My Family
            </Link>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight">
              {theme === 'adventure' ? 'Hey' : 'Hi'}, {child.firstName}!
            </h1>
            <p className="text-sm font-semibold" style={{ color: p.muted }}>
              {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
              {child.age != null ? ` · Age ${child.age}` : ''}
            </p>
          </div>

          <div
            role="radiogroup"
            aria-label="Kids View theme"
            className="flex rounded-2xl p-1 gap-1"
            style={{ background: p.card, boxShadow: CLAY }}
          >
            {KIDS_THEME_OPTIONS.map((opt) => {
              const on = opt.value === theme;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={themeBusy}
                  onClick={() => void changeTheme(opt.value)}
                  className="min-h-[44px] px-4 rounded-xl text-sm font-black transition-colors disabled:opacity-60"
                  style={on ? { background: p.accent, color: p.accentInk, boxShadow: CHIP } : { color: p.muted }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </header>

        {themeError ? <p className="text-xs font-semibold text-rose-700">{themeError}</p> : null}

        {level ? <KidsLevelBar level={level} tone={tone} /> : null}

        <div className="grid gap-4 sm:gap-5 grid-cols-1 lg:grid-cols-5">
          <section
            className="lg:col-span-3 rounded-[28px] p-5 sm:p-7 flex flex-wrap items-center gap-4"
            style={{ background: p.hero, boxShadow: CLAY }}
          >
            <Mascot theme={theme} />
            <div className="flex-1 min-w-[220px] space-y-2">
              <p className="text-xs font-black uppercase tracking-widest" style={{ color: p.heroLabel }}>
                Verse of the week
              </p>
              <p className="text-xl sm:text-2xl font-black leading-snug">“{verse.text}”</p>
              <p className="text-sm font-black" style={{ color: p.muted }}>
                {verse.ref}
              </p>
            </div>
          </section>

          <div className="lg:col-span-2 grid grid-cols-3 lg:grid-cols-1 gap-3 sm:gap-4">
            {statCards.map((s, i) => (
              <section
                key={s.label}
                className="rounded-[24px] p-4 flex flex-col lg:flex-row lg:items-center gap-2 lg:gap-4"
                style={{ background: p.stats[i].bg, boxShadow: CLAY }}
              >
                <span
                  className="w-11 h-11 rounded-2xl flex items-center justify-center text-white shrink-0"
                  style={{ background: p.stats[i].chip, boxShadow: CHIP }}
                >
                  <s.Icon size={20} aria-hidden />
                </span>
                <span className="flex flex-col min-w-0">
                  <span className="text-[11px] sm:text-xs font-black">{s.label}</span>
                  <span className="text-2xl sm:text-3xl font-black leading-none">{s.value}</span>
                  <span className="text-[11px] sm:text-xs font-bold truncate" style={{ color: p.muted }}>
                    {s.sub}
                  </span>
                </span>
              </section>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:gap-5 grid-cols-1 lg:grid-cols-5">
          <section className="lg:col-span-3 rounded-[28px] p-5 sm:p-6 space-y-4" style={{ background: p.card, boxShadow: CLAY }}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-black">My Points</h2>
              <span className="text-xs font-black px-3 py-1.5 rounded-xl" style={{ background: p.pill, color: p.pillInk }}>
                Last 6 weeks
              </span>
            </div>
            <div className="flex items-end gap-2 sm:gap-4 h-44" role="img" aria-label={`Points by week: ${weeklyPoints.map((w) => w.points).join(', ')}`}>
              {weeklyPoints.map((w, i) => {
                const last = i === weeklyPoints.length - 1;
                return (
                  <div key={w.weekStart} className="flex-1 h-full flex flex-col items-center justify-end gap-1.5">
                    <span className="text-xs font-black">{w.points}</span>
                    <div
                      className="w-full max-w-[44px] rounded-t-xl rounded-b-md"
                      style={{
                        height: `${Math.max(6, Math.round((w.points / maxWeek) * 120))}px`,
                        background: last ? p.accent : p.bar,
                        boxShadow: CHIP,
                      }}
                    />
                    <span className="text-[11px] font-bold" style={{ color: p.muted }}>
                      {shortDate(w.weekStart)}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          <section
            className="lg:col-span-2 rounded-[28px] p-5 sm:p-6 flex flex-wrap items-center gap-4"
            style={{ background: p.qrCard, boxShadow: CLAY }}
          >
            {card ? (
              <div className="bg-white p-3 rounded-2xl shrink-0">
                <QRCode value={card.qrPayload} size={128} aria-label={`${child.firstName}'s check-in code`} />
              </div>
            ) : (
              <span
                className="w-[152px] h-[152px] rounded-2xl bg-white/70 flex items-center justify-center shrink-0"
                aria-hidden
              >
                <QrCode size={56} style={{ color: p.muted }} />
              </span>
            )}
            <div className="flex-1 min-w-[150px] space-y-1.5">
              <h2 className="text-lg font-black" style={{ color: p.qrInk }}>
                My Check-in Code
              </h2>
              <p className="text-sm font-semibold" style={{ color: p.qrMuted }}>
                {card
                  ? 'Show this at the Kids desk to check in and earn points.'
                  : 'No check-in card yet. Ask the Kids desk to set one up.'}
              </p>
              {card?.cardNumber ? (
                <p className="text-xs font-black tracking-wider" style={{ color: p.qrMuted }}>
                  #{card.cardNumber}
                </p>
              ) : null}
            </div>
          </section>
        </div>

        {bucks ? <BucksWalletCard wallet={bucks} tone={tone} /> : null}
        {bucks ? (
          <BucksPrizeShop childId={child.id} cardRef={child.id ? undefined : childId} tone={tone} />
        ) : null}

        {badges?.length ? <KidsBadgeGrid badges={badges} tone={tone} /> : null}

        <section className="rounded-[28px] p-5 sm:p-6 flex items-center gap-4" style={{ background: p.cheer, boxShadow: CLAY }}>
          <span
            className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shrink-0"
            style={{ background: p.accent, boxShadow: CHIP }}
          >
            <Trophy size={22} aria-hidden />
          </span>
          <div>
            <h2 className="text-lg font-black">{cheer.title}</h2>
            <p className="text-sm font-semibold" style={{ color: p.cheerInk }}>
              {cheer.body}
            </p>
          </div>
        </section>
      </div>
      {badges?.length ? <NewBadgeCelebration childId={child.id} badges={badges} tone={tone} /> : null}
    </div>
  );
}
