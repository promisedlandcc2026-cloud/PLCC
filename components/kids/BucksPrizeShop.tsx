import React, { useEffect, useState } from 'react';
import { fetchParentPrizes, ParentDependentError, requestParentPrize, type ParentPrize } from '../../lib/parentDependentsClient';

function freshKey() {
  const c: Crypto | undefined = globalThis.crypto;
  if (c?.randomUUID) return `tap-${c.randomUUID()}`;
  return `tap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Parent prize request on Kids View. Church costs never appear here. */
export default function BucksPrizeShop({
  childId,
  cardRef,
  tone,
}: {
  childId?: string;
  cardRef?: string;
  tone: { ink: string; muted: string; card: string; accent: string; accentInk: string; track: string };
}) {
  const [prizes, setPrizes] = useState<ParentPrize[] | null>(null);
  const [hidden, setHidden] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetchParentPrizes()
      .then(setPrizes)
      .catch((err) => {
        if (err instanceof ParentDependentError && err.status === 503) setHidden(true);
        else setPrizes([]);
      });
  }, []);

  if (hidden || !prizes?.length) return null;

  const ask = async (prize: ParentPrize) => {
    if (busy) return;
    setBusy(prize.id);
    setMsg(null);
    try {
      await requestParentPrize({
        prizeId: prize.id,
        idempotencyKey: freshKey(),
        ...(childId ? { childId } : { cardRef }),
      });
      setMsg(`Requested ${prize.name}. A leader still has to approve it.`);
    } catch (err) {
      setMsg(err instanceof ParentDependentError ? err.message : 'Could not request that prize.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-[28px] p-5 sm:p-6 space-y-3" style={{ background: tone.card }} aria-labelledby="prize-shop-title">
      <h2 id="prize-shop-title" className="text-lg font-black" style={{ color: tone.ink }}>
        Prize table
      </h2>
      <p className="text-sm font-semibold" style={{ color: tone.muted }}>
        Asking holds the Bucks. They are spent when the prize is handed over.
      </p>
      <ul className="space-y-2">
        {prizes.map((p) => (
          <li key={p.id} className="rounded-2xl px-4 py-3 flex items-center justify-between gap-3" style={{ background: tone.track }}>
            <span>
              <span className="block text-sm font-black" style={{ color: tone.ink }}>{p.name}</span>
              <span className="block text-xs font-bold" style={{ color: tone.muted }}>
                {p.price} PLCC Bucks{p.inStock === false ? ' · Out of stock' : ''}
              </span>
            </span>
            <button
              type="button"
              disabled={Boolean(busy) || p.inStock === false}
              onClick={() => void ask(p)}
              className="h-10 px-3 rounded-xl text-xs font-black disabled:opacity-50"
              style={{ background: tone.accent, color: tone.accentInk }}
            >
              {busy === p.id ? 'Asking…' : 'Ask'}
            </button>
          </li>
        ))}
      </ul>
      {msg ? <p className="text-sm font-semibold" style={{ color: tone.ink }}>{msg}</p> : null}
    </section>
  );
}
