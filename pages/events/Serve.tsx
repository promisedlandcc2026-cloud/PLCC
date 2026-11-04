/**
 * Vault Serve Opportunities admin — member signup workflow (not event_volunteers roster).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ShareToAwcChat } from '../../components/awcone/ShareToAwcChat';
import { AddServeVolunteer } from '../../components/serve/AddServeVolunteer';
import {
  CheckCircle2,
  ClipboardList,
  HeartHandshake,
  Loader2,
  Plus,
  RefreshCw,
  X,
  XCircle,
} from 'lucide-react';
import { canPerform } from '../../lib/permissions';
import { useNav } from '../../App';
import { getAuthHeaders } from '../../lib/api';
import { Role } from '../../types';
import AskAdminTitleLink from '../../components/common/AskAdminTitleLink';

type FilterKey = 'open' | 'upcoming' | 'completed' | 'cancelled' | 'all';

type Opportunity = {
  id: string;
  title: string;
  description?: string | null;
  role_label?: string | null;
  location?: string | null;
  status: string;
  capacity?: number | null;
  requires_approval?: boolean;
  starts_at?: string | null;
  ends_at?: string | null;
  event_id?: string | null;
  team_id?: string | null;
  ministry_id?: string | null;
  activeSignupCount?: number;
  remainingSlots?: number | null;
  event?: { id: string; name?: string; date?: string } | null;
  ministry?: { id: string; name?: string } | null;
  team?: { id: string; name?: string } | null;
};

type Signup = {
  id: string;
  status: string;
  created_at: string;
  displayName: string;
  email: string | null;
  member_id: string | null;
  user_id: string;
};

type FormState = {
  title: string;
  description: string;
  role_label: string;
  location: string;
  starts_at: string;
  ends_at: string;
  capacity: string;
  requires_approval: boolean;
  event_id: string;
  ministry_id: string;
  team_id: string;
};

const emptyForm = (): FormState => ({
  title: '',
  description: '',
  role_label: '',
  location: '',
  starts_at: '',
  ends_at: '',
  capacity: '',
  requires_approval: false,
  event_id: '',
  ministry_id: '',
  team_id: '',
});

function toLocalInput(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(v: string) {
  if (!v.trim()) return null;
  const d = new Date(v);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString();
}

const EventsServe: React.FC = () => {
  const { userRole } = useNav();
  const canEdit = canPerform(userRole as Role, 'event.edit');

  const [filter, setFilter] = useState<FilterKey>('open');
  const [list, setList] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Vault search opens /events/serve?id=<opportunity> straight to it.
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    try {
      const hash = window.location.hash || '';
      const qs = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : window.location.search.slice(1);
      const id = new URLSearchParams(qs).get('id') || '';
      return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
    } catch {
      return null;
    }
  });
  const [detail, setDetail] = useState<Opportunity | null>(null);
  const [signups, setSignups] = useState<Signup[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [events, setEvents] = useState<Array<{ id: string; name: string }>>([]);
  const [ministries, setMinistries] = useState<Array<{ id: string; name: string }>>([]);
  const [teams, setTeams] = useState<Array<{ id: string; name: string }>>([]);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/vault?resource=events&subResource=serve&filter=${filter}`, {
        headers,
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to load opportunities');
      setList(data.opportunities || []);
    } catch (e: any) {
      setError(e.message || 'Failed to load');
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/vault?resource=events&subResource=serve&id=${encodeURIComponent(id)}`, {
        headers,
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to load detail');
      setDetail(data.opportunity);
      setSignups(data.signups || []);
    } catch (e: any) {
      setError(e.message || 'Failed to load detail');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const loadLookups = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const [ev, min, tm] = await Promise.all([
        fetch('/api/vault?resource=events&limit=100', { headers }).then((r) => r.json()),
        fetch('/api/vault?resource=people&subResource=ministries', { headers }).then((r) => r.json()),
        fetch('/api/vault?resource=people&subResource=teams', { headers }).then((r) => r.json()),
      ]);
      setEvents(
        (ev.events || ev.data || []).map((e: any) => ({
          id: e.id,
          name: e.name || e.title || 'Event',
        }))
      );
      setMinistries((min.ministries || []).map((m: any) => ({ id: m.id, name: m.name })));
      setTeams((tm.teams || []).map((t: any) => ({ id: t.id, name: t.name })));
    } catch {
      /* lookups optional */
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  // Searching again while this page is open (?id= changes) opens the new one.
  const [routeParams] = useSearchParams();
  const routeId = routeParams.get('id');
  useEffect(() => {
    if (routeId && /^[0-9a-f-]{36}$/i.test(routeId)) setSelectedId(routeId);
  }, [routeId]);

  useEffect(() => {
    loadLookups();
  }, [loadLookups]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (opp: Opportunity) => {
    setEditingId(opp.id);
    setForm({
      title: opp.title || '',
      description: opp.description || '',
      role_label: opp.role_label || '',
      location: opp.location || '',
      starts_at: toLocalInput(opp.starts_at),
      ends_at: toLocalInput(opp.ends_at),
      capacity: opp.capacity != null ? String(opp.capacity) : '',
      requires_approval: !!opp.requires_approval,
      event_id: opp.event_id || '',
      ministry_id: opp.ministry_id || '',
      team_id: opp.team_id || '',
    });
    setFormError(null);
    setModalOpen(true);
  };

  const saveForm = async () => {
    if (!canEdit) return;
    setSaving(true);
    setFormError(null);
    try {
      const headers = await getAuthHeaders();
      const body: Record<string, unknown> = {
        title: form.title,
        description: form.description || null,
        role_label: form.role_label || null,
        location: form.location || null,
        starts_at: fromLocalInput(form.starts_at),
        ends_at: fromLocalInput(form.ends_at),
        capacity: form.capacity.trim() ? Number(form.capacity) : null,
        requires_approval: form.requires_approval,
        event_id: form.event_id || null,
        ministry_id: form.ministry_id || null,
        team_id: form.team_id || null,
      };
      if (editingId) body.id = editingId;
      const res = await fetch('/api/vault?resource=events&subResource=serve', {
        method: editingId ? 'PATCH' : 'POST',
        headers,
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Save failed');
      setModalOpen(false);
      await loadList();
      if (editingId || data.opportunity?.id) {
        const id = editingId || data.opportunity.id;
        setSelectedId(id);
        await loadDetail(id);
      }
    } catch (e: any) {
      setFormError(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const statusAction = async (action: 'cancel' | 'complete') => {
    if (!detail || !canEdit) return;
    if (!window.confirm(`Mark this opportunity as ${action === 'cancel' ? 'cancelled' : 'completed'}?`)) return;
    const headers = await getAuthHeaders();
    const res = await fetch('/api/vault?resource=events&subResource=serve', {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ id: detail.id, action }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      setError(data.error || 'Action failed');
      return;
    }
    await loadList();
    await loadDetail(detail.id);
  };

  const signupAction = async (signupId: string, action: 'approve' | 'decline') => {
    if (!canEdit) return;
    const headers = await getAuthHeaders();
    const res = await fetch('/api/vault?resource=events&subResource=serve-signups', {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ id: signupId, action }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      setError(data.error || 'Signup action failed');
      return;
    }
    if (selectedId) await loadDetail(selectedId);
    await loadList();
  };

  const filters: { key: FilterKey; label: string }[] = useMemo(
    () => [
      { key: 'open', label: 'Open' },
      { key: 'upcoming', label: 'Upcoming' },
      { key: 'completed', label: 'Completed' },
      { key: 'cancelled', label: 'Cancelled' },
      { key: 'all', label: 'All' },
    ],
    []
  );

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#0d1a14]/80 mb-2">
            Events &amp; check-in
          </p>
          <h1 className="text-3xl md:text-4xl font-extrabold text-[#0d1a14] tracking-tight flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-3">
              <HeartHandshake className="text-[#0d1a14]" />
              Serve Opportunities
            </span>
            <AskAdminTitleLink />
          </h1>
          <p className="text-sm text-gray-500 mt-2 max-w-2xl">
            Member signup opportunities for Connect. This is separate from the legacy{' '}
            <span className="font-semibold text-gray-700">Event Volunteers</span> staff roster.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => loadList()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50"
          >
            <RefreshCw size={16} /> Refresh
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0d1a14] text-white text-sm font-bold hover:bg-[#12231c]"
            >
              <Plus size={16} /> New opportunity
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {filters.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wider ${
              filter === f.key
                ? 'bg-[#0d1a14] text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="grid lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2 space-y-3">
          {loading ? (
            <div className="flex items-center gap-2 text-gray-500 py-12 justify-center">
              <Loader2 className="animate-spin" size={18} /> Loading…
            </div>
          ) : list.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 p-10 text-center text-gray-500">
              <ClipboardList className="mx-auto mb-3 text-gray-300" />
              No opportunities for this filter.
            </div>
          ) : (
            list.map((opp) => (
              <button
                key={opp.id}
                type="button"
                onClick={() => setSelectedId(opp.id)}
                className={`w-full text-left rounded-2xl border p-4 transition ${
                  selectedId === opp.id
                    ? 'border-[#0d1a14] bg-[#0d1a14]/[0.03] shadow-sm'
                    : 'border-gray-100 bg-white hover:border-gray-200'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-bold text-[#0d1a14]">{opp.title}</h2>
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                    {opp.status}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {opp.starts_at ? new Date(opp.starts_at).toLocaleString() : 'No start time'}
                  {opp.event?.name ? ` · ${opp.event.name}` : ''}
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold text-gray-600">
                  <span>
                    Active {opp.activeSignupCount ?? 0}
                    {opp.capacity != null ? ` / ${opp.capacity}` : ''}
                  </span>
                  {opp.remainingSlots != null && (
                    <span className="text-emerald-700">{opp.remainingSlots} slots left</span>
                  )}
                  {opp.requires_approval && (
                    <span className="text-amber-700">Approval required</span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>

        <div className="lg:col-span-3 rounded-2xl border border-gray-100 bg-white min-h-[420px]">
          {!selectedId ? (
            <div className="h-full flex items-center justify-center text-gray-400 p-10 text-sm">
              Select an opportunity to view details and signups.
            </div>
          ) : detailLoading || !detail ? (
            <div className="flex items-center gap-2 text-gray-500 py-20 justify-center">
              <Loader2 className="animate-spin" size={18} /> Loading detail…
            </div>
          ) : (
            <div className="p-6 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-extrabold text-[#0d1a14]">{detail.title}</h2>
                  {detail.description && (
                    <p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">{detail.description}</p>
                  )}
                </div>
                {detail.status === 'open' && !canEdit ? <ShareToAwcChat kind="serve" id={detail.id} /> : null}
                {canEdit && detail.status === 'open' && (
                  <div className="flex flex-wrap gap-2">
                    <ShareToAwcChat kind="serve" id={detail.id} />
                    <button
                      type="button"
                      onClick={() => openEdit(detail)}
                      className="px-3 py-2 rounded-xl border text-xs font-bold"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => statusAction('complete')}
                      className="px-3 py-2 rounded-xl bg-emerald-700 text-white text-xs font-bold"
                    >
                      Complete
                    </button>
                    <button
                      type="button"
                      onClick={() => statusAction('cancel')}
                      className="px-3 py-2 rounded-xl bg-red-700 text-white text-xs font-bold"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              <div className="grid sm:grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-gray-50 p-3">
                  <div className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Schedule</div>
                  <div className="mt-1 text-gray-700">
                    {detail.starts_at ? new Date(detail.starts_at).toLocaleString() : '—'}
                    {detail.ends_at ? ` → ${new Date(detail.ends_at).toLocaleString()}` : ''}
                  </div>
                </div>
                <div className="rounded-xl bg-gray-50 p-3">
                  <div className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Capacity</div>
                  <div className="mt-1 text-gray-700">
                    Active {detail.activeSignupCount ?? 0}
                    {detail.capacity != null ? ` / ${detail.capacity}` : ' (unlimited)'}
                    {detail.remainingSlots != null ? ` · ${detail.remainingSlots} remaining` : ''}
                  </div>
                </div>
                <div className="rounded-xl bg-gray-50 p-3">
                  <div className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Links</div>
                  <div className="mt-1 text-gray-700">
                    {[detail.event?.name, detail.ministry?.name, detail.team?.name]
                      .filter(Boolean)
                      .join(' · ') || 'None'}
                  </div>
                </div>
                <div className="rounded-xl bg-gray-50 p-3">
                  <div className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Role / location</div>
                  <div className="mt-1 text-gray-700">
                    {[detail.role_label, detail.location].filter(Boolean).join(' · ') || '—'}
                    {detail.requires_approval ? ' · Approval required' : ''}
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-gray-400 mb-3">
                  Signup roster ({signups.length})
                </h3>
                {canEdit && detail.status === 'open' ? (
                  <div className="mb-3">
                    <AddServeVolunteer
                      opportunityId={detail.id}
                      onAdded={() => {
                        void loadDetail(detail.id);
                        void loadList();
                      }}
                    />
                  </div>
                ) : null}
                {signups.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400">
                    No signups yet.
                  </div>
                ) : (
                  <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100">
                    {signups.map((s) => (
                      <li key={s.id} className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3">
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-gray-800 truncate">{s.displayName}</div>
                          <div className="text-xs text-gray-500 truncate">
                            {s.email || 'No email'} · {s.status} ·{' '}
                            {new Date(s.created_at).toLocaleString()}
                            {s.member_id ? '' : ' · member_id null'}
                          </div>
                        </div>
                        {canEdit && s.status === 'pending' && (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => signupAction(s.id, 'approve')}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-bold"
                            >
                              <CheckCircle2 size={14} /> Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => signupAction(s.id, 'decline')}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-700 text-white text-xs font-bold"
                            >
                              <XCircle size={14} /> Decline
                            </button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl bg-white shadow-2xl border border-gray-100">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="font-extrabold text-[#0d1a14]">
                {editingId ? 'Edit opportunity' : 'New opportunity'}
              </h3>
              <button type="button" onClick={() => setModalOpen(false)} className="p-2 rounded-full hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {formError && (
                <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800">
                  {formError}
                </div>
              )}
              {(
                [
                  ['title', 'Title *'],
                  ['role_label', 'Role label'],
                  ['location', 'Location'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="block">
                  <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">{label}</span>
                  <input
                    className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                    value={form[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  />
                </label>
              ))}
              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">Description</span>
                <textarea
                  className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm min-h-[80px]"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">Starts</span>
                  <input
                    type="datetime-local"
                    className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                    value={form.starts_at}
                    onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">Ends</span>
                  <input
                    type="datetime-local"
                    className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                    value={form.ends_at}
                    onChange={(e) => setForm((f) => ({ ...f, ends_at: e.target.value }))}
                  />
                </label>
              </div>
              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">Capacity</span>
                <input
                  type="number"
                  min={1}
                  className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                  value={form.capacity}
                  onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
                  placeholder="Leave blank for unlimited"
                />
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <input
                  type="checkbox"
                  checked={form.requires_approval}
                  onChange={(e) => setForm((f) => ({ ...f, requires_approval: e.target.checked }))}
                />
                Requires approval
              </label>
              {(
                [
                  ['event_id', 'Linked event', events],
                  ['ministry_id', 'Linked ministry', ministries],
                  ['team_id', 'Linked team', teams],
                ] as const
              ).map(([key, label, opts]) => (
                <label key={key} className="block">
                  <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">{label}</span>
                  <select
                    className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                    value={form[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  >
                    <option value="">None</option>
                    {opts.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 rounded-xl text-sm font-bold text-gray-600"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={saveForm}
                className="px-4 py-2 rounded-xl bg-[#0d1a14] text-white text-sm font-bold disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EventsServe;
