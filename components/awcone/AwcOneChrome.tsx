import React from 'react';
import { Loader2 } from 'lucide-react';
import { AWC_ONE_APPS, type AwcOneAppId } from '../../lib/awcOne';

/** Deep burgundy page with the gold swooshes from the PLCC ONE artwork. */
export const AwcOneBackground: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div
    className={`min-h-screen relative overflow-hidden text-white selection:bg-gold selection:text-[#0d1914] ${className}`}
    style={{ background: 'radial-gradient(140% 70% at 50% 30%, #213d30 0%, #182e24 45%, #0d1914 100%)' }}
  >
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute bottom-[-30%] left-1/2 -translate-x-1/2 w-[900px] h-[500px] rounded-full bg-[#E4C98F]/10 blur-[120px]" />
    </div>
    <div className="relative z-10">{children}</div>
  </div>
);

/** Seal · divider · PLCC ONE wordmark, then the tagline. */
export const AwcOneHeader: React.FC<{ tagline?: string; compact?: boolean }> = ({
  tagline = 'One Login. All PLCC Applications.',
  compact,
}) => (
  <header className="relative flex flex-col items-center">
    {/* Gold swooshes ride with the logo, so they line up on every screen size. */}
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className="absolute right-[52%] top-[58%] w-[110vw] h-[80px] sm:h-[110px] rounded-[50%] border-b-[3px] border-[#E4C98F] shadow-[0_6px_14px_-6px_rgba(255,190,70,0.85)] rotate-[6deg]" />
      <div className="absolute left-[46%] top-[74%] w-[110vw] h-[70px] sm:h-[90px] rounded-[50%] border-t-[3px] border-[#E4C98F] shadow-[0_-6px_14px_-6px_rgba(255,190,70,0.85)] rotate-[-4deg]" />
    </div>
    <div className="relative flex items-center justify-center gap-3 sm:gap-5 w-full">
      <img
        src="/images/awc-one/awc-one-seal.webp"
        alt="Promised Land Christian Center"
        width={compact ? 96 : 120}
        height={compact ? 96 : 120}
        className={`${compact ? 'w-24 h-24' : 'w-28 h-28 sm:w-36 sm:h-36'} shrink-0 drop-shadow-[0_8px_20px_rgba(0,0,0,0.5)]`}
        decoding="async"
      />
      <span aria-hidden className={`w-[2px] ${compact ? 'h-20' : 'h-24 sm:h-32'} bg-gradient-to-b from-transparent via-[#E4C98F] to-transparent`} />
      <img
        src="/images/awc-one/awc-one-wordmark.webp"
        alt="PLCC ONE — The PLCC Digital Ecosystem"
        className={`${compact ? 'w-[210px]' : 'w-[220px] sm:w-[340px]'} h-auto min-w-0`}
        decoding="async"
      />
    </div>
    {tagline ? (
      <p className={`relative mt-2 text-center font-bold italic text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)] ${compact ? 'text-lg' : 'text-lg sm:text-2xl'}`}>
        {tagline}
      </p>
    ) : null}
  </header>
);

/** Exchange Hall at sunset, faded into the page. */
export const AwcOneScene: React.FC<{ className?: string }> = ({ className = 'h-[190px] sm:h-[260px]' }) => (
  <div className={`relative w-full ${className}`}>
    <img
      src="/images/awc-one/exchange-hall.webp"
      alt="Exchange Hall, home of Promised Land Christian Center"
      className="w-full h-full object-cover object-[center_45%]"
      style={{
        WebkitMaskImage: 'linear-gradient(180deg, transparent 0%, #000 14%, #000 72%, transparent 100%)',
        maskImage: 'linear-gradient(180deg, transparent 0%, #000 14%, #000 72%, transparent 100%)',
      }}
      decoding="async"
    />
  </div>
);

