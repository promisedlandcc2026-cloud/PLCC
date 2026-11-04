import React from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Heart, Sparkles } from 'lucide-react';

export type DailyInspiration = {
  id?: string;
  text: string;
  reference?: string | null;
  publish_date?: string;
};

type Props = {
  inspiration: DailyInspiration | null;
  loading?: boolean;
  isFallback?: boolean;
};

const DailyWordCard: React.FC<Props> = ({ inspiration, loading, isFallback }) => {
  const navigate = useNavigate();

  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-burgundy/15 bg-gradient-to-br from-burgundy via-[#15271f] to-[#2a0610] text-white shadow-lg shadow-burgundy/20">
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 20%, rgba(201, 163, 90,0.35), transparent 45%), radial-gradient(circle at 90% 80%, rgba(255,255,255,0.08), transparent 40%)',
        }}
      />
      <div className="relative p-6 sm:p-8">
        <div className="flex items-center gap-2 mb-4">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gold/15 text-gold text-[10px] font-black uppercase tracking-[0.25em]">
            <Sparkles size={12} />
            Today’s Word
          </span>
          {isFallback && inspiration ? (
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">
              Latest
            </span>
          ) : null}
        </div>

        {loading ? (
          <div className="space-y-3 animate-pulse">
            <div className="h-5 bg-white/10 rounded-lg w-11/12" />
            <div className="h-5 bg-white/10 rounded-lg w-2/3" />
            <div className="h-3 bg-white/10 rounded-lg w-1/4 mt-4" />
          </div>
        ) : inspiration?.text ? (
          <>
            <div className="flex items-start gap-3">
              <BookOpen size={22} className="text-gold shrink-0 mt-1 opacity-80" />
              <blockquote className="text-lg sm:text-xl font-medium leading-relaxed tracking-tight text-white/95">
                “{inspiration.text}”
              </blockquote>
            </div>
            {inspiration.reference ? (
              <p className="mt-4 text-xs font-black uppercase tracking-[0.2em] text-gold/80 pl-8">
                {inspiration.reference}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => navigate('/community/prayer-wall')}
              className="mt-6 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gold text-burgundy text-[10px] font-black uppercase tracking-widest hover:bg-white transition-colors"
            >
              <Heart size={14} />
              Share a prayer
            </button>
          </>
        ) : (
          <div className="py-2">
            <p className="text-base font-medium text-white/80 leading-relaxed">
              A fresh word for today is coming soon. Check back — or share a prayer with the church
              family.
            </p>
            <button
              type="button"
              onClick={() => navigate('/community/prayer-wall')}
              className="mt-5 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gold text-burgundy text-[10px] font-black uppercase tracking-widest hover:bg-white transition-colors"
            >
              <Heart size={14} />
              Share a prayer
            </button>
          </div>
        )}
      </div>
    </section>
  );
};

export default DailyWordCard;
