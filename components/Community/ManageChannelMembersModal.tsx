import React, { useEffect, useMemo, useState } from 'react';
import { Crown, Loader2, Shield, Trash2, Users, X } from 'lucide-react';
import { getAuthHeaders } from '../../lib/api';
import ChannelMemberPicker, { type PickerPerson } from './ChannelMemberPicker';

type MemberRow = {
  id: string;
  user_id: string;
  role: string;
  source: string;
  name: string;
  user_role: string | null;
  avatar_url: string | null;
  ministries: string[];
  is_creator: boolean;
};

type ManageChannelMembersModalProps = {
  isOpen: boolean;
  channelId: string;
  channelName: string;
  /** When known (e.g. active channel), used immediately for ministry Select All gating. */
  channelVisibility?: string | null;
  onClose: () => void;
};

function MembershipBadges({
  member,
  createdBy,
}: {
  member: MemberRow;
  createdBy: string | null;
}) {
  const isOwner = member.is_creator || member.user_id === createdBy;
  const isMod = String(member.role).toLowerCase() === 'moderator';
  const source = String(member.source || 'manual').toLowerCase();

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {isOwner ? (
        <span className="inline-flex items-center gap-0.5 text-[8px] font-black uppercase tracking-widest text-gold bg-gold-cream px-1.5 py-0.5 rounded">
          <Crown size={9} /> Owner
        </span>
      ) : null}
      {isMod && !isOwner ? (
        <span className="inline-flex items-center gap-0.5 text-[8px] font-black uppercase tracking-widest text-burgundy bg-burgundy/5 px-1.5 py-0.5 rounded">
          <Shield size={9} /> Moderator
        </span>
      ) : null}
      {isMod && isOwner ? (
        <span className="inline-flex items-center gap-0.5 text-[8px] font-black uppercase tracking-widest text-burgundy bg-burgundy/5 px-1.5 py-0.5 rounded">
          <Shield size={9} /> Moderator
        </span>
      ) : null}
      {source === 'ministry_sync' ? (
        <span className="text-[8px] font-black uppercase tracking-widest text-gray-400 bg-gray-50 border border-gray-100 px-1.5 py-0.5 rounded">
          Ministry Sync
        </span>
      ) : source === 'manual' ? (
        <span className="text-[8px] font-black uppercase tracking-widest text-gold/80 bg-gold-cream/60 border border-gold/10 px-1.5 py-0.5 rounded">
          Added
        </span>
      ) : source === 'role_grant' ? (
        <span className="text-[8px] font-black uppercase tracking-widest text-gray-400 bg-gray-50 border border-gray-100 px-1.5 py-0.5 rounded">
          Role Grant
        </span>
      ) : null}
    </span>
  );
}

