import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Home,
  Users,
  Search,
  Plus,
  MapPin,
  ChevronRight,
  Phone,
  ArrowLeft,
  UserX,
  Loader2,
  Printer,
  Pencil,
  Navigation,
  CheckCircle2,
  AlertCircle,
  X,
  Trash2,
  ChevronDown,
  User,
} from 'lucide-react';
import AccessDenied from '../../components/Layout/AccessDenied';
import { canPerform } from '../../lib/permissions';
import { useNav } from '../../App';
import { getAuthHeaders } from '../../lib/api';
import { formatAccountContact } from '../../api/_utils/authPhone';
import AskAdminTitleLink from '../../components/common/AskAdminTitleLink';
import { ageFromBirthday } from '../churchProfile/lib/memberAge';
import {
  findDuplicateGroups,
  findNameFixes,
  householdCompleteness,
  tidyHouseholdName,
} from '../../lib/householdCleanup';
import { Role } from '../../types';

type HouseholdRow = {
  id: string;
  name: string;
  headMemberId: string;
  head: string;
  memberCount: number;
  address: string;
  phone: string;
  bio: string;
  createdAt: string;
  membersList: any[];
};

type FamilyRole = 'Head' | 'Adult' | 'Child';

type EditForm = {
  name: string;
  address: string;
  phone: string;
  bio: string;
  head_member_id: string;
};

const EMPTY_FORM: EditForm = { name: '', address: '', phone: '', bio: '', head_member_id: '' };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function memberDisplayName(m: any): string {
  const first = String(m?.first_name || '').trim();
  const last = String(m?.last_name || '').trim();
  return `${first} ${last}`.trim() || 'Member';
}

function memberInitial(m: any): string {
  return String(m?.first_name || m?.last_name || '?').charAt(0).toUpperCase();
}

function isInHousehold(m: any, householdId: string, householdName: string): boolean {
  const hid = String(m?.household_id || '').trim();
  if (hid && hid === householdId) return true;
  if (!hid && householdName && String(m?.household_name || '').trim() === householdName) {
    return true;
  }
  return false;
}

function memberAge(m: any): number | undefined {
  return ageFromBirthday(m?.birthday);
}

function familyRole(m: any, headMemberId: string): FamilyRole {
  if (headMemberId && String(m?.id) === headMemberId) return 'Head';
  if (String(m?.role || '').trim().toLowerCase() === 'child') return 'Child';
  const age = memberAge(m);
  if (age != null && age < 18) return 'Child';
  return 'Adult';
}

const ROLE_ORDER: Record<FamilyRole, number> = { Head: 0, Adult: 1, Child: 2 };

const ROLE_CHIP: Record<FamilyRole, string> = {
  Head: 'bg-gold-light text-[#5C4300]',
  Adult: 'bg-[#F3EEF0] text-burgundy-dark',
  Child: 'bg-[#E8F0F7] text-[#1F4E79]',
};

function telHref(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '');
  return digits ? `tel:${digits}` : '';
}

