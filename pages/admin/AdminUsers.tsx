import React, { useEffect, useState } from 'react';
import {
  Search,
  X,
  ShieldCheck,
  UserPlus,
  Sparkles,
  ArrowLeft,
  Loader2,
  Wrench,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNav } from '../../App';
import { Role } from '../../types';
import { getAuthHeaders, parseApiJson } from '../../lib/api';
import { formatAccountContact, isPhonePlaceholderEmail } from '../../api/_utils/authPhone';

const ROLE_OPTIONS: { group: string; roles: { value: string; label: string }[] }[] = [
  {
    group: 'Admin / Staff',
    roles: [
      { value: 'SUPER_ADMIN', label: 'Super Admin' },
      { value: 'PASTOR', label: 'Pastor' },
      { value: 'FIRST_LADY', label: 'First Lady' },
      { value: 'ADMIN', label: 'Admin' },
      { value: 'ADMIN_STAFF', label: 'Admin Staff' },
      { value: 'SECRETARY', label: 'Secretary' },
      { value: 'ASST_SECRETARY', label: 'Asst. Secretary' },
      { value: 'MINISTRY_LEADER', label: 'Ministry Leader' },
      { value: 'FINANCE', label: 'Finance' },
      { value: 'MEDIA_TEAM', label: 'Media Team' },
      { value: 'WORSHIP_TEAM', label: 'Worship Team' },
      { value: 'STAFF', label: 'Staff' },
      { value: 'SUNDAY_SCHOOL_TEACHER', label: 'Sunday School Teacher' },
      { value: 'VOLUNTEER', label: 'Volunteer' },
      { value: 'KIOSK', label: 'Kids Desk Kiosk' },
      { value: 'ACCOUNTANT', label: 'Accountant (Fundraisers only)' },
    ],
  },
  {
    group: 'Public / User',
    roles: [
      { value: 'MEMBER', label: 'Member' },
      { value: 'PARENT', label: 'Parent' },
      { value: 'TEACHER', label: 'Teacher' },
      { value: 'YOUTH', label: 'Youth' },
      { value: 'GUEST', label: 'Guest' },
      { value: 'PENDING', label: 'Pending Approval' },
    ],
  },
];

function formatRoleLabel(role: string | null | undefined): string {
  if (!role) return '—';
  for (const group of ROLE_OPTIONS) {
    const match = group.roles.find((r) => r.value === role);
    if (match) return match.label;
  }
  return role.replace(/_/g, ' ');
}

function getOnboardingMeta(user: any): { path: 'new' | 'current' | null; summary: string | null } {
  const onboard = user?.notification_prefs?.onboarding;
  if (!onboard || (onboard.path !== 'new' && onboard.path !== 'current')) {
    return { path: null, summary: null };
  }
  const answers = onboard.answers || {};
  if (onboard.path === 'new') {
    const hopes = Array.isArray(answers.hopes) ? answers.hopes : [];
    const hopeLabels: Record<string, string> = {
      worship: 'Sunday worship',
      bible_study: 'Bible study',
      kids_youth: 'Kids / youth',
      baptism_membership: 'Baptism / membership',
      serving: 'Serving',
      prayer: 'Prayer',
    };
    const bits = hopes.slice(0, 3).map((h: string) => hopeLabels[h] || h);
    return { path: 'new', summary: bits.length ? bits.join(' · ') : 'New guest questionnaire' };
  }
  const teams = Array.isArray(answers.teamNames) ? answers.teamNames : [];
  const other = typeof answers.otherMinistry === 'string' ? answers.otherMinistry.trim() : '';
  const bits = [...teams.slice(0, 2), other].filter(Boolean);
  return { path: 'current', summary: bits.length ? bits.join(' · ') : 'Current member — ministry align' };
}

