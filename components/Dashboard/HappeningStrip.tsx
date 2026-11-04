import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Megaphone, Heart, Cake, ChevronRight } from 'lucide-react';

export type HappeningAnnouncement = {
  id?: string;
  title: string;
  content?: string | null;
  type?: string;
};

export type HappeningPrayer = {
  id?: string;
  content?: string;
  member_name?: string | null;
  is_anonymous?: boolean;
  prayed_count?: number;
};

export type HappeningBirthday = {
  id: string;
  name: string;
  nextDate: string;
  monthDay?: string;
};

type Props = {
  announcement: HappeningAnnouncement | null;
  prayer: HappeningPrayer | null;
  birthdays: HappeningBirthday[];
  loading?: boolean;
};

function snippet(text: string | null | undefined, max = 90): string {
  const s = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return '';
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function birthdayLabel(b: HappeningBirthday): string {
  try {
    const d = new Date(`${b.nextDate}T12:00:00`);
    const today = new Date();
    const sameDay =
      d.getFullYear() === today.getFullYear() &&
      d.getMonth() === today.getMonth() &&
      d.getDate() === today.getDate();
    if (sameDay) return 'Today';
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  } catch {
    return b.nextDate;
  }
}

const HappeningStrip: React.FC<Props> = ({ announcement, prayer, birthdays, loading }) => {
  const navigate = useNavigate();

  const birthdaySummary =
    birthdays.length === 0
      ? 'No visible birthdays this week'
      : birthdays.length === 1
        ? `${birthdays[0].name} · ${birthdayLabel(birthdays[0])}`
        : `${birthdays[0].name} +${birthdays.length - 1} more`;

  const cards = [
    {
      key: 'announcement',
      label: 'Announcement',
      title: announcement?.title || 'Church updates',
      detail: announcement
        ? snippet(announcement.content) || String(announcement.type || 'Update')
        : 'Nothing posted yet — check back soon.',
      icon: <Megaphone size={16} />,
      onClick: () => navigate('/communication/announcements'),
    },
    {
      key: 'prayer',
      label: 'Prayer',
      title: prayer
        ? prayer.is_anonymous
          ? 'A church member'
          : prayer.member_name || 'Prayer request'
        : 'Prayer wall',
      detail: prayer
        ? snippet(prayer.content) || 'Someone asked for prayer'
        : 'Lift someone up today.',
      icon: <Heart size={16} />,
      onClick: () => navigate('/community/prayer-wall'),
    },
    {
      key: 'birthdays',
      label: 'Birthdays',
      title: birthdays.length ? 'Celebrate this week' : 'Birthdays',
      detail: birthdaySummary,
      icon: <Cake size={16} />,
      onClick: () => navigate('/members'),
    },
  ];

  return (
    <section>
      <div className="flex items-end justify-between gap-3 mb-3">
        <div>
          <h2 className="text-lg font-black text-[#0d1a14] tracking-tight">Happening</h2>
          <p className="text-xs text-gray-600 font-medium mt-0.5">
            What’s new with our church family
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {cards.map((card) => (
          <button
            key={card.key}
            type="button"
            onClick={card.onClick}
            disabled={loading}
            className="text-left rounded-2xl border border-gray-100 bg-white p-4 shadow-sm hover:border-burgundy/20 hover:shadow-md transition-all active:scale-[0.99] group min-h-[120px] flex flex-col"
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-[#8A6A2E]">
                <span className="w-7 h-7 rounded-lg bg-gold-cream text-[#8A6A2E] flex items-center justify-center">
                  {card.icon}
                </span>
                {card.label}
              </span>
              <ChevronRight
                size={14}
                className="text-gray-300 group-hover:text-burgundy transition-colors"
              />
            </div>
            {loading ? (
              <div className="space-y-2 animate-pulse mt-1">
                <div className="h-3.5 bg-gray-100 rounded w-3/4" />
                <div className="h-3 bg-gray-50 rounded w-full" />
              </div>
            ) : (
              <>
                <p className="text-sm font-black text-[#0d1a14] tracking-tight line-clamp-2">
                  {card.title}
                </p>
                <p className="text-xs text-gray-500 font-medium mt-1.5 line-clamp-2 leading-snug flex-1">
                  {card.detail}
                </p>
              </>
            )}
          </button>
        ))}
      </div>
    </section>
  );
};

export default HappeningStrip;
