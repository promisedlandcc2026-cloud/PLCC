import React, { useEffect, useState } from 'react';
import { Hash, Loader2, Lock, Users, X } from 'lucide-react';
import { getAuthHeaders } from '../../lib/api';
import ChannelMemberPicker, { type PickerPerson } from './ChannelMemberPicker';

export type ChannelCreateKind = 'open' | 'private' | 'ministry';

type MinistryOption = { id: string; name: string; description?: string | null };

type NewChannelModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (channel: any) => void;
};

const TYPE_OPTIONS: {
  id: ChannelCreateKind;
  label: string;
  hint: string;
  icon: React.ReactNode;
}[] = [
  {
    id: 'open',
    label: 'Open Channel',
    hint: 'Everyone with Community access can see it',
    icon: <Hash size={16} />,
  },
  {
    id: 'private',
    label: 'Private Channel',
    hint: 'Only selected members can access it',
    icon: <Lock size={16} />,
  },
  {
    id: 'ministry',
    label: 'Ministry / Team',
    hint: 'Tied to a ministry with optional extras',
    icon: <Users size={16} />,
  },
];

const NewChannelModal: React.FC<NewChannelModalProps> = ({ isOpen, onClose, onCreated }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<ChannelCreateKind>('open');
  const [ministryId, setMinistryId] = useState('');
  const [ministries, setMinistries] = useState<MinistryOption[]>([]);
  const [people, setPeople] = useState<PickerPerson[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [loadingPeople, setLoadingPeople] = useState(false);
  const [loadingMinistries, setLoadingMinistries] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setName('');
    setDescription('');
    setKind('open');
    setMinistryId('');
    setSelectedIds([]);
    setSearch('');
    setError(null);
  }, [isOpen]);

  // Avoid carrying a private Select-All set into Ministry extras.
  useEffect(() => {
    setSelectedIds([]);
    setSearch('');
  }, [kind]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const loadMinistries = async () => {
      setLoadingMinistries(true);
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(
          '/api/vault?resource=community&subResource=chat&subResource=chat-ministries',
          { headers }
        );
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setMinistries(Array.isArray(data.ministries) ? data.ministries : []);
        }
      } catch {
        if (!cancelled) setMinistries([]);
      } finally {
        if (!cancelled) setLoadingMinistries(false);
      }
    };
    loadMinistries();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || (kind !== 'private' && kind !== 'ministry')) return;
    let cancelled = false;
    const t = window.setTimeout(async () => {
      setLoadingPeople(true);
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(
          `/api/vault?resource=community&subResource=chat&subResource=member-picker&q=${encodeURIComponent(search)}`,
          { headers }
        );
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setPeople(Array.isArray(data) ? data : []);
        }
      } catch {
        if (!cancelled) setPeople([]);
      } finally {
        if (!cancelled) setLoadingPeople(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [isOpen, kind, search]);

  if (!isOpen) return null;

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Channel name is required');
      return;
    }
    if (kind === 'ministry' && !ministryId) {
      setError('Select a ministry or team');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const body: Record<string, unknown> = {
        name: trimmed,
        description: description.trim() || null,
        channelType: kind,
      };
      if (kind === 'ministry') body.ministryId = ministryId;
      if (kind === 'private' || kind === 'ministry') body.memberIds = selectedIds;

      const res = await fetch('/api/vault?resource=community&subResource=chat&subResource=channels', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || 'Could not create channel');
        return;
      }
      onCreated(data);
      onClose();
    } catch {
      setError('Could not create channel');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-burgundy/25 backdrop-blur-sm p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-3xl shadow-2xl border border-gray-100 max-h-[92dvh] flex flex-col animate-in slide-in-from-bottom duration-200">
        <div className="px-5 pt-5 pb-3 flex items-start justify-between border-b border-gray-50 shrink-0">
          <div>
            <p className="text-[9px] font-black text-gold uppercase tracking-[0.25em] mb-1">Community</p>
            <h3 className="font-black text-[#0d1a14] uppercase tracking-tight text-lg">New Channel</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-gray-300 hover:text-burgundy hover:bg-gray-50"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto flex-1 space-y-4">
          <div>
            <label className="block text-[10px] font-black text-burgundy uppercase tracking-[0.2em] mb-1.5">
              Channel Name
            </label>
            <input
              className="w-full h-11 border border-gray-200 rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gold/30"
              placeholder="e.g. Youth Leaders"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div>
            <label className="block text-[10px] font-black text-burgundy uppercase tracking-[0.2em] mb-1.5">
              Description <span className="text-gray-300 normal-case tracking-normal">(optional)</span>
            </label>
            <textarea
              className="w-full min-h-[72px] border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gold/30"
              placeholder="What is this channel for?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-[10px] font-black text-burgundy uppercase tracking-[0.2em] mb-2">
              Channel Type
            </label>
            <div className="space-y-2">
              {TYPE_OPTIONS.map((opt) => {
                const active = kind === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setKind(opt.id)}
                    className={`w-full text-left flex items-start gap-3 p-3 rounded-xl border transition-all ${
                      active
                        ? 'border-gold bg-gold-cream/50 shadow-sm'
                        : 'border-gray-100 hover:border-gray-200 bg-white'
                    }`}
                  >
                    <span
                      className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        active ? 'bg-burgundy text-gold' : 'bg-gray-50 text-gray-400'
                      }`}
                    >
                      {opt.icon}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-black text-[#0d1a14] uppercase tracking-tight">
                        {opt.label}
                      </span>
                      <span className="block text-[11px] text-gray-400 font-medium mt-0.5">{opt.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {kind === 'ministry' ? (
            <div>
              <label className="block text-[10px] font-black text-burgundy uppercase tracking-[0.2em] mb-1.5">
                Ministry / Team
              </label>
              {loadingMinistries ? (
                <div className="flex items-center gap-2 text-gray-300 text-[10px] font-black uppercase tracking-widest py-3">
                  <Loader2 size={14} className="animate-spin" /> Loading ministries
                </div>
              ) : (
                <select
                  value={ministryId}
                  onChange={(e) => setMinistryId(e.target.value)}
                  className="w-full h-11 border border-gray-200 rounded-xl px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gold/30"
                >
                  <option value="">Select ministry…</option>
                  {ministries.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              )}
              {!loadingMinistries && ministries.length === 0 ? (
                <p className="text-[11px] text-gray-400 mt-1.5">
                  No ministries available for your role. Contact an admin.
                </p>
              ) : null}
            </div>
          ) : null}

          {kind === 'private' || kind === 'ministry' ? (
            <ChannelMemberPicker
              people={people}
              selectedIds={selectedIds}
              onChange={setSelectedIds}
              loading={loadingPeople}
              search={search}
              onSearchChange={setSearch}
              // Private may bulk-select; Ministry roster comes from sync — extras only.
              allowSelectAll={kind === 'private'}
              label={
                kind === 'ministry' ? 'Optional additional members' : 'Add Members'
              }
            />
          ) : null}

          {error ? (
            <p className="text-[12px] font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
              {error}
            </p>
          ) : null}
        </div>

        <div className="px-5 py-4 border-t border-gray-50 flex items-center gap-2 shrink-0 bg-white sm:rounded-b-2xl">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-11 rounded-xl border border-gray-200 text-[11px] font-black uppercase tracking-widest text-gray-400 hover:text-burgundy"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="flex-1 h-11 rounded-xl bg-burgundy text-gold text-[11px] font-black uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
            Create Channel
          </button>
        </div>
      </div>
    </div>
  );
};

export default NewChannelModal;
