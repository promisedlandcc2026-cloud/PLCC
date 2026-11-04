import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { HomeEventCard } from './HomeEventsCarousel';
import {
  eventCalendarYmd,
  eventLocalNoon,
  eventsOverviewPath,
} from '../../lib/eventDate';

type Props = {
  events: HomeEventCard[];
  loading?: boolean;
};

function normalizeTime(raw: string): string {
  const t = String(raw || '').trim();
  if (!t) return '';
  // "02:00 PM" → "2:00 PM"
  return t.replace(/^0(\d:)/, '$1');
}

function formatDayParts(ymd: string | null): { weekday: string; monthDay: string } {
  if (!ymd) return { weekday: 'Soon', monthDay: '' };
  try {
    const d = eventLocalNoon(ymd);
    return {
      weekday: d.toLocaleDateString(undefined, { weekday: 'short' }),
      monthDay: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    };
  } catch {
    return { weekday: '', monthDay: ymd };
  }
}

const HomeWeekList: React.FC<Props> = ({ events, loading }) => {
  const navigate = useNavigate();
  const week = events.slice(0, 5);
  const seeAllPath = eventsOverviewPath(eventCalendarYmd(week[0] ?? events[0] ?? null));

  return (
    <section
      className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5 flex flex-col min-w-0"
      data-home-week-list="true"
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h2 className="text-lg font-black text-[#0d1a14] tracking-tight leading-tight">
            Up next
          </h2>
          <p className="text-xs text-gray-500 font-medium mt-1">On the calendar</p>
        </div>
        <button
          type="button"
          onClick={() => navigate(seeAllPath)}
          className="mt-0.5 text-[10px] font-black uppercase tracking-widest text-burgundy hover:text-[#2a0610] shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold rounded"
        >
          Calendar
        </button>
      </div>

      {loading ? (
        <div className="space-y-2.5 animate-pulse">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 rounded-xl bg-gray-50" />
          ))}
        </div>
      ) : week.length === 0 ? (
        <p className="text-sm text-gray-400 font-medium py-6 text-center">
          No upcoming events scheduled.
        </p>
      ) : (
        <ul className="space-y-2">
          {week.map((e, idx) => {
            const ymd = eventCalendarYmd(e);
            const { weekday, monthDay } = formatDayParts(ymd);
            const time = normalizeTime(String(e.time || ''));
            return (
              <li key={e.id || `${e.title}-${idx}`}>
                <button
                  type="button"
                  onClick={() => navigate(eventsOverviewPath(ymd))}
                  className="w-full flex items-center gap-3 text-left rounded-xl border border-gray-100 bg-[#faf7f5] hover:bg-white hover:border-burgundy/20 px-3 py-2.5 transition-all group focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                >
                  <div className="w-[4.25rem] shrink-0 rounded-lg bg-white border border-gold/20 px-1.5 py-1.5 text-center">
                    <p className="text-[9px] font-black uppercase tracking-wider text-[#8A6A2E] leading-none">
                      {weekday}
                    </p>
                    <p className="text-[11px] font-black text-[#0d1a14] mt-1 leading-none whitespace-nowrap">
                      {monthDay || 'TBA'}
                    </p>
                    {time ? (
                      <p className="text-[9px] font-bold text-gray-400 mt-1 leading-none whitespace-nowrap">
                        {time}
                      </p>
                    ) : null}
                  </div>
                  <p className="text-sm font-bold text-[#0d1a14] line-clamp-2 flex-1 min-w-0 leading-snug group-hover:text-burgundy">
                    {e.title}
                  </p>
                  <ChevronRight
                    size={16}
                    className="text-gray-300 group-hover:text-burgundy shrink-0"
                    aria-hidden
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

export default HomeWeekList;
