import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  MessageSquare,
  Heart,
  CalendarDays,
  Video,
  ChevronRight,
  Music2,
} from 'lucide-react';

const TEEN_LINKS = [
  {
    key: 'feed',
    title: 'Drop into Community',
    detail: 'See what’s happening with your crew',
    path: '/community/feed',
    icon: MessageSquare,
    tag: 'Feed',
  },
  {
    key: 'prayer',
    title: 'Pray with someone',
    detail: 'Share a request or lift a friend up',
    path: '/community/prayer-wall',
    icon: Heart,
    tag: 'Prayer',
  },
  {
    key: 'events',
    title: 'What’s on this week',
    detail: 'Youth nights, hangouts, and more',
    path: '/events/overview',
    icon: CalendarDays,
    tag: 'Events',
  },
  {
    key: 'watch',
    title: 'Watch & worship',
    detail: 'Catch the live stream or a recent message',
    path: '/community/video',
    icon: Video,
    tag: 'Watch',
  },
] as const;

/**
 * Fills the Pending Signatures Home slot when there’s nothing to sign.
 * Aimed at teens / young people — same card chrome, different energy.
 */
const HomeTeensZone: React.FC = () => {
  const navigate = useNavigate();
  const links = TEEN_LINKS.slice(0, 3);

  return (
    <div className="bg-white rounded-[2rem] border border-burgundy/10 shadow-sm overflow-hidden">
      <div className="relative bg-burgundy p-6 overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-6 -top-8 w-40 h-40 rounded-full bg-gold/20 blur-2xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute left-24 -bottom-10 w-32 h-32 rounded-full bg-white/10 blur-xl"
        />
        <div className="relative z-10 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-gold shrink-0">
              <Music2 size={20} />
            </div>
            <div className="min-w-0">
              <h3 className="font-black text-white text-sm tracking-tight flex items-center gap-2">
                PLCC TEENS
                <Sparkles size={14} className="text-gold shrink-0" />
              </h3>
              <p className="text-[10px] font-bold text-gold/70 uppercase tracking-widest">
                Your spot on Home
              </p>
            </div>
          </div>
          <div className="px-3 py-1 bg-gold text-burgundy text-[10px] font-black rounded-lg shadow-lg shrink-0">
            OPEN ZONE
          </div>
        </div>
        <p className="relative z-10 mt-3 text-sm text-white/85 font-medium leading-snug max-w-lg">
          You’re caught up on signatures — jump into something with the teens crew.
        </p>
      </div>

      <div className="p-4 space-y-3">
        {links.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => navigate(item.path)}
              className="w-full flex items-center gap-4 p-4 rounded-2xl hover:bg-gray-50 transition-all border border-transparent hover:border-burgundy/5 group text-left"
            >
              <div className="w-10 h-10 rounded-xl bg-burgundy/5 text-burgundy flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                <Icon size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-[#0d1a14] text-sm truncate">{item.title}</h4>
                <div className="flex items-center gap-2 mt-1 min-w-0">
                  <span className="text-[9px] font-black text-gold uppercase tracking-tighter bg-gold/5 px-2 rounded-md shrink-0">
                    {item.tag}
                  </span>
                  <span className="text-[9px] font-bold text-gray-400 truncate">{item.detail}</span>
                </div>
              </div>
              <ChevronRight
                size={16}
                className="text-gray-300 group-hover:text-burgundy transition-colors shrink-0"
              />
            </button>
          );
        })}
      </div>

      <div className="px-6 py-4 bg-gray-50/50 border-t border-gray-50 flex items-center justify-between gap-3">
        <p className="text-[9px] font-bold text-gray-400">
          Built for teens · swaps back when new minutes need a signature.
        </p>
        <button
          type="button"
          onClick={() => navigate('/community/feed')}
          className="text-[9px] font-black uppercase tracking-widest text-burgundy hover:underline shrink-0"
        >
          Let’s go →
        </button>
      </div>
    </div>
  );
};

export default HomeTeensZone;