const ManageChannelMembersModal: React.FC<ManageChannelMembersModalProps> = ({
  isOpen,
  channelId,
  channelName,
  channelVisibility = null,
  onClose,
}) => {
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [people, setPeople] = useState<PickerPerson[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [memberFilter, setMemberFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingPeople, setLoadingPeople] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdBy, setCreatedBy] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<string | null>(channelVisibility);

  const effectiveVisibility = visibility ?? channelVisibility;
  const isMinistryChannel = String(effectiveVisibility || '').toLowerCase() === 'ministry';

  const memberIds = useMemo(() => members.map((m) => m.user_id), [members]);

  const filteredMembers = useMemo(() => {
    const q = memberFilter.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        String(m.user_role || '')
          .toLowerCase()
          .includes(q) ||
        String(m.source || '')
          .toLowerCase()
          .includes(q)
    );
  }, [members, memberFilter]);

  const loadMembers = async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `/api/vault?resource=community&subResource=chat&subResource=channel-members&channelId=${encodeURIComponent(channelId)}`,
        { headers }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || 'Unable to load members');
        setMembers([]);
        return;
      }
      setMembers(Array.isArray(data.members) ? data.members : []);
      setCreatedBy(data.created_by || null);
      setVisibility(data.visibility || null);
    } catch {
      setError('Unable to load members');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen || !channelId) return;
    setSelectedIds([]);
    setSearch('');
    setMemberFilter('');
    setVisibility(channelVisibility || null);
    loadMembers();
  }, [isOpen, channelId, channelVisibility]);

  useEffect(() => {
    if (!isOpen || !channelId) return;
    let cancelled = false;
    const t = window.setTimeout(async () => {
      setLoadingPeople(true);
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(
          `/api/vault?resource=community&subResource=chat&subResource=member-picker&channelId=${encodeURIComponent(channelId)}&q=${encodeURIComponent(search)}`,
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
  }, [isOpen, channelId, search]);

  if (!isOpen) return null;

  const addSelected = async () => {
    if (selectedIds.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(
        '/api/vault?resource=community&subResource=chat&subResource=channel-members',
        {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelId, userIds: selectedIds }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || 'Could not add members');
        return;
      }
      setMembers(Array.isArray(data.members) ? data.members : []);
      setSelectedIds([]);
    } catch {
      setError('Could not add members');
    } finally {
      setSaving(false);
    }
  };

  const removeMember = async (userId: string) => {
    setSaving(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `/api/vault?resource=community&subResource=chat&subResource=channel-members&channelId=${encodeURIComponent(channelId)}&userId=${encodeURIComponent(userId)}`,
        { method: 'DELETE', headers }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || 'Could not remove member');
        return;
      }
      setMembers(Array.isArray(data.members) ? data.members : []);
    } catch {
      setError('Could not remove member');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-burgundy/25 backdrop-blur-sm p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-3xl shadow-2xl border border-gray-100 max-h-[92dvh] flex flex-col">
        <div className="px-5 pt-5 pb-3 flex items-start justify-between border-b border-gray-50 shrink-0">
          <div>
            <p className="text-[9px] font-black text-gold uppercase tracking-[0.25em] mb-1">
              Channel Settings
            </p>
            <h3 className="font-black text-[#0d1a14] uppercase tracking-tight text-lg">Manage Members</h3>
            <p className="text-[11px] text-gray-400 font-medium mt-0.5 truncate">#{channelName}</p>
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

        <div className="px-5 py-4 overflow-y-auto flex-1 space-y-5">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] font-black text-burgundy uppercase tracking-[0.2em]">
                Current Members
              </label>
              <span className="text-[10px] font-bold text-gold uppercase tracking-widest">
                {members.length} {members.length === 1 ? 'member' : 'members'}
              </span>
            </div>
            {members.length > 4 ? (
              <p className="text-[10px] text-gray-300 font-semibold mb-2">
                Scroll to view all {members.length} members
              </p>
            ) : (
              <div className="mb-2" />
            )}
            <input
              value={memberFilter}
              onChange={(e) => setMemberFilter(e.target.value)}
              placeholder="Filter current members…"
              className="w-full h-9 mb-2 rounded-xl border border-gray-200 px-3 text-sm"
            />
            <div className="rounded-xl border border-gray-100 divide-y divide-gray-50 max-h-64 sm:max-h-80 overflow-y-auto overflow-x-hidden overscroll-contain shadow-inner bg-white">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-8 text-gray-300 text-[10px] font-black uppercase tracking-widest">
                  <Loader2 size={14} className="animate-spin" /> Loading
                </div>
              ) : filteredMembers.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-gray-300">
                  <Users size={18} />
                  <span className="text-[10px] font-black uppercase tracking-widest">No members</span>
                </div>
              ) : (
                filteredMembers.map((m) => {
                  const isOwner = m.is_creator || m.user_id === createdBy;
                  const isMinistrySync = String(m.source || '').toLowerCase() === 'ministry_sync';
                  const canTrash = !isOwner && !isMinistrySync;
                  return (
                    <div
                      key={m.user_id}
                      className="flex items-start gap-3 px-3 py-3 min-h-[48px]"
                    >
                      <div className="w-9 h-9 mt-0.5 rounded-xl bg-burgundy overflow-hidden shrink-0 flex items-center justify-center text-gold text-xs font-black">
                        {m.avatar_url ? (
                          <img src={m.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          (m.name || '?').charAt(0)
                        )}
                      </div>
                      <div className="min-w-0 flex-1 overflow-hidden">
                        <div className="flex items-start gap-1.5 flex-wrap">
                          <span className="text-[13px] font-bold text-[#0d1a14] break-words whitespace-normal leading-snug min-w-0">
                            {m.name}
                          </span>
                          <MembershipBadges member={m} createdBy={createdBy} />
                        </div>
                        <div className="mt-0.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider break-words whitespace-normal leading-snug">
                          {m.user_role || 'Member'}
                          {m.ministries?.length ? ` · ${m.ministries.slice(0, 2).join(' · ')}` : ''}
                        </div>
                        {isMinistrySync ? (
                          <div className="text-[9px] text-gray-300 font-medium mt-0.5">
                            Managed by ministry membership
                          </div>
                        ) : null}
                      </div>
                      {canTrash ? (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => removeMember(m.user_id)}
                          className="mt-0.5 p-2 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 disabled:opacity-40 shrink-0"
                          aria-label={`Remove ${m.name}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <ChannelMemberPicker
            people={people}
            selectedIds={selectedIds}
            onChange={setSelectedIds}
            loading={loadingPeople}
            search={search}
            onSearchChange={setSearch}
            excludeIds={memberIds}
            channelScoped
            allowSelectAll={!isMinistryChannel}
            label={
              isMinistryChannel ? 'Optional additional members' : 'Add Members'
            }
          />

          {error ? (
            <p className="text-[12px] font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
              {error}
            </p>
          ) : null}
        </div>

        <div className="px-5 py-4 border-t border-gray-50 flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-11 rounded-xl border border-gray-200 text-[11px] font-black uppercase tracking-widest text-gray-400 hover:text-burgundy"
          >
            Done
          </button>
          <button
            type="button"
            onClick={addSelected}
            disabled={saving || selectedIds.length === 0}
            className="flex-1 h-11 rounded-xl bg-burgundy text-gold text-[11px] font-black uppercase tracking-widest disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            Add Selected
          </button>
        </div>
      </div>
    </div>
  );
};

export default ManageChannelMembersModal;
