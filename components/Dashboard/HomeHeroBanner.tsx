import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Sparkles } from 'lucide-react';
import AskAdminTitleLink from '../common/AskAdminTitleLink';
import { eventsOverviewPath } from '../../lib/eventDate';
import SeasonParticles from '../Season/SeasonParticles';
import { usePublishedSeason } from '../Season/SeasonThemeProvider';

export const HOME_HERO_IMAGE_SRC = '/images/home-hero.jpg';
export const HOME_HERO_MOBILE_IMAGE_SRC = '/images/home-hero-mobile.jpg';

export type HomeNextService = {
  id?: string;
  title: string;
  whenLabel: string;
  dateYmd?: string;
};

type Props = {
  greeting: string;
  userName: string;
  verseText?: string | null;
  verseReference?: string | null;
  nextService: HomeNextService | null;
};

/**
 * Full-bleed home hero (sidebar → right edge of main).
 * Phones use a square composite; md+ uses the wide Exchange Hall crop.
 * Next Service overlays the photo — not a second column that can collide with the greeting.
 */
const HomeHeroBanner: React.FC<Props> = ({
  greeting,
  userName,
  verseText,
  verseReference,
  nextService,
}) => {
  const navigate = useNavigate();
  const { theme, showEffects } = usePublishedSeason();
  const [photoOk, setPhotoOk] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let pending = 2;
    let anyOk = false;

    const done = () => {
      pending -= 1;
      if (!cancelled && pending === 0) setPhotoOk(anyOk);
    };

    const check = (src: string) => {
      const img = new Image();
      img.onload = () => {
        anyOk = true;
        done();
      };
      img.onerror = () => done();
      img.src = src;
    };

    check(HOME_HERO_MOBILE_IMAGE_SRC);
    check(HOME_HERO_IMAGE_SRC);

    return () => {
      cancelled = true;
    };
  }, []);

  const service = nextService || {
    title: 'Sunday Worship',
    whenLabel: '10:00 AM',
  };

  return (
    <section className="relative w-full overflow-hidden min-h-[440px] sm:min-h-[360px] lg:min-h-[360px] shadow-[0_12px_40px_rgba(13, 26, 20,0.18)]">
      {photoOk ? (
        <picture>
          <source media="(max-width: 767px)" srcSet={HOME_HERO_MOBILE_IMAGE_SRC} />
          <img
            src={HOME_HERO_IMAGE_SRC}
            alt=""
            className="absolute inset-0 z-0 w-full h-full object-cover object-[center_42%] md:object-[72%_center]"
            onError={() => setPhotoOk(false)}
          />
        </picture>
      ) : (
        <div className="absolute inset-0 z-0 bg-gradient-to-br from-burgundy via-[#15271f] to-[#0c110f]" />
      )}

      {/* Mobile: lighter diagonal wash so square art shows; md+: strong left wash for greeting */}
      <div
        className="absolute inset-0 z-0 md:hidden"
        style={{
          background:
            'linear-gradient(165deg, rgba(13, 26, 20,0.88) 0%, rgba(13, 26, 20,0.72) 42%, rgba(13, 26, 20,0.45) 68%, rgba(13, 26, 20,0.28) 100%)',
        }}
      />
      <div
        className="absolute inset-0 z-0 hidden md:block"
        style={{
          background:
            'linear-gradient(100deg, rgba(13, 26, 20,0.97) 0%, rgba(13, 26, 20,0.92) 38%, rgba(13, 26, 20,0.55) 58%, rgba(13, 26, 20,0.22) 78%, rgba(13, 26, 20,0.12) 100%)',
        }}
      />

      {/* Above photo + wash, below greeting/controls — otherwise leaves can sit under the burgundy film. */}
      {showEffects ? <SeasonParticles effect={theme.effect} /> : null}

      {/* Soft watermark — decorative only, behind copy */}
      <p
        aria-hidden
        className="pointer-events-none absolute left-4 sm:left-8 top-[28%] md:top-1/2 -translate-y-1/2 text-[clamp(2.5rem,8vw,5.5rem)] font-black leading-none text-white/[0.06] tracking-tight select-none max-w-[55%] break-words"
      >
        Welcome Home to PLCC
      </p>

      {/* Brand mark on the photo side */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-20 flex items-center gap-2.5 max-w-[40%] sm:max-w-none">
        <img
          src="/images/awc-logo.png"
          alt=""
          className="h-12 w-12 sm:h-20 sm:w-20 lg:h-24 lg:w-24 rounded-full object-contain bg-white/90 shadow-lg ring-2 ring-gold/40 shrink-0"
        />
        <div className="hidden sm:block min-w-0">
          <p className="text-[13px] font-black text-burgundy leading-tight tracking-tight drop-shadow-sm bg-white/80 px-2 py-0.5 rounded">
            Promised Land Christian Center
          </p>
          <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-burgundy/80 mt-0.5 bg-white/70 px-2 py-0.5 rounded inline-block">
            Changing Hearts. Transforming Lives.
          </p>
        </div>
      </div>

      {/* Greeting — left column only; reserves space so it never sits under the card */}
      <div className="relative z-10 flex flex-col justify-between min-h-[440px] sm:min-h-[360px] lg:min-h-[360px] p-5 sm:p-8 lg:p-10 pr-16 sm:pr-8 lg:pr-[320px] pb-8 lg:pb-10">
        <div className="max-w-xl min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/30 text-white text-[10px] font-black uppercase tracking-[0.2em]"
              style={{ backgroundColor: 'var(--season-accent)' }}
            >
              <Sparkles size={12} />
              {theme.mark ? `${theme.mark} ` : ''}
              Welcome home
            </span>
            <AskAdminTitleLink className="rounded-full bg-burgundy/40 border-gold/50 text-gold hover:bg-burgundy/60 hover:text-gold" />
          </div>
          <h1 className="text-[clamp(1.15rem,3.6vw,2.35rem)] font-black text-white tracking-tight leading-[1.08] sm:whitespace-nowrap">
            {greeting}, {userName} 👋
          </h1>
          {theme.greeting ? (
            <p className="mt-2 text-sm font-black text-gold tracking-tight">{theme.greeting}</p>
          ) : null}
          <p className="mt-2 text-xs sm:text-sm font-black uppercase tracking-[0.22em] text-gold">
            Changing Hearts. Transforming Lives.
          </p>
          {verseText ? (
            <blockquote className="mt-4 sm:mt-5 text-sm sm:text-[15px] text-white/90 font-medium leading-relaxed border-l-2 border-gold/60 pl-4 max-w-md">
              “{verseText}”
              {verseReference ? (
                <cite className="block mt-2 text-[10px] font-black uppercase tracking-widest text-gold not-italic">
                  {verseReference}
                </cite>
              ) : null}
            </blockquote>
          ) : (
            <p className="mt-4 sm:mt-5 text-sm text-white/70 font-medium">
              A fresh word for today is coming soon.
            </p>
          )}
        </div>
      </div>

      {/* Next Service — desktop/tablet only; hidden on phones to keep the mobile hero clean */}
      <div className="hidden md:block absolute z-20 right-6 bottom-6 w-[270px]">
        <div className="rounded-2xl bg-[#0c110f]/92 backdrop-blur-md border border-gold/30 p-5 shadow-2xl">
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-gold mb-2">
            Next service
          </p>
          <h2 className="text-lg font-black text-white tracking-tight leading-snug">
            {service.title}
          </h2>
          <p className="text-xs text-white/75 font-medium mt-1">{service.whenLabel}</p>
          <button
            type="button"
            onClick={() => navigate(eventsOverviewPath(nextService?.dateYmd))}
            className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gold text-burgundy text-[10px] font-black uppercase tracking-widest hover:bg-white transition-colors"
          >
            View details
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </section>
  );
};

export default HomeHeroBanner;
