import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Loader2,
  Search,
  X,
  RefreshCw,
  FileText,
  Printer,
  Pencil,
  Trash2,
  Check,
  Calculator,
  Users,
  ListChecks,
  Settings2,
  Gamepad2,
  HandCoins,
  Globe,
  Minus,
  Lock,
  UserPlus,
  ShieldCheck,
  Link2,
  BookCheck,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import {
  buildFundraiserPayLink,
  FUNDRAISER_PAYMENT_METHODS,
  dollarsToCents,
  entryLeftCents,
  formatCents,
  paymentMethodLabel,
  type ChargeBreakdown,
  type FundraiserSummary,
  type PersonBalance,
} from '../../lib/fundraiserMath';
import { downloadFundraiserReport, downloadReminderLetters } from '../../lib/fundraiserPdf';
import { resetFundraiserAccess } from '../../lib/fundraiserAccess';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Fundraiser = {
  id: string;
  title: string;
  start_date: string;
  goal_amount_cents: number | null;
  status: 'open' | 'closed';
  notes: string | null;
  tithe_fund_id: string | null;
  tithe_fund_name: string | null;
  tithe_synced_at: string | null;
  summary?: FundraiserSummary;
};
type ChargeItem = { id: string; label: string; amount_cents: number; active: boolean };
type Payment = {
  id: string;
  payment_date: string;
  amount_cents: number;
  payment_method: string;
  notes: string | null;
  external_ref?: string | null;
  /** Cash / check sent to the DCB: posted, review, failed, before_link, not_sent, or null (waiting) */
  dcb_status?: string | null;
  dcb_error?: string | null;
  /** Volunteer who recorded it, or "PLCC Tithe" */
  recorded_by_name?: string | null;
};
type Entry = {
  id: string;
  entry_date: string;
  source_type: 'member' | 'visitor' | 'game' | 'online';
  member_id: string | null;
  display_name: string;
  kind: 'paid' | 'pledge' | 'charge';
  charge_item_id: string | null;
  charge_label: string | null;
  quantity: number;
  owed_amount_cents: number;
  received_amount_cents: number;
  payment_method: string | null;
  notes: string | null;
  external_ref?: string | null;
  match_dismissed?: boolean;
  recorded_by_name?: string | null;
  payments: Payment[];
};
type Full = {
  fundraiser: Fundraiser;
  chargeItems: ChargeItem[];
  entries: Entry[];
  summary: FundraiserSummary;
  balances: PersonBalance[];
  charges: ChargeBreakdown[];
  tithe?: { added: number; applied?: number; updated: number; warning?: string };
  dcb?: DcbOverview;
  dcbWarning?: string;
  permissions: { canManage: boolean; canDelete: boolean; role: string };
};
type DcbBucket = { count: number; cents: number };
type DcbOverview = {
  ready: boolean;
  configured: boolean;
  posted: DcbBucket;
  review: DcbBucket;
  waiting: DcbBucket;
  failed: DcbBucket & { lastError: string | null };
  beforeLink: DcbBucket;
  notSent: DcbBucket;
  pendingVoids: number;
};
type Tab = 'add' | 'owes' | 'charges' | 'entries' | 'settings';
type Who = 'member' | 'visitor' | 'game';
type Kind = 'paid' | 'pledge' | 'charge';

const API = '/api/vault?resource=fundraisers';
const today = () => new Date().toISOString().slice(0, 10);

function post<T = Full>(action: string, body: Record<string, unknown>) {
  return apiFetch<T>(`${API}&action=${action}`, { method: 'POST', body: JSON.stringify(body) });
}

// ---------------------------------------------------------------------------
// Small UI pieces
// ---------------------------------------------------------------------------
const fieldCls =
  'h-12 w-full rounded-xl border border-black/10 bg-white px-3.5 text-base text-[#16251f] focus:outline-none focus:ring-2 focus:ring-[#0d1a14]/20';
const labelCls = 'flex flex-col gap-1.5 text-[13px] font-semibold text-[#0d1a14]';
const btnPrimary =
  'inline-flex items-center justify-center gap-2 h-12 px-5 rounded-xl bg-[#0d1a14] text-amber-50 text-sm font-bold hover:bg-[#12231c] disabled:opacity-50';
const btnGhost =
  'inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl border border-black/10 bg-white text-sm font-semibold text-[#0d1a14] hover:bg-[#FAF6F0] disabled:opacity-50';

function MoneyInput(props: { value: string; onChange: (v: string) => void; placeholder?: string; id?: string }) {
  return (
    <span className="relative block">
      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-semibold">UGX</span>
      <input
        id={props.id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder || '0.00'}
        className={`${fieldCls} pl-12 font-bold tabular-nums`}
      />
    </span>
  );
}

function MethodSelect(props: { value: string; onChange: (v: string) => void }) {
  return (
    <select value={props.value} onChange={(e) => props.onChange(e.target.value)} className={fieldCls}>
      {FUNDRAISER_PAYMENT_METHODS.map((m) => (
        <option key={m.value} value={m.value}>
          {m.label}
        </option>
      ))}
    </select>
  );
}

