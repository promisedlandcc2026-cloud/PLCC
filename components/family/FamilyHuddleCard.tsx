import React from 'react';
import { Loader2, Radio, Share2, Users } from 'lucide-react';

type Props = {
  huddleLive: boolean;
  huddleCount: number;
  huddleConfigured: boolean;
  shareBusy?: boolean;
  shareMsg?: string | null;
  shareError?: string | null;
  onStart: () => void;
  onJoin: () => void;
  onShare: () => void;
};

export function FamilyHuddleCard({
  huddleLive,
  huddleCount,
  huddleConfigured,
  shareBusy,
  shareMsg,
  shareError,
  onStart,
  onJoin,
  onShare,
}: Props) {
  return (
    <section
      aria-labelledby="family-huddle-heading"
      className="rounded-3xl border border-burgundy/15 bg-white p-5 space-y-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 id="family-huddle-heading" className="text-sm font-black text-[#1A1A1A]">
            Family Huddle
          </h2>
          <p className="text-[12px] text-gray-500 leading-relaxed">
            Private live video for household adults. Guests can join with a share link.
            Children & dependents are not on camera in this version. No recording.
          </p>
        </div>
        {huddleLive ? (
          <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-red-600 text-white text-[10px] font-black uppercase tracking-wider px-2.5 py-1">
            <Radio size={12} aria-hidden />
            LIVE
            {huddleCount > 0 ? (
              <span className="font-bold normal-case tracking-normal">· {huddleCount}</span>
            ) : null}
          </span>
        ) : null}
      </div>

      {!huddleConfigured ? (
        <p className="text-sm text-gray-500">Family Huddle is not configured yet. Check back soon.</p>
      ) : (
        <div className="space-y-2">
          {huddleLive ? (
            <button
              type="button"
              onClick={onJoin}
              className="inline-flex w-full min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-burgundy text-white text-sm font-bold"
            >
              <Users size={16} aria-hidden />
              Join Family Huddle
            </button>
          ) : (
            <button
              type="button"
              onClick={onStart}
              className="inline-flex w-full min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-burgundy text-white text-sm font-bold"
            >
              <Radio size={16} aria-hidden />
              Start Family Huddle
            </button>
          )}
          <button
            type="button"
            onClick={onShare}
            disabled={shareBusy}
            className="inline-flex w-full min-h-[44px] items-center justify-center gap-2 rounded-2xl border border-burgundy/15 bg-white text-burgundy text-sm font-bold disabled:opacity-50"
          >
            {shareBusy ? (
              <Loader2 size={16} className="animate-spin" aria-hidden />
            ) : (
              <Share2 size={16} aria-hidden />
            )}
            Share invite link
          </button>
          {shareMsg ? <p className="text-[12px] text-emerald-700 font-medium">{shareMsg}</p> : null}
          {shareError ? <p className="text-[12px] text-red-600 font-medium">{shareError}</p> : null}
        </div>
      )}
    </section>
  );
}