function mapsHref(address: string): string {
  const a = address.trim();
  return a ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a)}` : '';
}

function formatAdded(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

type ListFilter = 'all' | 'head' | 'address' | 'dup' | 'empty';
type ListSort = 'name' | 'members' | 'attention' | 'recent';

const LIST_FILTERS: { id: ListFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'head', label: 'Needs head' },
  { id: 'address', label: 'No address' },
  { id: 'dup', label: 'Possible duplicates' },
  { id: 'empty', label: 'Empty' },
];

function householdInitial(name: string): string {
  return String(name || '?').replace(/^the\s+/i, '').charAt(0).toUpperCase() || '?';
}

function completenessOf(h: HouseholdRow): number {
  return householdCompleteness(h);
}

const HouseholdsPage: React.FC = () => {
  const { userRole } = useNav();
  const { id: routeId } = useParams();
  const navigate = useNavigate();
  const canViewRoster = canPerform(userRole as Role, 'people.view_roster');
  const canEdit = canPerform(userRole as Role, 'household.edit');

  const [households, setHouseholds] = useState<HouseholdRow[]>([]);
  const [allMembers, setAllMembers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editMode, setEditMode] = useState<'create' | 'edit'>('create');
  const [editForm, setEditForm] = useState<EditForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [memberPickerQuery, setMemberPickerQuery] = useState('');
  const [addMemberError, setAddMemberError] = useState<string | null>(null);

  const canMerge = canPerform(userRole as Role, 'household.delete');
  const [listFilter, setListFilter] = useState<ListFilter>('all');
  const [listSort, setListSort] = useState<ListSort>('name');
  const [suggestionsOpen, setSuggestionsOpen] = useState<boolean>(
    () => typeof window !== 'undefined' && window.innerWidth >= 768
  );
  const [mergeGroup, setMergeGroup] = useState<HouseholdRow[] | null>(null);
  const [mergeKeepId, setMergeKeepId] = useState('');
  const [tidyOpen, setTidyOpen] = useState(false);
  const [tidyPicked, setTidyPicked] = useState<string[]>([]);
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [cleanupError, setCleanupError] = useState<string | null>(null);
  const [cleanupNotice, setCleanupNotice] = useState<string | null>(null);

  const routeHouseholdId = useMemo(() => {
    const raw = String(routeId || '').trim();
    if (!raw || raw === 'view' || !UUID_RE.test(raw)) return null;
    return raw;
  }, [routeId]);

  const fetchData = useCallback(async () => {
    setLoadError(null);
    try {
      const headers = await getAuthHeaders();
      const [hhRes, memRes] = await Promise.all([
        fetch('/api/vault?resource=people&subResource=households', { headers }),
        fetch('/api/vault?resource=people', { headers }),
      ]);

      const hhData = await hhRes.json().catch(() => ({}));
      const memData = await memRes.json().catch(() => ({}));

      if (!hhRes.ok || !hhData.ok) {
        throw new Error(hhData.error || 'Could not load households');
      }

      const mapped: HouseholdRow[] = (hhData.households || []).map((h: any) => {
        const list = Array.isArray(h.members) ? h.members : [];
        const headMemberId = String(h.head_member_id || '').trim();
        const headMember = headMemberId
          ? list.find((m: any) => String(m.id) === headMemberId)
          : null;
        return {
          id: String(h.id),
          name: String(h.name || 'Untitled household'),
          headMemberId: headMember ? headMemberId : '',
          head: headMember ? memberDisplayName(headMember) : '',
          memberCount: list.length,
          address: String(h.address || '').trim(),
          phone: String(h.phone || '').trim(),
          bio: String(h.bio || '').trim(),
          createdAt: String(h.created_at || ''),
          membersList: list,
        };
      });
      setHouseholds(mapped);

      if (memRes.ok && memData.ok) {
        setAllMembers(Array.isArray(memData.members) ? memData.members : []);
      } else {
        setAllMembers([]);
      }
    } catch (err: any) {
      console.error('Failed to fetch households', err);
      setLoadError(err?.message || 'Failed to load households');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canViewRoster) {
      setIsLoading(false);
      return;
    }
    fetchData();
  }, [canViewRoster, fetchData]);

  const selectedHousehold = useMemo(() => {
    if (!routeHouseholdId) return null;
    return households.find((h) => h.id === routeHouseholdId) || null;
  }, [households, routeHouseholdId]);

  const invalidDetailRoute = Boolean(routeId) && !selectedHousehold && !isLoading;

  const householdMembers = useMemo(() => {
    if (!selectedHousehold) return [];
    const list =
      selectedHousehold.membersList.length > 0
        ? selectedHousehold.membersList
        : allMembers.filter((m) => isInHousehold(m, selectedHousehold.id, selectedHousehold.name));
    const headId = selectedHousehold.headMemberId;
    return [...list].sort((a, b) => {
      const ra = ROLE_ORDER[familyRole(a, headId)];
      const rb = ROLE_ORDER[familyRole(b, headId)];
      if (ra !== rb) return ra - rb;
      return memberDisplayName(a).localeCompare(memberDisplayName(b));
    });
  }, [selectedHousehold, allMembers]);

  const headMember = useMemo(() => {
    if (!selectedHousehold?.headMemberId) return null;
    return householdMembers.find((m) => String(m.id) === selectedHousehold.headMemberId) || null;
  }, [selectedHousehold, householdMembers]);

  const callNumber = useMemo(() => {
    if (!selectedHousehold) return '';
    return selectedHousehold.phone || String(headMember?.phone || '').trim();
  }, [selectedHousehold, headMember]);

  const availableMembers = useMemo(() => {
    if (!selectedHousehold) return [];
    const q = memberPickerQuery.trim().toLowerCase();
    return allMembers
      .filter((m) => !isInHousehold(m, selectedHousehold.id, selectedHousehold.name))
      .filter((m) => {
        if (!q) return true;
        const name = memberDisplayName(m).toLowerCase();
        const email = String(m.email || '').toLowerCase();
        const hh = String(m.household_name || '').toLowerCase();
        return name.includes(q) || email.includes(q) || hh.includes(q);
      })
      .sort((a, b) => memberDisplayName(a).localeCompare(memberDisplayName(b)));
  }, [allMembers, selectedHousehold, memberPickerQuery]);

  const filteredHouseholds = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return households;
    return households.filter((h) => {
      const hay = `${h.name} ${h.address} ${h.phone} ${h.head}`.toLowerCase();
      return hay.includes(q);
    });
  }, [households, searchQuery]);

  const duplicateGroups = useMemo(() => findDuplicateGroups(households), [households]);
  const duplicateIds = useMemo(
    () => new Set(duplicateGroups.flat().map((h) => h.id)),
    [duplicateGroups]
  );
  const nameFixes = useMemo(() => findNameFixes(households), [households]);

  const listStats = useMemo(
    () => ({
      people: households.reduce((n, h) => n + h.memberCount, 0),
      needsHead: households.filter((h) => h.memberCount > 0 && !h.headMemberId).length,
      noContact: households.filter((h) => !h.address && !h.phone).length,
    }),
    [households]
  );

  const filterTest = useCallback(
    (f: ListFilter, h: HouseholdRow) => {
      if (f === 'head') return h.memberCount > 0 && !h.headMemberId;
      if (f === 'address') return !h.address;
      if (f === 'dup') return duplicateIds.has(h.id);
      if (f === 'empty') return h.memberCount === 0;
      return true;
    },
    [duplicateIds]
  );

  const filterCounts = useMemo(() => {
    const out = {} as Record<ListFilter, number>;
    for (const f of LIST_FILTERS) out[f.id] = filteredHouseholds.filter((h) => filterTest(f.id, h)).length;
    return out;
  }, [filteredHouseholds, filterTest]);

  const visibleHouseholds = useMemo(() => {
    const list = filteredHouseholds.filter((h) => filterTest(listFilter, h));
    const byName = (a: HouseholdRow, b: HouseholdRow) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    return [...list].sort((a, b) => {
      if (listSort === 'members') return b.memberCount - a.memberCount || byName(a, b);
      if (listSort === 'attention') return completenessOf(a) - completenessOf(b) || byName(a, b);
      if (listSort === 'recent') return String(b.createdAt).localeCompare(String(a.createdAt)) || byName(a, b);
      return byName(a, b);
    });
  }, [filteredHouseholds, filterTest, listFilter, listSort]);

  const openMerge = (group: HouseholdRow[]) => {
    setCleanupError(null);
    setMergeKeepId(group[0]?.id || '');
    setMergeGroup(group);
  };

  const closeMerge = () => {
    if (cleanupBusy) return;
    setMergeGroup(null);
    setCleanupError(null);
  };

  const confirmMerge = async () => {
    if (!mergeGroup || cleanupBusy) return;
    const keeper = mergeGroup.find((h) => h.id === mergeKeepId) || mergeGroup[0];
    const others = mergeGroup.filter((h) => h.id !== keeper.id);
    setCleanupBusy(true);
    setCleanupError(null);
    try {
      const headers = { ...(await getAuthHeaders()), 'Content-Type': 'application/json' };
      const res = await fetch('/api/vault?resource=people&subResource=households&action=merge', {
        method: 'POST',
        headers,
        body: JSON.stringify({ keepId: keeper.id, mergeIds: others.map((h) => h.id) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        throw new Error(data.error || 'Could not merge these households.');
      }
      const moved = Number(data.result?.members_moved ?? others.reduce((n, h) => n + h.memberCount, 0));
      setMergeGroup(null);
      setCleanupNotice(
        `Merged into ${keeper.name}. ${moved} ${moved === 1 ? 'member' : 'members'} moved.`
      );
      await fetchData();
    } catch (err: any) {
      console.error(err);
      setCleanupError(err?.message || 'Could not merge these households.');
    } finally {
      setCleanupBusy(false);
    }
  };

  const openTidy = () => {
    setCleanupError(null);
    setTidyPicked(nameFixes.map((f) => f.id));
    setTidyOpen(true);
  };

  const closeTidy = () => {
    if (cleanupBusy) return;
    setTidyOpen(false);
    setCleanupError(null);
  };

  const confirmTidy = async () => {
    if (cleanupBusy || tidyPicked.length === 0) return;
    setCleanupBusy(true);
    setCleanupError(null);
    const failed: string[] = [];
    let done = 0;
    try {
      const headers = { ...(await getAuthHeaders()), 'Content-Type': 'application/json' };
      for (const fix of nameFixes.filter((f) => tidyPicked.includes(f.id))) {
        const res = await fetch('/api/vault?resource=people&subResource=households', {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ id: fix.id, name: fix.to }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.ok === false) failed.push(`${fix.from}: ${data.error || 'not saved'}`);
        else done += 1;
      }
      await fetchData();
      if (failed.length > 0) {
        setCleanupError(`${done} renamed. These didn't save — ${failed.join('; ')}`);
      } else {
        setTidyOpen(false);
        setCleanupNotice(`${done} ${done === 1 ? 'name' : 'names'} tidied.`);
      }
    } catch (err: any) {
      console.error(err);
      setCleanupError(err?.message || 'Could not rename households.');
    } finally {
      setCleanupBusy(false);
    }
  };

  const openCreate = () => {
    setEditMode('create');
    setEditForm(EMPTY_FORM);
    setFormError(null);
    setIsEditModalOpen(true);
  };

  const openEdit = () => {
    if (!selectedHousehold) return;
    setEditMode('edit');
    setEditForm({
      name: selectedHousehold.name,
      address: selectedHousehold.address,
      phone: selectedHousehold.phone,
      bio: selectedHousehold.bio,
      head_member_id: selectedHousehold.headMemberId,
    });
    setFormError(null);
    setIsEditModalOpen(true);
  };

  const closeEdit = () => {
    if (saving) return;
    setIsEditModalOpen(false);
    setFormError(null);
  };

  const submitHousehold = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const name = editForm.name.trim();
    if (!name) {
      setFormError('Please enter a household name.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const headers = {
        ...(await getAuthHeaders()),
        'Content-Type': 'application/json',
      };
      const isEdit = editMode === 'edit' && selectedHousehold;
      const base = {
        name,
        address: editForm.address.trim(),
        phone: editForm.phone.trim(),
        bio: editForm.bio.trim(),
      };
      const res = await fetch('/api/vault?resource=people&subResource=households', {
        method: isEdit ? 'PATCH' : 'POST',
        headers,
        body: JSON.stringify(
          isEdit
            ? { id: selectedHousehold!.id, ...base, head_member_id: editForm.head_member_id || null }
            : base
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        throw new Error(data.error || 'Could not save household. Please try again.');
      }
      setIsEditModalOpen(false);
      await fetchData();
      if (!isEdit && data.household?.id) {
        navigate(`/households/${data.household.id}`);
      }
    } catch (err: any) {
      console.error(err);
      setFormError(err?.message || 'Could not save household. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!confirm('Remove this member from the household?')) return;
    try {
      const headers = {
        ...(await getAuthHeaders()),
        'Content-Type': 'application/json',
      };
      const res = await fetch('/api/vault?resource=people', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ id: memberId, householdName: '' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        throw new Error(data.error || 'Failed to remove member');
      }
      await fetchData();
    } catch (err: any) {
      console.error(err);
      alert(err?.message || 'Failed to remove member');
    }
  };

  const closeAddMember = () => {
    setIsAddMemberModalOpen(false);
    setSelectedMemberId('');
    setMemberPickerQuery('');
    setAddMemberError(null);
  };

  const handleAddMember = async () => {
    if (!selectedMemberId || !selectedHousehold || saving) return;
    setSaving(true);
    setAddMemberError(null);
    try {
      const headers = {
        ...(await getAuthHeaders()),
        'Content-Type': 'application/json',
      };
      const res = await fetch('/api/vault?resource=people', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          id: selectedMemberId,
          householdName: selectedHousehold.name,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        throw new Error(data.error || 'Failed to add member');
      }
      closeAddMember();
      await fetchData();
    } catch (err: any) {
      console.error(err);
      setAddMemberError(err?.message || 'Failed to add member');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteHousehold = async () => {
    if (!selectedHousehold) return;
    if (
      !confirm(
        `Delete “${selectedHousehold.name}”? Members will not be deleted, but their household assignment will be cleared.`
      )
    ) {
      return;
    }
    try {
      const headers = {
        ...(await getAuthHeaders()),
        'Content-Type': 'application/json',
      };
      const res = await fetch('/api/vault?resource=people&subResource=households', {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ id: selectedHousehold.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        throw new Error(data.error || 'Failed to delete household');
      }
      navigate('/households');
      await fetchData();
    } catch (err: any) {
      console.error(err);
      alert(err?.message || 'Error deleting household');
    }
  };

  const handlePrintLabel = () => {
    if (!selectedHousehold) return;
    const printWindow = window.open('', '_blank', 'width=400,height=300');
    if (!printWindow) return;
    const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const safeName = esc(selectedHousehold.name);
    const safeAddress = esc(selectedHousehold.address || '');
    const safePhone = esc(selectedHousehold.phone || '');
    printWindow.document.write(`
      <html>
        <head>
          <title>Print Label - ${safeName}</title>
          <style>
            body { font-family: sans-serif; padding: 20px; text-align: center; }
            .label { border: 2px solid #000; padding: 20px; border-radius: 10px; display: inline-block; }
            h2 { margin: 0 0 10px; font-size: 18px; }
            p { margin: 5px 0; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="label">
            <h2>${safeName}</h2>
            <p>${safeAddress}</p>
            <p>${safePhone}</p>
          </div>
          <script>window.onload = function() { window.print(); window.close(); }</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const inputClass =
    'w-full min-h-[48px] px-4 rounded-2xl border border-[#DCD2BE] bg-white text-base font-semibold text-ink outline-none focus:border-burgundy focus:ring-2 focus:ring-burgundy/15';
  const labelClass = 'block text-xs font-extrabold uppercase tracking-wider text-[#6B5A4E] mb-1.5';

  const renameMemberCount =
    editMode === 'edit' && selectedHousehold && editForm.name.trim() !== selectedHousehold.name
      ? householdMembers.length
      : 0;

  const editModal = isEditModalOpen ? (
    <div
      className="fixed inset-0 z-50 bg-ink/45 flex items-end sm:items-center justify-center sm:p-4"
      onClick={closeEdit}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="household-edit-title"
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full sm:max-w-md rounded-t-[28px] sm:rounded-[28px] px-5 pt-3 pb-7 sm:p-7 shadow-2xl max-h-[92vh] overflow-y-auto animate-in slide-in-from-bottom-4 sm:zoom-in-95"
      >
        <div className="sm:hidden mx-auto mb-3 h-1.5 w-10 rounded-full bg-[#E2D9C6]" />
        <div className="flex items-center justify-between mb-4">
          <h3 id="household-edit-title" className="font-['Cormorant_Garamond',serif] text-[28px] font-bold text-ink leading-tight">
            {editMode === 'edit' ? 'Edit household' : 'New household'}
          </h3>
          <button
            type="button"
            onClick={closeEdit}
            aria-label="Close"
            className="w-11 h-11 rounded-2xl bg-[#F6F1E6] text-ink flex items-center justify-center"
          >
            <X size={18} />
          </button>
        </div>

        {formError && (
          <div
            role="alert"
            className="mb-4 flex gap-2.5 rounded-2xl border border-[#DDE8E1] bg-[#FCEDEE] px-3.5 py-3"
          >
            <AlertCircle size={18} className="shrink-0 mt-0.5 text-[#244335]" />
            <span className="text-sm font-semibold leading-snug text-[#1c3429]">{formError}</span>
          </div>
        )}

        <form onSubmit={submitHousehold} className="space-y-4">
          <div>
            <label htmlFor="hh-name" className={labelClass}>
              Household name
            </label>
            <input
              id="hh-name"
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              required
              placeholder="e.g. The Smith Household"
              className={inputClass}
            />
            {renameMemberCount > 0 && (
              <p className="mt-1.5 text-xs font-medium text-[#6B5A4E]">
                Renaming updates all {renameMemberCount}{' '}
                {renameMemberCount === 1 ? 'member' : 'members'} automatically.
              </p>
            )}
          </div>

          {editMode === 'edit' && (
            <div>
              <label htmlFor="hh-head" className={labelClass}>
                Head of household
              </label>
              <select
                id="hh-head"
                value={editForm.head_member_id}
                onChange={(e) => setEditForm({ ...editForm, head_member_id: e.target.value })}
                disabled={householdMembers.length === 0}
                className={`${inputClass} disabled:bg-gray-50 disabled:text-gray-400`}
              >
                <option value="">
                  {householdMembers.length === 0 ? 'Add members first' : 'Not set'}
                </option>
                {householdMembers
                  .filter((m) => familyRole(m, '') !== 'Child')
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {memberDisplayName(m)}
                    </option>
                  ))}
              </select>
            </div>
          )}

          <div>
            <label htmlFor="hh-address" className={labelClass}>
              Address
            </label>
            <input
              id="hh-address"
              value={editForm.address}
              onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
              placeholder="123 Main St, City, MA 00000"
              autoComplete="street-address"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="hh-phone" className={labelClass}>
              Home phone
            </label>
            <input
              id="hh-phone"
              type="tel"
              value={editForm.phone}
              onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
              placeholder="(555) 555-5555"
              autoComplete="tel"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="hh-note" className={labelClass}>
              Pastoral note
            </label>
            <textarea
              id="hh-note"
              value={editForm.bio}
              onChange={(e) => setEditForm({ ...editForm, bio: e.target.value })}
              placeholder="Care notes, prayer needs, visits…"
              className={`${inputClass} py-3 resize-none`}
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <button
              type="button"
              onClick={closeEdit}
              className="min-h-[52px] rounded-2xl bg-[#F6F1E6] text-ink font-extrabold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="min-h-[52px] rounded-2xl bg-burgundy text-gold-light font-extrabold shadow-lg shadow-burgundy/20 disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {saving && <Loader2 size={16} className="animate-spin" />}
              {saving ? 'Saving…' : editMode === 'edit' ? 'Save changes' : 'Create household'}
            </button>
          </div>
        </form>
      </div>
    </div>
  ) : null;

  if (!canViewRoster) {
    return <AccessDenied />;
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-gray-400">
        <Loader2 className="animate-spin text-burgundy" size={28} />
        <p className="text-sm font-semibold">Loading households…</p>
      </div>
    );
  }

  if (selectedHousehold) {
    const callHref = telHref(callNumber);
    const directionsHref = mapsHref(selectedHousehold.address);
    const added = formatAdded(selectedHousehold.createdAt);
    const actionBase =
      'flex flex-col items-center justify-center gap-1 min-h-[56px] px-2 py-2.5 rounded-2xl text-xs font-bold transition-all';
    const actionIdle = `${actionBase} bg-white/10 text-gold-cream hover:bg-white/20`;
    const actionDisabled = `${actionBase} bg-white/5 text-gold-cream/40 cursor-not-allowed`;

    return (
      <div className="space-y-5 md:space-y-6 animate-in fade-in slide-in-from-right-4 duration-500 pb-12">
        {editModal}

        {isAddMemberModalOpen && (
          <div
            className="fixed inset-0 z-50 bg-ink/45 flex items-end sm:items-center justify-center sm:p-4"
            onClick={closeAddMember}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="household-add-title"
              onClick={(e) => e.stopPropagation()}
              className="bg-white w-full sm:max-w-md rounded-t-[28px] sm:rounded-[28px] px-5 pt-3 pb-7 sm:p-7 shadow-2xl animate-in slide-in-from-bottom-4 sm:zoom-in-95"
            >
              <div className="sm:hidden mx-auto mb-3 h-1.5 w-10 rounded-full bg-[#E2D9C6]" />
              <h3 id="household-add-title" className="font-['Cormorant_Garamond',serif] text-[28px] font-bold text-ink leading-tight mb-1">
                Add member
              </h3>
              <p className="text-sm text-[#6B5A4E] mb-5">
                Assign a member to <span className="font-bold text-ink">{selectedHousehold.name}</span>.
                They will be moved from any current household.
              </p>
              {addMemberError && (
                <div
                  role="alert"
                  className="mb-4 flex gap-2.5 rounded-2xl border border-[#DDE8E1] bg-[#FCEDEE] px-3.5 py-3"
                >
                  <AlertCircle size={18} className="shrink-0 mt-0.5 text-[#244335]" />
                  <span className="text-sm font-semibold text-[#1c3429]">{addMemberError}</span>
                </div>
              )}
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                  <input
                    value={memberPickerQuery}
                    onChange={(e) => setMemberPickerQuery(e.target.value)}
                    placeholder="Search members…"
                    aria-label="Search members"
                    className={`${inputClass} pl-10`}
                  />
                </div>
                <select
                  value={selectedMemberId}
                  onChange={(e) => setSelectedMemberId(e.target.value)}
                  aria-label="Member"
                  className={inputClass}
                >
                  <option value="">Select a member…</option>
                  {availableMembers.map((m) => {
                    const currentHH =
                      m.household_name && m.household_name !== 'Unassigned'
                        ? m.household_name
                        : null;
                    return (
                      <option key={m.id} value={m.id}>
                        {memberDisplayName(m)}
                        {currentHH ? ` (currently: ${currentHH})` : ''}
                      </option>
                    );
                  })}
                </select>
                {availableMembers.length === 0 && (
                  <p className="text-xs text-gray-400 italic">No matching members available.</p>
                )}
                <div className="grid grid-cols-2 gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={closeAddMember}
                    className="min-h-[52px] rounded-2xl bg-[#F6F1E6] text-ink font-extrabold"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleAddMember}
                    disabled={!selectedMemberId || saving}
                    className="min-h-[52px] rounded-2xl bg-burgundy text-gold-light font-extrabold shadow-lg shadow-burgundy/20 disabled:opacity-50"
                  >
                    {saving ? 'Adding…' : 'Add member'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Top bar */}
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => navigate('/households')}
            className="flex items-center gap-1.5 min-h-[44px] text-burgundy font-bold text-sm hover:text-burgundy-dark"
          >
            <ArrowLeft size={18} />
            Households
          </button>
          <div className="flex items-center gap-2">
            {canPerform(userRole, 'household.delete') && (
              <button
                type="button"
                onClick={handleDeleteHousehold}
                aria-label="Delete household"
                className="hidden md:flex items-center gap-2 min-h-[44px] px-4 rounded-2xl bg-white border border-red-100 text-red-600 font-bold text-sm hover:bg-red-50"
              >
                <Trash2 size={16} />
                Delete
              </button>
            )}
            <button
              type="button"
              onClick={handlePrintLabel}
              className="hidden md:flex items-center gap-2 min-h-[44px] px-4 rounded-2xl bg-white border border-[#DCD2BE] text-ink font-bold text-sm hover:border-gold"
            >
              <Printer size={16} />
              Print label
            </button>
            {canEdit && (
              <button
                type="button"
                onClick={openEdit}
                className="flex items-center gap-2 min-h-[44px] px-4 md:px-5 rounded-2xl bg-burgundy text-gold-light font-extrabold text-sm shadow-lg shadow-burgundy/20 hover:brightness-110"
              >
                <Pencil size={16} />
                <span className="md:hidden">Edit</span>
                <span className="hidden md:inline">Edit household</span>
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-5 md:gap-6 items-start">
          {/* Left column: hero + contact + note */}
          <aside className="w-full lg:w-[360px] lg:shrink-0 space-y-4">
            <section className="rounded-[24px] bg-burgundy text-gold-cream p-5 md:p-6 space-y-4 shadow-xl shadow-burgundy/15">
              <div className="flex items-center gap-3.5">
                <div className="w-14 h-14 rounded-2xl bg-gold text-ink flex items-center justify-center font-['Cormorant_Garamond',serif] text-[32px] font-bold shrink-0">
                  {selectedHousehold.name.replace(/^the\s+/i, '').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h1 className="font-['Cormorant_Garamond',serif] text-[28px] font-bold leading-tight break-words">
                    {selectedHousehold.name}
                  </h1>
                  <p className="text-[13px] font-semibold text-gold-light">
                    {householdMembers.length} {householdMembers.length === 1 ? 'member' : 'members'}
                    {' · '}
                    {headMember ? `Head: ${memberDisplayName(headMember)}` : 'No head set'}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {callHref ? (
                  <a href={callHref} className={actionIdle}>
                    <Phone size={18} />
                    Call
                  </a>
                ) : (
                  <span className={actionDisabled} aria-disabled="true" title="No phone on file">
                    <Phone size={18} />
                    Call
                  </span>
                )}
                {directionsHref ? (
                  <a href={directionsHref} target="_blank" rel="noopener noreferrer" className={actionIdle}>
                    <Navigation size={18} />
                    Directions
                  </a>
                ) : (
                  <span className={actionDisabled} aria-disabled="true" title="No address on file">
                    <Navigation size={18} />
                    Directions
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => navigate('/events/check-someone-in')}
                  className={`${actionBase} bg-gold text-ink font-extrabold hover:brightness-105`}
                >
                  <CheckCircle2 size={18} />
                  Check in all
                </button>
              </div>
            </section>

            <section className="rounded-[20px] bg-white border border-[#EFE8D8] p-5 space-y-4">
              <div className="flex gap-3 items-start">
                <MapPin size={18} className="text-burgundy shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#6B5A4E]">Address</p>
                  {selectedHousehold.address ? (
                    <p className="text-[15px] font-semibold text-[#3A2A22] break-words">
                      {selectedHousehold.address}
                    </p>
                  ) : canEdit ? (
                    <button type="button" onClick={openEdit} className="text-[15px] font-bold text-burgundy hover:underline">
                      + Add an address
                    </button>
                  ) : (
                    <p className="text-[15px] font-medium text-gray-400">No address on file</p>
                  )}
                </div>
              </div>
              <div className="h-px bg-[#F2ECDF]" />
              <div className="flex gap-3 items-start">
                <Phone size={18} className="text-burgundy shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#6B5A4E]">Home phone</p>
                  {selectedHousehold.phone ? (
                    <p className="text-[15px] font-semibold text-[#3A2A22]">{selectedHousehold.phone}</p>
                  ) : canEdit ? (
                    <button type="button" onClick={openEdit} className="text-[15px] font-bold text-burgundy hover:underline">
                      + Add a phone number
                    </button>
                  ) : (
                    <p className="text-[15px] font-medium text-gray-400">No phone on file</p>
                  )}
                </div>
              </div>
              {added && (
                <>
                  <div className="h-px bg-[#F2ECDF] hidden lg:block" />
                  <div className="hidden lg:block">
                    <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#6B5A4E]">Added</p>
                    <p className="text-[15px] font-semibold text-[#3A2A22]">{added}</p>
                  </div>
                </>
              )}
            </section>

            <section className="hidden lg:block rounded-[20px] bg-gold-cream border border-[#EADFB8] p-5 space-y-1.5">
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-burgundy">Pastoral note</p>
              <p className="text-sm font-medium leading-relaxed text-[#6B5A4E] whitespace-pre-line">
                {selectedHousehold.bio || 'No note yet. Add care notes, prayer needs, or visit history from Edit.'}
              </p>
            </section>
          </aside>

          {/* Right column: members */}
          <section className="w-full min-w-0 flex-1 space-y-4">
            <div className="lg:rounded-[24px] lg:bg-white lg:border lg:border-[#EFE8D8] lg:overflow-hidden">
              <div className="flex items-center justify-between lg:px-6 lg:py-3 lg:border-b lg:border-[#F2ECDF] lg:bg-gold-cream">
                <h2 className="text-lg font-extrabold text-ink">Family members</h2>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setIsAddMemberModalOpen(true)}
                    className="flex items-center gap-1 min-h-[44px] px-1 text-[13px] font-extrabold text-burgundy hover:text-burgundy-dark"
                  >
                    <Plus size={16} />
                    Add member
                  </button>
                )}
              </div>

              {householdMembers.length === 0 ? (
                <div className="text-center py-12 text-gray-400 bg-white rounded-[20px] border border-[#EFE8D8] lg:border-0 mt-2 lg:mt-0">
                  <Users size={28} className="mx-auto mb-3 opacity-40" />
                  <p className="text-sm font-semibold">No members assigned yet</p>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setIsAddMemberModalOpen(true)}
                      className="mt-3 min-h-[44px] text-sm font-extrabold text-burgundy hover:underline"
                    >
                      Add the first member
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {/* Phone / tablet: cards */}
                  <div className="lg:hidden space-y-2.5 mt-1">
                    {householdMembers.map((m: any) => {
                      const fr = familyRole(m, selectedHousehold.headMemberId);
                      const age = memberAge(m);
                      const contact =
                        fr === 'Child'
                          ? age != null
                            ? `Age ${age}`
                            : 'Parent-managed'
                          : formatAccountContact(m.email, m.phone) || m.email || m.phone || 'No contact on file';
                      return (
                        <div
                          key={m.id}
                          className="flex items-center gap-3 p-3 rounded-[18px] bg-white border border-[#EFE8D8]"
                        >
                          <div
                            className={`w-11 h-11 rounded-[14px] flex items-center justify-center font-extrabold shrink-0 ${
                              fr === 'Child' ? 'bg-[#EFE8D8] text-burgundy' : 'bg-burgundy text-gold'
                            }`}
                          >
                            {memberInitial(m)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[15px] font-extrabold text-ink truncate">{memberDisplayName(m)}</p>
                            <p className="text-xs font-medium text-[#6B5A4E] truncate">{contact}</p>
                          </div>
                          <span className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-extrabold ${ROLE_CHIP[fr]}`}>
                            {fr}
                          </span>
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => handleRemoveMember(m.id)}
                              aria-label={`Remove ${memberDisplayName(m)} from household`}
                              className="shrink-0 w-11 h-11 -mr-1 flex items-center justify-center text-gray-400 hover:text-red-600"
                            >
                              <UserX size={18} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Desktop: table */}
                  <div className="hidden lg:block overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="text-[11px] font-extrabold uppercase tracking-wider text-[#6B5A4E]">
                          <th className="px-6 py-3">Name</th>
                          <th className="px-4 py-3">Role</th>
                          <th className="px-4 py-3">Contact</th>
                          <th className="px-6 py-3">
                            <span className="sr-only">Actions</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {householdMembers.map((m: any) => {
                          const fr = familyRole(m, selectedHousehold.headMemberId);
                          const age = memberAge(m);
                          const contact =
                            fr === 'Child'
                              ? age != null
                                ? `Age ${age} · Parent-managed`
                                : 'Parent-managed'
                              : formatAccountContact(m.email, m.phone) || m.email || m.phone || '—';
                          return (
                            <tr key={m.id} className="border-t border-[#F2ECDF]">
                              <td className="px-6 py-3.5">
                                <div className="flex items-center gap-3">
                                  <div
                                    className={`w-9 h-9 rounded-xl flex items-center justify-center font-extrabold text-sm shrink-0 ${
                                      fr === 'Child' ? 'bg-[#EFE8D8] text-burgundy' : 'bg-burgundy text-gold'
                                    }`}
                                  >
                                    {memberInitial(m)}
                                  </div>
                                  <span className="font-extrabold text-ink">{memberDisplayName(m)}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3.5">
                                <span className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold ${ROLE_CHIP[fr]}`}>
                                  {fr}
                                </span>
                              </td>
                              <td className="px-4 py-3.5 text-[#6B5A4E]">{contact}</td>
                              <td className="px-6 py-3.5 text-right">
                                {canEdit && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveMember(m.id)}
                                    className="min-h-[44px] px-2 font-bold text-[#8A7A6E] hover:text-red-600"
                                  >
                                    Remove
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            {/* Phone: note under members */}
            <section className="lg:hidden rounded-[20px] bg-gold-cream border border-[#EADFB8] p-5 space-y-1.5">
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-burgundy">Pastoral note</p>
              <p className="text-sm font-medium leading-relaxed text-[#6B5A4E] whitespace-pre-line">
                {selectedHousehold.bio || 'No note yet. Add care notes, prayer needs, or visit history from Edit.'}
              </p>
            </section>

            <div className="md:hidden flex gap-2">
              <button
                type="button"
                onClick={handlePrintLabel}
                className="flex-1 flex items-center justify-center gap-2 min-h-[48px] rounded-2xl bg-white border border-[#DCD2BE] text-ink font-bold text-sm"
              >
                <Printer size={16} />
                Print label
              </button>
              {canPerform(userRole, 'household.delete') && (
                <button
                  type="button"
                  onClick={handleDeleteHousehold}
                  className="flex-1 flex items-center justify-center gap-2 min-h-[48px] rounded-2xl bg-white border border-red-100 text-red-600 font-bold text-sm"
                >
                  <Trash2 size={16} />
                  Delete
                </button>
              )}
            </div>
          </section>
        </div>
      </div>
    );
  }

  const merging = mergeGroup !== null;
  const mergeKeeper = merging ? mergeGroup!.find((h) => h.id === mergeKeepId) || mergeGroup![0] : null;
  const mergeOthers = merging ? mergeGroup!.filter((h) => h.id !== mergeKeeper!.id) : [];
  const mergeMovingMembers = mergeOthers.reduce((n, h) => n + h.memberCount, 0);

  const mergeModal = merging ? (
    <div className="fixed inset-0 z-50 bg-ink/45 flex items-end sm:items-center justify-center sm:p-4" onClick={closeMerge}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="household-merge-title"
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full sm:max-w-lg rounded-t-[28px] sm:rounded-[28px] px-5 pt-3 pb-7 sm:p-7 shadow-2xl max-h-[92vh] overflow-y-auto animate-in slide-in-from-bottom-4 sm:zoom-in-95"
      >
        <div className="sm:hidden mx-auto mb-3 h-1.5 w-10 rounded-full bg-[#E2D9C6]" />
        <div className="flex items-center justify-between mb-1">
          <h3 id="household-merge-title" className="font-['Cormorant_Garamond',serif] text-[28px] font-bold text-ink leading-tight">
            Merge households
          </h3>
          <button type="button" onClick={closeMerge} aria-label="Close" className="w-11 h-11 rounded-2xl bg-[#F6F1E6] text-ink flex items-center justify-center">
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-[#6B5A4E] mb-4">Choose the household to keep. Everyone in the others moves into it.</p>

        {cleanupError && (
          <div role="alert" className="mb-4 flex gap-2.5 rounded-2xl border border-[#DDE8E1] bg-[#FCEDEE] px-3.5 py-3">
            <AlertCircle size={18} className="shrink-0 mt-0.5 text-[#244335]" />
            <span className="text-sm font-semibold leading-snug text-[#1c3429]">{cleanupError}</span>
          </div>
        )}

        <fieldset className="space-y-2">
          <legend className="sr-only">Household to keep</legend>
          {mergeGroup!.map((h) => {
            const selected = h.id === mergeKeeper!.id;
            return (
              <label
                key={h.id}
                className={`flex items-center gap-3 p-3.5 rounded-2xl border cursor-pointer transition-colors ${
                  selected ? 'border-burgundy bg-[#FBF5F6]' : 'border-[#EFE8D8] bg-white'
                }`}
              >
                <input
                  type="radio"
                  name="keep-household"
                  value={h.id}
                  checked={selected}
                  onChange={() => setMergeKeepId(h.id)}
                  className="w-5 h-5 accent-[#1d372c] shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-extrabold text-ink truncate">{h.name}</p>
                  <p className="text-xs font-medium text-[#6B5A4E] truncate">
                    {h.memberCount} {h.memberCount === 1 ? 'member' : 'members'}
                    {h.address ? ` · ${h.address}` : ''}
                    {h.phone ? ` · ${h.phone}` : ''}
                  </p>
                </div>
                <span
                  className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-extrabold ${
                    selected ? 'bg-burgundy text-gold-light' : 'bg-[#F1EEE8] text-[#5E5348]'
                  }`}
                >
                  {selected ? 'Keep' : 'Merge in'}
                </span>
              </label>
            );
          })}
        </fieldset>

        <div className="mt-4 rounded-2xl bg-gold-cream border border-[#EADFB8] p-4 text-sm text-[#3A2A22] space-y-1">
          <p className="font-bold">What will happen</p>
          <p>
            {mergeMovingMembers} {mergeMovingMembers === 1 ? 'member moves' : 'members move'} into{' '}
            <span className="font-bold">{mergeKeeper!.name}</span>.
          </p>
          <p>
            {mergeOthers.length === 1 ? `“${mergeOthers[0].name}” is` : `${mergeOthers.length} households are`} removed afterwards.
          </p>
          <p>Any missing address, phone or note is filled in from the merged households.</p>
        </div>

        <div className="grid grid-cols-2 gap-2.5 pt-4">
          <button type="button" onClick={closeMerge} className="min-h-[52px] rounded-2xl bg-[#F6F1E6] text-ink font-extrabold">
            Cancel
          </button>
          <button
            type="button"
            onClick={confirmMerge}
            disabled={cleanupBusy}
            className="min-h-[52px] rounded-2xl bg-burgundy text-gold-light font-extrabold shadow-lg shadow-burgundy/20 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {cleanupBusy && <Loader2 size={16} className="animate-spin" />}
            {cleanupBusy ? 'Merging…' : 'Merge households'}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  const tidyModal = tidyOpen ? (
    <div className="fixed inset-0 z-50 bg-ink/45 flex items-end sm:items-center justify-center sm:p-4" onClick={closeTidy}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="household-tidy-title"
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full sm:max-w-lg rounded-t-[28px] sm:rounded-[28px] px-5 pt-3 pb-7 sm:p-7 shadow-2xl max-h-[92vh] overflow-y-auto animate-in slide-in-from-bottom-4 sm:zoom-in-95"
      >
        <div className="sm:hidden mx-auto mb-3 h-1.5 w-10 rounded-full bg-[#E2D9C6]" />
        <div className="flex items-center justify-between mb-1">
          <h3 id="household-tidy-title" className="font-['Cormorant_Garamond',serif] text-[28px] font-bold text-ink leading-tight">
            Tidy names
          </h3>
          <button type="button" onClick={closeTidy} aria-label="Close" className="w-11 h-11 rounded-2xl bg-[#F6F1E6] text-ink flex items-center justify-center">
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-[#6B5A4E] mb-4">Untick any name you want to leave as it is. Members follow the new name.</p>

        {cleanupError && (
          <div role="alert" className="mb-4 flex gap-2.5 rounded-2xl border border-[#DDE8E1] bg-[#FCEDEE] px-3.5 py-3">
            <AlertCircle size={18} className="shrink-0 mt-0.5 text-[#244335]" />
            <span className="text-sm font-semibold leading-snug text-[#1c3429]">{cleanupError}</span>
          </div>
        )}

        <div className="space-y-2">
          {nameFixes.map((f) => {
            const checked = tidyPicked.includes(f.id);
            return (
              <label
                key={f.id}
                className={`flex items-center gap-3 p-3.5 rounded-2xl border cursor-pointer ${
                  checked ? 'border-burgundy bg-[#FBF5F6]' : 'border-[#EFE8D8] bg-white'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    setTidyPicked((prev) => (prev.includes(f.id) ? prev.filter((x) => x !== f.id) : [...prev, f.id]))
                  }
                  className="w-5 h-5 accent-[#1d372c] shrink-0"
                />
                <div className="min-w-0 flex-1 text-[15px]">
                  <span className="text-[#6B5A4E] line-through decoration-[#C9BBA8]">{f.from}</span>
                  <span className="mx-2 text-[#8A7A6E]" aria-hidden="true">→</span>
                  <span className="font-extrabold text-ink">{f.to}</span>
                </div>
              </label>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-2.5 pt-4">
          <button type="button" onClick={closeTidy} className="min-h-[52px] rounded-2xl bg-[#F6F1E6] text-ink font-extrabold">
            Cancel
          </button>
          <button
            type="button"
            onClick={confirmTidy}
            disabled={cleanupBusy || tidyPicked.length === 0}
            className="min-h-[52px] rounded-2xl bg-burgundy text-gold-light font-extrabold shadow-lg shadow-burgundy/20 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {cleanupBusy && <Loader2 size={16} className="animate-spin" />}
            {cleanupBusy ? 'Renaming…' : `Rename ${tidyPicked.length}`}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  const statTile = (label: string, value: number, tone: 'brand' | 'plain' | 'warn') => (
    <div
      className={`flex-1 min-w-[140px] rounded-[20px] px-4 py-3.5 md:px-5 md:py-4 flex flex-col gap-0.5 ${
        tone === 'brand' ? 'bg-burgundy text-gold-cream' : 'bg-white border border-[#EFE8D8]'
      }`}
    >
      <span className={`text-xs font-bold ${tone === 'brand' ? 'text-gold-light' : 'text-[#6B5A4E]'}`}>{label}</span>
      <span
        className={`font-['Cormorant_Garamond',serif] text-[32px] md:text-[40px] font-bold leading-none ${
          tone === 'warn' && value > 0 ? 'text-[#7A5200]' : tone === 'brand' ? '' : 'text-ink'
        }`}
      >
        {value}
      </span>
    </div>
  );

  const suggestionCount = (canMerge ? duplicateGroups.length : 0) + (canEdit && nameFixes.length > 0 ? 1 : 0);

  return (
    <div className="space-y-5 md:space-y-6 animate-in fade-in duration-500 pb-12">
      {editModal}
      {mergeModal}
      {tidyModal}

      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h1 className="font-['Cormorant_Garamond',serif] text-4xl md:text-5xl font-bold text-ink leading-none">Households</h1>
            <AskAdminTitleLink />
          </div>
          <p className="text-[#6B5A4E] font-medium text-sm md:text-[15px]">Family units for contact, care and check-in.</p>
        </div>
        {canPerform(userRole, 'household.create') && (
          <button
            type="button"
            onClick={openCreate}
            aria-label="New household"
            className="shrink-0 flex items-center justify-center gap-2 min-h-[48px] min-w-[48px] px-3 md:px-6 rounded-2xl bg-burgundy text-gold-light font-extrabold text-[15px] shadow-lg shadow-burgundy/20 hover:brightness-110 active:scale-95 transition-all"
          >
            <Plus size={20} />
            <span className="hidden md:inline">New household</span>
          </button>
        )}
      </div>

      {cleanupNotice && (
        <div role="status" className="flex items-center justify-between gap-3 rounded-2xl border border-[#CFE3D2] bg-[#EEF7EF] px-4 py-3 text-sm font-semibold text-[#1F5130]">
          <span className="flex items-center gap-2">
            <CheckCircle2 size={18} className="shrink-0" />
            {cleanupNotice}
          </span>
          <button type="button" onClick={() => setCleanupNotice(null)} aria-label="Dismiss" className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-white/60">
            <X size={16} />
          </button>
        </div>
      )}

      {invalidDetailRoute && (
        <div className="rounded-2xl border border-amber-100 bg-amber-50/80 px-5 py-4 text-sm font-semibold text-amber-900">
          That household could not be found. Showing the full list instead.
        </div>
      )}

      {loadError && (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm font-semibold text-red-700 flex items-center justify-between gap-4">
          <span>{loadError}</span>
          <button
            onClick={() => {
              setIsLoading(true);
              fetchData();
            }}
            className="text-xs font-black uppercase tracking-widest text-burgundy hover:underline"
          >
            Retry
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-2.5 md:gap-3">
        {statTile('Households', households.length, 'brand')}
        {statTile('People in a household', listStats.people, 'plain')}
        {statTile('Head not set', listStats.needsHead, 'warn')}
        {statTile('No address or phone', listStats.noContact, 'warn')}
      </div>

      {suggestionCount > 0 && (
        <section className="rounded-[22px] bg-gold-cream border border-[#EADFB8] overflow-hidden">
          <button
            type="button"
            onClick={() => setSuggestionsOpen((v) => !v)}
            aria-expanded={suggestionsOpen}
            className="w-full flex items-center gap-3 px-4 md:px-5 py-3.5 text-left min-h-[56px]"
          >
            <span className="w-10 h-10 shrink-0 rounded-xl bg-burgundy text-gold-light flex items-center justify-center font-extrabold">
              {suggestionCount}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] md:text-base font-extrabold text-ink">Clean-up suggestions</span>
              <span className="block text-xs md:text-[13px] font-medium text-[#6B5A4E] truncate">
                {[
                  canMerge && duplicateGroups.length > 0
                    ? `${duplicateGroups.length} possible ${duplicateGroups.length === 1 ? 'duplicate' : 'duplicates'}`
                    : '',
                  canEdit && nameFixes.length > 0 ? `${nameFixes.length} ${nameFixes.length === 1 ? 'name' : 'names'} to tidy` : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </span>
            <ChevronDown size={20} className={`shrink-0 text-burgundy transition-transform ${suggestionsOpen ? 'rotate-180' : ''}`} />
          </button>
          {suggestionsOpen && (
            <div className="px-4 md:px-5 pb-4 flex flex-wrap gap-2.5 md:gap-3">
              {canMerge &&
                duplicateGroups.map((g) => (
                  <div key={g[0].id} className="flex-1 basis-[300px] flex items-center gap-3 p-3.5 rounded-2xl bg-white border border-[#EFE8D8]">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-extrabold text-ink">Possible duplicate: {tidyHouseholdName(g[0].name)}</p>
                      <p className="text-[13px] font-medium text-[#6B5A4E]">
                        {g.map((h) => `${h.name} (${h.memberCount})`).join(' · ')}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => openMerge(g)}
                      className="shrink-0 min-h-[44px] px-4 rounded-[14px] border border-burgundy bg-white text-[13px] font-extrabold text-burgundy hover:bg-[#FBF5F6]"
                    >
                      Review &amp; merge
                    </button>
                  </div>
                ))}
              {canEdit && nameFixes.length > 0 && (
                <div className="flex-1 basis-[300px] flex items-center gap-3 p-3.5 rounded-2xl bg-white border border-[#EFE8D8]">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-extrabold text-ink">
                      Tidy {nameFixes.length} {nameFixes.length === 1 ? 'name' : 'names'}
                    </p>
                    <p className="text-[13px] font-medium text-[#6B5A4E]">
                      {nameFixes
                        .slice(0, 3)
                        .map((f) => `${f.from} → ${f.to}`)
                        .join(' · ')}
                      {nameFixes.length > 3 ? ` · +${nameFixes.length - 3} more` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={openTidy}
                    className="shrink-0 min-h-[44px] px-4 rounded-[14px] border border-burgundy bg-white text-[13px] font-extrabold text-burgundy hover:bg-[#FBF5F6]"
                  >
                    Fix names
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2.5 md:gap-3">
        <div className="relative flex-1 basis-[260px]">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8A7A6E]" size={18} />
          <input
            type="search"
            aria-label="Search households"
            placeholder="Search by name, head, address or phone"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full min-h-[48px] pl-11 pr-4 rounded-2xl border border-[#DCD2BE] bg-white text-base text-ink outline-none focus:border-burgundy focus:ring-2 focus:ring-burgundy/15"
          />
        </div>
        <label htmlFor="hh-sort" className="sr-only">
          Sort households
        </label>
        <select
          id="hh-sort"
          value={listSort}
          onChange={(e) => setListSort(e.target.value as ListSort)}
          className="min-h-[48px] px-3 rounded-2xl border border-[#DCD2BE] bg-white text-[15px] font-semibold text-ink outline-none focus:border-burgundy"
        >
          <option value="name">Name A–Z</option>
          <option value="members">Most members</option>
          <option value="attention">Needs attention first</option>
          <option value="recent">Recently added</option>
        </select>
      </div>

      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap pb-0.5" role="group" aria-label="Filter households">
        {LIST_FILTERS.map((f) => {
          const active = listFilter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              aria-pressed={active}
              onClick={() => setListFilter(f.id)}
              className={`shrink-0 flex items-center gap-2 min-h-[44px] px-4 rounded-full border text-sm whitespace-nowrap transition-colors ${
                active
                  ? 'border-burgundy bg-burgundy text-gold-light font-extrabold'
                  : 'border-[#DCD2BE] bg-white text-ink font-bold hover:border-burgundy/40'
              }`}
            >
              {f.label}
              <span
                className={`px-2 rounded-full text-xs ${active ? 'bg-white/15' : 'bg-[#F6F1E6] text-[#6B5A4E]'}`}
              >
                {filterCounts[f.id]}
              </span>
            </button>
          );
        })}
      </div>

      {visibleHouseholds.length === 0 ? (
        <div className="bg-white rounded-[24px] border border-[#EFE8D8] py-16 px-6 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gold-cream text-burgundy flex items-center justify-center">
            <Home size={28} />
          </div>
          <h3 className="text-lg font-extrabold text-ink mb-1">
            {households.length === 0 ? 'No households yet' : 'Nothing matches'}
          </h3>
          <p className="text-sm text-[#6B5A4E] font-medium mb-6">
            {households.length === 0
              ? 'Create a household, then add members from its page.'
              : 'Try a different search or filter.'}
          </p>
          {households.length === 0 && canPerform(userRole, 'household.create') && (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 min-h-[48px] px-6 rounded-2xl bg-burgundy text-gold-light font-extrabold text-sm shadow-lg"
            >
              <Plus size={16} />
              Create household
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Phone: compact rows */}
          <div className="md:hidden space-y-2.5">
            {visibleHouseholds.map((hh) => {
              const score = completenessOf(hh);
              const isDup = duplicateIds.has(hh.id);
              return (
                <button
                  key={hh.id}
                  type="button"
                  onClick={() => navigate(`/households/${hh.id}`)}
                  className="w-full text-left flex items-center gap-3 p-3.5 rounded-[20px] bg-white border border-[#EFE8D8] active:scale-[0.99] transition-transform"
                >
                  <span className="w-[46px] h-[46px] shrink-0 rounded-[14px] bg-burgundy text-gold flex items-center justify-center font-['Cormorant_Garamond',serif] text-2xl font-bold">
                    {householdInitial(hh.name)}
                  </span>
                  <span className="min-w-0 flex-1 flex flex-col gap-1">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[15px] font-extrabold text-ink truncate">{hh.name}</span>
                      {isDup && hh.memberCount > 0 && (
                        <span className="shrink-0 px-2 py-0.5 rounded-full bg-[#FCEDEE] text-[#203b2f] text-[10px] font-extrabold">Dup?</span>
                      )}
                      {hh.memberCount === 0 && (
                        <span className="shrink-0 px-2 py-0.5 rounded-full bg-[#F1EEE8] text-[#5E5348] text-[10px] font-extrabold">Empty</span>
                      )}
                    </span>
                    <span className="text-xs font-semibold text-[#6B5A4E] truncate">
                      {hh.memberCount} {hh.memberCount === 1 ? 'member' : 'members'}
                      {' · '}
                      {hh.head ? `Head: ${hh.head}` : hh.memberCount > 0 ? 'Head not set' : 'No members'}
                    </span>
                    <span className="grid grid-cols-4 gap-[3px] w-24 mt-0.5" aria-label={`${score} of 4 details`}>
                      {[0, 1, 2, 3].map((i) => (
                        <span key={i} className={`h-1 rounded-sm ${i < score ? 'bg-burgundy' : 'bg-[#EFE8D8]'}`} />
                      ))}
                    </span>
                  </span>
                  <ChevronRight size={18} className="shrink-0 text-[#8A7A6E]" />
                </button>
              );
            })}
          </div>

          {/* Tablet / desktop: cards */}
          <div className="hidden md:grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3.5">
            {visibleHouseholds.map((hh) => {
              const score = completenessOf(hh);
              const isDup = duplicateIds.has(hh.id);
              return (
                <button
                  key={hh.id}
                  type="button"
                  onClick={() => navigate(`/households/${hh.id}`)}
                  className="group text-left flex flex-col gap-3.5 p-[18px] rounded-[22px] bg-white border border-[#EFE8D8] hover:border-burgundy/30 hover:shadow-lg hover:shadow-burgundy/5 transition-all"
                >
                  <span className="flex items-start gap-3 w-full">
                    <span className="w-12 h-12 shrink-0 rounded-[14px] bg-burgundy text-gold flex items-center justify-center font-['Cormorant_Garamond',serif] text-[26px] font-bold">
                      {householdInitial(hh.name)}
                    </span>
                    <span className="min-w-0 flex-1 flex flex-col gap-1">
                      <span className="text-base font-extrabold text-ink leading-tight group-hover:text-burgundy">{hh.name}</span>
                      <span className="text-[13px] font-semibold text-[#6B5A4E]">
                        {hh.memberCount} {hh.memberCount === 1 ? 'member' : 'members'}
                      </span>
                    </span>
                    {isDup && hh.memberCount > 0 && (
                      <span className="shrink-0 px-2.5 py-1 rounded-full bg-[#FCEDEE] text-[#203b2f] text-[11px] font-extrabold">Duplicate?</span>
                    )}
                    {hh.memberCount === 0 && (
                      <span className="shrink-0 px-2.5 py-1 rounded-full bg-[#F1EEE8] text-[#5E5348] text-[11px] font-extrabold">Empty</span>
                    )}
                  </span>

                  <span className="flex flex-col gap-2 w-full text-[13px] font-semibold">
                    <span className="flex items-center gap-2">
                      <User size={15} className={hh.head ? 'text-burgundy shrink-0' : 'text-[#7A5200] shrink-0'} />
                      <span className={`truncate ${hh.head ? 'text-[#3A2A22]' : 'text-[#7A5200]'}`}>
                        {hh.head ? hh.head : 'Head not set'}
                      </span>
                    </span>
                    <span className="flex items-start gap-2">
                      <MapPin size={15} className="text-burgundy shrink-0 mt-px" />
                      {hh.address ? (
                        <span className="text-[#3A2A22] line-clamp-2">{hh.address}</span>
                      ) : (
                        <span className="text-burgundy font-bold">No address yet</span>
                      )}
                    </span>
                    {hh.phone && (
                      <span className="flex items-center gap-2 text-[#3A2A22]">
                        <Phone size={15} className="text-burgundy shrink-0" />
                        {hh.phone}
                      </span>
                    )}
                  </span>

                  <span className="mt-auto flex items-center gap-2.5 w-full pt-3 border-t border-[#F2ECDF]">
                    <span className="flex-1 grid grid-cols-4 gap-1">
                      {[0, 1, 2, 3].map((i) => (
                        <span key={i} className={`h-1.5 rounded-sm ${i < score ? 'bg-burgundy' : 'bg-[#EFE8D8]'}`} />
                      ))}
                    </span>
                    <span className="text-xs font-bold text-[#6B5A4E]">{score} of 4 details</span>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default HouseholdsPage;
