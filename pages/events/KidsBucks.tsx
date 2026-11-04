import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Loader2, RotateCcw, ScanLine, Search, Settings2, X } from 'lucide-react';
import CardScannerCamera from '../../components/people/CardScannerCamera';
import AskAdminTitleLink from '../../components/common/AskAdminTitleLink';
import { precheckScannedToken } from '../../lib/cardScannerUi';
import { PrizeDesk, RecommendationDesk } from '../../components/kids/BucksPhase2Desk';
import {
  awardBucks,
  BUCKS_COIN,
  BucksError,
  fetchBucksAdmin,
  fetchBucksChildren,
  fetchBucksMe,
  fetchBucksRecent,
  newIdempotencyKey,
  reverseBucks,
  saveBucksLeader,
  saveBucksReason,
  setBucksCaps,
  type BucksAdmin,
  type BucksChild,
  type BucksLeader,
  type BucksMe,
  type BucksReason,
  type BucksRecentEntry,
} from '../../lib/kidsBucksClient';

type Picked = { kind: 'child'; child: BucksChild } | { kind: 'card'; token: string; label: string };

const card = 'rounded-3xl border border-burgundy/10 bg-white p-5 space-y-4';
const h2 = 'text-sm font-black text-[#1A1A1A] inline-flex items-center gap-2';
const input =
  'h-11 px-3 bg-gray-50 rounded-xl border border-gray-100 outline-none focus:border-burgundy/30 text-sm font-semibold text-[#0d1a14] placeholder:text-gray-400';

