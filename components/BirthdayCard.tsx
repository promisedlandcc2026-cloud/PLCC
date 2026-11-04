/**
 * Birthday / anniversary greeting from the Pastor, shown as a card with the church
 * header and seal (opened from a "celebration" notification).
 */
import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

type Props = {
  title: string;
  body?: string | null;
  onClose: () => void;
};

const SEAL_SRC = '/images/awc-seal.png';

export default function BirthdayCard({ title, body, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const cleanTitle = title.replace(/^\(Test\)\s*/, '');

  return createPortal(
    <div
      data-birthday-card="true"
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/55 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={cleanTitle}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md overflow-hidden rounded-3xl bg-[#FFFDF9] shadow-2xl border border-[#E7D7C1]"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full text-white/80 hover:bg-white/10 hover:text-white"
        >
          <X size={20} aria-hidden />
        </button>
        <div className="bg-[#0e1914] px-6 pb-6 pt-7 text-center">
          <img
            src={SEAL_SRC}
            alt="Promised Land Christian Center seal"
            className="mx-auto mb-3 h-24 w-24 rounded-full object-cover shadow-lg"
          />
          <p className="font-serif text-2xl text-white">Promised Land Christian Center</p>
          <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.3em] text-[#E9C979]">
            Where Everybody Is Somebody
          </p>
        </div>
        <div className="px-6 pb-8 pt-7 text-center">
          <h2 className="font-serif text-3xl leading-tight text-[#15281f]">{cleanTitle}</h2>
          {body
            ? body
                .split(/\n{2,}/)
                .map((p) => p.trim())
                .filter(Boolean)
                .map((p, i) =>
                  /^“[\s\S]+” — /.test(p) ? (
                    <p key={i} className="mt-5 border-t border-[#E7D7C1] pt-4 font-serif text-base italic leading-relaxed text-[#8A6D3B]">
                      {p}
                    </p>
                  ) : (
                    <p
                      key={i}
                      className={`whitespace-pre-line font-serif leading-relaxed text-[#2B1A1F] ${i === 0 ? 'mt-4 text-lg' : 'mt-3 text-base'}`}
                    >
                      {p}
                    </p>
                  )
                )
            : null}
          <button
            type="button"
            onClick={onClose}
            className="mt-7 min-h-[52px] w-full rounded-2xl bg-[#0e1914] text-base font-bold text-white"
          >
            Amen 🙏
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
