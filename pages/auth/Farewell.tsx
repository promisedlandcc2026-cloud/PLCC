import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Home, LogIn } from 'lucide-react';

/**
 * Post-logout landing. Session is already cleared before this route loads.
 * Verse rotates gently so the page does not feel stuck on one line forever.
 */
const FAREWELL_VERSES = [
  {
    ref: 'Numbers 6:24–26',
    text: 'The Lord bless you and keep you; the Lord make his face to shine upon you and be gracious to you; the Lord lift up his countenance upon you and give you peace.',
  },
  {
    ref: 'Psalm 121:8',
    text: 'The Lord will keep your going out and your coming in from this time forth and forevermore.',
  },
  {
    ref: 'Isaiah 26:3',
    text: 'You keep him in perfect peace whose mind is stayed on you, because he trusts in you.',
  },
  {
    ref: 'Philippians 4:7',
    text: 'And the peace of God, which surpasses all understanding, will guard your hearts and your minds in Christ Jesus.',
  },
] as const;

function pickVerse() {
  const i = Math.floor(Date.now() / 86_400_000) % FAREWELL_VERSES.length;
  return FAREWELL_VERSES[i]!;
}

const Farewell: React.FC = () => {
  const [userName, setUserName] = useState('');
  const verse = pickVerse();

  useEffect(() => {
    const savedName = localStorage.getItem('awc_last_user_name');
    if (savedName) setUserName(savedName);
  }, []);

  return (
    <div className="min-h-[100dvh] bg-[#f7f4ef] flex flex-col items-center justify-center p-6 text-center relative overflow-hidden">
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.35]"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(29, 55, 44,0.12), transparent), radial-gradient(ellipse 60% 40% at 90% 100%, rgba(201, 163, 90,0.14), transparent)',
        }}
        aria-hidden
      />

      <div className="relative z-10 w-full max-w-lg animate-in fade-in duration-500">
        <div className="rounded-[1.75rem] border border-[#0d1a14]/10 bg-white/90 shadow-[0_24px_60px_-28px_rgba(13, 26, 20,0.35)] px-6 py-10 sm:px-10 sm:py-12">
          <div className="mx-auto mb-8 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0d1a14] text-gold">
            <BookOpen size={26} aria-hidden />
          </div>

          <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#8A6A2E] mb-3">
            Session ended
          </p>
          <h1 className="text-3xl sm:text-4xl font-black text-[#0d1a14] tracking-tight mb-2">
            {userName ? `Go in peace, ${userName}` : 'Go in peace'}
            <span className="text-gold">.</span>
          </h1>
          <p className="text-sm text-gray-500 font-medium mb-8">
            Your Vault session is closed. You can return anytime.
          </p>

          <blockquote className="rounded-2xl bg-[#f7f4ef] border border-[#0d1a14]/08 px-5 py-5 text-left mb-8">
            <p className="text-[15px] sm:text-base leading-relaxed text-[#0d1a14]/90 font-medium italic">
              “{verse.text}”
            </p>
            <footer className="mt-3 text-[11px] font-black uppercase tracking-[0.2em] text-[#8A6A2E]">
              — {verse.ref}
            </footer>
          </blockquote>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href="https://sanctum-live-nine.vercel.app"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 min-h-[48px] px-6 rounded-xl border border-gray-200 bg-white text-[#0d1a14] text-[11px] font-black uppercase tracking-widest hover:border-[#0d1a14]/25 transition-colors"
            >
              <Home size={16} aria-hidden />
              Main website
            </a>
            <Link
              to="/login"
              className="inline-flex items-center justify-center gap-2 min-h-[48px] px-6 rounded-xl bg-[#0d1a14] text-gold text-[11px] font-black uppercase tracking-widest hover:bg-[#101814] transition-colors"
            >
              <LogIn size={16} aria-hidden />
              Sign in again
            </Link>
          </div>
        </div>

        <p className="mt-6 text-[10px] font-bold uppercase tracking-[0.25em] text-[#0d1a14]/35">
          PLCC Canaan · signed out
        </p>
      </div>
    </div>
  );
};

export default Farewell;
