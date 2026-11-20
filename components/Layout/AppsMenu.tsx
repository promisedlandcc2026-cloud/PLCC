/**
 * "Apps" in the top bar: one tap to the other PLCC apps, already signed in where the
 * one sign-on works (Ka Link, Tribes). Same switcher as Ka Link's and Tribes' bottom bars.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink, LayoutGrid, Loader2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { signedInAppUrl, TITHE_URL, type AwcOneAppId } from '../../lib/awcOne';

const APPS: Array<{ id: AwcOneAppId; name: string; note: string }> = [
  { id: 'chat', name: 'PLCC Ka Link', note: 'Chats, messages, calls and prayer rooms' },
  { id: 'connect', name: 'Tribes', note: 'Posts, events and your church family' },
  { id: 'tithe', name: 'Firstfruits', note: 'Tithe and offerings' },
];

export const AppsMenu: React.FC<{ isAuthenticated: boolean }> = ({ isAuthenticated }) => {
  const [open, setOpen] = useState(false);
  const [opening, setOpening] = useState<AwcOneAppId | null>(null);
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const openApp = async (id: AwcOneAppId) => {
    setOpening(id);
    const url = id === 'tithe' ? TITHE_URL : await signedInAppUrl(id, isAuthenticated);
    window.location.href = url;
  };

  return (
    <div className="relative hidden sm:block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-center w-11 h-11 md:w-12 md:h-12 rounded-2xl bg-white border border-gray-100 text-gray-500 hover:text-burgundy hover:bg-gray-50 transition-all active:scale-90"
        aria-label="Other PLCC apps"
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid="topbar-apps"
        title="Apps"
      >
        <LayoutGrid size={20} />
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-[140] bg-black/30 md:bg-transparent" onClick={() => setOpen(false)} aria-hidden />
          <div
            className="fixed inset-x-0 bottom-0 z-[150] rounded-t-3xl md:absolute md:inset-auto md:right-0 md:top-14 md:w-80 md:rounded-3xl bg-white shadow-2xl border border-gray-100 pb-[max(1rem,env(safe-area-inset-bottom))] md:pb-2"
            role="dialog"
            aria-label="Other PLCC apps"
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-1">
              <p className="font-black text-[#0d1a14]">PLCC apps</p>
              <button type="button" onClick={() => setOpen(false)} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400" aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <p className="px-5 pb-2 text-xs text-gray-500">Same sign-in everywhere.</p>
            <ul>
              {APPS.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => void openApp(a.id)}
                    disabled={opening !== null}
                    className="w-full flex items-center justify-between gap-3 px-5 min-h-[60px] border-t border-gray-100 text-left hover:bg-gray-50 disabled:opacity-60"
                  >
                    <span>
                      <span className="block font-bold text-[#0d1a14]">{a.name}</span>
                      <span className="block text-xs text-gray-500">{a.note}</span>
                    </span>
                    {opening === a.id ? <Loader2 size={18} className="animate-spin text-burgundy shrink-0" /> : <ExternalLink size={18} className="text-burgundy shrink-0" />}
                  </button>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    navigate('/launcher');
                  }}
                  className="w-full flex items-center justify-between gap-3 px-5 min-h-[60px] border-t border-gray-100 text-left hover:bg-gray-50"
                >
                  <span>
                    <span className="block font-bold text-[#0d1a14]">All PLCC apps</span>
                    <span className="block text-xs text-gray-500">The PLCC ONE home screen</span>
                  </span>
                  <LayoutGrid size={18} className="text-burgundy shrink-0" />
                </button>
              </li>
            </ul>
          </div>
        </>
      ) : null}
    </div>
  );
};
