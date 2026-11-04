import React from 'react';
import type { BucksWallet } from '../../lib/parentDependentsClient';
import { BUCKS_COIN } from '../../lib/kidsBucksClient';

type Tone = { ink: string; muted: string; card: string; accent: string; accentInk: string; track: string };

const CLAY =
  '0 14px 28px rgba(40,40,80,.10), 0 2px 4px rgba(40,40,80,.06), inset 0 2px 0 rgba(255,255,255,.7), inset 0 -5px 0 rgba(40,40,80,.05)';

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** PLCC Bucks wallet for Kids View. Read-only: Bucks are only given by leaders. */
export default function BucksWalletCard({ wallet, tone }: { wallet: BucksWallet; tone: Tone }) {
  const lines = wallet.history.slice(0, 5);
  return (
    <section
      aria-labelledby="bucks-title"
      className="rounded-[28px] p-5 sm:p-6 space-y-5"
      style={{ background: tone.card, boxShadow: CLAY }}
    >
      <div className="flex flex-wrap items-center gap-4">
        <img
          src={BUCKS_COIN.md}
          srcSet={`${BUCKS_COIN.md} 1x, ${BUCKS_COIN.lg} 2x`}
          width={72}
          height={72}
          alt=""
          className="shrink-0 drop-shadow-md"
        />
        <div className="flex-1 min-w-[160px]">
          <p id="bucks-title" className="text-xs font-black uppercase tracking-widest" style={{ color: tone.muted }}>
            My PLCC Bucks
          </p>
          <p className="text-4xl font-black leading-none mt-1 tabular-nums" style={{ color: tone.ink }}>
            {wallet.balance}
          </p>
          <p className="text-xs font-bold mt-1" style={{ color: tone.muted }}>
            {wallet.totalEarned} earned in all
            {wallet.onHold ? ` · ${wallet.onHold} on hold for a prize` : ''}
            {wallet.outstandingCorrection ? ` · ${wallet.outstandingCorrection} still to recover` : ''}
          </p>
        </div>
      </div>

      {lines.length ? (
        <ul className="space-y-2.5" aria-label="Recent PLCC Bucks">
          {lines.map((l) => {
            const positive = l.amount > 0;
            return (
              <li
                key={l.id}
                className="rounded-2xl px-4 py-3 flex items-start justify-between gap-3"
                style={{ background: tone.track }}
              >
                <span className="min-w-0">
                  <span
                    className={`block text-sm font-black ${l.reversed ? 'line-through opacity-60' : ''}`}
                    style={{ color: tone.ink }}
                  >
                    {positive ? '+' : '−'}
                    {Math.abs(l.amount)} PLCC Bucks — {l.reasonLabel}
                  </span>
                  <span className="block text-xs font-semibold mt-0.5" style={{ color: tone.muted }}>
                    {l.kind === 'reversal'
                      ? 'Corrected by'
                      : l.kind === 'recovery'
                        ? 'Paid back toward a correction by'
                        : l.kind === 'redemption'
                          ? 'Prize handed over by'
                          : 'Awarded by'}{' '}
                    {l.awardedBy} · {shortDate(l.createdAt)}
                    {l.reversed ? ' · Corrected' : ''}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm font-semibold rounded-2xl px-4 py-3" style={{ background: tone.track, color: tone.ink }}>
          No PLCC Bucks yet. Leaders give them for memory verses, kindness, helping out and more.
        </p>
      )}

      {wallet.requests?.length ? (
        <ul className="space-y-2" aria-label="Prize requests">
          {wallet.requests.map((r) => (
            <li key={r.id} className="rounded-2xl px-4 py-3 text-sm font-bold" style={{ background: tone.track, color: tone.ink }}>
              {r.prizeName} · {r.price} Bucks · {r.status === 'approved' ? 'Approved, waiting for pickup' : r.status === 'requested' ? 'Waiting for a leader' : r.status}
            </li>
          ))}
        </ul>
      ) : null}
      {wallet.challenge?.title ? (
        <p className="text-sm font-bold rounded-2xl px-4 py-3" style={{ background: tone.track, color: tone.ink }}>
          This week: {wallet.challenge.title}
          {wallet.challenge.completed ? ' · Done' : ''}
        </p>
      ) : null}
      <p className="text-[11px] font-semibold" style={{ color: tone.muted }}>
        PLCC Bucks are for fun and have no cash value.
      </p>
    </section>
  );
}