function Segmented<T extends string>(props: {
  label?: string;
  value: T;
  options: ReadonlyArray<readonly [T, string]>;
  onPick: (v: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {props.label && <span className="text-[13px] font-semibold text-[#0d1a14]">{props.label}</span>}
      <div role="radiogroup" aria-label={props.label} className="flex flex-wrap gap-1 p-1 rounded-xl bg-[#F3ECE3] w-fit max-w-full">
        {props.options.map(([v, text]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={props.value === v}
            onClick={() => props.onPick(v)}
            className={`min-h-[42px] px-4 rounded-[10px] text-sm font-bold transition ${
              props.value === v ? 'bg-white text-[#0d1a14] shadow-sm' : 'text-[#6b5a55] hover:text-[#0d1a14]'
            }`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function Stat(props: { label: string; value: string; sub?: string; tone?: 'gold' | 'green' | 'red' | 'plain'; big?: boolean }) {
  const tone =
    props.tone === 'green'
      ? 'text-emerald-300'
      : props.tone === 'red'
        ? 'text-rose-300'
        : props.tone === 'gold'
          ? 'text-[#E9C979]'
          : 'text-white';
  return (
    <div className="rounded-2xl bg-white/[0.06] border border-white/10 p-4 flex flex-col gap-1 min-w-0">
      <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#CDBBA9]">{props.label}</span>
      <span className={`${props.big ? 'text-3xl' : 'text-2xl'} font-black tabular-nums ${tone} truncate`}>{props.value}</span>
      {props.sub && <span className="text-[12px] text-[#BFAE9E]">{props.sub}</span>}
    </div>
  );
}

function entryTypeLabel(e: Entry): string {
  if (e.source_type === 'online') return 'Online · PLCC Tithe';
  if (e.source_type === 'game') return 'Game / event';
  if (e.kind === 'pledge') return 'Pledge';
  if (e.kind === 'charge') return `${e.charge_label || 'Fun charge'}${e.quantity > 1 ? ` × ${e.quantity}` : ''}`;
  return 'Gift';
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
const FundraisersPage: React.FC = () => {
  const [list, setList] = useState<Fundraiser[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [full, setFull] = useState<Full | null>(null);
  const [perms, setPerms] = useState<Full['permissions']>({ canManage: false, canDelete: false, role: '' });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('add');
  const [noAccess, setNoAccess] = useState(false);

  // create
  const [showCreate, setShowCreate] = useState(false);
  const [showAccess, setShowAccess] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newGoal, setNewGoal] = useState('');
  const [newStart, setNewStart] = useState(today());

  const flash = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 3500);
  };

  const apply = useCallback((data: Full) => {
    setFull(data);
    if (data.permissions) setPerms(data.permissions);
    setSelectedId(data.fundraiser.id);
    if (data.tithe?.warning || data.dcbWarning) setError([data.tithe?.warning, data.dcbWarning].filter(Boolean).join(' '));
    else if (data.tithe?.added || data.tithe?.applied) {
      const bits: string[] = [];
      if (data.tithe.applied) bits.push(`${data.tithe.applied} online payment${data.tithe.applied === 1 ? '' : 's'} applied to balances`);
      if (data.tithe.added) bits.push(`${data.tithe.added} new online gift${data.tithe.added === 1 ? '' : 's'} added`);
      flash(`PLCC Tithe: ${bits.join(' · ')}.`);
    }
  }, []);

  const loadList = useCallback(async () => {
    const data = await apiFetch<{ fundraisers: Fundraiser[]; permissions: Full['permissions'] }>(`${API}&action=list`);
    setList(data.fundraisers || []);
    if (data.permissions) setPerms(data.permissions);
    return data.fundraisers || [];
  }, []);

  const loadOne = useCallback(
    async (id: string) => {
      const data = await apiFetch<Full>(`${API}&action=get&id=${encodeURIComponent(id)}`);
      apply(data);
      return data;
    },
    [apply]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const rows = await loadList();
        if (cancelled) return;
        const pick = rows.find((r) => r.status === 'open') || rows[0];
        if (pick) await loadOne(pick.id);
      } catch (err: any) {
        if (cancelled) return;
        if (err?.status === 403) setNoAccess(true);
        else setError(err?.message || 'Could not load fundraisers.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadList, loadOne]);

  /** Run a write, apply the returned fundraiser, refresh the list totals. */
  const run = async (fn: () => Promise<Full>, done?: string) => {
    setBusy(true);
    setError(null);
    try {
      const data = await fn();
      apply(data);
      void loadList();
      if (done) flash(done);
      return true;
    } catch (err: any) {
      setError(err?.message || 'Something went wrong. Please try again.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return setError('Give the fundraiser a name, such as 2nd Floor Building Fund.');
    const goal = newGoal.trim() ? dollarsToCents(newGoal) : null;
    if (goal != null && !Number.isFinite(goal)) return setError('Enter a valid goal amount.');
    setBusy(true);
    setError(null);
    try {
      const res = await post<{ fundraiser: Fundraiser }>('create', { title: newTitle.trim(), goalAmountCents: goal, startDate: newStart });
      await loadList();
      await loadOne(res.fundraiser.id);
      setShowCreate(false);
      setNewTitle('');
      setNewGoal('');
      setTab('settings');
      flash('Fundraiser created. Add your fun charges and link the PLCC Tithe fund in Settings.');
    } catch (err: any) {
      setError(err?.message || 'Could not create the fundraiser.');
    } finally {
      setBusy(false);
    }
  };

  const f = full?.fundraiser;
  const s = full?.summary;
  const isOpen = f?.status === 'open';

  if (noAccess) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <Lock className="mx-auto text-[#0d1a14]/50" size={36} />
        <h1 className="mt-4 text-2xl font-black text-[#16251f]">Fundraisers</h1>
        <p className="mt-2 text-sm text-gray-600">
          You don't have Fundraiser access. Ask the Pastor, First Lady or Finance to turn it on for you.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-5">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-[#16251f]">Fundraisers</h1>
          <p className="text-sm text-gray-500 mt-1 max-w-2xl">
            Gifts, pledges, fun charges and game cash for special projects. Kept separate from the Sunday offering. A
            pledge or fun charge only counts as raised once it is paid.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {perms.canManage && (
            <button type="button" onClick={() => setShowAccess((v) => !v)} className={btnGhost} aria-expanded={showAccess}>
              {showAccess ? <X size={16} /> : <ShieldCheck size={16} />} {showAccess ? 'Close' : 'Fundraiser access'}
            </button>
          )}
          <button type="button" onClick={() => setShowCreate((v) => !v)} className={btnPrimary}>
            {showCreate ? <X size={16} /> : <Plus size={16} />} {showCreate ? 'Cancel' : 'New fundraiser'}
          </button>
        </div>
      </header>

      {showAccess && perms.canManage && (
        <section className="rounded-2xl border border-black/[0.06] bg-white p-5">
          <AccessManager onError={setError} />
        </section>
      )}

      {error && (
        <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800 flex justify-between gap-3">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss">
            <X size={16} />
          </button>
        </div>
      )}
      {notice && (
        <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          {notice}
        </div>
      )}

      {showCreate && (
        <form onSubmit={handleCreate} className="rounded-2xl border border-black/[0.06] bg-white p-5 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <label className={`${labelCls} sm:col-span-3`}>
            Name
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="2nd Floor Building Fund" className={fieldCls} />
          </label>
          <label className={labelCls}>
            Goal (optional)
            <MoneyInput value={newGoal} onChange={setNewGoal} placeholder="50,000" />
          </label>
          <label className={labelCls}>
            Start date
            <input type="date" value={newStart} onChange={(e) => setNewStart(e.target.value)} className={fieldCls} />
          </label>
          <button type="submit" disabled={busy} className={btnPrimary}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Create
          </button>
        </form>
      )}

      {loading ? (
        <div className="py-20 flex justify-center text-gray-400">
          <Loader2 className="animate-spin" />
        </div>
      ) : list.length === 0 && !showCreate ? (
        <div className="rounded-2xl border border-dashed border-black/10 bg-white p-10 text-center">
          <HandCoins className="mx-auto text-[#0d1a14]/40" size={36} />
          <p className="mt-3 font-bold text-[#0d1a14]">No fundraisers yet</p>
          <p className="text-sm text-gray-500">
            Tap New fundraiser to start one, such as the 2nd Floor Building Fund.
          </p>
        </div>
      ) : (
        <>
          {list.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {list.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void loadOne(item.id).catch((err) => setError(err?.message || 'Could not open it.'))}
                  className={`shrink-0 rounded-xl border px-4 py-2.5 text-left ${
                    item.id === selectedId ? 'border-[#0d1a14] bg-[#0d1a14] text-amber-50' : 'border-black/10 bg-white text-[#0d1a14]'
                  }`}
                >
                  <span className="block text-sm font-bold">{item.title}</span>
                  <span className={`block text-[11px] ${item.id === selectedId ? 'text-amber-100/80' : 'text-gray-500'}`}>
                    {item.status === 'closed' ? 'Closed' : 'Open'} · {formatCents(item.summary?.totalRaisedCents)} raised
                  </span>
                </button>
              ))}
            </div>
          )}

          {f && s && full && (
            <>
              <CalculatorCard
                fundraiser={f}
                summary={s}
                perms={perms}
                busy={busy}
                onRun={run}
                onDeleted={async () => {
                  setFull(null);
                  const rows = await loadList();
                  const next = rows.find((r) => r.status === 'open') || rows[0];
                  if (next) await loadOne(next.id);
                  flash('Fundraiser deleted.');
                }}
                onError={setError}
              />

              {full.dcb && <DcbCard full={full} perms={perms} busy={busy} onRun={run} />}

              <nav className="flex gap-1 p-1 rounded-2xl bg-[#F3ECE3] overflow-x-auto" aria-label="Fundraiser sections">
                {(
                  [
                    ['add', 'Add', Plus],
                    ['owes', `Who owes (${s.peopleOwingCount})`, Users],
                    ['charges', 'Fun charges', ListChecks],
                    ['entries', `All entries (${s.entryCount})`, FileText],
                    ['settings', 'Tithe link', Settings2],
                  ] as const
                )
                  .filter(([id]) => id !== 'settings' || perms.canManage)
                  .map(([id, label, Icon]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTab(id)}
                    className={`shrink-0 inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-xl text-sm font-bold ${
                      tab === id ? 'bg-white text-[#0d1a14] shadow-sm' : 'text-[#6b5a55]'
                    }`}
                  >
                    <Icon size={15} /> {label}
                  </button>
                ))}
              </nav>

              {tab === 'add' &&
                (isOpen ? (
                  <AddEntry full={full} busy={busy} onRun={run} onError={setError} />
                ) : (
                  <ClosedNote />
                ))}
              {tab === 'owes' && <WhoOwes full={full} busy={busy} onRun={run} onError={setError} />}
              {tab === 'charges' && <ChargesTab full={full} perms={perms} busy={busy} onRun={run} onError={setError} />}
              {tab === 'entries' && <EntriesTab full={full} perms={perms} busy={busy} onRun={run} onError={setError} />}
              {tab === 'settings' && <SettingsTab full={full} perms={perms} busy={busy} onRun={run} onError={setError} />}
            </>
          )}
        </>
      )}
    </div>
  );
};

type RunFn = (fn: () => Promise<Full>, done?: string) => Promise<boolean>;

/** Short label for where a hand-entered payment stands in the DCB. */
function dcbLabel(p: Payment): { text: string; cls: string } | null {
  if (p.external_ref) return null; // Tithe sends online gifts to the DCB itself
  switch (p.dcb_status) {
    case 'posted':
      return { text: 'In DCB', cls: 'bg-emerald-50 text-emerald-700' };
    case 'review':
      return { text: 'In DCB · Finance to confirm', cls: 'bg-sky-50 text-sky-700' };
    case 'before_link':
      return { text: 'Not in DCB', cls: 'bg-gray-100 text-gray-600' };
    case 'not_sent':
      return { text: 'Under $1 · not in DCB', cls: 'bg-gray-100 text-gray-600' };
    case 'failed':
    default:
      return { text: 'Sending to DCB…', cls: 'bg-amber-50 text-amber-800' };
  }
}

function DcbChip({ p }: { p: Payment }) {
  const l = dcbLabel(p);
  if (!l) return null;
  return (
    <span title={p.dcb_status === 'failed' && p.dcb_error ? p.dcb_error : undefined} className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${l.cls}`}>
      {l.text}
    </span>
  );
}

/** Church records: how much of the cash / check collected is already in the DCB. */
function DcbCard(props: { full: Full; perms: Full['permissions']; busy: boolean; onRun: RunFn }) {
  const d = props.full.dcb!;
  const f = props.full.fundraiser;
  const { canManage } = props.perms;
  const handTotal = d.posted.count + d.review.count + d.waiting.count + d.failed.count + d.beforeLink.count + d.notSent.count;
  if (!d.ready) {
    if (!canManage) return null;
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        <b>Cash and check are not going to the DCB yet.</b> Run <code>supabase/migrations/fundraisers_phase_4_dcb.sql</code> in Supabase to turn it on.
      </section>
    );
  }
  if (!handTotal && !d.pendingVoids) return null;
  const waitingCount = d.waiting.count + d.failed.count;
  const waitingCents = d.waiting.cents + d.failed.cents;
  return (
    <section className="rounded-2xl border border-black/[0.06] bg-white p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <BookCheck size={18} className="text-[#0d1a14]" />
        <h3 className="text-lg font-black text-[#16251f]">Church records (DCB)</h3>
      </div>
      <p className="text-sm text-gray-500 max-w-2xl">
        Every cash, check or other payment recorded here also goes to the Digital Contribution Book under <b>{(f.tithe_fund_name || f.title)}</b>, automatically.
        Online gifts from PLCC Tithe go there through Tithe. Pledges and fun charges still owed are not money yet, so they stay here until paid.
      </p>
      <ul className="flex flex-col gap-1.5 text-sm">
        <li className="flex justify-between gap-3">
          <span>In the DCB ({d.posted.count} payment{d.posted.count === 1 ? '' : 's'})</span>
          <b className="tabular-nums text-emerald-700">{formatCents(d.posted.cents)}</b>
        </li>
        {d.review.count > 0 && (
          <li className="flex justify-between gap-3">
            <span>In the DCB, Finance to confirm the giver ({d.review.count})</span>
            <b className="tabular-nums text-sky-700">{formatCents(d.review.cents)}</b>
          </li>
        )}
        {waitingCount > 0 && (
          <li className="flex justify-between gap-3">
            <span>On the way to the DCB — retried automatically ({waitingCount})</span>
            <b className="tabular-nums text-amber-800">{formatCents(waitingCents)}</b>
          </li>
        )}
        {d.notSent.count > 0 && (
          <li className="flex justify-between gap-3 text-gray-500">
            <span>Under $1.00, not sent ({d.notSent.count})</span>
            <b className="tabular-nums">{formatCents(d.notSent.cents)}</b>
          </li>
        )}
        {d.beforeLink.count > 0 && (
          <li className="flex justify-between gap-3 text-gray-600">
            <span>Entered before this link — not in the DCB ({d.beforeLink.count})</span>
            <b className="tabular-nums">{formatCents(d.beforeLink.cents)}</b>
          </li>
        )}
      </ul>
      {canManage && d.failed.lastError && <p className="text-xs text-amber-800">Last DCB message: {d.failed.lastError}</p>}
      {canManage && !d.configured && (
        <p className="text-xs text-amber-800">The DCB link is not set up on PLCC Canaan (AWC_DCB_API_URL + AWC_DCB_SERVICE_SECRET).</p>
      )}
      {d.pendingVoids > 0 && (
        <p className="text-xs text-amber-800">
          {d.pendingVoids} removed payment{d.pendingVoids === 1 ? ' is' : 's are'} still being taken back out of the DCB (retried automatically).
        </p>
      )}
      {canManage && d.beforeLink.count > 0 && (
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            disabled={props.busy}
            onClick={() => {
              if (!window.confirm(`Send ${d.beforeLink.count} earlier payment(s), ${formatCents(d.beforeLink.cents)}, to the DCB?\n\nOnly do this if Finance has NOT already typed them into the DCB by hand, or they will be counted twice.`)) return;
              void props.onRun(() => post('send-earlier-to-dcb', { fundraiserId: f.id }), 'Earlier payments sent to the DCB.');
            }}
            className={btnPrimary}
          >
            <BookCheck size={16} /> Send earlier payments to the DCB
          </button>
          <p className="text-xs text-gray-500">Only if Finance has not already entered them in the DCB by hand.</p>
        </div>
      )}
    </section>
  );
}

function ClosedNote() {
  return (
    <div className="rounded-2xl border border-black/[0.06] bg-white p-6 text-sm text-gray-600">
      This fundraiser is closed, so it is a read-only record. Tap Reopen fundraiser at the top to add entries or payments.
    </div>
  );
}

// ---------------------------------------------------------------------------
// Calculator card
// ---------------------------------------------------------------------------
function CalculatorCard(props: {
  fundraiser: Fundraiser;
  summary: FundraiserSummary;
  perms: Full['permissions'];
  busy: boolean;
  onRun: RunFn;
  onDeleted: () => Promise<void>;
  onError: (m: string) => void;
}) {
  const { fundraiser: f, summary: s, perms, busy, onRun } = props;
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(f.title);
  const [goal, setGoal] = useState(f.goal_amount_cents ? (f.goal_amount_cents / 100).toFixed(2) : '');
  const [start, setStart] = useState(f.start_date);
  const [notes, setNotes] = useState(f.notes || '');
  useEffect(() => {
    setTitle(f.title);
    setGoal(f.goal_amount_cents ? (f.goal_amount_cents / 100).toFixed(2) : '');
    setStart(f.start_date);
    setNotes(f.notes || '');
    setEditing(false);
  }, [f.id, f.title, f.goal_amount_cents, f.start_date, f.notes]);

  const pct = s.percentRaised ?? 0;
  const owedPct = s.goalCents ? Math.min(100 - pct, Math.floor((s.stillOwedCents / s.goalCents) * 100)) : 0;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const goalCents = goal.trim() ? dollarsToCents(goal) : null;
    if (goalCents != null && !Number.isFinite(goalCents)) return props.onError('Enter a valid goal amount.');
    const ok = await onRun(
      () => post('update', { fundraiserId: f.id, title, goalAmountCents: goalCents, startDate: start, notes }),
      'Details saved.'
    );
    if (ok) setEditing(false);
  };

  const remove = async () => {
    const typed = window.prompt(
      `Permanently delete "${f.title}" and all of its gifts, pledges, charges and payments?\n\nType the fundraiser name to confirm:`
    );
    if (typed === null) return;
    try {
      await post('delete', { fundraiserId: f.id, confirmTitle: typed.trim() });
      await props.onDeleted();
    } catch (err: any) {
      props.onError(err?.message || 'Could not delete the fundraiser.');
    }
  };

  return (
    <section className="rounded-[24px] bg-[#16251f] text-white p-5 sm:p-7 flex flex-col gap-5">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-2xl sm:text-3xl font-black leading-tight">{f.title}</h2>
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${f.status === 'open' ? 'bg-emerald-400/15 text-emerald-200' : 'bg-white/10 text-[#D9C9B9]'}`}>
              {f.status === 'open' ? 'Open' : 'Closed'}
            </span>
          </div>
          <p className="text-sm text-[#C9B8A8] mt-1">
            Started {f.start_date}
            {f.tithe_fund_name ? ` · Online gifts from PLCC Tithe: ${f.tithe_fund_name}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 self-start">
          <>
          <button type="button" onClick={() => setEditing((v) => !v)} className="h-10 px-4 rounded-xl border border-white/20 text-sm font-semibold text-[#E2D5C7] hover:bg-white/10">
            <Pencil size={14} className="inline mr-1" />
            {editing ? 'Cancel' : 'Edit details'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void onRun(
                () => post('update', { fundraiserId: f.id, status: f.status === 'open' ? 'closed' : 'open' }),
                f.status === 'open' ? 'Fundraiser closed. It stays here as a record.' : 'Fundraiser reopened.'
              )
            }
            className="h-10 px-4 rounded-xl border border-white/20 text-sm font-semibold text-[#E2D5C7] hover:bg-white/10 disabled:opacity-50"
          >
            {f.status === 'open' ? 'Close fundraiser' : 'Reopen fundraiser'}
          </button>
          </>
          {perms.canDelete && (
            <button type="button" disabled={busy} onClick={() => void remove()} className="h-10 px-4 rounded-xl border border-rose-300/40 text-sm font-semibold text-rose-200 hover:bg-rose-500/15 disabled:opacity-50">
              <Trash2 size={14} className="inline mr-1" />
              Delete
            </button>
          )}
        </div>
      </div>

      {editing && (
        <form onSubmit={save} className="rounded-2xl bg-white/5 border border-white/15 p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-[#E2D5C7] sm:col-span-2">
            Name
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={fieldCls} />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-[#E2D5C7]">
            Goal (optional)
            <MoneyInput value={goal} onChange={setGoal} placeholder="No goal" />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-[#E2D5C7]">
            Start date
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={fieldCls} />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-[#E2D5C7] sm:col-span-2">
            Notes (optional)
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className={fieldCls} />
          </label>
          <div className="sm:col-span-2 flex justify-end">
            <button type="submit" disabled={busy} className="h-11 px-5 rounded-xl bg-[#C9A35A] text-[#16251f] text-sm font-bold disabled:opacity-50">
              Save details
            </button>
          </div>
        </form>
      )}

      {/* Progress */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-4xl sm:text-5xl font-black tabular-nums">{formatCents(s.totalRaisedCents)}</span>
          <span className="text-sm text-[#D9C9B9]">
            {s.goalCents != null ? (
              <>
                <b className="text-[#E9C979]">{pct}%</b> of {formatCents(s.goalCents)} goal
              </>
            ) : (
              'raised so far'
            )}
          </span>
        </div>
        {s.goalCents != null && (
          <div className="h-3 rounded-full bg-white/10 overflow-hidden flex" aria-hidden="true">
            <div className="h-full bg-[#C9A35A]" style={{ width: `${pct}%` }} />
            <div className="h-full bg-[#C9A35A]/35" style={{ width: `${owedPct}%` }} />
          </div>
        )}
        {s.goalCents != null && (
          <p className="text-[12px] text-[#BFAE9E]">Gold = raised · light gold = still owed by pledges and fun charges</p>
        )}
      </div>

      {/* The calculator */}
      <div className="flex items-center gap-2 text-[#E9C979] text-sm font-bold uppercase tracking-[0.1em]">
        <Calculator size={16} /> Calculator
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Given now" value={formatCents(s.givenNowCents)} sub={`Gifts · games ${formatCents(s.gameCents)} · online ${formatCents(s.onlineCents)}`} />
        <Stat label="Pledged" value={formatCents(s.pledgedCents)} sub={`${formatCents(s.pledgePaidCents)} paid · ${formatCents(s.pledgedCents - s.pledgePaidCents)} left`} />
        <Stat label="Fun charges" value={formatCents(s.chargedCents)} sub={`${formatCents(s.chargePaidCents)} paid · ${formatCents(s.chargedCents - s.chargePaidCents)} left`} />
        <Stat label="Total raised" value={formatCents(s.totalRaisedCents)} sub="Given now + paid on pledges and charges" tone="green" />
        <Stat label="Still owed" value={formatCents(s.stillOwedCents)} sub={`${s.peopleOwingCount} ${s.peopleOwingCount === 1 ? 'person' : 'people'} owe`} tone="red" />
        <Stat label="If everyone pays" value={formatCents(s.expectedTotalCents)} sub="Raised + still owed" tone="gold" />
        {s.goalCents != null && (
          <>
            <Stat label="Goal left" value={formatCents(s.goalLeftCents)} sub="Goal − total raised" />
            <Stat label="Goal left after all pay" value={formatCents(s.goalLeftAfterOwedCents)} sub="What new gifts still need to cover" />
          </>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Add entry (gift / pledge / fun charge / game)
// ---------------------------------------------------------------------------
function AddEntry(props: { full: Full; busy: boolean; onRun: RunFn; onError: (m: string) => void }) {
  const { full, busy, onRun } = props;
  const f = full.fundraiser;
  const activeItems = full.chargeItems.filter((i) => i.active);
  const [who, setWho] = useState<Who>('member');
  const [kind, setKind] = useState<Kind>(activeItems.length ? 'charge' : 'paid');
  const [member, setMember] = useState<{ id: string; name: string } | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Array<{ id: string; name: string }>>([]);
  const [searching, setSearching] = useState(false);
  const [name, setName] = useState('');
  const [date, setDate] = useState(today());
  const [amount, setAmount] = useState('');
  const [pledged, setPledged] = useState('');
  const [paidSoFar, setPaidSoFar] = useState('');
  const [itemId, setItemId] = useState<string | null>(activeItems[0]?.id || null);
  const [qty, setQty] = useState(1);
  const [unitPrice, setUnitPrice] = useState('');
  const [paidNow, setPaidNow] = useState(false);
  const [method, setMethod] = useState('cash');
  const [notes, setNotes] = useState('');

  const item = activeItems.find((i) => i.id === itemId) || null;
  useEffect(() => {
    setUnitPrice(item ? (item.amount_cents / 100).toFixed(2) : '');
  }, [item?.id, item?.amount_cents]);

  useEffect(() => {
    if (who !== 'member' || query.trim().length < 2 || member) {
      setResults([]);
      return;
    }
    const t = window.setTimeout(async () => {
      setSearching(true);
      try {
        const data = await apiFetch<{ members: Array<{ id: string; name: string }> }>(
          `${API}&action=member-search&q=${encodeURIComponent(query.trim())}`
        );
        setResults(data.members || []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => window.clearTimeout(t);
  }, [query, who, member]);

  const effectiveKind: Kind = who === 'game' ? 'paid' : kind;
  const unitCents = dollarsToCents(unitPrice);
  const chargeTotal = Number.isFinite(unitCents) ? unitCents * qty : NaN;

  const reset = () => {
    setMember(null);
    setQuery('');
    setName('');
    setAmount('');
    setPledged('');
    setPaidSoFar('');
    setQty(1);
    setPaidNow(false);
    setNotes('');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body: Record<string, unknown> = { fundraiserId: f.id, sourceType: who, kind: effectiveKind, entryDate: date, notes };
    if (who === 'member') {
      if (!member) return props.onError('Search for and pick the member.');
      body.memberId = member.id;
    } else {
      if (!name.trim()) return props.onError(who === 'game' ? 'Name the game or event.' : "Enter the visitor's name.");
      body.displayName = name.trim();
    }
    let done = '';
    if (effectiveKind === 'paid') {
      const c = dollarsToCents(amount);
      if (!Number.isFinite(c) || c <= 0) return props.onError('Enter the amount received.');
      body.amountCents = c;
      body.paymentMethod = method;
      done = `${formatCents(c)} recorded.`;
    } else if (effectiveKind === 'pledge') {
      const p = dollarsToCents(pledged);
      if (!Number.isFinite(p) || p <= 0) return props.onError('Enter the pledged amount.');
      const paid = paidSoFar.trim() ? dollarsToCents(paidSoFar) : 0;
      if (!Number.isFinite(paid) || paid < 0 || paid > p) return props.onError('Paid so far must be between $0 and the pledge.');
      body.pledgedAmountCents = p;
      body.paidNowCents = paid;
      body.paymentMethod = method;
      done = `Pledge of ${formatCents(p)} recorded.`;
    } else {
      if (!item) return props.onError('Pick a fun charge.');
      if (!Number.isFinite(unitCents) || unitCents <= 0) return props.onError('Enter the charge amount.');
      body.chargeItemId = item.id;
      body.quantity = qty;
      body.unitAmountCents = unitCents;
      body.paidNow = paidNow;
      body.paymentMethod = method;
      done = `${item.label}${qty > 1 ? ` × ${qty}` : ''} — ${formatCents(chargeTotal)} ${paidNow ? 'paid' : 'owed'}.`;
    }
    const ok = await onRun(() => post('add-entry', body), done);
    if (ok) reset();
  };

  return (
    <form onSubmit={submit} className="rounded-2xl border border-black/[0.06] bg-white p-5 flex flex-col gap-5">
      <Segmented<Who>
        label="Who"
        value={who}
        onPick={(v) => {
          setWho(v);
          setMember(null);
        }}
        options={[
          ['member', 'Member'],
          ['visitor', 'Visitor'],
          ['game', 'Game / event'],
        ]}
      />

      {who === 'member' ? (
        member ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-[#0d1a14]/20 bg-[#F7F2F3] px-4 py-3">
            <span className="font-bold text-[#0d1a14]">{member.name}</span>
            <button type="button" onClick={() => setMember(null)} className="text-sm font-semibold text-[#0d1a14] underline">
              Change
            </button>
          </div>
        ) : (
          <label className={labelCls}>
            Member
            <span className="relative block">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Type a name…" className={`${fieldCls} pl-10`} />
              {searching && <Loader2 size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />}
            </span>
            {results.length > 0 && (
              <ul className="rounded-xl border border-black/10 bg-white divide-y divide-black/5 max-h-60 overflow-y-auto">
                {results.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setMember(m);
                        setResults([]);
                      }}
                      className="w-full text-left px-4 py-3 text-sm font-semibold text-[#0d1a14] hover:bg-[#FAF6F0]"
                    >
                      {m.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </label>
        )
      ) : (
        <label className={labelCls}>
          {who === 'game' ? 'Game or event' : 'Visitor name'}
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={who === 'game' ? 'Bingo night' : 'Full name'} className={fieldCls} />
        </label>
      )}

      {who !== 'game' && (
        <Segmented<Kind>
          label="What"
          value={kind}
          onPick={setKind}
          options={[
            ['charge', 'Fun charge'],
            ['paid', 'Gift (paid now)'],
            ['pledge', 'Pledge'],
          ]}
        />
      )}

      {effectiveKind === 'charge' &&
        (activeItems.length === 0 ? (
          <p className="text-sm text-gray-600 rounded-xl bg-[#FAF6F0] px-4 py-3">
            No fun charges yet. A finance leader adds them under the <b>Fun charges</b> tab (for example, Coming in late $20).
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {activeItems.map((i) => (
                <button
                  key={i.id}
                  type="button"
                  onClick={() => setItemId(i.id)}
                  aria-pressed={itemId === i.id}
                  className={`rounded-xl border px-3 py-3 text-left min-h-[64px] ${
                    itemId === i.id ? 'border-[#0d1a14] bg-[#0d1a14] text-amber-50' : 'border-black/10 bg-white text-[#0d1a14] hover:border-[#0d1a14]/40'
                  }`}
                >
                  <span className="block text-sm font-bold leading-tight">{i.label}</span>
                  <span className={`block text-lg font-black tabular-nums ${itemId === i.id ? 'text-[#E9C979]' : ''}`}>{formatCents(i.amount_cents)}</span>
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <div className={labelCls}>
                How many times
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} className="h-12 w-12 rounded-xl border border-black/10 flex items-center justify-center" aria-label="One less">
                    <Minus size={16} />
                  </button>
                  <span className="w-10 text-center text-xl font-black tabular-nums">{qty}</span>
                  <button type="button" onClick={() => setQty((q) => Math.min(99, q + 1))} className="h-12 w-12 rounded-xl border border-black/10 flex items-center justify-center" aria-label="One more">
                    <Plus size={16} />
                  </button>
                </div>
              </div>
              <label className={labelCls}>
                Price each (can adjust)
                <MoneyInput value={unitPrice} onChange={setUnitPrice} />
              </label>
              <div className="rounded-xl bg-[#FAF6F0] px-4 h-12 flex items-center justify-between">
                <span className="text-sm font-semibold text-[#6b5a55]">Total</span>
                <span className="text-xl font-black tabular-nums text-[#0d1a14]">{Number.isFinite(chargeTotal) ? formatCents(chargeTotal) : '—'}</span>
              </div>
            </div>
            <Segmented<'owes' | 'paid'>
              label="Paid?"
              value={paidNow ? 'paid' : 'owes'}
              onPick={(v) => setPaidNow(v === 'paid')}
              options={[
                ['owes', 'Owes'],
                ['paid', 'Paid now'],
              ]}
            />
          </div>
        ))}

      {effectiveKind === 'paid' && (
        <label className={labelCls}>
          Amount received
          <MoneyInput value={amount} onChange={setAmount} />
        </label>
      )}
      {effectiveKind === 'pledge' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className={labelCls}>
            Pledged
            <MoneyInput value={pledged} onChange={setPledged} />
          </label>
          <label className={labelCls}>
            Paid so far (optional)
            <MoneyInput value={paidSoFar} onChange={setPaidSoFar} placeholder="0.00" />
          </label>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {(effectiveKind === 'paid' || (effectiveKind === 'pledge' && paidSoFar.trim()) || (effectiveKind === 'charge' && paidNow)) && (
          <label className={labelCls}>
            Paid via
            <MethodSelect value={method} onChange={setMethod} />
          </label>
        )}
        <label className={labelCls}>
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={fieldCls} />
        </label>
        <label className={labelCls}>
          Note (optional)
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Receipt #, MTN / Airtel / Sendwave name…" className={fieldCls} />
        </label>
      </div>

      <div className="flex justify-end">
        <button type="submit" disabled={busy || (effectiveKind === 'charge' && !activeItems.length)} className={btnPrimary}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Save
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Payment form (shared)
// ---------------------------------------------------------------------------
function PayForm(props: { full: Full; entry: Entry; busy: boolean; onRun: RunFn; onError: (m: string) => void; onDone: () => void }) {
  const left = entryLeftCents(props.entry);
  const [amount, setAmount] = useState((left / 100).toFixed(2));
  const [method, setMethod] = useState('cash');
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState('');
  const save = async () => {
    const c = dollarsToCents(amount);
    if (!Number.isFinite(c) || c <= 0) return props.onError('Enter the amount received.');
    if (c > left) return props.onError(`Only ${formatCents(left)} is left.`);
    const ok = await props.onRun(
      () => post('add-payment', { fundraiserId: props.full.fundraiser.id, entryId: props.entry.id, amountCents: c, paymentMethod: method, paymentDate: date, notes }),
      `${formatCents(c)} payment recorded for ${props.entry.display_name}.`
    );
    if (ok) props.onDone();
  };
  return (
    <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
      <label className={labelCls}>
        Amount ({formatCents(left)} left)
        <MoneyInput value={amount} onChange={setAmount} />
      </label>
      <label className={labelCls}>
        Paid via
        <MethodSelect value={method} onChange={setMethod} />
      </label>
      <label className={labelCls}>
        Date
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={fieldCls} />
      </label>
      <button type="button" disabled={props.busy} onClick={() => void save()} className={btnPrimary}>
        Save payment
      </button>
      <label className={`${labelCls} sm:col-span-4`}>
        Note (optional)
        <input value={notes} onChange={(e) => setNotes(e.target.value)} className={fieldCls} />
      </label>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Who owes
// ---------------------------------------------------------------------------
function payLinkFor(full: Full, p: PersonBalance): string | null {
  const f = full.fundraiser;
  if (!f.tithe_fund_id || f.status !== 'open') return null;
  return buildFundraiserPayLink({ fundraiserId: f.id, fundraiserTitle: f.title, titheFundId: f.tithe_fund_id, person: p });
}

/** Share (phone share sheet) or copy a person's "Pay my balance" link. */
async function sharePayLink(name: string, title: string, amountCents: number, url: string): Promise<'shared' | 'copied' | 'cancelled'> {
  const first = String(name || '').trim().split(' ')[0] || 'there';
  const text = `Hi ${first}, here is your link to pay your ${formatCents(amountCents)} balance for ${title} (card, bank, MTN, Airtel or Sendwave):`;
  const nav: any = typeof navigator !== 'undefined' ? navigator : null;
  try {
    if (nav && typeof nav.share === 'function') {
      await nav.share({ title, text, url });
      return 'shared';
    }
  } catch (err: any) {
    if (err?.name === 'AbortError') return 'cancelled';
  }
  await navigator.clipboard.writeText(`${text} ${url}`);
  return 'copied';
}

function ToMatch(props: { full: Full; busy: boolean; onRun: RunFn; onError: (m: string) => void }) {
  const { full } = props;
  const gifts = full.entries.filter((e) => e.source_type === 'online' && !e.match_dismissed);
  const [choice, setChoice] = useState<Record<string, string>>({});
  if (!gifts.length || !full.balances.length) return null;
  return (
    <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5 flex flex-col gap-3">
      <div>
        <h3 className="text-lg font-black text-[#16251f] flex items-center gap-2">
          <Globe size={18} /> Online gifts to match ({gifts.length})
        </h3>
        <p className="text-sm text-amber-900">
          These came through PLCC Tithe without a "Pay my balance" link. If one is someone paying what they owe, pick them and
          tap Apply. If it's just a gift, tap Keep as gift.
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {gifts.map((g) => {
          const picked = choice[g.id] || '';
          const person = full.balances.find((b) => b.key === picked);
          return (
            <li key={g.id} className="rounded-xl bg-white border border-amber-200 p-3 flex flex-col gap-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-bold text-[#16251f]">{g.display_name}</span>
                <span className="font-black tabular-nums text-[#16251f]">{formatCents(g.received_amount_cents)}</span>
              </div>
              <p className="text-[12px] text-gray-500">
                {g.entry_date} · {paymentMethodLabel(g.payment_method)} · {g.notes || 'PLCC Tithe'}
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  value={picked}
                  onChange={(e) => setChoice((c) => ({ ...c, [g.id]: e.target.value }))}
                  className={`${fieldCls} sm:flex-1`}
                  aria-label={`Whose balance does ${g.display_name}'s gift pay?`}
                >
                  <option value="">Whose balance does this pay?</option>
                  {full.balances.map((b) => (
                    <option key={b.key} value={b.key}>
                      {b.name} — owes {formatCents(b.leftCents)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={props.busy || !person}
                  onClick={() =>
                    person &&
                    void props.onRun(
                      () =>
                        post('match-online', {
                          fundraiserId: full.fundraiser.id,
                          entryId: g.id,
                          targetEntryIds: person.lines.filter((l) => l.leftCents > 0).map((l) => l.entryId),
                        }),
                      `${formatCents(g.received_amount_cents)} applied to ${person.name}'s balance.`
                    )
                  }
                  className={btnPrimary}
                >
                  <Check size={16} /> Apply
                </button>
                <button
                  type="button"
                  disabled={props.busy}
                  onClick={() => void props.onRun(() => post('keep-as-gift', { fundraiserId: full.fundraiser.id, entryId: g.id }), 'Kept as a gift.')}
                  className={btnGhost}
                >
                  Keep as gift
                </button>
              </div>
              {person && g.received_amount_cents > person.leftCents && (
                <p className="text-[12px] text-amber-900">
                  {formatCents(person.leftCents)} pays off {person.name}; the other {formatCents(g.received_amount_cents - person.leftCents)} stays as a gift.
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function WhoOwes(props: { full: Full; busy: boolean; onRun: RunFn; onError: (m: string) => void }) {
  const { full } = props;
  const [paying, setPaying] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const [filter, setFilter] = useState('');
  const [shared, setShared] = useState<string | null>(null);
  const byId = useMemo(() => new Map(full.entries.map((e) => [e.id, e])), [full.entries]);
  const people = full.balances.filter((p) => !filter.trim() || p.name.toLowerCase().includes(filter.trim().toLowerCase()));
  const linked = Boolean(full.fundraiser.tithe_fund_id);

  const print = async (list: PersonBalance[]) => {
    setPrinting(true);
    try {
      await downloadReminderLetters(full.fundraiser, list, { payLinkFor: (p) => payLinkFor(full, p) });
    } catch (err: any) {
      props.onError(err?.message || 'Could not make the letters.');
    } finally {
      setPrinting(false);
    }
  };

  const share = async (p: PersonBalance) => {
    const url = payLinkFor(full, p);
    if (!url) return;
    try {
      const how = await sharePayLink(p.name, full.fundraiser.title, p.leftCents, url);
      if (how !== 'cancelled') {
        setShared(p.key);
        window.setTimeout(() => setShared((k) => (k === p.key ? null : k)), 2500);
      }
    } catch {
      props.onError('Could not copy the pay link. Please try again.');
    }
  };

  if (!full.balances.length) {
    return (
      <div className="rounded-2xl border border-black/[0.06] bg-white p-8 text-center text-sm text-gray-600">
        Nobody owes anything right now. Every pledge and fun charge is paid.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <ToMatch full={full} busy={props.busy} onRun={props.onRun} onError={props.onError} />
      <section className="rounded-2xl border border-black/[0.06] bg-white overflow-hidden">
        <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-xl font-black text-[#16251f]">Who still owes</h3>
            <p className="text-sm text-gray-500">
              {full.balances.length} {full.balances.length === 1 ? 'person owes' : 'people owe'} {formatCents(full.summary.stillOwedCents)} in pledges and fun charges.
            </p>
            {!linked && (
              <p className="text-[12px] text-gray-500 mt-1">
                Pay links appear once a leader links an PLCC Tithe fund to this fundraiser.
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find a name" className={`${fieldCls} h-11 w-44`} />
            <button type="button" disabled={printing} onClick={() => void print(full.balances)} className={btnGhost}>
              {printing ? <Loader2 size={15} className="animate-spin" /> : <Printer size={15} />} Print all reminder letters
            </button>
          </div>
        </div>
        <ul className="divide-y divide-black/[0.05] border-t border-black/[0.05]">
          {people.map((p) => (
            <li key={p.key} className="p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-[#16251f] truncate">{p.name}</p>
                  <p className="text-[13px] text-gray-500">
                    Owed {formatCents(p.owedCents)} · paid {formatCents(p.paidCents)}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-rose-700">Still owes</p>
                  <p className="text-xl font-black tabular-nums text-rose-700">{formatCents(p.leftCents)}</p>
                </div>
              </div>
              <ul className="flex flex-col gap-2">
                {p.lines
                  .filter((l) => l.leftCents > 0)
                  .map((l) => {
                    const entry = byId.get(l.entryId);
                    const last = entry?.payments?.[0];
                    return (
                      <li key={l.entryId} className="flex flex-col gap-2">
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#FAF6F0] px-3 py-2">
                          <span className="text-sm font-semibold text-[#0d1a14]">
                            {l.label} <span className="font-normal text-gray-500">· {formatCents(l.owedCents)}, paid {formatCents(l.paidCents)}</span>
                            {last && (
                              <span className="block text-[12px] font-normal text-gray-500">
                                Last: {formatCents(last.amount_cents)} {paymentMethodLabel(last.payment_method)} on {last.payment_date}
                                {last.recorded_by_name ? ` · recorded by ${last.recorded_by_name}` : ''}
                              </span>
                            )}
                          </span>
                          <span className="flex items-center gap-2">
                            <b className="tabular-nums text-[#0d1a14]">{formatCents(l.leftCents)} left</b>
                            {full.fundraiser.status === 'open' && entry && (
                              <button
                                type="button"
                                onClick={() => setPaying(paying === l.entryId ? null : l.entryId)}
                                className="h-9 px-3 rounded-lg bg-[#0d1a14] text-amber-50 text-xs font-bold"
                              >
                                {paying === l.entryId ? 'Cancel' : 'Record payment'}
                              </button>
                            )}
                          </span>
                        </div>
                        {paying === l.entryId && entry && (
                          <PayForm full={full} entry={entry} busy={props.busy} onRun={props.onRun} onError={props.onError} onDone={() => setPaying(null)} />
                        )}
                      </li>
                    );
                  })}
              </ul>
              <div className="flex flex-wrap items-center gap-3">
                {payLinkFor(full, p) && (
                  <button type="button" onClick={() => void share(p)} className={btnGhost}>
                    {shared === p.key ? <Check size={15} className="text-emerald-600" /> : <Link2 size={15} />}
                    {shared === p.key ? 'Ready to send' : 'Send pay link'}
                  </button>
                )}
                <button type="button" disabled={printing} onClick={() => void print([p])} className="text-sm font-semibold text-[#0d1a14] underline disabled:opacity-50">
                  Print reminder letter
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fun charges: totals + price list
// ---------------------------------------------------------------------------
function ChargesTab(props: { full: Full; perms: Full['permissions']; busy: boolean; onRun: RunFn; onError: (m: string) => void }) {
  const { full, perms } = props;
  const f = full.fundraiser;
  const [label, setLabel] = useState('');
  const [price, setPrice] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editPrice, setEditPrice] = useState('');

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const c = dollarsToCents(price);
    if (!label.trim()) return props.onError('Name the charge, such as Coming in late.');
    if (!Number.isFinite(c) || c <= 0) return props.onError('Enter the charge amount.');
    const ok = await props.onRun(() => post('add-charge-item', { fundraiserId: f.id, label: label.trim(), amountCents: c }), `${label.trim()} added.`);
    if (ok) {
      setLabel('');
      setPrice('');
    }
  };

  const saveEdit = async (item: ChargeItem) => {
    const c = dollarsToCents(editPrice);
    if (!editLabel.trim() || !Number.isFinite(c) || c <= 0) return props.onError('Enter a name and amount.');
    const ok = await props.onRun(() => post('update-charge-item', { fundraiserId: f.id, itemId: item.id, label: editLabel.trim(), amountCents: c }), 'Charge updated.');
    if (ok) setEditId(null);
  };

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-2xl border border-black/[0.06] bg-white overflow-hidden">
        <h3 className="px-5 pt-5 text-xl font-black text-[#16251f]">Fun charge totals</h3>
        {full.charges.length === 0 ? (
          <p className="px-5 pb-6 pt-2 text-sm text-gray-500">No fun charges recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm mt-3">
              <thead className="bg-[#FAF6F0] text-[#6b5a55] text-[12px] uppercase tracking-wide">
                <tr>
                  <th className="text-left px-5 py-2">Charge</th>
                  <th className="text-center px-3 py-2">Times</th>
                  <th className="text-right px-3 py-2">Charged</th>
                  <th className="text-right px-3 py-2">Paid</th>
                  <th className="text-right px-5 py-2">Still owed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.05]">
                {full.charges.map((c) => (
                  <tr key={c.key}>
                    <td className="px-5 py-3 font-semibold text-[#0d1a14]">{c.label}</td>
                    <td className="px-3 py-3 text-center tabular-nums">{c.quantity}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatCents(c.chargedCents)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-emerald-700">{formatCents(c.paidCents)}</td>
                    <td className="px-5 py-3 text-right tabular-nums font-bold text-rose-700">{formatCents(c.leftCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-black/[0.06] bg-white p-5 flex flex-col gap-4">
        <div>
          <h3 className="text-xl font-black text-[#16251f]">Price list</h3>
          <p className="text-sm text-gray-500">
            Add, rename, re-price or turn off charges. Past charges keep the price they were given.
          </p>
        </div>
        <ul className="divide-y divide-black/[0.05] rounded-xl border border-black/[0.06]">
          {full.chargeItems.length === 0 && <li className="px-4 py-3 text-sm text-gray-500">No charges yet.</li>}
          {full.chargeItems.map((i) => (
            <li key={i.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-2">
              {editId === i.id ? (
                <div className="flex flex-wrap items-end gap-2 w-full">
                  <input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} className={`${fieldCls} flex-1 min-w-[160px]`} />
                  <span className="w-32">
                    <MoneyInput value={editPrice} onChange={setEditPrice} />
                  </span>
                  <button type="button" disabled={props.busy} onClick={() => void saveEdit(i)} className={btnPrimary}>
                    Save
                  </button>
                  <button type="button" onClick={() => setEditId(null)} className={btnGhost}>
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <span className={`text-sm font-semibold ${i.active ? 'text-[#0d1a14]' : 'text-gray-400 line-through'}`}>
                    {i.label} · {formatCents(i.amount_cents)}
                  </span>
                  {(
                    <span className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditId(i.id);
                          setEditLabel(i.label);
                          setEditPrice((i.amount_cents / 100).toFixed(2));
                        }}
                        className="text-sm font-semibold text-[#0d1a14] underline"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={props.busy}
                        onClick={() => void props.onRun(() => post('update-charge-item', { fundraiserId: f.id, itemId: i.id, active: !i.active }), i.active ? `${i.label} turned off.` : `${i.label} turned on.`)}
                        className="text-sm font-semibold text-[#0d1a14] underline disabled:opacity-50"
                      >
                        {i.active ? 'Turn off' : 'Turn on'}
                      </button>
                    </span>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
        {(
          <form onSubmit={add} className="grid grid-cols-1 sm:grid-cols-[1fr_160px_auto] gap-2 items-end">
            <label className={labelCls}>
              New charge
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Coming in late" className={fieldCls} />
            </label>
            <label className={labelCls}>
              Amount
              <MoneyInput value={price} onChange={setPrice} placeholder="20.00" />
            </label>
            <button type="submit" disabled={props.busy} className={btnPrimary}>
              <Plus size={16} /> Add
            </button>
          </form>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// All entries
// ---------------------------------------------------------------------------
type EntryFilter = 'all' | 'gifts' | 'pledges' | 'charges' | 'games' | 'online';

function EntriesTab(props: { full: Full; perms: Full['permissions']; busy: boolean; onRun: RunFn; onError: (m: string) => void }) {
  const { full, perms } = props;
  const f = full.fundraiser;
  const isOpen = f.status === 'open';
  const [filter, setFilter] = useState<EntryFilter>('all');
  const [editing, setEditing] = useState<string | null>(null);
  const [paying, setPaying] = useState<string | null>(null);
  const [eDate, setEDate] = useState('');
  const [eName, setEName] = useState('');
  const [eAmount, setEAmount] = useState('');
  const [eQty, setEQty] = useState(1);
  const [eMethod, setEMethod] = useState('cash');
  const [eNotes, setENotes] = useState('');
  const [printing, setPrinting] = useState(false);

  const visible = full.entries.filter((e) => {
    if (filter === 'all') return true;
    if (filter === 'online') return e.source_type === 'online';
    if (filter === 'games') return e.source_type === 'game';
    if (filter === 'gifts') return e.kind === 'paid' && e.source_type !== 'game' && e.source_type !== 'online';
    if (filter === 'pledges') return e.kind === 'pledge';
    return e.kind === 'charge';
  });

  const startEdit = (e: Entry) => {
    setPaying(null);
    if (editing === e.id) return setEditing(null);
    setEditing(e.id);
    setEDate(e.entry_date);
    setEName(e.display_name);
    setEQty(e.quantity || 1);
    setEAmount(
      e.kind === 'paid'
        ? (e.received_amount_cents / 100).toFixed(2)
        : e.kind === 'pledge'
          ? (e.owed_amount_cents / 100).toFixed(2)
          : (e.owed_amount_cents / Math.max(1, e.quantity) / 100).toFixed(2)
    );
    setEMethod(e.payment_method || 'cash');
    setENotes(e.notes || '');
  };

  const saveEdit = async (e: Entry) => {
    const body: Record<string, unknown> = { fundraiserId: f.id, entryId: e.id, entryDate: eDate, notes: eNotes };
    if (e.source_type !== 'member') body.displayName = eName;
    const c = dollarsToCents(eAmount);
    if (!Number.isFinite(c) || c <= 0) return props.onError('Enter a valid amount.');
    if (e.kind === 'paid') {
      body.amountCents = c;
      body.paymentMethod = eMethod;
    } else if (e.kind === 'pledge') {
      body.pledgedAmountCents = c;
    } else {
      body.unitAmountCents = c;
      body.quantity = eQty;
    }
    const ok = await props.onRun(() => post('update-entry', body), 'Entry corrected.');
    if (ok) setEditing(null);
  };

  const removeEntry = async (e: Entry) => {
    if (!window.confirm(`Delete ${e.display_name}'s ${entryTypeLabel(e).toLowerCase()}${e.payments.length ? ' and its payments' : ''}? This can't be undone.`)) return;
    await props.onRun(() => post('delete-entry', { fundraiserId: f.id, entryId: e.id }), 'Entry deleted.');
  };

  const removePayment = async (e: Entry, p: Payment) => {
    if (!window.confirm(`Remove the ${formatCents(p.amount_cents)} payment from ${e.display_name}?`)) return;
    await props.onRun(() => post('delete-payment', { fundraiserId: f.id, entryId: e.id, paymentId: p.id }), 'Payment removed.');
  };

  const report = async () => {
    setPrinting(true);
    try {
      await downloadFundraiserReport(f, full.summary, full.balances, full.entries);
    } catch (err: any) {
      props.onError(err?.message || 'Could not make the report.');
    } finally {
      setPrinting(false);
    }
  };

  const filters: ReadonlyArray<readonly [EntryFilter, string]> = [
    ['all', 'All'],
    ['charges', 'Fun charges'],
    ['gifts', 'Gifts'],
    ['pledges', 'Pledges'],
    ['games', 'Games'],
    ['online', 'Online'],
  ];

  return (
    <section className="rounded-2xl border border-black/[0.06] bg-white overflow-hidden">
      <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex gap-1 p-1 rounded-xl bg-[#F3ECE3] overflow-x-auto">
          {filters.map(([v, l]) => (
            <button
              key={v}
              type="button"
              onClick={() => setFilter(v)}
              className={`shrink-0 min-h-[38px] px-3 rounded-[9px] text-sm font-bold ${filter === v ? 'bg-white text-[#0d1a14] shadow-sm' : 'text-[#6b5a55]'}`}
            >
              {l}
            </button>
          ))}
        </div>
        <button type="button" disabled={printing} onClick={() => void report()} className={btnGhost}>
          {printing ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />} Full report (PDF)
        </button>
      </div>
      {visible.length === 0 ? (
        <p className="px-5 pb-8 text-sm text-gray-500">Nothing here yet.</p>
      ) : (
        <ul className="divide-y divide-black/[0.05] border-t border-black/[0.05]">
          {visible.map((e) => {
            const left = entryLeftCents(e);
            const online = e.source_type === 'online';
            return (
              <li key={e.id} className="p-5 flex flex-col gap-3">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-[#16251f]">{e.display_name}</span>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#F3ECE3] text-[#6b5a55] inline-flex items-center gap-1">
                        {online ? <Globe size={11} /> : e.source_type === 'game' ? <Gamepad2 size={11} /> : null}
                        {entryTypeLabel(e)}
                      </span>
                      {!online && e.kind === 'paid' && e.payments[0] && <DcbChip p={e.payments[0]} />}
                    </div>
                    <p className="text-[13px] text-gray-500 mt-0.5">
                      {e.entry_date}
                      {e.payment_method ? ` · ${paymentMethodLabel(e.payment_method)}` : ''}
                      {e.kind !== 'paid' ? ` · ${e.kind === 'pledge' ? 'pledged' : 'charged'} ${formatCents(e.owed_amount_cents)}` : ''}
                      {e.notes ? ` · ${e.notes}` : ''}
                      {e.recorded_by_name ? ` · recorded by ${e.recorded_by_name}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 sm:justify-end">
                    {e.kind !== 'paid' && (
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${left > 0 ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
                        {left > 0 ? `${formatCents(left)} left` : 'Paid in full'}
                      </span>
                    )}
                    <span className="font-black tabular-nums w-28 text-right text-[#16251f]">{formatCents(e.received_amount_cents)}</span>
                  </div>
                </div>

                {!online && isOpen && (
                  <div className="flex flex-wrap gap-2">
                    {e.kind !== 'paid' && left > 0 && (
                      <button type="button" onClick={() => { setEditing(null); setPaying(paying === e.id ? null : e.id); }} className="h-10 px-4 rounded-xl bg-[#0d1a14] text-amber-50 text-sm font-bold">
                        {paying === e.id ? 'Cancel' : 'Record payment'}
                      </button>
                    )}
                    <button type="button" onClick={() => startEdit(e)} className={btnGhost}>
                      <Pencil size={14} /> {editing === e.id ? 'Cancel edit' : 'Edit'}
                    </button>
                    {perms.canDelete && (
                      <button type="button" disabled={props.busy} onClick={() => void removeEntry(e)} className="h-11 px-4 rounded-xl border border-rose-200 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">
                        <Trash2 size={14} className="inline mr-1" />
                        Delete
                      </button>
                    )}
                  </div>
                )}
                {online && <p className="text-[12px] text-gray-500">From PLCC Tithe — fix or refund it in Tithe and it updates here.</p>}

                {paying === e.id && <PayForm full={full} entry={e} busy={props.busy} onRun={props.onRun} onError={props.onError} onDone={() => setPaying(null)} />}

                {editing === e.id && (
                  <div className="rounded-xl bg-[#FAF6F0] border border-black/[0.06] p-4 flex flex-col gap-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
                      {e.source_type !== 'member' ? (
                        <label className={labelCls}>
                          {e.source_type === 'game' ? 'Game / event' : 'Visitor name'}
                          <input value={eName} onChange={(ev) => setEName(ev.target.value)} className={fieldCls} />
                        </label>
                      ) : (
                        <div className={labelCls}>
                          Member
                          <span className="h-12 flex items-center text-base font-normal text-gray-500">{e.display_name}</span>
                        </div>
                      )}
                      <label className={labelCls}>
                        Date
                        <input type="date" value={eDate} onChange={(ev) => setEDate(ev.target.value)} className={fieldCls} />
                      </label>
                      <label className={labelCls}>
                        {e.kind === 'paid' ? 'Amount received' : e.kind === 'pledge' ? `Pledged (${formatCents(e.received_amount_cents)} paid)` : 'Price each'}
                        <MoneyInput value={eAmount} onChange={setEAmount} />
                      </label>
                      {e.kind === 'paid' && (
                        <label className={labelCls}>
                          Paid via
                          <MethodSelect value={eMethod} onChange={setEMethod} />
                        </label>
                      )}
                      {e.kind === 'charge' && (
                        <label className={labelCls}>
                          Times
                          <input type="number" min={1} max={99} value={eQty} onChange={(ev) => setEQty(Math.max(1, Math.min(99, Number(ev.target.value) || 1)))} className={fieldCls} />
                        </label>
                      )}
                      <label className={`${labelCls} sm:col-span-2 lg:col-span-4`}>
                        Note
                        <input value={eNotes} onChange={(ev) => setENotes(ev.target.value)} className={fieldCls} />
                      </label>
                    </div>
                    {e.kind !== 'paid' && e.payments.length > 0 && (
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[13px] font-semibold text-[#0d1a14]">Payments</span>
                        <ul className="divide-y divide-black/[0.05] rounded-xl border border-black/[0.06] bg-white">
                          {e.payments.map((p) => (
                            <li key={p.id} className="px-3 py-2 flex items-center justify-between gap-3 text-sm">
                              <span>
                                {p.payment_date} · {paymentMethodLabel(p.payment_method)}
                                {p.recorded_by_name ? ` · recorded by ${p.recorded_by_name}` : ''}
                                {p.notes ? <span className="text-gray-500"> · {p.notes}</span> : null}{' '}
                                <DcbChip p={p} />
                              </span>
                              <span className="flex items-center gap-3">
                                <b className="tabular-nums">{formatCents(p.amount_cents)}</b>
                                {perms.canDelete && !p.external_ref && (
                                  <button type="button" disabled={props.busy} onClick={() => void removePayment(e, p)} className="text-xs font-semibold text-rose-700 underline disabled:opacity-50">
                                    Remove
                                  </button>
                                )}
                              </span>
                            </li>
                          ))}
                        </ul>
                        {!perms.canDelete && <p className="text-xs text-gray-500">The Super Admin, Pastor or First Lady can remove a payment entered by mistake.</p>}
                      </div>
                    )}
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => setEditing(null)} className={btnGhost}>
                        Cancel
                      </button>
                      <button type="button" disabled={props.busy} onClick={() => void saveEdit(e)} className={btnPrimary}>
                        Save correction
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Settings: PLCC Tithe link
// ---------------------------------------------------------------------------
function SettingsTab(props: { full: Full; perms: Full['permissions']; busy: boolean; onRun: RunFn; onError: (m: string) => void }) {
  const { full, perms } = props;
  const f = full.fundraiser;
  const [funds, setFunds] = useState<Array<{ id: string; name: string; active: boolean }>>([]);
  const [loadingFunds, setLoadingFunds] = useState(false);
  const [fundWarning, setFundWarning] = useState<string | null>(null);
  const [choice, setChoice] = useState(f.tithe_fund_id || '');

  useEffect(() => {
    setChoice(f.tithe_fund_id || '');
  }, [f.tithe_fund_id]);

  useEffect(() => {
    if (!perms.canManage) return;
    let cancelled = false;
    (async () => {
      setLoadingFunds(true);
      try {
        const data = await apiFetch<{ funds: Array<{ id: string; name: string; active: boolean }>; warning?: string }>(`${API}&action=tithe-funds`);
        if (cancelled) return;
        setFunds(data.funds || []);
        setFundWarning(data.warning || null);
      } catch (err: any) {
        if (!cancelled) setFundWarning(err?.message || 'Could not load PLCC Tithe funds.');
      } finally {
        if (!cancelled) setLoadingFunds(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [perms.canManage]);

  const save = async () => {
    const fund = funds.find((x) => x.id === choice);
    await props.onRun(
      () => post('update', { fundraiserId: f.id, titheFundId: choice || null, titheFundName: fund?.name || null }),
      choice ? `Linked to ${fund?.name || 'the PLCC Tithe fund'}. Online gifts will appear automatically.` : 'PLCC Tithe fund unlinked.'
    );
  };

  return (
    <section className="rounded-2xl border border-black/[0.06] bg-white p-5 flex flex-col gap-4">
      <div>
        <h3 className="text-xl font-black text-[#16251f]">Online gifts from PLCC Tithe</h3>
        <p className="text-sm text-gray-500 max-w-2xl">
          Pick the PLCC Tithe fund for this fundraiser (for example, 2nd Floor Building Fund). Gifts to that fund appear here as
          <b> Online · PLCC Tithe</b> once they are confirmed — card and bank by Flutterwave, MTN, Airtel and Sendwave after Finance verifies them in
          Tithe. They are read-only here and also go to the DCB as usual. Cash and check recorded here go to the DCB from PLCC Canaan.
        </p>
      </div>
      {f.tithe_fund_name && (
        <p className="text-sm rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-emerald-900">
          Linked to <b>{f.tithe_fund_name}</b>
          {f.tithe_synced_at ? ` · last checked ${new Date(f.tithe_synced_at).toLocaleString()}` : ''}
        </p>
      )}
      {perms.canManage ? (
        <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
          <label className={`${labelCls} flex-1`}>
            PLCC Tithe fund
            <select value={choice} onChange={(e) => setChoice(e.target.value)} className={fieldCls} disabled={loadingFunds}>
              <option value="">Not linked</option>
              {funds.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                  {x.active ? '' : ' (inactive)'}
                </option>
              ))}
            </select>
          </label>
          <button type="button" disabled={props.busy || loadingFunds || choice === (f.tithe_fund_id || '')} onClick={() => void save()} className={btnPrimary}>
            Save link
          </button>
          {f.tithe_fund_id && (
            <button type="button" disabled={props.busy} onClick={() => void props.onRun(() => post('sync-tithe', { fundraiserId: f.id }), 'Checked PLCC Tithe for new gifts.')} className={btnGhost}>
              <RefreshCw size={15} /> Check now
            </button>
          )}
        </div>
      ) : (
        <p className="text-sm text-gray-500">Only a finance leader can change the PLCC Tithe link.</p>
      )}
      {fundWarning && <p className="text-sm text-amber-800">{fundWarning}</p>}
      {perms.canManage && !loadingFunds && !fundWarning && funds.length === 0 && (
        <p className="text-sm text-gray-500">No funds found in PLCC Tithe. Add a fund there first, then come back.</p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Who has Fundraiser access (switch on top of a person's role)
// ---------------------------------------------------------------------------
type AccessPerson = { id: string; name: string; email?: string; role?: string; grantedAt?: string | null };
type SearchPerson = AccessPerson & { hasSwitch: boolean; byRole: boolean; canGrant: boolean };

function roleLabel(role?: string): string {
  const r = String(role || '').toUpperCase();
  const map: Record<string, string> = {
    MEMBER: 'Member', ACCOUNTANT: 'Accountant', VOLUNTEER: 'Volunteer', STAFF: 'Staff', ADMIN_STAFF: 'Admin Staff',
    MINISTRY_LEADER: 'Ministry Leader', WORSHIP_TEAM: 'Worship Team', MEDIA_TEAM: 'Media Team', PARENT: 'Parent',
    TEACHER: 'Teacher', SUNDAY_SCHOOL_TEACHER: 'Sunday School Teacher', YOUTH: 'Youth',
  };
  return map[r] || (r ? r.charAt(0) + r.slice(1).toLowerCase().replace(/_/g, ' ') : '');
}

function AccessManager(props: { onError: (m: string) => void }) {
  const [people, setPeople] = useState<AccessPerson[]>([]);
  const [byRole, setByRole] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [notReady, setNotReady] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchPerson[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ people: AccessPerson[]; byRole: string[] }>(`${API}&action=access-list`);
      setPeople(data.people || []);
      setByRole(data.byRole || []);
      setNotReady(null);
    } catch (err: any) {
      if (err?.status === 503) setNotReady(err?.message || 'Run fundraisers_phase_2_access.sql in Supabase.');
      else props.onError(err?.message || 'Could not load who has access.');
    } finally {
      setLoading(false);
    }
  }, [props]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = window.setTimeout(async () => {
      try {
        const data = await apiFetch<{ people: SearchPerson[] }>(`${API}&action=access-search&q=${encodeURIComponent(q.trim())}`);
        setResults(data.people || []);
      } catch {
        setResults([]);
      }
    }, 250);
    return () => window.clearTimeout(t);
  }, [q]);

  const setAccess = async (person: AccessPerson, allowed: boolean) => {
    if (!allowed && !window.confirm(`Remove Fundraiser access for ${person.name}?`)) return;
    setBusyId(person.id);
    try {
      await post<{ ok: boolean }>('set-access', { userId: person.id, allowed });
      setQ('');
      setResults([]);
      await load();
      resetFundraiserAccess();
    } catch (err: any) {
      props.onError(err?.message || 'Could not change Fundraiser access.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mt-2 pt-5 border-t border-black/[0.06] flex flex-col gap-4">
      <div>
        <h3 className="text-xl font-black text-[#16251f] flex items-center gap-2">
          <ShieldCheck size={20} /> Who has Fundraiser access
        </h3>
        <p className="text-sm text-gray-500 max-w-2xl">
          {byRole.length ? `${byRole.join(', ')} have access by their role. ` : ''}
          Anyone else — members who run the fundraiser, Accountants — needs the switch below. They keep everything their role
          already has, and can start and run fundraisers (charges, entries, payments, reminders). Only leaders delete or link
          PLCC Tithe.
        </p>
      </div>

      {notReady ? (
        <p className="text-sm text-amber-800 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">{notReady}</p>
      ) : loading ? (
        <Loader2 className="animate-spin text-gray-400" />
      ) : (
        <>
          <ul className="divide-y divide-black/[0.05] rounded-xl border border-black/[0.06]">
            {people.length === 0 && <li className="px-4 py-3 text-sm text-gray-500">Nobody has the switch on yet.</li>}
            {people.map((p) => (
              <li key={p.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-[#0d1a14] truncate">{p.name}</span>
                  <span className="block text-[12px] text-gray-500">
                    {roleLabel(p.role)}
                    {p.grantedAt ? ` · since ${new Date(p.grantedAt).toLocaleDateString()}` : ''}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={busyId === p.id}
                  onClick={() => void setAccess(p, false)}
                  className="h-10 px-4 rounded-xl border border-rose-200 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                >
                  Turn off
                </button>
              </li>
            ))}
          </ul>

          <label className={labelCls}>
            Give someone access
            <span className="relative block">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or email" className={`${fieldCls} pl-10`} />
            </span>
          </label>
          {results.length > 0 && (
            <ul className="divide-y divide-black/[0.05] rounded-xl border border-black/[0.06] bg-white">
              {results.map((p) => (
                <li key={p.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-[#0d1a14] truncate">{p.name}</span>
                    <span className="block text-[12px] text-gray-500">{roleLabel(p.role)}{p.email ? ` · ${p.email}` : ''}</span>
                  </span>
                  {p.byRole ? (
                    <span className="text-xs font-semibold text-emerald-700">Has access by role</span>
                  ) : p.hasSwitch ? (
                    <span className="text-xs font-semibold text-emerald-700">Switch is on</span>
                  ) : p.canGrant ? (
                    <button type="button" disabled={busyId === p.id} onClick={() => void setAccess(p, true)} className={btnPrimary}>
                      <UserPlus size={15} /> Turn on
                    </button>
                  ) : (
                    <span className="text-xs font-semibold text-gray-500">Approve this account first</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

export default FundraisersPage;
