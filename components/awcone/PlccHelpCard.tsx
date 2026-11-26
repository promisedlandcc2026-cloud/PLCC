import React from 'react';
import { ArrowUpRight, Camera, LifeBuoy, Loader2 } from 'lucide-react';
import { PLCC_GOLD, PLCC_GREEN } from './PlccOneShell';

const serif = { fontFamily: "'Fraunces', Georgia, serif" } as const;

/**
 * Shepherd Assist — the PLCC Help Center. The one place members report a problem with
 * Ka Link or any PLCC app, with screenshots. Shown to everyone on the PLCC ONE home.
 */
export const PlccHelpCard: React.FC<{ onOpen: () => void; busy?: boolean }> = ({ onOpen, busy = false }) => (
  <button
    type="button"
    onClick={onOpen}
    disabled={busy}
    aria-label="Open the PLCC Help Center to report a problem"
    className="group w-full text-left disabled:cursor-wait flex items-center gap-4 md:gap-5 rounded-2xl border-2 px-4 md:px-6 py-4 md:py-5 shadow-[0_10px_30px_rgba(29,55,44,0.12)] hover:brightness-[0.98] active:scale-[0.99] transition focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2"
    style={{ borderColor: PLCC_GOLD, background: '#fbf7ee', color: PLCC_GREEN, outlineColor: PLCC_GOLD }}
  >
    <span className="w-14 h-14 md:w-[72px] md:h-[72px] shrink-0 rounded-2xl grid place-items-center text-white group-hover:scale-105 transition-transform" style={{ background: PLCC_GREEN }}>
      {busy ? <Loader2 size={32} className="animate-spin" aria-hidden /> : <LifeBuoy size={34} style={{ color: PLCC_GOLD }} aria-hidden />}
    </span>
    <span className="min-w-0 flex-1">
      <span className="block text-[12px] md:text-[13px] font-bold uppercase tracking-[0.2em]" style={{ color: '#8a6a2c' }}>Need help with an app?</span>
      <span className="block text-2xl md:text-[30px] font-bold leading-tight" style={serif}>PLCC Help Center</span>
      <span className="mt-0.5 flex items-center gap-1.5 text-base md:text-lg italic opacity-90" style={serif}>
        <Camera size={18} className="shrink-0 not-italic" style={{ color: '#8a6a2c' }} aria-hidden />
        Report a problem, add a screenshot, get it fixed
      </span>
    </span>
    <span className="shrink-0 hidden sm:flex items-center gap-1 rounded-xl px-4 py-3 text-lg font-bold text-white shadow" style={{ background: PLCC_GREEN }}>
      Get help <ArrowUpRight size={20} aria-hidden />
    </span>
    <ArrowUpRight size={26} className="sm:hidden shrink-0" aria-hidden />
  </button>
);
