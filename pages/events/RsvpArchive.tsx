import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Archive,
  ArrowLeft,
  ChevronDown,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  RotateCcw,
  Search,
} from 'lucide-react';
import { getAuthHeaders } from '../../lib/api';
import { downloadCookoutRsvpCsv, downloadCookoutRsvpPdf } from '../../lib/cookoutRsvpExport';
import { useNav } from '../../App';
import { Role } from '../../types';

type ArchivedEvent = {
  id: string;
  name: string;
  date: string;
  time: string;
  location: string;
  archivedAt: string;
  archivedBy: string;
  signups: number;
  people: number;
  paidCount: number;
  paidTotal: number;
};

type Row = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  household_size?: number | null;
  children_count?: number | null;
  guests_invited?: number | null;
  food_contribution_amount?: number | string | null;
  food_contribution_paid?: boolean | null;
  food_contribution_paid_by?: string | null;
  food_contribution_intent?: string | null;
  allergies?: string | null;
  created_at?: string;
};

type Totals = { adults: number; children: number; guests: number; funds: number; fundsPaid: number };

const money = (n: number | string | null | undefined) => {
  const v = Number(n);
  return Number.isFinite(v) ? `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';
};

const prettyDate = (ymd: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd || '')) return ymd || '';
  return new Date(`${ymd}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const shortDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

const phone = (p?: string | null) => {
  const d = String(p || '').replace(/\D/g, '');
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return p || '—';
};

/**
 * RSVP Archive — past event RSVPs kept with every signup and paid record.
 * Read-only for the Pastor, First Lady and Finance; Super Admin can restore.
 */
const RsvpArchivePage: React.FC = () => {
  const { userRole } = useNav();
  const isSuperAdmin = String(userRole) === Role.SUPER_ADMIN;
  const [events, setEvents] = useState<ArchivedEvent[]>([]);
  const [canRestore, setCanRestore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const [open, setOpen] = useState<ArchivedEvent | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [totals, setTotals] = useState<Totals>({ adults: 0, children: 0, guests: 0, funds: 0, fundsPaid: 0 });
  const [rowsLoading, setRowsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/vault?resource=events&subResource=rsvp-archive', { headers });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not load the RSVP Archive');
      setEvents(data.events || []);
      setCanRestore(Boolean(data.canRestore));
    } catch (err: any) {
      setError(err?.message || 'Could not load the RSVP Archive');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const openEvent = async (ev: ArchivedEvent) => {
    setOpen(ev);
    setRows([]);
    setSearch('');
    setRowsLoading(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `/api/vault?resource=events&subResource=rsvp&eventId=${encodeURIComponent(ev.id)}`,
        { headers }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not load this RSVP');
      setRows(data.registrations || []);
      setTotals(data.totals || { adults: 0, children: 0, guests: 0, funds: 0, fundsPaid: 0 });
    } catch (err: any) {
      setError(err?.message || 'Could not load this RSVP');
    } finally {
      setRowsLoading(false);
    }
  };

  const restore = async (ev: ArchivedEvent) => {
    if (!window.confirm(`Restore the RSVP for "${ev.name}"?\n\nIt moves back to Event RSVPs and online signup turns on again (unless its sign-up date has passed).`)) return;
    setRestoringId(ev.id);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/vault?resource=events&subResource=rsvp-archive', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: ev.id, action: 'restore' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not restore');
      setOpen(null);
      setFlash(`"${ev.name}" was restored to Event RSVPs.`);
      window.setTimeout(() => setFlash(null), 6000);
      await loadEvents();
    } catch (err: any) {
      setError(err?.message || 'Could not restore');
    } finally {
      setRestoringId(null);
    }
  };

  const meta = open
    ? {
        title: `${open.name} RSVP Roster (archived)`,
        eventLine: `${open.date}  |  ${open.time}`,
        fileSlug: `${open.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-rsvps`,
      }
    : undefined;

  const q = search.trim().toLowerCase();
  const shown = !q
    ? rows
    : rows.filter((r) => [r.name, r.phone, r.email, r.allergies].filter(Boolean).join(' ').toLowerCase().includes(q));

  const btn =
    'inline-flex items-center justify-center gap-2 min-h-[42px] px-4 rounded-xl border border-black/[0.08] bg-white text-sm font-medium text-[#0d1a14] hover:bg-[#0d1a14]/[0.04] transition-colors disabled:opacity-50';

  return (
    <div className="w-full max-w-[1200px] mx-auto pt-4 md:pt-10 pb-24 px-4 md:px-10">
      <header className="mb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#0d1a14]/50 mb-2">Events</p>
          <h1 className="text-2xl md:text-[2rem] font-semibold text-[#0d1a14] tracking-tight flex items-center gap-3">
            <Archive size={26} className="text-[#0d1a14]/70" aria-hidden />
            RSVP Archive
          </h1>
          <p className="text-sm text-gray-500 mt-2 max-w-2xl">
            Past event RSVPs, kept with every signup and paid record. View and export only
            {canRestore ? '; Super Admin can restore an RSVP.' : '.'}
          </p>
        </div>
        {isSuperAdmin ? (
          <Link to="/events/cookout-rsvps" className={btn}>
            <ArrowLeft size={15} />
            Event RSVPs
          </Link>
        ) : null}
      </header>

      {flash && (
        <p className="mb-5 text-sm font-medium text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3" role="status">
          {flash}
        </p>
      )}
      {error && (
        <p className="mb-5 text-sm font-medium text-red-800 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</p>
      )}

      {open ? (
        <section className="bg-white border border-black/[0.06] rounded-2xl overflow-hidden">
          <div className="px-4 sm:px-5 py-4 border-b border-black/[0.05] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="min-w-0">
              <button
                type="button"
                onClick={() => setOpen(null)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-[#0d1a14] mb-1.5"
              >
                <ArrowLeft size={13} /> All archived RSVPs
              </button>
              <h2 className="text-lg font-semibold text-[#0d1a14] break-words">{open.name}</h2>
              <p className="text-sm text-gray-500">
                {prettyDate(open.date)}
                {open.time ? ` · ${open.time}` : ''} · Archived {shortDate(open.archivedAt)}
                {open.archivedBy ? ` by ${open.archivedBy}` : ''}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="relative">
                <button type="button" className={btn} onClick={() => setExportOpen((o) => !o)} disabled={!rows.length} aria-expanded={exportOpen}>
                  <Download size={15} /> Export <ChevronDown size={14} />
                </button>
                {exportOpen && (
                  <div role="menu" className="absolute right-0 mt-2 w-52 rounded-xl border border-black/[0.08] bg-white shadow-lg py-1 z-20">
                    <button
                      type="button"
                      role="menuitem"
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-[#0d1a14] hover:bg-[#0d1a14]/5"
                      onClick={() => {
                        downloadCookoutRsvpCsv(rows as any, meta);
                        setExportOpen(false);
                      }}
                    >
                      <FileSpreadsheet size={16} /> Spreadsheet (CSV)
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-[#0d1a14] hover:bg-[#0d1a14]/5"
                      onClick={() => {
                        try {
                          downloadCookoutRsvpPdf(rows as any, totals, meta);
                        } catch (err: any) {
                          setError(err?.message || 'Could not create the PDF');
                        }
                        setExportOpen(false);
                      }}
                    >
                      <FileText size={16} /> PDF report
                    </button>
                  </div>
                )}
              </div>
              {canRestore && (
                <button type="button" className={btn} onClick={() => void restore(open)} disabled={restoringId === open.id}>
                  {restoringId === open.id ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />}
                  Restore
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 divide-x divide-y sm:divide-y-0 divide-black/[0.05] border-b border-black/[0.05]">
            {[
              { label: 'Adults', value: String(totals.adults) },
              { label: 'Children', value: String(totals.children) },
              { label: 'Guests', value: String(totals.guests) },
              { label: 'Paid', value: money(totals.fundsPaid) },
              { label: 'Not paid', value: money(totals.funds) },
            ].map((s) => (
              <div key={s.label} className="px-5 py-3.5">
                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-gray-400">{s.label}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-[#0d1a14]">{s.value}</p>
              </div>
            ))}
          </div>

          {rows.length > 0 && (
            <div className="px-4 sm:px-5 py-3 border-b border-black/[0.05]">
              <div className="relative sm:w-80">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300" size={16} />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, phone, email"
                  aria-label="Search signups"
                  className="w-full min-h-[40px] pl-10 pr-3 rounded-xl border border-black/[0.08] bg-[#FAFAF8] text-sm outline-none focus:bg-white focus:border-[#0d1a14]/30"
                />
              </div>
            </div>
          )}

          {rowsLoading ? (
            <div className="flex justify-center py-16 text-[#0d1a14]">
              <Loader2 className="animate-spin" size={26} />
            </div>
          ) : rows.length === 0 ? (
            <p className="px-6 py-14 text-center text-gray-500">No signups were saved for this RSVP.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#FAFAF8] text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">
                    <th className="px-5 py-2.5">Guest</th>
                    <th className="px-3 py-2.5">Party</th>
                    <th className="px-3 py-2.5">Gift</th>
                    <th className="px-3 py-2.5">Allergies</th>
                    <th className="px-5 py-2.5">Signed up</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.05]">
                  {shown.map((r) => {
                    const kids = Number(r.children_count) || 0;
                    const adults = Math.max(0, (Number(r.household_size) || 1) - kids);
                    const guests = Number(r.guests_invited) || 0;
                    const amount = Number(r.food_contribution_amount) || 0;
                    return (
                      <tr key={r.id} className="align-top">
                        <td className="px-5 py-3">
                          <p className="font-semibold text-[#0d1a14]">{r.name}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {phone(r.phone)}
                            {r.email ? ` · ${r.email}` : ''}
                          </p>
                        </td>
                        <td className="px-3 py-3 text-gray-700 whitespace-nowrap">
                          {adults} {adults === 1 ? 'adult' : 'adults'}
                          {kids ? ` · ${kids} ${kids === 1 ? 'child' : 'children'}` : ''}
                          {guests ? ` · ${guests} ${guests === 1 ? 'guest' : 'guests'}` : ''}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          {amount > 0 ? (
                            <span className="inline-flex items-center gap-2">
                              <span className="font-semibold tabular-nums text-[#0d1a14]">{money(amount)}</span>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1 ring-inset ${
                                  r.food_contribution_paid
                                    ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/15'
                                    : r.food_contribution_intent === 'pledge'
                                      ? 'bg-slate-100 text-slate-700 ring-slate-500/15'
                                      : 'bg-rose-50 text-[#1d372c] ring-[#1d372c]/15'
                                }`}
                              >
                                {r.food_contribution_paid ? 'Paid' : r.food_contribution_intent === 'pledge' ? 'Pledged' : 'Not paid'}
                              </span>
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-gray-600">{r.allergies?.trim() || 'None'}</td>
                        <td className="px-5 py-3 text-gray-500 whitespace-nowrap">{shortDate(r.created_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : loading ? (
        <div className="bg-white border border-black/[0.06] rounded-2xl flex justify-center py-20 text-[#0d1a14]">
          <Loader2 className="animate-spin" size={28} />
        </div>
      ) : events.length === 0 && !error ? (
        <div className="bg-white border border-black/[0.06] rounded-2xl px-8 py-16 text-center">
          <p className="text-gray-700 font-medium">Nothing is archived yet.</p>
          <p className="text-sm text-gray-500 mt-2">
            When an event is over, Super Admin can tap <strong>Archive</strong> on its RSVP to move it here.
          </p>
        </div>
      ) : (
        <ul className="bg-white border border-black/[0.06] rounded-2xl divide-y divide-black/[0.05] overflow-hidden">
          {events.map((ev) => (
            <li key={ev.id}>
              <button
                type="button"
                onClick={() => void openEvent(ev)}
                className="w-full text-left px-5 py-4 hover:bg-[#FAFAF8] transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-[#0d1a14] break-words">{ev.name}</p>
                  <p className="text-sm text-gray-500">
                    {prettyDate(ev.date)} · Archived {shortDate(ev.archivedAt)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-600 shrink-0">
                  <span>
                    <strong className="text-[#0d1a14] tabular-nums">{ev.signups}</strong> signups
                  </span>
                  <span>
                    <strong className="text-[#0d1a14] tabular-nums">{ev.people}</strong> people
                  </span>
                  <span>
                    <strong className="text-emerald-700 tabular-nums">{money(ev.paidTotal)}</strong> paid
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default RsvpArchivePage;
