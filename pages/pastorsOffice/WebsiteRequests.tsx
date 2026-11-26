import React, { useEffect, useState } from 'react';
import { Globe, RefreshCw } from 'lucide-react';
import ContactLinks from './ContactLinks';
import { officeZone as zone } from './ugandaTime';

export type WebsiteRequest = {
  id: string;
  service: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  preferred_start: string | null;
  message: string | null;
  status: 'new' | 'contacted' | 'closed';
  created_at: string;
  matched?: { name?: string } | { name?: string }[] | null;
};

const SERVICE_LABEL: Record<string, string> = {
  baptism: 'Baptism',
  dedication: 'Child dedication',
  wedding: 'Wedding',
  counseling: 'Counselling',
  other: 'Something else',
};

export function matchedName(r: Pick<WebsiteRequest, 'matched'>): string | null {
  const m = Array.isArray(r.matched) ? r.matched[0] : r.matched;
  return m?.name ? String(m.name) : null;
}

type Api = (resource: string, body?: object) => Promise<any>;

/** Requests sent from the church website (no sign-in): the office calls, WhatsApps or emails them. */
export default function WebsiteRequests({ officeId, api }: { officeId: string; api: Api }) {
  const [rows, setRows] = useState<WebsiteRequest[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [showClosed, setShowClosed] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await api(`pastors-office-website&scope=office&officeId=${encodeURIComponent(officeId)}`);
      setRows(Array.isArray(data.requests) ? data.requests : []);
      setError('');
    } catch (e: any) {
      setRows([]);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (officeId) void load();
  }, [officeId]);

  async function setStatus(r: WebsiteRequest, status: WebsiteRequest['status']) {
    setBusy(r.id);
    try {
      await api('pastors-office-website', { action: 'set_status', id: r.id, status });
      setRows((list) => list.map((x) => (x.id === r.id ? { ...x, status } : x)));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  }

  const visible = rows.filter((r) => showClosed || r.status !== 'closed');
  const newCount = rows.filter((r) => r.status === 'new').length;

  return (
    <section className="mt-4 rounded-xl border border-[#d7dfeb] bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-serif text-2xl font-bold"><Globe size={20} />Website requests{newCount > 0 && <span className="rounded-full bg-[#c69a39] px-2 py-0.5 text-xs font-bold text-white">{newCount} new</span>}</h2>
          <p className="mt-1 text-sm">Sent from the church website, by visitors or members who weren’t signed in. Reach them by phone, WhatsApp or email.</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />Show closed</label>
          <button type="button" onClick={() => void load()} className="inline-flex items-center gap-1 rounded border px-3 py-2 text-sm"><RefreshCw size={14} />Refresh</button>
        </div>
      </div>
      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {loading ? <p role="status" className="mt-4 text-sm">Loading website requests…</p> : visible.length === 0 ? <p className="mt-4 text-sm">No website requests to show.</p> : (
        <ul className="mt-3 divide-y">
          {visible.map((r) => {
            const member = matchedName(r);
            return (
              <li key={r.id} className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{r.full_name} · {SERVICE_LABEL[r.service] || r.service}</p>
                  {member
                    ? <span className="rounded-full bg-[#e3f1e7] px-2 py-0.5 text-xs font-semibold text-[#1d5b33]" title={`Phone or email matches the PLCC account of ${member}`}>Member · {member}</span>
                    : <span className="rounded-full bg-[#f9edce] px-2 py-0.5 text-xs font-semibold text-[#72520f]">Visitor</span>}
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${r.status === 'new' ? 'bg-[#102d50] text-white' : 'bg-[#e6edf5] text-[#38516e]'}`}>{r.status}</span>
                </div>
                <p className="mt-1 text-xs text-[#52647d]">Sent {new Date(r.created_at).toLocaleString(undefined, { timeZone: zone, timeZoneName: 'short' })}{r.preferred_start ? ` · Preferred ${new Date(r.preferred_start).toLocaleString(undefined, { timeZone: zone, timeZoneName: 'short' })}` : ''}</p>
                <ContactLinks phone={r.phone} email={r.email} />
                {r.message && <p className="mt-2 whitespace-pre-wrap text-sm">{r.message}</p>}
                <div className="mt-2 flex flex-wrap gap-2">
                  {r.status !== 'contacted' && <button type="button" disabled={busy === r.id} onClick={() => void setStatus(r, 'contacted')} className="rounded border px-3 py-2 text-sm">Mark contacted</button>}
                  {r.status !== 'closed' && <button type="button" disabled={busy === r.id} onClick={() => void setStatus(r, 'closed')} className="rounded border px-3 py-2 text-sm">Close</button>}
                  {r.status === 'closed' && <button type="button" disabled={busy === r.id} onClick={() => void setStatus(r, 'new')} className="rounded border px-3 py-2 text-sm">Reopen</button>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