function time(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

const NEEDS_GRANT = new Set(['SECRETARY', 'ASST_SECRETARY']);

export default function KidsBucksPage() {
  const [me, setMe] = useState<BucksMe | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setMe(await fetchBucksMe());
    } catch (err) {
      setLoadError(err instanceof BucksError ? err.message : 'Could not load PLCC Bucks.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
      <header className="flex items-start gap-4">
        <img src={BUCKS_COIN.md} srcSet={`${BUCKS_COIN.md} 1x, ${BUCKS_COIN.lg} 2x`} width={56} height={56} alt="" className="shrink-0" />
        <div className="space-y-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-gold">Kids Ministry</p>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-black text-[#0d1a14]">Kids Bucks</h1>
            <AskAdminTitleLink />
          </div>
          <p className="text-sm text-gray-500 leading-relaxed">
            Give PLCC Bucks for memory verses, kindness and helping. Bucks have no cash value.
          </p>
        </div>
      </header>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-gray-500">
          <Loader2 className="animate-spin" size={20} aria-hidden /> Loading…
        </div>
      ) : loadError ? (
        <div className="rounded-3xl border border-rose-200 bg-rose-50 p-5 space-y-2">
          <p className="text-sm font-medium text-rose-900">{loadError}</p>
          <button type="button" onClick={() => void load()} className="text-sm font-bold text-burgundy underline">
            Retry
          </button>
        </div>
      ) : me && !me.canAward && !me.canReverse && !me.canApprove && !me.canFulfill && !me.canRecommend && !me.isSuperAdmin ? (
        <div className={card}>
          <p className="text-sm font-semibold text-[#0d1a14]">You can't give PLCC Bucks yet.</p>
          <p className="text-sm text-gray-500">
            Kids ministry leaders can give Bucks. If you need access, ask a Super Admin to turn on PLCC Bucks for your account.
          </p>
        </div>
      ) : me ? (
        <>
          {me.canAward ? <GiveBucks me={me} /> : null}
          {me.canReverse ? <TodayAwards /> : null}
          {me.canApprove || me.canFulfill || me.isSuperAdmin ? <PrizeDesk me={me} /> : null}
          {me.canRecommend || me.canAward ? <RecommendationDesk me={me} /> : null}
          {me.isSuperAdmin ? <AdminPanel onChanged={load} /> : null}
        </>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
function GiveBucks({ me }: { me: BucksMe }) {
  const [children, setChildren] = useState<BucksChild[] | null>(null);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Picked | null>(null);
  const [scanning, setScanning] = useState(false);
  const [busyReason, setBusyReason] = useState<string | null>(null);
  const [toast, setToast] = useState<{ tone: 'ok' | 'warn' | 'err'; text: string } | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    fetchBucksChildren()
      .then((r) => setChildren(r.children))
      .catch(() => setChildren([]));
  }, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!children || !q) return [];
    return children.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 8);
  }, [children, query]);

  const onDecode = (raw: string) => {
    const pre = precheckScannedToken(raw);
    if (!pre.ok) {
      setToast({ tone: 'err', text: 'That code is not an PLCC child card.' });
      return;
    }
    setScanning(false);
    setPicked({ kind: 'card', token: pre.token, label: 'Scanned child card' });
    setToast(null);
  };

  const give = async (reason: BucksReason) => {
    if (!picked || inFlight.current) return;
    inFlight.current = true;
    setBusyReason(reason.id);
    setToast(null);
    try {
      const r = await awardBucks({
        reasonId: reason.id,
        idempotencyKey: newIdempotencyKey(),
        ...(picked.kind === 'child' ? { childId: picked.child.id } : { cardToken: picked.token }),
      });
      setToast({ tone: 'ok', text: `+${r.amount} PLCC Bucks to ${r.childName} — ${r.reasonLabel}. New balance: ${r.balance}.` });
      if (picked.kind === 'card') setPicked({ ...picked, label: r.childName });
      setChildren((prev) => prev?.map((c) => (c.id === r.childId ? { ...c, balance: r.balance } : c)) ?? prev);
    } catch (err) {
      const e = err instanceof BucksError ? err : null;
      setToast({ tone: e?.code === 'weekly_cap' || e?.code === 'daily_cap' ? 'warn' : 'err', text: e?.message || 'Could not give Bucks. Try again.' });
    } finally {
      inFlight.current = false;
      setBusyReason(null);
    }
  };

  const pickedName = picked?.kind === 'child' ? picked.child.name : picked?.label;

  return (
    <section className={card} aria-labelledby="give-title">
      <h2 id="give-title" className={h2}>
        <img src={BUCKS_COIN.sm} width={18} height={18} alt="" /> Give PLCC Bucks
      </h2>

      {!picked ? (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setScanning((s) => !s)}
            className="w-full h-12 rounded-xl bg-burgundy text-gold font-black text-sm inline-flex items-center justify-center gap-2"
          >
            <ScanLine size={18} aria-hidden /> {scanning ? 'Stop scanning' : "Scan the child's Family Pass"}
          </button>
          {scanning ? (
            <CardScannerCamera
              active={scanning}
              paused={false}
              onStart={() => setScanning(true)}
              onStop={() => setScanning(false)}
              onDecode={onDecode}
              hint="Hold the child's Family Pass QR in the frame"
            />
          ) : null}
          <label className="block space-y-1.5">
            <span className="text-[11px] font-black uppercase tracking-wide text-gray-500">Or find a child</span>
            <span className="relative block">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Type a name"
                className={`${input} w-full pl-9`}
              />
            </span>
          </label>
          {matches.length ? (
            <ul className="divide-y divide-gray-100 rounded-2xl border border-gray-100">
              {matches.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setPicked({ kind: 'child', child: c });
                      setToast(null);
                    }}
                    className="w-full min-h-[48px] px-4 flex items-center justify-between gap-3 text-left hover:bg-gray-50"
                  >
                    <span className="font-bold text-[#0d1a14]">{c.name}</span>
                    <span className="inline-flex items-center gap-1 text-xs font-black text-gray-500 tabular-nums">
                      <img src={BUCKS_COIN.sm} width={14} height={14} alt="" /> {c.balance}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : query.trim() && children ? (
            <p className="text-xs text-gray-500">No child matches “{query.trim()}”.</p>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3">
            <span className="font-black text-[#0d1a14]">{pickedName}</span>
            <button
              type="button"
              onClick={() => {
                setPicked(null);
                setToast(null);
                setQuery('');
              }}
              className="h-9 px-3 rounded-lg text-xs font-bold text-burgundy hover:bg-white inline-flex items-center gap-1"
            >
              <X size={14} aria-hidden /> Change child
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {me.reasons.map((r) => (
              <button
                key={r.id}
                type="button"
                disabled={Boolean(busyReason)}
                onClick={() => void give(r)}
                className="min-h-[52px] px-4 rounded-xl border border-burgundy/15 bg-white hover:bg-burgundy/5 text-left flex items-center justify-between gap-3 disabled:opacity-50"
              >
                <span className="text-sm font-bold text-[#0d1a14]">{r.label}</span>
                <span className="shrink-0 text-sm font-black text-burgundy tabular-nums inline-flex items-center gap-1">
                  {busyReason === r.id ? <Loader2 size={14} className="animate-spin" /> : `+${r.amount}`}
                </span>
              </button>
            ))}
          </div>
          {me.caps ? (
            <p className="text-[11px] text-gray-500">
              Limits: {me.caps.weekly} Bucks per child each week (Mon–Sun), {me.caps.daily} from you per child each day.
            </p>
          ) : null}
        </div>
      )}

      {toast ? (
        <p
          role="status"
          className={`text-sm font-semibold rounded-xl px-4 py-3 flex items-start gap-2 ${
            toast.tone === 'ok'
              ? 'bg-emerald-50 text-emerald-900'
              : toast.tone === 'warn'
                ? 'bg-amber-50 text-amber-900'
                : 'bg-rose-50 text-rose-900'
          }`}
        >
          {toast.tone === 'ok' ? <CheckCircle2 size={18} className="shrink-0 mt-0.5" aria-hidden /> : null}
          {toast.text}
        </p>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ */
function TodayAwards() {
  const [entries, setEntries] = useState<BucksRecentEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fixing, setFixing] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setEntries((await fetchBucksRecent()).entries);
    } catch (err) {
      setError(err instanceof BucksError ? err.message : 'Could not load today’s awards.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (id: string) => {
    if (!note.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const corrected = await reverseBucks(id, note.trim());
      setNotice(corrected.outstanding ? `${corrected.outstanding} PLCC Bucks are still to recover from later awards.` : null);
      setFixing(null);
      setNote('');
      await load();
    } catch (err) {
      setError(err instanceof BucksError ? err.message : 'Could not correct that award.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={card} aria-labelledby="today-title">
      <div className="flex items-center justify-between gap-2">
        <h2 id="today-title" className={h2}>
          <RotateCcw size={14} aria-hidden /> Today's awards
        </h2>
        <button type="button" onClick={() => void load()} className="text-xs font-bold text-burgundy underline">
          Refresh
        </button>
      </div>
      {notice ? <p className="text-xs text-amber-800 font-medium">{notice}</p> : null}
      {error ? <p className="text-xs text-rose-700 font-medium">{error}</p> : null}
      {!entries ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : !entries.length ? (
        <p className="text-sm text-gray-500 py-3 text-center border border-dashed border-gray-200 rounded-2xl">No PLCC Bucks given today yet.</p>
      ) : (
        <ul className="space-y-2">
          {entries.map((e) => (
            <li key={e.id} className="rounded-2xl border border-gray-100 px-4 py-3 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className={`block text-sm font-bold text-[#0d1a14] ${e.reversed ? 'line-through opacity-60' : ''}`}>
                    {e.amount > 0 ? '+' : '−'}
                    {Math.abs(e.amount)} · {e.childName} · {e.reasonLabel}
                  </span>
                  <span className="block text-xs text-gray-500">
                    {e.kind === 'reversal' ? 'Corrected by' : 'By'} {e.awardedBy} · {time(e.createdAt)}
                    {e.note ? ` · “${e.note}”` : ''}
                    {e.reversed ? ' · Corrected' : ''}
                  </span>
                </span>
                {e.kind === 'award' && !e.reversed && fixing !== e.id ? (
                  <button
                    type="button"
                    onClick={() => {
                      setFixing(e.id);
                      setNote('');
                    }}
                    className="h-9 px-3 rounded-lg text-xs font-bold text-rose-700 hover:bg-rose-50 shrink-0"
                  >
                    Correct
                  </button>
                ) : null}
              </div>
              {fixing === e.id ? (
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    autoFocus
                    value={note}
                    onChange={(ev) => setNote(ev.target.value)}
                    maxLength={200}
                    placeholder="Why? e.g. Given to the wrong child"
                    className={`${input} flex-1`}
                    aria-label="Reason for the correction"
                  />
                  <button
                    type="button"
                    disabled={!note.trim() || busy}
                    onClick={() => void submit(e.id)}
                    className="h-11 px-4 rounded-xl bg-rose-700 text-white text-sm font-bold disabled:opacity-50"
                  >
                    {busy ? 'Saving…' : `Take back ${e.amount}`}
                  </button>
                  <button type="button" onClick={() => setFixing(null)} className="h-11 px-3 text-sm font-bold text-gray-500">
                    Cancel
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
function AdminPanel({ onChanged }: { onChanged: () => void }) {
  const [data, setData] = useState<BucksAdmin | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [weekly, setWeekly] = useState('');
  const [daily, setDaily] = useState('');

  const load = useCallback(async () => {
    try {
      const d = await fetchBucksAdmin();
      setData(d);
      setWeekly(String(d.caps?.weekly ?? ''));
      setDaily(String(d.caps?.daily ?? ''));
    } catch (err) {
      setMsg({ ok: false, text: err instanceof BucksError ? err.message : 'Could not load settings.' });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (fn: () => Promise<unknown>, okText: string) => {
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: okText });
      await load();
      onChanged();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof BucksError ? err.message : 'Could not save.' });
    }
  };

  if (!data) return msg ? <p className="text-xs text-rose-700">{msg.text}</p> : null;

  return (
    <section className={card} aria-labelledby="admin-title">
      <h2 id="admin-title" className={h2}>
        <Settings2 size={14} aria-hidden /> Super Admin settings
      </h2>
      {msg ? <p className={`text-xs font-semibold ${msg.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{msg.text}</p> : null}

      <div className="space-y-2">
        <h3 className="text-xs font-black uppercase tracking-wide text-gray-500">Limits</h3>
        <div className="flex flex-wrap items-end gap-2">
          <label className="space-y-1">
            <span className="block text-[11px] font-bold text-gray-500">Per child, per week</span>
            <input type="number" min={1} max={1000} value={weekly} onChange={(e) => setWeekly(e.target.value)} className={`${input} w-32`} />
          </label>
          <label className="space-y-1">
            <span className="block text-[11px] font-bold text-gray-500">Per leader, per child, per day</span>
            <input type="number" min={1} max={1000} value={daily} onChange={(e) => setDaily(e.target.value)} className={`${input} w-32`} />
          </label>
          <button
            type="button"
            onClick={() => void run(() => setBucksCaps(Number(weekly), Number(daily)), 'Limits saved.')}
            className="h-11 px-4 rounded-xl bg-burgundy text-gold text-sm font-bold"
          >
            Save limits
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-black uppercase tracking-wide text-gray-500">Reasons</h3>
        <ul className="space-y-2">
          {data.reasons.map((r) => (
            <ReasonRow key={r.id} reason={r} onSave={(next) => run(() => saveBucksReason(next), 'Reason saved.')} />
          ))}
        </ul>
        <NewReason onSave={(next) => run(() => saveBucksReason(next), 'Reason added.')} />
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-black uppercase tracking-wide text-gray-500">Leaders</h3>
        <p className="text-xs text-gray-500">
          Kids ministry roles can give Bucks automatically. Secretaries need “Can give Bucks” turned on. Ministry
          Leaders do not approve prizes until you turn that on. Volunteers can recommend or hand prizes over, but they
          cannot give Bucks. The name you approve is what parents see.
        </p>
        <ul className="space-y-2">
          {data.leaders.map((l) => (
            <LeaderRow key={l.userId} leader={l} onSave={(next) => run(() => saveBucksLeader(next), `${l.name} saved.`)} />
          ))}
        </ul>
      </div>
    </section>
  );
}

function ReasonRow({ reason, onSave }: { reason: BucksReason; onSave: (r: { id: string; label: string; amount: number; active: boolean; sortOrder?: number }) => void }) {
  const [label, setLabel] = useState(reason.label);
  const [amount, setAmount] = useState(String(reason.amount));
  const [active, setActive] = useState(reason.active !== false);
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-100 p-2">
      <input value={label} onChange={(e) => setLabel(e.target.value)} className={`${input} flex-1 min-w-[160px]`} aria-label="Reason label" />
      <input type="number" min={1} max={100} value={amount} onChange={(e) => setAmount(e.target.value)} className={`${input} w-20`} aria-label="Bucks" />
      <label className="h-11 px-2 inline-flex items-center gap-1.5 text-xs font-bold text-gray-600">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="accent-[#0d1a14]" /> On
      </label>
      <button
        type="button"
        onClick={() => onSave({ id: reason.id, label: label.trim(), amount: Number(amount), active, sortOrder: reason.sort_order })}
        className="h-11 px-3 rounded-xl border border-burgundy/20 text-burgundy text-xs font-bold"
      >
        Save
      </button>
    </li>
  );
}

function NewReason({ onSave }: { onSave: (r: { id: string; label: string; amount: number; active: boolean }) => void }) {
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('10');
  const id = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="New reason, e.g. Invited a friend" className={`${input} flex-1 min-w-[160px]`} />
      <input type="number" min={1} max={100} value={amount} onChange={(e) => setAmount(e.target.value)} className={`${input} w-20`} aria-label="Bucks" />
      <button
        type="button"
        disabled={id.length < 2}
        onClick={() => {
          onSave({ id, label: label.trim(), amount: Number(amount), active: true });
          setLabel('');
        }}
        className="h-11 px-3 rounded-xl bg-burgundy text-gold text-xs font-bold disabled:opacity-50"
      >
        Add reason
      </button>
    </div>
  );
}

function LeaderRow({ leader, onSave }: { leader: BucksLeader; onSave: (l: { userId: string; displayName: string | null; canAward: boolean; canApprove: boolean; canFulfill: boolean; canRecommend: boolean; active: boolean }) => void }) {
  const [displayName, setDisplayName] = useState(leader.displayName || '');
  const [canAward, setCanAward] = useState(leader.canAward);
  const [canApprove, setCanApprove] = useState(Boolean(leader.canApprove));
  const [canFulfill, setCanFulfill] = useState(Boolean(leader.canFulfill));
  const [canRecommend, setCanRecommend] = useState(Boolean(leader.canRecommend));
  const [active, setActive] = useState(leader.active);
  const needsGrant = NEEDS_GRANT.has(leader.role);
  const isVolunteer = leader.role === 'VOLUNTEER';
  return (
    <li className="rounded-2xl border border-gray-100 p-3 space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-bold text-[#0d1a14]">{leader.name}</span>
        <span className="text-[10px] font-black uppercase tracking-wide text-gray-400">{leader.role.replace(/_/g, ' ')}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={40}
          placeholder="Name parents see, e.g. Teacher Keisha"
          className={`${input} flex-1 min-w-[180px]`}
          aria-label={`Name parents see for ${leader.name}`}
        />
        {isVolunteer ? (
          <span className="h-11 px-2 inline-flex items-center text-xs font-semibold text-gray-500">Volunteers cannot give Bucks</span>
        ) : needsGrant ? (
          <label className="h-11 px-2 inline-flex items-center gap-1.5 text-xs font-bold text-gray-600">
            <input type="checkbox" checked={canAward} onChange={(e) => setCanAward(e.target.checked)} className="accent-[#0d1a14]" /> Can give Bucks
          </label>
        ) : (
          <span className="h-11 px-2 inline-flex items-center text-xs font-semibold text-gray-500">Gives Bucks by role</span>
        )}
        {leader.role === 'MINISTRY_LEADER' ? (
          <label className="h-11 px-2 inline-flex items-center gap-1.5 text-xs font-bold text-gray-600">
            <input type="checkbox" checked={canApprove} onChange={(e) => setCanApprove(e.target.checked)} className="accent-[#0d1a14]" /> Can approve prizes
          </label>
        ) : null}
        <label className="h-11 px-2 inline-flex items-center gap-1.5 text-xs font-bold text-gray-600">
          <input type="checkbox" checked={canFulfill} onChange={(e) => setCanFulfill(e.target.checked)} className="accent-[#0d1a14]" /> Can hand over prizes
        </label>
        <label className="h-11 px-2 inline-flex items-center gap-1.5 text-xs font-bold text-gray-600">
          <input type="checkbox" checked={canRecommend} onChange={(e) => setCanRecommend(e.target.checked)} className="accent-[#0d1a14]" /> Can recommend
        </label>
        <label className="h-11 px-2 inline-flex items-center gap-1.5 text-xs font-bold text-gray-600">
          <input type="checkbox" checked={!active} onChange={(e) => setActive(!e.target.checked)} className="accent-rose-700" /> Paused
        </label>
        <button
          type="button"
          onClick={() => onSave({
            userId: leader.userId,
            displayName: displayName.trim() || null,
            canAward: isVolunteer ? false : canAward,
            canApprove: leader.role === 'MINISTRY_LEADER' ? canApprove : false,
            canFulfill,
            canRecommend,
            active,
          })}
          className="h-11 px-3 rounded-xl border border-burgundy/20 text-burgundy text-xs font-bold"
        >
          Save
        </button>
      </div>
    </li>
  );
}