const TILE =
  'relative flex flex-col items-center justify-center gap-2 rounded-[20px] border-2 border-[#E4C98F] text-white text-center ' +
  'shadow-[0_0_16px_rgba(255,190,70,0.55),inset_0_0_16px_rgba(255,200,90,0.22)] ' +
  'hover:shadow-[0_0_26px_rgba(255,200,90,0.85),inset_0_0_18px_rgba(255,210,110,0.3)] hover:-translate-y-0.5 ' +
  'active:scale-[0.98] transition-all focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-70';
const TILE_BG = { background: 'radial-gradient(120% 90% at 50% 15%, #274839 0%, #1a3127 55%, #11211a 100%)' };

export const AwcOneTile: React.FC<{
  id: AwcOneAppId;
  onOpen: (id: AwcOneAppId) => void;
  busy?: boolean;
  badge?: number;
  size?: 'phone' | 'wide';
}> = ({ id, onOpen, busy, badge, size = 'phone' }) => {
  const app = AWC_ONE_APPS.find((a) => a.id === id)!;
  const [awc, ...rest] = app.name.split(' ');
  const wide = size === 'wide';
  return (
    <button
      type="button"
      onClick={() => onOpen(id)}
      disabled={busy}
      aria-label={`Open ${app.name}`}
      className={`${TILE} ${wide ? 'min-h-[260px] px-4 py-6 gap-3 rounded-[26px]' : 'h-[128px] px-1.5 py-2.5'}`}
      style={TILE_BG}
    >
      {busy ? (
        <Loader2 className="animate-spin text-[#E4C98F]" size={wide ? 56 : 40} aria-hidden />
      ) : (
        <img
          src={app.icon}
          alt=""
          style={{ height: wide ? app.iconH * 1.9 : app.iconH }}
          className="w-auto max-w-[90%] object-contain"
          decoding="async"
        />
      )}
      {wide ? (
        <>
          <span className="text-2xl xl:text-[28px] font-black drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">{app.name}</span>
          <span aria-hidden className="w-[70%] h-px bg-gradient-to-r from-transparent via-[#E4C98F] to-transparent" />
          <span className="text-base leading-snug text-[#F3E3D0]">{app.blurb}</span>
        </>
      ) : (
        <span className="text-[18px] font-black leading-[1.05] drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
          {awc}
          <br />
          {rest.join(' ')}
        </span>
      )}
      {badge ? (
        <span aria-label={`${badge} unread`} className="absolute -top-2 -right-1.5 min-w-[26px] h-[26px] px-1.5 rounded-full bg-white text-[#213d30] border-2 border-[#E4C98F] text-[13px] font-black flex items-center justify-center">
          {badge > 99 ? '99+' : badge}
        </span>
      ) : null}
    </button>
  );
};

/** Phone: 2 x 2 tiles. Desktop / tablet: all four in a row with their blurbs. */
export const AwcOneTiles: React.FC<{
  onOpen: (id: AwcOneAppId) => void;
  busyId?: AwcOneAppId | null;
  /** Unread counts shown on tiles (e.g. PLCC Chat). */
  badges?: Partial<Record<AwcOneAppId, number>>;
}> = ({ onOpen, busyId, badges }) => (
  <nav aria-label="PLCC apps" className="w-full">
    <div className="md:hidden grid grid-cols-2 gap-[11px]">
      {AWC_ONE_APPS.map((a) => (
        <AwcOneTile key={a.id} id={a.id} onOpen={onOpen} busy={busyId === a.id} badge={badges?.[a.id]} />
      ))}
    </div>
    <div className="hidden md:grid grid-cols-4 gap-4 lg:gap-5">
      {AWC_ONE_APPS.map((a) => (
        <AwcOneTile key={a.id} id={a.id} onOpen={onOpen} busy={busyId === a.id} size="wide" badge={badges?.[a.id]} />
      ))}
    </div>
  </nav>
);

export const AwcOneFooter: React.FC = () => (
  <footer className="text-center flex flex-col gap-0.5 pb-6 pt-4">
    <span className="text-lg font-extrabold">Promised Land Christian Center</span>
    <span className="text-base font-bold italic text-[#E4C98F]">Changing Hearts. Transforming Lives.</span>
  </footer>
);
