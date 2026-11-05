import React, { useCallback, useEffect, useState } from 'react';
import { Gift, HandHeart } from 'lucide-react';
import {
  adjustBucksStock,
  approveBucksRequest,
  BucksError,
  closeBucksRequest,
  decideBucksRecommendation,
  fetchBucksChildren,
  fetchBucksPrizes,
  fetchBucksRecommendations,
  fetchBucksRequests,
  fulfillBucksRequest,
  newIdempotencyKey,
  recommendBucks,
  requestBucksPrize,
  saveBucksPrize,
  setBucksBudget,
  type BucksChild,
  type BucksMe,
  type BucksPrize,
  type BucksRecommendation,
  type BucksRequestRow,
} from '../../lib/kidsBucksClient';

import { formatCurrency } from '../../utils/formatters';
const card = 'rounded-3xl border border-burgundy/10 bg-white p-5 space-y-4';
const h2 = 'text-sm font-black text-[#1A1A1A] inline-flex items-center gap-2';

function money(cents: number | null | undefined) {
  if (cents == null) return 'cost not set';
  return formatCurrency(cents / 100);
}

export function PrizeDesk({ me }: { me: BucksMe }) {
  const [rows, setRows] = useState<BucksRequestRow[] | null>(null);
  const [prizes, setPrizes] = useState<BucksPrize[]>([]);
  const [children, setChildren] = useState<BucksChild[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [childId, setChildId] = useState('');
  const [prizeId, setPrizeId] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [req, prize] = await Promise.all([
        me.canApprove || me.canFulfill ? fetchBucksRequests() : Promise.resolve({ requests: [] as BucksRequestRow[] }),
        fetchBucksPrizes(),
      ]);
      setRows(req.requests);
      setPrizes(prize.prizes);
      if (me.canApprove || me.canAward) setChildren((await fetchBucksChildren()).children);
    } catch (err) {
      setError(err instanceof BucksError ? err.message : 'Could not load the prize table.');
    }
  }, [me.canApprove, me.canAward, me.canFulfill]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      setNote('');
      await load();
    } catch (err) {
      setError(err instanceof BucksError ? err.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={card} aria-labelledby="prize-desk-title">
      <h2 id="prize-desk-title" className={h2}>
        <Gift size={14} aria-hidden /> Prize table
      </h2>
      {error ? <p className="text-xs font-medium text-rose-700">{error}</p> : null}
      {me.canApprove ? (
        <div className="flex flex-wrap gap-2">
          <select value={childId} onChange={(e) => setChildId(e.target.value)} className="h-11 px-3 rounded-xl border border-gray-100 bg-gray-50 text-sm font-semibold" aria-label="Child">
            <option value="">Child</option>
            {children.map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.balance})</option>
            ))}
          </select>
          <select value={prizeId} onChange={(e) => setPrizeId(e.target.value)} className="h-11 px-3 rounded-xl border border-gray-100 bg-gray-50 text-sm font-semibold" aria-label="Prize">
            <option value="">Prize</option>
            {prizes.filter((p) => p.active !== false).map((p) => (
              <option key={p.id} value={p.id}>{p.name} · {p.price}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy || !childId || !prizeId}
            onClick={() => void run(() => requestBucksPrize({ childId, prizeId, idempotencyKey: newIdempotencyKey() }))}
            className="h-11 px-4 rounded-xl bg-burgundy text-gold text-sm font-bold disabled:opacity-50"
          >
            Request
          </button>
        </div>
      ) : null}
      {!rows ? <p className="text-sm text-gray-500">Loading…</p> : !rows.length ? (
        <p className="text-sm text-gray-500">No prizes waiting.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="rounded-2xl border border-gray-100 px-4 py-3 space-y-2">
              <p className="text-sm font-bold text-[#0d1a14]">
                {r.childName} · {r.prizeName} · {r.price} Bucks · {r.status === 'approved' ? 'Approved' : 'Waiting'}
              </p>
              <div className="flex flex-wrap gap-2">
                {me.canApprove && r.status === 'requested' ? (
                  <>
                    <button type="button" disabled={busy} onClick={() => void run(() => approveBucksRequest({ requestId: r.id }))} className="h-9 px-3 rounded-lg bg-burgundy text-gold text-xs font-bold">Approve</button>
                    <button type="button" disabled={busy || !note.trim()} onClick={() => void run(() => closeBucksRequest({ requestId: r.id, which: 'reject', note }))} className="h-9 px-3 rounded-lg text-xs font-bold text-rose-700">Reject</button>
                  </>
                ) : null}
                {me.canFulfill && r.status === 'approved' ? (
                  <button type="button" disabled={busy} onClick={() => void run(() => fulfillBucksRequest(r.id))} className="h-9 px-3 rounded-lg bg-burgundy text-gold text-xs font-bold">Hand over</button>
                ) : null}
                {me.isSuperAdmin && r.status === 'requested' ? (
                  <button type="button" disabled={busy || !note.trim()} onClick={() => void run(() => approveBucksRequest({ requestId: r.id, override: true, note }))} className="h-9 px-3 rounded-lg text-xs font-bold text-burgundy">Approve over budget</button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      {me.canApprove ? (
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for a rejection or a budget override" className="h-11 w-full px-3 rounded-xl border border-gray-100 bg-gray-50 text-sm" />
      ) : null}
      {me.isSuperAdmin ? <PrizeAdmin prizes={prizes} onSaved={load} /> : null}
    </section>
  );
}

function PrizeAdmin({ prizes, onSaved }: { prizes: BucksPrize[]; onSaved: () => Promise<void> }) {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [budget, setBudget] = useState('100');
  const [msg, setMsg] = useState<string | null>(null);

  const saveCost = async (p: BucksPrize, dollars: string) => {
    const cents = Math.round(Number(dollars) * 100);
    await saveBucksPrize({ id: p.id, name: p.name, price: p.price, unitCostCents: Number.isFinite(cents) ? cents : null, active: p.active !== false });
    setMsg(`${p.name} cost saved.`);
    await onSaved();
  };

  return (
    <div className="space-y-3 border-t border-gray-100 pt-3">
      <h3 className="text-xs font-black uppercase tracking-wide text-gray-500">Church cost, stock, budget</h3>
      {msg ? <p className="text-xs font-semibold text-emerald-700">{msg}</p> : null}
      <ul className="space-y-2">
        {prizes.map((p) => (
          <PrizeCostRow key={p.id} prize={p} onSave={saveCost} />
        ))}
      </ul>
      <div className="flex flex-wrap items-end gap-2">
        <label className="space-y-1">
          <span className="block text-[11px] font-bold text-gray-500">Budget month</span>
          <input type="date" value={month} onChange={(e) => setMonth(e.target.value)} className="h-11 px-3 rounded-xl border border-gray-100 bg-gray-50 text-sm" />
        </label>
        <label className="space-y-1">
          <span className="block text-[11px] font-bold text-gray-500">Budget (UGX)</span>
          <input value={budget} onChange={(e) => setBudget(e.target.value)} className="h-11 w-28 px-3 rounded-xl border border-gray-100 bg-gray-50 text-sm" />
        </label>
        <button
          type="button"
          onClick={() => void setBucksBudget(month.slice(0, 7) + '-01', Math.round(Number(budget) * 100)).then(() => setMsg('Budget saved.'))}
          className="h-11 px-4 rounded-xl border border-burgundy/20 text-burgundy text-sm font-bold"
        >
          Save budget
        </button>
      </div>
    </div>
  );
}

function PrizeCostRow({ prize, onSave }: { prize: BucksPrize; onSave: (p: BucksPrize, dollars: string) => Promise<void> }) {
  const [dollars, setDollars] = useState(prize.unitCostCents == null ? '' : (prize.unitCostCents / 100).toFixed(2));
  const [stockNote, setStockNote] = useState('');
  const [delta, setDelta] = useState('1');
  return (
    <li className="rounded-2xl border border-gray-100 p-3 space-y-2">
      <p className="text-sm font-bold text-[#0d1a14]">{prize.name} · {prize.price} Bucks · {money(prize.unitCostCents)} · on hand {prize.onHand ?? 0}</p>
      <div className="flex flex-wrap gap-2">
        <input value={dollars} onChange={(e) => setDollars(e.target.value)} placeholder="Church cost UGX" className="h-10 w-28 px-3 rounded-xl border border-gray-100 text-sm" aria-label={`Church cost for ${prize.name}`} />
        <button type="button" onClick={() => void onSave(prize, dollars)} className="h-10 px-3 rounded-xl text-xs font-bold text-burgundy">Save cost</button>
        <input value={delta} onChange={(e) => setDelta(e.target.value)} className="h-10 w-16 px-3 rounded-xl border border-gray-100 text-sm" aria-label="Stock change" />
        <input value={stockNote} onChange={(e) => setStockNote(e.target.value)} placeholder="Why the stock changed" className="h-10 flex-1 min-w-[140px] px-3 rounded-xl border border-gray-100 text-sm" />
        <button
          type="button"
          onClick={() => void adjustBucksStock({ prizeId: prize.id, delta: Number(delta), note: stockNote })}
          className="h-10 px-3 rounded-xl text-xs font-bold text-burgundy"
        >
          Adjust stock
        </button>
      </div>
    </li>
  );
}

export function RecommendationDesk({ me }: { me: BucksMe }) {
  const [rows, setRows] = useState<BucksRecommendation[] | null>(null);
  const [children, setChildren] = useState<BucksChild[]>([]);
  const [childId, setChildId] = useState('');
  const [reasonId, setReasonId] = useState(me.reasons[0]?.id || 'kindness');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      if (me.canAward) setRows((await fetchBucksRecommendations()).recommendations);
      else setRows([]);
      if (me.canRecommend || me.canApprove) setChildren((await fetchBucksChildren()).children);
    } catch (err) {
      setError(err instanceof BucksError ? err.message : 'Could not load recommendations.');
    }
  }, [me.canApprove, me.canAward, me.canRecommend]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className={card} aria-labelledby="recommend-title">
      <h2 id="recommend-title" className={h2}>
        <HandHeart size={14} aria-hidden /> Recommendations
      </h2>
      <p className="text-xs text-gray-500">A recommendation pays only when a different leader approves it.</p>
      {error ? <p className="text-xs text-rose-700">{error}</p> : null}
      {me.canRecommend ? (
        <div className="flex flex-wrap gap-2">
          <select value={childId} onChange={(e) => setChildId(e.target.value)} className="h-11 px-3 rounded-xl border border-gray-100 bg-gray-50 text-sm font-semibold" aria-label="Child to recommend">
            <option value="">Child</option>
            {children.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={reasonId} onChange={(e) => setReasonId(e.target.value)} className="h-11 px-3 rounded-xl border border-gray-100 bg-gray-50 text-sm font-semibold" aria-label="Reason">
            {me.reasons.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you see?" className="h-11 flex-1 min-w-[140px] px-3 rounded-xl border border-gray-100 text-sm" />
          <button
            type="button"
            disabled={!childId}
            onClick={() => void recommendBucks({ childId, reasonId, note, idempotencyKey: newIdempotencyKey() }).then(() => setNote(''))}
            className="h-11 px-4 rounded-xl bg-burgundy text-gold text-sm font-bold disabled:opacity-50"
          >
            Recommend
          </button>
        </div>
      ) : null}
      {me.canAward ? (
        <ul className="space-y-2">
          {(rows || []).map((r) => (
            <li key={r.id} className="rounded-2xl border border-gray-100 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-bold text-[#0d1a14]">{r.childName} · {r.reasonId} · from {r.recommendedBy}{r.note ? ` · “${r.note}”` : ''}</span>
              <span className="flex gap-2">
                <button type="button" onClick={() => void decideBucksRecommendation({ recommendationId: r.id, approve: true }).then(load)} className="h-9 px-3 rounded-lg bg-burgundy text-gold text-xs font-bold">Approve</button>
                <button type="button" onClick={() => void decideBucksRecommendation({ recommendationId: r.id, approve: false, note: 'Not this time' }).then(load)} className="h-9 px-3 rounded-lg text-xs font-bold text-rose-700">Decline</button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
