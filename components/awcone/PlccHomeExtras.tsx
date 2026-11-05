import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, BookOpen, CalendarDays, HandHeart, Heart, Megaphone, MapPin } from 'lucide-react';
import { authedFetch } from '../../lib/authedFetch';
import { eventCalendarYmd, eventLocalNoon, formatEventWhenLabel, toEventYmd } from '../../lib/eventDate';
import { PLCC_GOLD, PLCC_GREEN } from './PlccOneShell';

/**
 * Desktop-only lower half of the PLCC ONE member home:
 * upcoming events, daily inspiration, announcements and quick links.
 * Hidden below the lg breakpoint so the phone layout stays as it is.
 */

const serif = { fontFamily: "'Fraunces', Georgia, serif" } as const;

type HomeEvent = { id?: string; title: string; date?: string; start_time?: string; time?: string; location?: string | null };
type Inspiration = { text: string; reference?: string | null };
type Announcement = { id?: string; title: string; content?: string | null };

/** Used when no word for today has been published yet (KJV, public domain). */
const FALLBACK_VERSES: Inspiration[] = [
  { text: 'The Lord is my shepherd; I shall not want.', reference: 'Psalm 23:1 (KJV)' },
  { text: 'I can do all things through Christ which strengtheneth me.', reference: 'Philippians 4:13 (KJV)' },
  { text: 'Trust in the Lord with all thine heart; and lean not unto thine own understanding.', reference: 'Proverbs 3:5 (KJV)' },
  { text: 'This is the day which the Lord hath made; we will rejoice and be glad in it.', reference: 'Psalm 118:24 (KJV)' },
  { text: 'Be strong and of a good courage; be not afraid, neither be thou dismayed.', reference: 'Joshua 1:9 (KJV)' },
  { text: 'The joy of the Lord is your strength.', reference: 'Nehemiah 8:10 (KJV)' },
  { text: 'Cast thy burden upon the Lord, and he shall sustain thee.', reference: 'Psalm 55:22 (KJV)' },
];

function todaysFallback(): Inspiration {
  const day = Math.floor(Date.now() / 86_400_000);
  return FALLBACK_VERSES[day % FALLBACK_VERSES.length];
}

function upcoming(raw: any): HomeEvent[] {
  const list: any[] = Array.isArray(raw?.events) ? raw.events : Array.isArray(raw) ? raw : [];
  const cutoff = Date.now() - 12 * 60 * 60 * 1000;
  return list
    .map((e) => ({
      id: e.id,
      title: e.title || e.name || 'Church event',
      start_time: e.start_time || e.starts_at || undefined,
      date: toEventYmd(e.date) || undefined,
      time: e.time ? String(e.time) : undefined,
      location: e.location || e.place || null,
    }))
    .map((e) => {
      const ymd = eventCalendarYmd(e);
      return { e, t: ymd ? eventLocalNoon(ymd).getTime() : Number.NaN };
    })
    .filter(({ t }) => Number.isFinite(t) && t >= cutoff)
    .sort((a, b) => a.t - b.t)
    .slice(0, 3)
    .map(({ e }) => e);
}

