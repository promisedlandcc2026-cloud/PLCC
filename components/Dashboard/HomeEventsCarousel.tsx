import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, MapPin } from 'lucide-react';
import {
  eventCalendarYmd,
  eventsOverviewPath,
  formatEventDayLabel,
} from '../../lib/eventDate';

export type HomeEventCard = {
  id?: string;
  title: string;
  date?: string;
  time?: string;
  start_time?: string;
  location?: string | null;
  image_url?: string | null;
};

type Props = {
  events: HomeEventCard[];
  loading?: boolean;
};

function formatWhen(e: HomeEventCard): string {
  const ymd = eventCalendarYmd(e);
  if (!ymd) return 'Date TBA';
  return formatEventDayLabel(ymd);
}

/** Home “Happening at PLCC” — fixed 2×2 grid (not a horizontal scroller). */
const HomeEventsCarousel: React.FC<Props> = ({ events, loading }) => {
  const navigate = useNavigate();
  const list = events.slice(0, 4);
  const seeAllPath = eventsOverviewPath(eventCalendarYmd(list[0] ?? events[0] ?? null));

  return (
    <section className="min-w-0" data-home-events-carousel="true" data-home-events-grid="2x2">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h2 className="text-lg font-black text-[#0d1a14] tracking-tight leading-tight">
            Happening at PLCC
          </h2>
          <p className="text-xs text-gray-500 font-medium mt-1">Upcoming gatherings</p>
        </div>
        <button
          type="button"
          onClick={() => navigate(seeAllPath)}
          className="mt-0.5 text-[10px] font-black uppercase tracking-widest text-burgundy hover:text-[#101814] shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold rounded"
        >
          See all
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[11.5rem] rounded-2xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-5 py-10 text-center">
          <CalendarDays className="mx-auto text-gray-300 mb-2" size={28} />
          <p className="text-sm font-bold text-gray-400">No upcoming events yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {list.map((e, idx) => (
            <button
              key={e.id || `${e.title}-${idx}`}
              type="button"
              onClick={() => navigate(eventsOverviewPath(eventCalendarYmd(e)))}
              className="w-full min-w-0 rounded-2xl overflow-hidden border border-gray-100 bg-white shadow-sm hover:shadow-md hover:border-burgundy/20 transition-all text-left group focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            >
              <div className="relative h-24 sm:h-28 bg-gradient-to-br from-burgundy to-[#101814]">
                {e.image_url ? (
                  <img
                    src={e.image_url}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <CalendarDays className="text-gold/40" size={32} />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-burgundy/85 via-burgundy/20 to-transparent" />
                <span className="absolute bottom-2 left-2 inline-flex max-w-[calc(100%-1rem)] truncate rounded-md bg-burgundy/90 px-1.5 py-0.5 text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-gold">
                  {formatWhen(e)}
                </span>
              </div>
              <div className="px-2.5 sm:px-3.5 py-2.5 sm:py-3 min-h-[4.25rem]">
                <h3 className="text-[12px] sm:text-sm font-black text-[#0d1a14] tracking-tight line-clamp-2 leading-snug group-hover:text-burgundy">
                  {e.title}
                </h3>
                {e.location ? (
                  <p className="mt-1 text-[10px] sm:text-[11px] text-gray-500 font-medium flex items-start gap-1 leading-snug">
                    <MapPin size={11} className="shrink-0 text-gold mt-0.5" />
                    <span className="line-clamp-1">{e.location}</span>
                  </p>
                ) : null}
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
};

export default HomeEventsCarousel;
