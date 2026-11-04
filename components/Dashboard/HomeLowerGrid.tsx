import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Megaphone,
  FileText,
  Heart,
  Cake,
  ChevronRight,
  Users,
  BookOpen,
  Sparkles,
} from 'lucide-react';
import type { HappeningAnnouncement, HappeningBirthday, HappeningPrayer } from './HappeningStrip';
import type { DailyInspiration } from './DailyWordCard';

type SermonTeaser = {
  id?: string;
  title: string;
  speaker?: string | null;
  date?: string | null;
};

type Props = {
  announcement: HappeningAnnouncement | null;
  prayer: HappeningPrayer | null;
  birthdays: HappeningBirthday[];
  pendingSignatureCount: number;
  sermon: SermonTeaser | null;
  inspiration: DailyInspiration | null;
  loading?: boolean;
};

function snippet(text: string | null | undefined, max = 80): string {
  const s = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return '';
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

const HomeLowerGrid: React.FC<Props> = ({
  announcement,
  prayer,
  birthdays,
  pendingSignatureCount,
  sermon,
  inspiration,
  loading,
}) => {
  const navigate = useNavigate();

  const forYouItems = [
    announcement
      ? {
          key: 'ann',
          label: 'Announcement',
          title: announcement.title,
          detail: snippet(announcement.content) || 'New church update',
          icon: Megaphone,
          path: '/communication/announcements',
        }
      : null,
    pendingSignatureCount > 0
      ? {
          key: 'sig',
          label: 'Action needed',
          title: `${pendingSignatureCount} pending signature${pendingSignatureCount === 1 ? '' : 's'}`,
          detail: 'Acknowledge in Minutes',
          icon: FileText,
          path: '/communication/minutes',
        }
      : null,
    prayer
      ? {
          key: 'prayer',
          label: 'Prayer',
          title: prayer.is_anonymous ? 'Someone needs prayer' : prayer.member_name || 'Prayer request',
          detail: snippet(prayer.content) || 'Open the prayer wall',
          icon: Heart,
          path: '/community/prayer-wall',
        }
      : null,
    birthdays[0]
      ? {
          key: 'bday',
          label: 'Birthday',
          title: birthdays[0].name,
          detail:
            birthdays.length > 1
              ? `+${birthdays.length - 1} more this week`
              : 'Celebrate them this week',
          icon: Cake,
          path: '/members',
        }
      : null,
  ].filter(Boolean) as Array<{
    key: string;
    label: string;
    title: string;
    detail: string;
    icon: typeof Megaphone;
    path: string;
  }>;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* For You */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="text-lg font-black text-[#0d1a14] tracking-tight">For you</h2>
        <p className="text-xs text-gray-600 font-medium mt-0.5 mb-4">Personal updates</p>
        {loading ? (
          <div className="space-y-2 animate-pulse">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 rounded-xl bg-gray-50" />
            ))}
          </div>
        ) : forYouItems.length === 0 ? (
          <p className="text-sm text-gray-400 font-medium">You’re all caught up.</p>
        ) : (
          <ul className="space-y-2">
            {forYouItems.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={() => navigate(item.path)}
                    className="w-full flex items-center gap-3 text-left rounded-xl border border-gray-50 bg-gray-50/70 hover:border-burgundy/15 hover:bg-white px-3 py-2.5 transition-all group"
                  >
                    <div className="w-9 h-9 rounded-lg bg-burgundy/5 text-burgundy flex items-center justify-center shrink-0">
                      <Icon size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-black uppercase tracking-widest text-[#8A6A2E]">
                        {item.label}
                      </p>
                      <p className="text-sm font-bold text-[#0d1a14] truncate">{item.title}</p>
                      <p className="text-xs text-gray-500 truncate">{item.detail}</p>
                    </div>
                    <ChevronRight size={14} className="text-gray-300 group-hover:text-burgundy" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Community */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col">
        <h2 className="text-lg font-black text-[#0d1a14] tracking-tight">PLCC Community</h2>
        <p className="text-xs text-gray-600 font-medium mt-0.5 mb-4">Stay in the conversation</p>
        <div className="flex-1 rounded-xl bg-burgundy/5 border border-burgundy/10 p-4 mb-4">
          <Users className="text-burgundy mb-2" size={22} />
          <p className="text-sm font-bold text-[#0d1a14] leading-snug">
            {prayer
              ? `${prayer.is_anonymous ? 'A member' : prayer.member_name || 'Someone'} shared on the prayer wall.`
              : 'See what’s new in the feed and chat with your church family.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/community/feed')}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-burgundy text-gold text-[10px] font-black uppercase tracking-widest hover:bg-burgundy-dark transition-colors"
        >
          Open Community
        </button>
      </section>

      {/* Sermons + Prayer CTA */}
      <div className="flex flex-col gap-4">
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex-1">
          <h2 className="text-lg font-black text-[#0d1a14] tracking-tight">Recent sermons</h2>
          <p className="text-xs text-gray-600 font-medium mt-0.5 mb-3">Messages to revisit</p>
          {sermon ? (
            <button
              type="button"
              onClick={() => navigate('/community/sermon-notes')}
              className="w-full text-left rounded-xl border border-gray-50 bg-gray-50/80 hover:border-burgundy/15 p-3 transition-all group"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-burgundy text-gold flex items-center justify-center shrink-0">
                  <BookOpen size={18} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-black text-[#0d1a14] line-clamp-2 group-hover:text-burgundy">
                    {sermon.title}
                  </p>
                  {sermon.speaker ? (
                    <p className="text-xs text-gray-500 font-medium mt-1">{sermon.speaker}</p>
                  ) : null}
                </div>
              </div>
            </button>
          ) : inspiration?.text ? (
            <button
              type="button"
              onClick={() => navigate('/community/sermon-notes')}
              className="w-full text-left rounded-xl border border-gray-50 bg-gray-50/80 p-3"
            >
              <div className="flex items-start gap-2">
                <Sparkles size={16} className="text-gold shrink-0 mt-0.5" />
                <p className="text-sm font-medium text-[#0d1a14] line-clamp-3">
                  “{inspiration.text}”
                </p>
              </div>
            </button>
          ) : (
            <p className="text-sm text-gray-400 font-medium">Sermons will appear here.</p>
          )}
        </section>

        <section className="relative overflow-hidden rounded-2xl border border-burgundy/20 min-h-[140px] shadow-sm">
          <div className="absolute inset-0 bg-gradient-to-br from-[#15271f] via-burgundy to-[#1a0408]" />
          <div
            className="absolute inset-0 opacity-40"
            style={{
              backgroundImage:
                'radial-gradient(circle at 80% 20%, rgba(201, 163, 90,0.35), transparent 50%)',
            }}
          />
          <div className="relative z-10 p-5 flex flex-col h-full justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-gold mb-1">
                Need prayer?
              </p>
              <h3 className="text-lg font-black text-white tracking-tight">
                We’re here with you
              </h3>
            </div>
            <button
              type="button"
              onClick={() => navigate('/community/prayer-wall')}
              className="self-start inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gold text-burgundy text-[10px] font-black uppercase tracking-widest hover:bg-white transition-colors"
            >
              <Heart size={14} />
              Submit a prayer request
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};

export default HomeLowerGrid;