async function getJson(url: string): Promise<any> {
  try {
    const r = await authedFetch(url);
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

const CARD = 'rounded-[24px] bg-white border border-[#16251f]/10 shadow-[0_1px_2px_rgba(22,37,31,0.04)]';

export const PlccHomeExtras: React.FC<{ enabled: boolean }> = ({ enabled }) => {
  const navigate = useNavigate();
  const [events, setEvents] = useState<HomeEvent[]>([]);
  const [word, setWord] = useState<Inspiration | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  useEffect(() => {
    if (!enabled) return;
    // Only load on desktop, where this section is shown.
    if (typeof window !== 'undefined' && !window.matchMedia('(min-width: 1024px)').matches) return;
    let alive = true;
    void Promise.all([
      getJson('/api/vault?resource=events'),
      getJson('/api/vault?resource=community&subResource=inspiration&today=1'),
      getJson('/api/vault?resource=communication&subResource=announcements'),
    ]).then(([ev, insp, ann]) => {
      if (!alive) return;
      setEvents(upcoming(ev));
      const w = insp?.ok ? insp.inspiration : null;
      if (w?.text) setWord({ text: String(w.text), reference: w.reference ?? null });
      const list = Array.isArray(ann?.announcements) ? ann.announcements : [];
      setAnnouncements(
        list
          .filter((a: any) => a && a.title)
          .slice(0, 2)
          .map((a: any) => ({ id: a.id, title: String(a.title), content: a.content ?? null })),
      );
    });
    return () => {
      alive = false;
    };
  }, [enabled]);

  const verse = word || todaysFallback();
  const quick = [
    { label: 'Prayer', Icon: Heart, to: '/community/prayer-wall' },
    { label: 'Calendar', Icon: CalendarDays, to: '/events/overview' },
    { label: 'Give', Icon: HandHeart, to: '/giving' },
  ];

  return (
    <div className="hidden lg:block mt-10 space-y-6" aria-label="Church home">
      <div className="grid grid-cols-2 gap-6">
        {/* Upcoming events */}
        <section className={`${CARD} p-8 flex flex-col`}>
          <div className="flex items-center justify-between pb-5 border-b border-[#16251f]/10">
            <h2 className="text-2xl font-semibold text-[#16251f]" style={serif}>Upcoming Events</h2>
            <CalendarDays size={24} style={{ color: PLCC_GOLD }} aria-hidden />
          </div>
          <div className="flex-1 pt-5">
            {events.length ? (
              <ul className="space-y-4">
                {events.map((e) => (
                  <li key={e.id || e.title} className="flex gap-4">
                    <span className="w-1 rounded-full shrink-0" style={{ background: PLCC_GOLD }} aria-hidden />
                    <div className="min-w-0">
                      <p className="font-bold text-[17px] text-[#16251f] truncate">{e.title}</p>
                      <p className="text-sm text-[#16251f]/60">{formatEventWhenLabel(e)}</p>
                      {e.location ? (
                        <p className="text-sm text-[#16251f]/50 flex items-center gap-1 truncate">
                          <MapPin size={13} aria-hidden /> {e.location}
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <>
                <p className="text-xl font-semibold text-[#16251f]" style={serif}>Your next gathering</p>
                <p className="mt-2 text-[#16251f]/60">Church events will appear here.</p>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={() => navigate('/events/overview')}
            className="mt-6 self-start inline-flex items-center gap-2 font-bold hover:gap-3 transition-all"
            style={{ color: '#a98a45' }}
          >
            View calendar <ArrowRight size={18} aria-hidden />
          </button>
        </section>

        {/* Daily inspiration */}
        <section className="rounded-[24px] p-8 flex flex-col text-white" style={{ background: PLCC_GREEN }}>
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold" style={{ ...serif, color: '#E4C98F' }}>Daily Inspiration</h2>
            <BookOpen size={24} style={{ color: '#E4C98F' }} aria-hidden />
          </div>
          <blockquote className="mt-6 flex-1">
            <p className="text-[22px] leading-snug font-semibold">“{verse.text}”</p>
            {verse.reference ? (
              <footer className="mt-3 text-base" style={{ color: '#E4C98F' }}>{verse.reference}</footer>
            ) : null}
          </blockquote>
          <p className="mt-6 text-white/80">A moment in God's Word.</p>
        </section>
      </div>

      {/* Announcements */}
      <section className={`${CARD} p-8`}>
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold text-[#16251f]" style={serif}>Church Announcements</h2>
          <Megaphone size={24} style={{ color: PLCC_GOLD }} aria-hidden />
        </div>
        {announcements.length ? (
          <ul className="mt-4 divide-y divide-[#16251f]/10">
            {announcements.map((a) => (
              <li key={a.id || a.title} className="py-3">
                <p className="font-bold text-[#16251f]">{a.title}</p>
                {a.content ? <p className="mt-0.5 text-sm text-[#16251f]/60 line-clamp-2">{a.content}</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[#16251f]/60">Latest announcements from PLCC leadership will appear here.</p>
        )}
      </section>

      {/* Quick access */}
      <section className="rounded-[24px] p-8" style={{ background: '#ebe3d5' }}>
        <h2 className="text-2xl font-semibold text-[#16251f] mb-5" style={serif}>Quick Access</h2>
        <div className="grid grid-cols-3 gap-5">
          {quick.map(({ label, Icon, to }) => (
            <button
              key={label}
              type="button"
              onClick={() => navigate(to)}
              className="rounded-2xl bg-white py-6 flex flex-col items-center gap-2 text-[#16251f] font-semibold hover:shadow-[0_10px_30px_rgba(22,37,31,0.10)] hover:-translate-y-0.5 transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d372c]"
            >
              <Icon size={24} style={{ color: PLCC_GREEN }} aria-hidden />
              {label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
};

export default PlccHomeExtras;
