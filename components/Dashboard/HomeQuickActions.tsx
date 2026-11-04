import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  QrCode,
  Video,
  CalendarDays,
  DollarSign,
  Heart,
  Users,
  BookOpen,
  Clapperboard,
} from 'lucide-react';

const ACTIONS = [
  {
    label: 'Check In',
    hint: 'Children & family',
    path: '/events/check-someone-in',
    icon: QrCode,
    tone: 'bg-burgundy text-gold border-burgundy',
  },
  {
    label: 'Watch Live',
    hint: 'Sunday services',
    path: '/community/video',
    icon: Video,
    tone: 'bg-gold text-burgundy border-gold',
  },
  {
    label: 'Events',
    hint: 'Calendar',
    path: '/events/overview',
    icon: CalendarDays,
    tone: 'bg-white text-burgundy border-gray-100',
  },
  {
    label: 'Give',
    hint: 'Tithes & offerings',
    path: '/giving',
    icon: DollarSign,
    tone: 'bg-white text-burgundy border-gray-100',
  },
  {
    label: 'Prayer Wall',
    hint: 'Pray together',
    path: '/community/prayer-wall',
    icon: Heart,
    tone: 'bg-white text-burgundy border-gray-100',
  },
  {
    label: 'Community',
    hint: 'Feed & chat',
    path: '/community/feed',
    icon: Users,
    tone: 'bg-white text-burgundy border-gray-100',
  },
  {
    label: 'How-Tos',
    hint: 'Video guides',
    path: '/help/how-to-videos',
    icon: Clapperboard,
    tone: 'bg-white text-burgundy border-gray-100',
  },
] as const;

const HomeQuickActions: React.FC = () => {
  const navigate = useNavigate();

  return (
    <section>
      <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 snap-x snap-mandatory scrollbar-thin">
        {ACTIONS.map((a) => {
          const Icon = a.icon;
          return (
            <button
              key={a.path}
              type="button"
              onClick={() => navigate(a.path)}
              className={`snap-start shrink-0 w-[120px] sm:w-[140px] rounded-2xl border p-3.5 sm:p-4 text-left shadow-sm hover:shadow-md transition-all active:scale-[0.98] ${a.tone}`}
            >
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${
                  a.tone.includes('bg-burgundy')
                    ? 'bg-white/10'
                    : a.tone.includes('bg-gold')
                      ? 'bg-burgundy/10'
                      : 'bg-burgundy/5'
                }`}
              >
                <Icon size={18} />
              </div>
              <p className="text-sm font-black tracking-tight leading-tight">{a.label}</p>
              <p
                className={`text-[10px] font-bold uppercase tracking-wider mt-1 ${
                  a.tone.includes('bg-burgundy')
                    ? 'text-gold/80'
                    : a.tone.includes('bg-gold')
                      ? 'text-burgundy/70'
                      : 'text-gray-400'
                }`}
              >
                {a.hint}
              </p>
            </button>
          );
        })}
      </div>
    </section>
  );
};

export default HomeQuickActions;