const StaffRolesPage: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  const { userRole, userId } = useNav();
  const navigate = useNavigate();
  const isSuperAdmin = userRole === Role.SUPER_ADMIN || userRole === 'SUPER_ADMIN';

  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [isAddingUser, setIsAddingUser] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserFirstName, setNewUserFirstName] = useState('');
  const [newUserLastName, setNewUserLastName] = useState('');
  const [newUserTitle, setNewUserTitle] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [selectedRole, setSelectedRole] = useState('MEMBER');

  useEffect(() => {
    if (!isSuperAdmin) {
      setLoading(false);
      return;
    }
    fetchUsers();
  }, [isSuperAdmin]);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/vault?resource=users', { headers });
      const data = await parseApiJson<{ ok?: boolean; error?: string; users?: any[] }>(res);
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not load users');
      setUsers(data.users || []);
    } catch (err: any) {
      setError(err?.message || 'Could not load users');
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (user: any, nextRole: string) => {
    if (!isSuperAdmin || nextRole === user.role) return;
    setSavingId(user.id);
    setError(null);
    setNotice(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/vault?resource=users', {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, role: nextRole }),
      });
      const data = await parseApiJson<{ ok?: boolean; error?: string }>(res);
      if (!res.ok) throw new Error(data.error || 'Could not update role');
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, role: nextRole } : u)));
      setNotice(`Updated ${user.name || formatAccountContact(user.email, user.phone) || user.email} to ${formatRoleLabel(nextRole)}.`);
    } catch (err: any) {
      setError(err?.message || 'Could not update role');
    } finally {
      setSavingId(null);
    }
  };

  const handleInviteUser = async () => {
    if (!newUserEmail || !newUserFirstName || !newUserPassword) {
      setError('Please fill in name, email, and temporary password.');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/vault?resource=users', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: newUserFirstName,
          lastName: newUserLastName,
          email: newUserEmail,
          password: newUserPassword,
          role: selectedRole,
          title: newUserTitle,
        }),
      });
      const data = await parseApiJson<{ ok?: boolean; error?: string }>(res);
      if (!res.ok) throw new Error(data.error || 'Failed to invite user');
      setIsAddingUser(false);
      setNewUserEmail('');
      setNewUserFirstName('');
      setNewUserLastName('');
      setNewUserTitle('');
      setNewUserPassword('');
      setSelectedRole('MEMBER');
      setNotice(`Access created for ${newUserEmail}.`);
      await fetchUsers();
    } catch (err: any) {
      setError(err?.message || 'Failed to invite user');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredUsers = users.filter((u) => {
    const q = searchTerm.toLowerCase().trim();
    if (!q) return true;
    const contact = formatAccountContact(u.email, u.phone).toLowerCase();
    const digits = `${u.email || ''}${u.phone || ''}`.replace(/\D/g, '');
    const qDigits = q.replace(/\D/g, '');
    return (
      (u.name || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      contact.includes(q) ||
      (qDigits.length >= 3 && digits.includes(qDigits)) ||
      (u.role || '').toLowerCase().includes(q)
    );
  });
  const pendingUsers = users.filter((u) => {
    if (u.role !== 'PENDING') return false;
    const email = String(u.email || '').toLowerCase();
    const name = String(u.name || '');
    // Hide local QA / phase-smoke stubs so Staff & Roles stays readable
    if (/@awc-vault\.local$/i.test(email)) return false;
    if (/^TEST\s*[—-]/.test(name) || /Phase 2\.\d/i.test(name)) return false;
    if (/jerless/i.test(email)) return false;
    if (/@atomic(mail|vault)?\.io$/i.test(email) || /@atomicmail\.com$/i.test(email)) return false;
    return true;
  });

  if (!isSuperAdmin) {
    return (
      <div className={`w-full max-w-2xl ${embedded ? '' : 'mx-auto pt-10 pb-24 px-4'} animate-in fade-in duration-500`}>
        {!embedded && (
          <button
            onClick={() => navigate('/settings')}
            className="flex items-center gap-2 text-gray-400 font-bold text-[10px] uppercase tracking-widest mb-8 hover:text-burgundy transition-colors"
          >
            <ArrowLeft size={14} />
            Back to Settings
          </button>
        )}
        <div className="bg-white border border-gray-100 rounded-3xl p-10 text-center shadow-sm">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-burgundy/5 text-burgundy flex items-center justify-center mb-4">
            <ShieldCheck size={28} />
          </div>
          <h1 className="text-2xl font-black text-[#0d1a14] tracking-tight">Staff & Roles</h1>
          <p className="text-gray-500 mt-3 font-medium">
            Only Super Admins can assign roles to members.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`w-full ${embedded ? 'max-w-4xl' : 'max-w-4xl mx-auto pt-4 md:pt-8 pb-24 px-4 md:px-6'} animate-in fade-in duration-500 space-y-6`}>
      {!embedded && (
        <button
          onClick={() => navigate('/settings?tab=staff-roles')}
          className="flex items-center gap-2 text-gray-400 font-bold text-[10px] uppercase tracking-widest hover:text-burgundy transition-colors"
        >
          <ArrowLeft size={14} />
          Back to Settings
        </button>
      )}

      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#0d1a14]/50 mb-1">
            Administration
          </p>
          <h1 className="text-3xl md:text-4xl font-semibold text-[#0d1a14] tracking-tight">
            Staff & Roles
          </h1>
          <p className="text-gray-500 mt-2 max-w-xl">
            Manage roles and permissions for church staff and members. Only Super Admins can assign roles.
          </p>
        </div>
        {!isAddingUser && (
          <button
            type="button"
            onClick={() => setIsAddingUser(true)}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#0d1a14] text-amber-100 text-sm font-semibold hover:bg-[#14251d] transition-colors"
          >
            <UserPlus size={16} />
            Invite user
          </button>
        )}
      </div>

      {error && (
        <p className="text-sm font-medium text-red-800 bg-red-50 border border-red-100 rounded-2xl px-4 py-3">
          {error}
        </p>
      )}
      {notice && (
        <p className="text-sm font-medium text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3">
          {notice}
        </p>
      )}

      {typeof sessionStorage !== 'undefined' &&
        sessionStorage.getItem('awc_vault_repair_unlocked') === '1' && (
          <button
            type="button"
            onClick={() => navigate('/admin/vault-repair')}
            className="w-full text-left rounded-2xl border border-burgundy/20 bg-burgundy/[0.04] px-5 py-4 hover:bg-burgundy/[0.07] transition-colors flex items-start gap-3"
          >
            <div className="w-10 h-10 rounded-xl bg-burgundy text-gold flex items-center justify-center shrink-0">
              <Wrench size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-[#0d1a14]">Vault Repair Desk</p>
              <p className="text-xs text-gray-500 font-medium mt-0.5 leading-snug">
                Diagnose login and access issues, then run allowlisted fixes.
              </p>
            </div>
          </button>
        )}

      {pendingUsers.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-5">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
              <Sparkles size={16} />
            </div>
            <div>
              <p className="font-semibold text-amber-950">Pending approval ({pendingUsers.length})</p>
              <p className="text-sm text-amber-800/80 mt-0.5">
                These people finished onboarding and need a role assigned below. New guests vs current members are labeled on each row.
              </p>
              <ul className="mt-3 space-y-2">
                {pendingUsers.slice(0, 8).map((u) => {
                  const meta = getOnboardingMeta(u);
                  return (
                    <li key={u.id} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-semibold text-amber-950">{u.name || formatAccountContact(u.email, u.phone) || 'Unnamed'}</span>
                      {meta.path === 'new' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 text-[10px] font-bold uppercase tracking-wide">
                          New guest
                        </span>
                      ) : meta.path === 'current' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold uppercase tracking-wide">
                          Current member
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold uppercase tracking-wide">
                          Pending
                        </span>
                      )}
                      {meta.summary ? (
                        <span className="text-xs text-amber-800/70 truncate max-w-full sm:max-w-md">{meta.summary}</span>
                      ) : null}
                    </li>
                  );
                })}
                {pendingUsers.length > 8 ? (
                  <li className="text-xs text-amber-800/70 font-medium">+{pendingUsers.length - 8} more below</li>
                ) : null}
              </ul>
            </div>
          </div>
        </div>
      )}

      {isAddingUser && (
        <div className="bg-white border border-black/[0.06] rounded-2xl p-6 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[#0d1a14]">Invite user</h2>
            <button
              type="button"
              onClick={() => setIsAddingUser(false)}
              className="p-2 rounded-xl text-gray-400 hover:bg-gray-50"
              aria-label="Close invite form"
            >
              <X size={18} />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">First name *</span>
              <input
                value={newUserFirstName}
                onChange={(e) => setNewUserFirstName(e.target.value)}
                className="mt-1.5 w-full min-h-[44px] px-3 rounded-xl border border-gray-200 text-sm font-medium outline-none focus:border-burgundy"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Last name</span>
              <input
                value={newUserLastName}
                onChange={(e) => setNewUserLastName(e.target.value)}
                className="mt-1.5 w-full min-h-[44px] px-3 rounded-xl border border-gray-200 text-sm font-medium outline-none focus:border-burgundy"
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Email *</span>
              <input
                type="email"
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
                className="mt-1.5 w-full min-h-[44px] px-3 rounded-xl border border-gray-200 text-sm font-medium outline-none focus:border-burgundy"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Title</span>
              <input
                value={newUserTitle}
                onChange={(e) => setNewUserTitle(e.target.value)}
                placeholder="Optional"
                className="mt-1.5 w-full min-h-[44px] px-3 rounded-xl border border-gray-200 text-sm font-medium outline-none focus:border-burgundy"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Temporary password *</span>
              <input
                type="text"
                value={newUserPassword}
                onChange={(e) => setNewUserPassword(e.target.value)}
                minLength={6}
                className="mt-1.5 w-full min-h-[44px] px-3 rounded-xl border border-gray-200 text-sm font-medium font-mono outline-none focus:border-burgundy"
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Role *</span>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                className="mt-1.5 w-full min-h-[44px] px-3 rounded-xl border border-gray-200 text-sm font-semibold text-[#0d1a14] outline-none focus:border-burgundy bg-white"
              >
                {ROLE_OPTIONS.map((group) => (
                  <optgroup key={group.group} label={group.group}>
                    {group.roles.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsAddingUser(false)}
              className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleInviteUser}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0d1a14] text-amber-100 text-sm font-semibold disabled:opacity-60"
            >
              {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : null}
              Create access
            </button>
          </div>
        </div>
      )}

      <div className="bg-white border border-black/[0.06] rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 sm:p-5 border-b border-black/[0.04]">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name, email, or role…"
              className="w-full min-h-[44px] pl-11 pr-4 rounded-xl border border-gray-200 bg-[#FAFAF8] text-sm font-medium outline-none focus:border-burgundy focus:bg-white"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16 text-[#0d1a14]">
            <Loader2 className="animate-spin" size={28} />
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="px-6 py-14 text-center text-gray-500 font-medium">No users found.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredUsers.map((u) => (
              <div
                key={u.id}
                className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#FAFAF8]/80 transition-colors"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-[#0d1a14] truncate">
                    {u.name || 'Unnamed user'}
                    {u.id === userId ? (
                      <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-burgundy/70">
                        You
                      </span>
                    ) : null}
                  </p>
                  <p className="text-sm text-gray-500 truncate">
                    {formatAccountContact(u.email, u.phone) || u.email}
                  </p>
                  {isPhonePlaceholderEmail(u.email) ? (
                    <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mt-0.5">
                      Phone sign-in
                    </p>
                  ) : null}
                  {u.title ? <p className="text-xs text-gray-400 mt-0.5">{u.title}</p> : null}
                  {u.role === 'PENDING' ? (() => {
                    const meta = getOnboardingMeta(u);
                    if (!meta.path) return null;
                    return (
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                            meta.path === 'new'
                              ? 'bg-sky-100 text-sky-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {meta.path === 'new' ? 'New guest' : 'Current member'}
                        </span>
                        {meta.summary ? (
                          <span className="text-xs text-gray-400 truncate max-w-[240px]">{meta.summary}</span>
                        ) : null}
                      </div>
                    );
                  })() : null}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {savingId === u.id ? (
                    <Loader2 size={16} className="animate-spin text-burgundy" />
                  ) : null}
                  <select
                    value={u.role || 'MEMBER'}
                    disabled={savingId === u.id}
                    onChange={(e) => handleRoleChange(u, e.target.value)}
                    className="min-h-[40px] max-w-full sm:min-w-[200px] px-3 rounded-xl border border-gray-200 bg-white text-xs font-bold text-[#0d1a14] outline-none focus:border-burgundy disabled:opacity-60"
                    aria-label={`Role for ${u.name || formatAccountContact(u.email, u.phone) || u.email}`}
                  >
                    {ROLE_OPTIONS.map((group) => (
                      <optgroup key={group.group} label={group.group}>
                        {group.roles.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                    {!ROLE_OPTIONS.some((g) => g.roles.some((r) => r.value === u.role)) && u.role ? (
                      <option value={u.role}>{formatRoleLabel(u.role)}</option>
                    ) : null}
                  </select>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default StaffRolesPage;
