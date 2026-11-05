import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Award, Palette, Sparkles, Star, X } from 'lucide-react';
import { useNav } from '../../App';

/**
 * "New in Canaan" spotlight on Home. Bump RELEASE_KEY for the next launch so
 * people who dismissed this one see the new card. Dismissal is per browser.
 */
const RELEASE_KEY = 'awc.whatsnew.2026-10-kids-view';

const ITEMS = [
  {
    Icon: Sparkles,
    title: 'Kids View',
    body: 'A fun dashboard for each child: verse of the week, streak, points and their check-in QR.',
  },
  {
    Icon: Award,
    title: 'Badges & levels',
    body: 'Kids unlock 13 badges and level up from Seedling to Legend just by checking in.',
  },
  {
    Icon: Palette,
    title: 'Two themes',
    body: 'Pick Soft Garden or Adventure for each child. They can switch it themselves.',
  },
  {
    Icon: Star,
    title: 'Points on My Profile',
    body: 'Your check-in points card is back, plus a quick jump bar to every profile section.',
  },
];

function readDismissed(): boolean {
  try {
    return localStorage.getItem(RELEASE_KEY) === 'dismissed';
  } catch {
    return false;
  }
}

const WhatsNewCard: React.FC = () => {
  const navigate = useNavigate();
  const { openAskAdmin } = useNav();
  const [hidden, setHidden] = useState(readDismissed);

  if (hidden) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(RELEASE_KEY, 'dismissed');
    } catch {
      /* private mode — hides for this visit only */
    }
    setHidden(true);
  };

  return (
    <section
      aria-labelledby="whats-new-title"
      className="relative rounded-[2rem] bg-burgundy text-white overflow-hidden shadow-xl shadow-burgundy/15"
    >
      <div
        aria-hidden
        className="absolute -right-16 -top-16 w-56 h-56 rounded-full bg-gold/15"
      />
      <div className="relative p-5 sm:p-7 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <p className="text-[10px] font-black uppercase tracking-widest text-gold">New in Canaan</p>
            <h2 id="whats-new-title" className="text-2xl sm:text-3xl font-black tracking-tight leading-tight">
              Meet Kids View
            </h2>
            <p className="text-sm text-white/80 font-medium max-w-xl">
              Parents can now open a playful dashboard for each child, right from My Family.
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss what's new"
            className="shrink-0 w-11 h-11 -mr-2 -mt-2 rounded-xl flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10"
          >
            <X size={18} />
          </button>
        </div>

        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {ITEMS.map(({ Icon, title, body }) => (
            <li key={title} className="flex items-start gap-3 rounded-2xl bg-white/10 p-3.5">
              <span className="w-9 h-9 rounded-xl bg-gold text-burgundy flex items-center justify-center shrink-0">
                <Icon size={18} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-black">{title}</span>
                <span className="block text-xs text-white/75 leading-relaxed">{body}</span>
              </span>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={() => navigate('/family')}
            className="min-h-[44px] px-5 rounded-xl bg-gold text-burgundy text-xs font-black uppercase tracking-widest hover:bg-white transition-colors"
          >
            Open My Family
          </button>
          <button
            type="button"
            onClick={() => openAskAdmin('What is Kids View and how do I open it for my child?')}
            className="min-h-[44px] px-5 rounded-xl border border-white/30 text-white text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-colors inline-flex items-center gap-2"
          >
            <Sparkles size={14} className="text-gold" aria-hidden />
            Ask Admin how
          </button>
        </div>
      </div>
    </section>
  );
};

export default WhatsNewCard;
