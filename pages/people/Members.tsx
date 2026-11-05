
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus,
  MoreHorizontal,
  Trash2,
  Search,
  Filter,
  UserPlus,
  UserCheck,
  Link2,
  Phone,
  Mail,
  UserX,
  Sparkles,
  LifeBuoy,
  Home,
  Key,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import ResponsivePage from '../../components/Layout/ResponsivePage';
import AccessDenied from '../../components/Layout/AccessDenied';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { fetchAuthorized } from '../../lib/api';
import { Copy, Camera, QrCode } from 'lucide-react';
import QRCode from 'react-qr-code';
import { canPerform } from '../../lib/permissions';
import { useNav } from '../../App';
import AskAdminTitleLink from '../../components/common/AskAdminTitleLink';
import { FollowUp, Role, Tag } from '../../types';
import { fetchWithTimeout, getAuthHeaders, isAbortOrTimeoutError } from '../../lib/api';
import { canManageServeEligibility } from '../../lib/serveEligibilityUi';
import ServeEligibilitySection from '../../components/people/ServeEligibilitySection';
import ConsentAcknowledgementsSection from '../../components/people/ConsentAcknowledgementsSection';
import { canManageFamilyAdmin } from '../../lib/familyAdminUi';
import FamilyAccessSection from '../../components/people/FamilyAccessSection';
import { formatAccountContact } from '../../api/_utils/authPhone';
import { BirthdayMonthDay } from '../../components/BirthdayMonthDay';

/** Format YYYY-MM-DD for display without UTC timezone shift. */
function formatMemberBirthday(value?: string | null): string {
  if (!value) return '';
  const raw = String(value).slice(0, 10);
  const [y, mo, d] = raw.split('-').map(Number);
  if (!y || !mo || !d) return raw;
  return new Date(y, mo - 1, d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    // 1904 = saved without a year (adults enter month & day only)
    ...(y === 1904 ? {} : { year: 'numeric' as const }),
  });
}

interface Member {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: 'Active' | 'Visitor' | 'Inactive';
  household: string;
  householdId?: string;
  joinedDate: string;
  firstName?: string;
  lastName?: string;
  birthday?: string;
  avatarUrl?: string;
  accessCode?: string; // Add accessCode
  isTemporaryPassword?: boolean;
  ministries?: string[];
  children?: { name: string; age: string; notes?: string }[];
  /** Directory role label (e.g. Member, Child) — not auth Role enum */
  role?: string;
}

const PAGE_SIZE = 10;

const MembersPage: React.FC = () => {
  const { userRole } = useNav();
  const navigate = useNavigate();
  const canViewRoster = canPerform(userRole as Role, 'people.view_roster');
  const isSuperAdmin = userRole === 'SUPER_ADMIN';
  const canViewPending = ['SUPER_ADMIN', 'ADMIN', 'PASTOR'].includes(String(userRole || '').toUpperCase());
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  // Vault search opens Members with ?q=<name> to show that person.
  const [searchQuery, setSearchQuery] = useState(() => {
    try {
      const hash = window.location.hash || '';
      const qs = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : window.location.search.slice(1);
      return new URLSearchParams(qs).get('q')?.slice(0, 80) || '';
    } catch {
      return '';
    }
  });
  const [routeParams] = useSearchParams();
  const routeQ = routeParams.get('q');
  useEffect(() => {
    if (routeQ) setSearchQuery(routeQ.slice(0, 80));
  }, [routeQ]);
  const [isSearching, setIsSearching] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Selected Member State
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);

  // Grant Access State
  const [showAccessModal, setShowAccessModal] = useState(false);
  const [accessForm, setAccessForm] = useState({ password: '', role: 'MEMBER' });
  const [accessLookupLoading, setAccessLookupLoading] = useState(false);
  const [existingLogin, setExistingLogin] = useState<{ id: string; email: string; role?: string; name?: string } | null>(null);
  const [accessSubmitting, setAccessSubmitting] = useState(false);
  // Complex Edit State
  const [editMinistries, setEditMinistries] = useState<string[]>([]);
  const [editChildren, setEditChildren] = useState<{ name: string; age: string; notes?: string }[]>([]);
  const [newChildName, setNewChildName] = useState("");
  const [newChildAge, setNewChildAge] = useState("");
  const [showMinistry, setShowMinistry] = useState(false);

  const MINISTRY_OPTIONS = [
    'Children’s Ministry', 'Youth Ministry', 'Young Adults', 'Worship Team',
    'Choir', 'Media & Tech', 'Hospitality', 'Ushers', 'Prayer Team',
    'Men’s Ministry', 'Women’s Ministry', 'Outreach', 'Events Ministry', 'Finance Team',
    'Security Team', 'Sunday School Teacher'
  ];

  const toggleMinistry = (min: string) => {
    if (editMinistries.includes(min)) {
      setEditMinistries(editMinistries.filter(m => m !== min));
    } else {
      setEditMinistries([...editMinistries, min]);
    }
  };

  const addChild = () => {
    if (!newChildName || !newChildAge) return;
    setEditChildren([...editChildren, { name: newChildName, age: newChildAge }]);
    setNewChildName("");
    setNewChildAge("");
  };

  const removeChild = (idx: number) => {
    setEditChildren(editChildren.filter((_, i) => i !== idx));
  };

  // Fetch Members (optional server search — finds people outside the default newest window)
  const mapMembers = (rows: any[]): Member[] =>
    (rows || []).map((m: any) => ({
      id: m.id,
      name: `${m.first_name} ${m.last_name}`,
      firstName: m.first_name,
      lastName: m.last_name,
      email: formatAccountContact(m.email, m.phone) || 'No Email',
      phone: m.phone || 'No Phone',
      status: m.status || 'Active',
      household: m.household_name || 'Unassigned',
      householdId: m.household_id,
      joinedDate: new Date(m.created_at).toLocaleDateString('en-US', {
        month: 'short',
        year: 'numeric',
      }),
      birthday: m.birthday ? String(m.birthday).slice(0, 10) : '',
      avatarUrl: m.avatar_url,
      accessCode: m.access_code || '----',
      isTemporaryPassword: m.is_temporary_password,
      ministries: m.ministries || [],
      children: m.children || [],
      role: m.role || undefined,
    }));

  const fetchMembers = useCallback(async (query?: string) => {
    const q = String(query || '').trim();
    try {
      setLoadError(null);
      if (q) setIsSearching(true);
      else setIsLoading(true);
      const headers = await getAuthHeaders();
      const url = q
        ? `/api/vault?resource=people&query=${encodeURIComponent(q)}`
        : '/api/vault?resource=people';
      const res = await fetchWithTimeout(url, { headers }, 55_000);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error(
            'Session expired or missing. Sign out and sign back in, then open Members again. You do not need to restart the database.'
          );
        }
        throw new Error(data?.error || data?.details || `Failed to load members (${res.status})`);
      }
      if (data.ok) {
        setMembers(mapMembers(data.members));
      } else {
        throw new Error(data?.error || 'Failed to load members');
      }
    } catch (err) {
      console.error(err);
      setMembers([]);
      setLoadError(
        isAbortOrTimeoutError(err)
          ? 'Timed out waiting for members. Tap Retry — the first load after idle can take up to a minute.'
          : err instanceof Error
            ? err.message
            : 'Could not load members.'
      );
    } finally {
      setIsLoading(false);
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    if (!canViewRoster) {
      setIsLoading(false);
      return;
    }
    fetchMembers();
  }, [canViewRoster, fetchMembers]);

  // Debounced server search — typing queries the full members table, not only the loaded page.
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasUserSearchedRef = useRef(false);
  useEffect(() => {
    if (!canViewRoster) return;
    const q = searchQuery.trim();
    if (!q && !hasUserSearchedRef.current) return;
    hasUserSearchedRef.current = true;
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      fetchMembers(searchQuery);
    }, 300);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [canViewRoster, searchQuery, fetchMembers]);

  const handleAddContext = () => {
    setEditingMember(null);
    setEditMinistries([]);
    setEditChildren([]);
    setShowMinistry(false);
    setPreviewUrl(null);
    setSelectedFile(null);
    setShowAddModal(true);
  };

  const handleEditContext = (member: Member, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingMember(member);
    setEditMinistries(member.ministries || []);
    setEditChildren(member.children || []);
    setPreviewUrl(member.avatarUrl || null);
    setSelectedFile(null);
    setShowAddModal(true);
  };

  const handleGrantAccess = async () => {
    if (!editingMember || !editingMember.email || editingMember.email === 'No Email') {
      alert('Member must have a valid email address to log in or receive a role.');
      return;
    }
    setAccessLookupLoading(true);
    setExistingLogin(null);
    setAccessForm({ password: '', role: 'MEMBER' });
    setShowAccessModal(true);
    try {
      const headers = await getAuthHeaders(undefined, localStorage.getItem('awc_user_id'));
      const email = encodeURIComponent(editingMember.email.trim());
      const res = await fetch(`/api/vault?resource=users&email=${email}`, { headers });
      const data = await res.json();
      if (res.ok && data.exists && data.users?.[0]) {
        const u = data.users[0];
        setExistingLogin({ id: u.id, email: u.email, role: u.role, name: u.name });
        setAccessForm({ password: '', role: u.role || 'MEMBER' });
      } else {
        setExistingLogin(null);
        setAccessForm({ password: '', role: 'MEMBER' });
      }
    } catch (err) {
      console.error(err);
      setExistingLogin(null);
    } finally {
      setAccessLookupLoading(false);
    }
  };

  const closeAccessModal = () => {
    setShowAccessModal(false);
    setExistingLogin(null);
    setAccessForm({ password: '', role: 'MEMBER' });
    setAccessLookupLoading(false);
    setAccessSubmitting(false);
  };
  const handleDeleteContext = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!confirm("Are you sure you want to delete this member? This cannot be undone.")) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/vault?resource=people', {
        method: 'DELETE',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      const data = await res.json().catch(() => ({} as { error?: string; details?: string }));
      if (!res.ok) {
        alert(data.error || data.details || 'Failed to delete member');
        return;
      }
      fetchMembers(searchQuery);
    } catch (err) {
      console.error(err);
      alert('Failed to delete member');
    }
  };

  const uploadAvatar = async (file: File): Promise<string | null> => {
    if (!supabase) {
      console.error("Supabase client not initialized. Check your environment variables.");
      alert("Upload failed: System configuration error.");
      return null;
    }

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file);

      if (uploadError) {
        throw uploadError;
      }

      const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
      return data.publicUrl;
    } catch (error) {
      console.error('Error uploading avatar:', error);
      alert('Error uploading avatar');
      return null;
    }
  };

  const submitMemberForm = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    const firstName = (form.elements.namedItem('firstName') as HTMLInputElement).value;
    const lastName = (form.elements.namedItem('lastName') as HTMLInputElement).value;
    const email = (form.elements.namedItem('email') as HTMLInputElement).value;
    const phone = (form.elements.namedItem('phone') as HTMLInputElement).value;
    const status = (form.elements.namedItem('status') as HTMLSelectElement).value;
    const householdName = (form.elements.namedItem('householdName') as HTMLInputElement).value;
    const birthday = (form.elements.namedItem('birthday') as HTMLInputElement).value;

    let avatarUrl = editingMember?.avatarUrl;

    if (selectedFile) {
      const uploadedUrl = await uploadAvatar(selectedFile);
      if (uploadedUrl) {
        avatarUrl = uploadedUrl;
      }
    }

    const endpoint = '/api/vault?resource=people';
    const method = editingMember ? 'PATCH' : 'POST';

    // For now we persist basic fields. If Admin wants to edit Ministries/Children, 
    // it's best done via a dedicated UI or by updating this form further.
    // Given the complexity of Kids/Ministry arrays, we'll auto-preserve them if editing, 
    // or initialize empty if new. Ideally we add UI to edit them here too.

    const body: any = {
      firstName,
      lastName,
      email,
      phone,
      status,
      householdName,
      birthday,
      avatar_url: avatarUrl,
      ministries: editMinistries,
      children: editChildren
    };
    if (editingMember) body.id = editingMember.id;

    try {
      const headers = await getAuthHeaders();
      const res = await fetch(endpoint, {
        method,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (res.ok) {
        fetchMembers(searchQuery);
        setShowAddModal(false);
      } else {
        alert(data.error || "Failed to save member");
      }
    } catch (err) {
      console.error(err);
      alert("An unexpected error occurred");
    }
  };

  const submitAccessForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember) return;

    const assignedRole = isSuperAdmin ? accessForm.role : 'MEMBER';
    const alreadyHasLogin = !!existingLogin;

    if (!alreadyHasLogin && accessForm.password.trim().length < 6) {
      alert('Temporary password must be at least 6 characters for new logins.');
      return;
    }

    setAccessSubmitting(true);
    try {
      const headers = await getAuthHeaders(
        { 'Content-Type': 'application/json' },
        localStorage.getItem('awc_user_id')
      );
      const res = await fetch('/api/vault?resource=users', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          firstName: editingMember.firstName,
          lastName: editingMember.lastName,
          email: editingMember.email,
          role: assignedRole,
          ...(alreadyHasLogin
            ? {}
            : { password: accessForm.password.trim() }),
        }),
      });

      const data = await res.json();
      if (res.ok) {
        if (data.alreadyHadAccess) {
          alert(
            `Role updated to ${assignedRole.replace(/_/g, ' ')}. They keep their current password.`
          );
        } else {
          alert(
            isSuperAdmin
              ? 'Login created. They can sign in with the temporary password (or email/phone / passkey after setup).'
              : 'Login created as Member. A Super Admin can change their role in Staff & Roles.'
          );
        }
        closeAccessModal();
      } else {
        alert(data.error || 'Failed to update access');
      }
    } catch (err) {
      console.error(err);
      alert('Error updating user account');
    } finally {
      setAccessSubmitting(false);
    }
  };
  const activeCount = members.filter(m => m.status === 'Active').length;
  const linkedCount = members.filter(m => m.household !== 'Unassigned').length;
  const pendingMembers = members.filter(m => m.status === 'Visitor' || m.status === 'Inactive');
  const pendingCount = pendingMembers.length;
  const linkedPercent = members.length > 0 ? Math.round((linkedCount / members.length) * 100) : 0;

  const filteredMembers = members
    .filter((m) => {
      const query = searchQuery.toLowerCase();
      return (
        (m.name || '').toLowerCase().includes(query) ||
        (m.email || '').toLowerCase().includes(query) ||
        (m.household || '').toLowerCase().includes(query)
      );
    })
    .sort((a, b) => {
      const ln = String(a.lastName || '').localeCompare(String(b.lastName || ''), undefined, {
        sensitivity: 'base',
      });
      if (ln !== 0) return ln;
      return String(a.firstName || '').localeCompare(String(b.firstName || ''), undefined, {
        sensitivity: 'base',
      });
    });

  useEffect(() => {
    setPage(1);
  }, [searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredMembers.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const paginatedMembers = filteredMembers.slice(pageStart, pageStart + PAGE_SIZE);
  const rangeFrom = filteredMembers.length === 0 ? 0 : pageStart + 1;
  const rangeTo = Math.min(pageStart + PAGE_SIZE, filteredMembers.length);

  if (!canViewRoster) {
    return <AccessDenied />;
  }

  return (
    <ResponsivePage>

      {/* Member Details Modal */}
      {selectedMember && (
        <MemberDetailsModal
          member={selectedMember}
          userRole={userRole}
          onClose={() => setSelectedMember(null)}
          onEdit={() => {
            setSelectedMember(null);
            handleEditContext(selectedMember);
          }}
        />
      )}

      {/* Grant Access / Assign Role Modal */}
      {showAccessModal && (
        <div className="fixed inset-0 z-[160] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl animate-in zoom-in-95 border-4 border-gold/20">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl bg-burgundy text-gold flex items-center justify-center"><Key size={24} /></div>
              <div>
                <h3 className="text-xl font-black text-[#0d1a14]">
                  {accessLookupLoading
                    ? 'Checking account…'
                    : existingLogin
                      ? 'Assign role'
                      : 'Create login'}
                </h3>
                <p className="text-xs text-gray-500 font-bold">{editingMember?.email}</p>
              </div>
            </div>

            {accessLookupLoading ? (
              <div className="flex items-center justify-center py-10 text-gray-500 gap-2">
                <Loader2 className="animate-spin" size={20} />
                <span className="text-sm font-medium">Looking up login…</span>
              </div>
            ) : (
              <form onSubmit={submitAccessForm} className="space-y-4">
                {existingLogin ? (
                  <p className="text-sm text-gray-600 font-medium leading-relaxed bg-gold-cream/50 border border-gold/20 rounded-xl px-4 py-3">
                    This email already has a Vault login
                    {existingLogin.role ? ` (${String(existingLogin.role).replace(/_/g, ' ')})` : ''}.
                    Changing the role does <span className="font-black text-[#0d1a14]">not</span> reset their password.
                    You can also manage roles in{' '}
                    <button
                      type="button"
                      className="text-burgundy font-black underline underline-offset-2"
                      onClick={() => {
                        closeAccessModal();
                        navigate('/settings?tab=staff-roles');
                      }}
                    >
                      Staff &amp; Roles
                    </button>
                    .
                  </p>
                ) : (
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Temporary password</label>
                    <input
                      type="text"
                      name="password"
                      value={accessForm.password}
                      onChange={e => setAccessForm({ ...accessForm, password: e.target.value })}
                      placeholder="e.g. Welcome2024!"
                      required
                      minLength={6}
                      className="w-full p-3 bg-gray-50 rounded-xl border-none outline-none focus:ring-2 focus:ring-gold font-mono"
                    />
                    <p className="text-xs text-gray-500 mt-1.5">Only for members who have never signed up. They can change it after signing in.</p>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Role</label>
                  {isSuperAdmin ? (
                    <select
                      name="role"
                      value={accessForm.role}
                      onChange={e => setAccessForm({ ...accessForm, role: e.target.value })}
                      className="w-full p-3 bg-gray-50 rounded-xl border-none outline-none focus:ring-2 focus:ring-gold"
                    >
                      <optgroup label="Admin / Staff">
                        <option value="SUPER_ADMIN">Super Admin</option>
                        <option value="PASTOR">Pastor</option>
                        <option value="MINISTRY_LEADER">Ministry Leader</option>
                        <option value="FINANCE">Finance</option>
                        <option value="MEDIA_TEAM">Media Team</option>
                        <option value="ADMIN_STAFF">Admin Staff</option>
                        <option value="VOLUNTEER">Volunteer</option>
                      </optgroup>
                      <optgroup label="Public / User">
                        <option value="GUEST">Guest</option>
                        <option value="MEMBER">Member</option>
                        <option value="PARENT">Parent</option>
                        <option value="TEACHER">Teacher</option>
                        <option value="YOUTH">Youth</option>
                      </optgroup>
                    </select>
                  ) : (
                    <div className="w-full p-3 bg-gray-50 rounded-xl text-sm font-semibold text-[#0d1a14]">
                      Member
                      <p className="text-xs text-gray-400 font-medium mt-1 normal-case tracking-normal">
                        Only Super Admins can assign other roles (Staff &amp; Roles).
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex gap-4 pt-4">
                  <button
                    type="button"
                    onClick={closeAccessModal}
                    disabled={accessSubmitting}
                    className="flex-1 py-3 font-bold text-gray-400 hover:bg-gray-50 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={accessSubmitting}
                    className="flex-1 py-3 bg-burgundy text-gold font-bold rounded-xl shadow-lg disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {accessSubmitting ? <Loader2 className="animate-spin" size={16} /> : null}
                    {existingLogin ? 'Save role' : 'Create login'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
      {/* Add/Edit Modal Overlay */}
      {showAddModal && (
        <div className="fixed inset-0 z-[150] bg-black/50 flex items-center justify-center p-4 pt-20 pb-[120px] lg:pt-4 lg:pb-4">
        <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl animate-in zoom-in-95 flex flex-col" style={{ maxHeight: 'min(85vh, calc(100vh - 180px))' }}>
          {/* Sticky Modal Header - always visible */}
          <div className="flex items-center justify-between px-8 pt-6 pb-4 border-b border-gray-100 shrink-0">
            <h3 className="text-2xl font-black text-[#0d1a14]">{editingMember ? 'Edit Profile' : 'Add New Member'}</h3>
            {editingMember ? (
              <button
                type="button"
                onClick={handleGrantAccess}
                className="flex items-center gap-1.5 px-4 py-2 bg-gold-cream text-gold text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-gold hover:text-white transition-colors border border-gold/20 shrink-0"
                title="Assign role if they already have a login, or create a first-time login"
              >
                <Key size={12} /> Access / Role
              </button>
            ) : (
              <span className="text-[10px] font-bold text-gray-400 bg-gray-50 px-2 py-1 rounded-lg shrink-0">
                Save first
              </span>
            )}
          </div>
          <div className="overflow-y-auto custom-scrollbar flex-1 p-8">
            <form id="member-form" onSubmit={submitMemberForm} className="space-y-4">
              {/* Avatar Upload */}
              <div className="flex justify-center mb-6">
                <div className="relative group cursor-pointer">
                  <div className="w-24 h-24 rounded-full bg-gray-100 overflow-hidden border-2 border-dashed border-gray-300 group-hover:border-gold transition-colors flex items-center justify-center">
                    {previewUrl ? (
                      <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <div className="text-gray-300 group-hover:text-gold transition-colors">
                        <Camera size={32} />
                      </div>
                    )}
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setSelectedFile(e.target.files[0]);
                        setPreviewUrl(URL.createObjectURL(e.target.files[0]));
                      }
                    }}
                  />
                  <div className="absolute bottom-0 right-0 bg-gold text-white p-1.5 rounded-full shadow-md">
                    <Plus size={12} />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-1">First Name</label>
                  <input name="firstName" defaultValue={editingMember?.firstName} required className="w-full p-3 bg-gray-50 rounded-xl border-none outline-none focus:ring-2 focus:ring-gold" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Last Name</label>
                  <input name="lastName" defaultValue={editingMember?.lastName} required className="w-full p-3 bg-gray-50 rounded-xl border-none outline-none focus:ring-2 focus:ring-gold" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Email</label>
                <input name="email" type="email" defaultValue={editingMember?.email} className="w-full p-3 bg-gray-50 rounded-xl border-none outline-none focus:ring-2 focus:ring-gold" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Phone</label>
                <input name="phone" type="tel" defaultValue={editingMember?.phone === 'No Phone' ? '' : editingMember?.phone} placeholder="0772 123456" className="w-full p-3 bg-gray-50 rounded-xl border-none outline-none focus:ring-2 focus:ring-gold" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Household Name</label>
                <input name="householdName" placeholder="e.g. Smith Family" defaultValue={editingMember?.household !== 'Unassigned' ? editingMember?.household : ''} className="w-full p-3 bg-gray-50 rounded-xl border-none outline-none focus:ring-2 focus:ring-gold" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Birthday (Optional)</label>
                <BirthdayMonthDay name="birthday" whose="their" value={editingMember?.birthday || ''} />
                <p className="text-[10px] text-gray-400 mt-1">Add the birth year only if the member wants it saved. Children's full birth dates are set on their household profile.</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Status</label>
                <select name="status" defaultValue={editingMember?.status || 'Active'} className="w-full p-3 bg-gray-50 rounded-xl border-none outline-none focus:ring-2 focus:ring-gold">
                  <option value="Active">Active</option>
                  <option value="Visitor">Visitor</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>

              {/* Ministry & Children Edit UI */}
              <div className="col-span-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowMinistry(!showMinistry)}
                  className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase hover:text-burgundy transition-colors w-full py-2"
                >
                  {showMinistry ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  Ministry & Family Details
                </button>

                {showMinistry && (
                  <div className="space-y-4 pt-4 animate-in fade-in slide-in-from-top-2">
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Ministries</label>
                      <div className="flex flex-wrap gap-2">
                        {MINISTRY_OPTIONS.map(min => (
                          <button
                            type="button"
                            key={min}
                            onClick={() => toggleMinistry(min)}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all border ${editMinistries.includes(min)
                              ? 'bg-burgundy text-gold border-burgundy'
                              : 'bg-gray-50 text-gray-400 border-gray-100 hover:border-gold/20'
                              }`}
                          >
                            {min}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-3">Children</label>
                      <div className="space-y-2 mb-3">
                        {editChildren.map((child, idx) => (
                          <div key={idx} className="flex items-center justify-between bg-white p-2 rounded-xl border border-gray-100">
                            <div className="flex flex-col">
                              <span className="text-xs font-bold text-[#0d1a14]">{child.name}</span>
                              <span className="text-[10px] text-gray-400">{child.age} Years Old</span>
                            </div>
                            <button type="button" onClick={() => removeChild(idx)} className="text-gray-300 hover:text-red-500">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <input
                          placeholder="Name"
                          value={newChildName}
                          onChange={e => setNewChildName(e.target.value)}
                          className="flex-1 px-3 py-2 bg-white rounded-lg text-xs font-bold outline-none border border-gray-200 focus:border-gold"
                        />
                        <input
                          placeholder="Age"
                          value={newChildAge}
                          onChange={e => setNewChildAge(e.target.value)}
                          className="w-16 px-3 py-2 bg-white rounded-lg text-xs font-bold outline-none border border-gray-200 focus:border-gold"
                        />
                        <button
                          type="button"
                          onClick={addChild}
                          disabled={!newChildName || !newChildAge}
                          className="bg-burgundy text-gold px-3 rounded-lg disabled:opacity-50"
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </form>
          </div>
          <div className="flex gap-4 px-8 pb-6 pt-4 border-t border-gray-50 rounded-b-3xl bg-white shrink-0" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
            <button type="button" form="member-form" onClick={() => setShowAddModal(false)} className="flex-1 py-3 font-bold text-gray-400 hover:bg-gray-50 rounded-xl">Cancel</button>
            <button type="submit" form="member-form" className="flex-1 py-3 bg-burgundy text-gold font-bold rounded-xl shadow-lg">{editingMember ? 'Update Profile' : 'Save Member'}</button>
          </div>
        </div>
        </div>
      )}

      {/* Header Area */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <h1 className="text-3xl md:text-4xl font-extrabold text-[#0d1a14] tracking-tight leading-none">Members</h1>
            <AskAdminTitleLink />
          </div>
          <p className="text-gray-400 font-medium text-sm md:text-base">Manage your congregation and track household connections.</p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <button className="flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-white border border-gray-100 text-gray-500 font-bold text-sm shadow-sm min-h-[44px]">
            <Filter size={18} className="text-gold" />
            Filters
          </button>

          {canPerform(userRole, 'people.create') && (
            <button onClick={handleAddContext} className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-burgundy text-gold font-bold text-sm shadow-xl shadow-burgundy/20 min-h-[44px] border-b-2 border-gold/30 hover:brightness-110 active:scale-95 transition-all">
              <UserPlus size={18} />
              Add Member
            </button>
          )}
        </div>
      </div>

      {/* Stats Bar */}
      <div className={`grid grid-cols-1 gap-4 md:gap-6 ${canViewPending ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
        <StatCard
          label="Total Active"
          value={isLoading ? '…' : activeCount.toLocaleString()}
          icon={<UserCheck size={24} />}
          color="burgundy"
        />
        <StatCard
          label="Linked Households"
          value={isLoading ? '…' : `${linkedPercent}%`}
          icon={<Link2 size={24} />}
          color="gold"
        />
        {canViewPending && (
          <StatCard
            label="Visitors / Pending"
            value={isLoading ? '…' : pendingCount.toLocaleString()}
            icon={<UserX size={24} />}
            color="gray"
          />
        )}
      </div>

      {canViewPending && pendingCount > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-5">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
              <Sparkles size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-amber-950">Visitors / Pending ({pendingCount})</p>
              <p className="text-sm text-amber-800/80 mt-0.5">
                Guests and inactive profiles that may need follow-up or a household link. Tap a row to open their record.
              </p>
              <ul className="mt-3 space-y-2">
                {pendingMembers.slice(0, 8).map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedMember(m)}
                      className="w-full flex flex-wrap items-center gap-2 text-sm text-left rounded-xl px-2 py-1.5 -mx-2 hover:bg-amber-100/70 transition-colors"
                    >
                      <span className="font-semibold text-amber-950">{m.name || 'Unnamed'}</span>
                      {m.status === 'Visitor' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold uppercase tracking-wide">
                          Pending
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[10px] font-bold uppercase tracking-wide">
                          Inactive
                        </span>
                      )}
                      <span className="text-xs text-amber-800/70 truncate max-w-full sm:max-w-md">
                        {m.household && m.household !== 'Unassigned'
                          ? m.household
                          : m.joinedDate
                            ? `Joined ${m.joinedDate}`
                            : 'Needs household or follow-up'}
                      </span>
                    </button>
                  </li>
                ))}
                {pendingCount > 8 ? (
                  <li className="text-xs text-amber-800/70 font-medium">+{pendingCount - 8} more in the list below</li>
                ) : null}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Search & Insight */}
      <div className="bg-white rounded-[2rem] border border-gray-50 shadow-sm p-4 md:p-8 space-y-4">
        <div className="relative group w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-gold" size={20} />
          <input
            type="text"
            placeholder="Search name, email, phone, or household..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-12 py-4 bg-gray-50/50 rounded-2xl outline-none border border-transparent focus:bg-white focus:border-gold/20 focus:ring-4 focus:ring-gold/5 transition-all text-sm font-semibold text-[#0d1a14]"
          />
          {isSearching && (
            <Loader2
              className="absolute right-4 top-1/2 -translate-y-1/2 text-burgundy animate-spin"
              size={18}
            />
          )}
        </div>
        <div className="flex items-center gap-3 text-[10px] md:text-xs font-bold text-gray-400 uppercase tracking-widest bg-gold-cream/30 p-3 rounded-xl border border-gold/10">
          <Sparkles size={14} className="text-gold shrink-0" />
          <span className="truncate">Insight: <span className="text-burgundy">{members.length - linkedCount} members need household updates</span></span>
        </div>
      </div>

      {/* List Area: Mobile Cards / Desktop Table */}
      <div className="min-w-0 space-y-4">
        <div className="hidden md:block bg-white rounded-[2rem] border border-gray-50 shadow-sm overflow-hidden min-h-[300px]">
          <table className="w-full text-left">
            <thead className="bg-gold-cream/20">
              <tr className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                <th className="px-8 py-5">Member</th>
                <th className="px-8 py-5">Phone</th>
                <th className="px-8 py-5">Status</th>
                <th className="px-8 py-5">Household</th>
                <th className="px-8 py-5 text-center">Security</th>
                <th className="px-8 py-5">Joined</th>
                <th className="px-8 py-5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-8 py-16 text-center text-sm font-semibold text-gray-400">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="animate-spin" size={18} aria-hidden />
                      Loading members…
                    </span>
                  </td>
                </tr>
              ) : loadError ? (
                <tr>
                  <td colSpan={7} className="px-8 py-16 text-center space-y-3">
                    <p className="text-sm font-semibold text-red-800">{loadError}</p>
                    <p className="text-xs text-gray-500">
                      {/does not exist|column/i.test(loadError)
                        ? 'A schema mismatch blocked this load. Retry after the latest deploy, or contact support if it persists.'
                        : 'If Supabase PostgREST/Auth shows Unhealthy, wait for it to recover, then retry.'}
                    </p>
                    <button
                      type="button"
                      onClick={() => void fetchMembers(searchQuery)}
                      className="min-h-[44px] rounded-xl bg-[#0d1a14] px-5 text-sm font-black text-white"
                    >
                      Retry
                    </button>
                  </td>
                </tr>
              ) : paginatedMembers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-8 py-16 text-center text-sm font-semibold text-gray-400">
                    {searchQuery.trim()
                      ? '0 members match this search.'
                      : '0 members in the directory.'}
                  </td>
                </tr>
              ) : (
                paginatedMembers.map(member => (
                <tr
                  key={member.id}
                  onClick={() => setSelectedMember(member)}
                  className="group hover:bg-gold-cream/10 transition-colors cursor-pointer"
                >
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-burgundy text-gold flex items-center justify-center font-bold text-xs shrink-0">
                        {member.name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-[#0d1a14] truncate">{member.name}</p>
                        <p className="text-[11px] text-gray-400 truncate">{member.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <div className="text-sm font-bold text-gray-500">{member.phone}</div>
                  </td>
                  <td className="px-8 py-5">
                    <StatusBadge status={member.status} />
                  </td>
                  <td className="px-8 py-5">
                    {member.household !== 'Unassigned' && member.householdId ? (
                      <button onClick={(e) => { e.stopPropagation(); navigate(`/households/${member.householdId}`); }} className="text-sm font-bold text-burgundy hover:underline flex items-center gap-2">
                        <Home size={14} className="text-gold" />
                        {member.household}
                      </button>
                    ) : member.household !== 'Unassigned' ? (
                      <span className="text-sm font-bold text-gray-500 flex items-center gap-2">
                        <Home size={14} className="text-gold" />
                        {member.household}
                      </span>
                    ) : (
                      <span className="text-gray-300 text-xs italic">No household</span>
                    )}
                  </td>
                  <td className="px-8 py-5 text-center">
                    <span className={`inline-flex px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${member.isTemporaryPassword
                      ? 'bg-gold/10 text-burgundy border-gold/20'
                      : 'bg-green-50 text-green-600 border-green-100'}`}>
                      {member.isTemporaryPassword ? 'Temp' : 'Set'}
                    </span>
                  </td>
                  <td className="px-8 py-5 text-xs text-gray-400 font-medium">{member.joinedDate}</td>
                  <td className="px-8 py-5 text-right">
                    <div className="flex justify-end gap-2">
                      {canPerform(userRole, 'people.edit') && (
                        <button onClick={(e) => handleEditContext(member, e)} className="p-2 text-gray-300 hover:text-burgundy hover:bg-burgundy/5 rounded-lg transition-colors" title="Edit">
                          <MoreHorizontal size={20} />
                        </button>
                      )}
                      {canPerform(userRole, 'people.delete') && (
                        <button onClick={(e) => handleDeleteContext(member.id, e)} className="p-2 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                          <UserX size={20} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile View: Cards */}
        <div className="md:hidden space-y-4">
          {isLoading ? (
            <div className="bg-white p-10 rounded-3xl border border-gray-100 text-center text-sm font-semibold text-gray-400">
              <span className="inline-flex items-center gap-2">
                <Loader2 className="animate-spin" size={18} aria-hidden />
                Loading members…
              </span>
            </div>
          ) : loadError ? (
            <div className="bg-white p-10 rounded-3xl border border-red-100 text-center space-y-3">
              <p className="text-sm font-semibold text-red-800">{loadError}</p>
              <button
                type="button"
                onClick={() => void fetchMembers(searchQuery)}
                className="min-h-[44px] rounded-xl bg-[#0d1a14] px-5 text-sm font-black text-white"
              >
                Retry
              </button>
            </div>
          ) : paginatedMembers.length === 0 ? (
            <div className="bg-white p-10 rounded-3xl border border-dashed border-gray-200 text-center text-sm font-semibold text-gray-400">
              {searchQuery.trim()
                ? '0 members match this search.'
                : '0 members in the directory.'}
            </div>
          ) : (
            paginatedMembers.map(member => (
            <div
              key={member.id}
              onClick={() => setSelectedMember(member)}
              className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col gap-4 active:scale-[0.98] transition-all cursor-pointer"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-burgundy text-gold flex items-center justify-center font-black text-sm shrink-0">
                    {member.name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-black text-[#0d1a14] truncate">{member.name}</h3>
                    <p className="text-xs text-gray-400 truncate">{member.email}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  {canPerform(userRole, 'people.edit') && (
                    <button onClick={(e) => handleEditContext(member, e)} className="p-2 text-gray-300 hover:text-burgundy"><MoreHorizontal size={20} /></button>
                  )}
                  {canPerform(userRole, 'people.delete') && (
                    <button onClick={(e) => handleDeleteContext(member.id, e)} className="p-2 text-gray-300 hover:text-red-500"><UserX size={20} /></button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-50">
                <div>
                  <p className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-1">Status</p>
                  <StatusBadge status={member.status} />
                </div>
                <div>
                  <p className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-1">Household</p>
                  {member.household !== 'Unassigned' && member.householdId ? (
                    <button onClick={(e) => { e.stopPropagation(); navigate(`/households/${member.householdId}`); }} className="text-xs font-bold text-burgundy truncate max-w-full flex items-center gap-1.5">
                      <Home size={12} className="text-gold" />
                      {member.household}
                    </button>
                  ) : member.household !== 'Unassigned' ? (
                    <span className="text-xs font-bold text-gray-500 truncate max-w-full flex items-center gap-1.5">
                      <Home size={12} className="text-gold" />
                      {member.household}
                    </span>
                  ) : (
                    <span className="text-[10px] text-gray-400 italic">None</span>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between pt-4">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-gray-400 font-bold uppercase">Joined {member.joinedDate}</span>
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-tight border self-start ${member.isTemporaryPassword
                    ? 'bg-gold/10 text-burgundy border-gold/20'
                    : 'bg-green-50 text-green-600 border-green-100'}`}>
                    {member.isTemporaryPassword ? 'Temp Pwd' : 'Pwd Set'}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button className="p-3 bg-gray-50 text-gold rounded-xl min-h-[44px] min-w-[44px] flex items-center justify-center"><Phone size={16} /></button>
                  <button className="p-3 bg-burgundy/5 text-burgundy rounded-xl min-h-[44px] min-w-[44px] flex items-center justify-center"><Mail size={16} /></button>
                </div>
              </div>
            </div>
          ))
          )}
        </div>

        {filteredMembers.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-1">
            <p className="text-sm text-gray-500">
              Showing <span className="font-semibold text-[#0d1a14]">{rangeFrom}–{rangeTo}</span> of{' '}
              <span className="font-semibold text-[#0d1a14]">{filteredMembers.length}</span> members
              {searchQuery.trim() ? (
                <span className="text-gray-400"> (filtered from {members.length})</span>
              ) : null}
            </p>
            {filteredMembers.length > PAGE_SIZE && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-xl border border-gray-100 bg-white text-sm font-medium text-[#0d1a14] hover:bg-gray-50 disabled:opacity-40 disabled:pointer-events-none"
                >
                  <ChevronLeft size={16} />
                  Previous
                </button>
                <span className="text-sm tabular-nums text-gray-500 px-2">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-xl border border-gray-100 bg-white text-sm font-medium text-[#0d1a14] hover:bg-gray-50 disabled:opacity-40 disabled:pointer-events-none"
                >
                  Next
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer Support */}
      <div className="flex flex-col md:flex-row items-center justify-center gap-8 pt-8 border-t border-gray-100">
        <FooterHelp title="Strategy" sub="Ask PLCC AI for an audit." icon={<Sparkles />} color="gold" />
        <FooterHelp title="Migration" sub="Contact Support Squad." icon={<LifeBuoy />} color="burgundy" />
        <p className="text-[9px] text-gray-300 font-mono absolute bottom-2 right-4">v1.1</p>
      </div>
    </ResponsivePage >
  );
};

const MemberDetailsModal = ({
  member,
  userRole,
  onClose,
  onEdit,
}: {
  member: Member;
  userRole?: string | null;
  onClose: () => void;
  onEdit: () => void;
}) => {
  const navigate = useNavigate();
  const handleContentClick = (e: React.MouseEvent) => e.stopPropagation();
  const [showQR, setShowQR] = useState(false);
  const [passPayload, setPassPayload] = useState('');
  const [passCode, setPassCode] = useState(member.accessCode || '');
  const [passError, setPassError] = useState('');
  const [passLoading, setPassLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'profile' | 'followups' | 'tags' | 'family'>('profile');
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [memberTags, setMemberTags] = useState<Tag[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(false);
  const [directoryPrivacy, setDirectoryPrivacy] = useState<{
    directoryOptIn: boolean;
    showPhoto: boolean;
    showPhone: boolean;
    showEmail: boolean;
    showBirthday: boolean;
    showAnniversary: boolean;
    showHousehold: boolean;
    showMinistries: boolean;
  } | null>(null);
  const [privacyUnavailable, setPrivacyUnavailable] = useState(false);
  const showServeEligibility = canManageServeEligibility(userRole);
  const showFamilyAccess = canManageFamilyAdmin(userRole);

  useEffect(() => {
    if (!showQR) return;
    let cancelled = false;
    setPassLoading(true);
    setPassError('');
    setPassPayload('');
    void (async () => {
      try {
        const res = await fetchAuthorized(
          `/api/vault?resource=people&subResource=member-pass&memberId=${encodeURIComponent(member.id)}`
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !data?.ok || !data.qrPayload) {
          setPassError(data?.error || 'Could not load this membership pass.');
          return;
        }
        setPassPayload(String(data.qrPayload));
        if (data.accessCode) setPassCode(String(data.accessCode));
      } catch {
        if (!cancelled) setPassError('Could not load this membership pass.');
      } finally {
        if (!cancelled) setPassLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showQR, member.id]);

  useEffect(() => {
    if (activeTab === 'followups') fetchFollowUps();
    if (activeTab === 'tags') fetchTags();
  }, [activeTab]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(
          `/api/vault?resource=people&subResource=directory-privacy&memberId=${encodeURIComponent(member.id)}`,
          { headers }
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (data?.unavailable) {
          setPrivacyUnavailable(true);
          setDirectoryPrivacy(null);
          return;
        }
        if (data?.ok && data.privacy) {
          setPrivacyUnavailable(false);
          setDirectoryPrivacy({
            directoryOptIn: Boolean(data.privacy.directoryOptIn),
            showPhoto: Boolean(data.privacy.showPhoto),
            showPhone: Boolean(data.privacy.showPhone),
            showEmail: Boolean(data.privacy.showEmail),
            showBirthday: Boolean(data.privacy.showBirthday),
            showAnniversary: Boolean(data.privacy.showAnniversary),
            showHousehold: Boolean(data.privacy.showHousehold),
            showMinistries: Boolean(data.privacy.showMinistries),
          });
        }
      } catch {
        if (!cancelled) {
          setPrivacyUnavailable(true);
          setDirectoryPrivacy(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [member.id]);

  const fetchTags = async () => {
    setLoading(true);
    try {
      const [resAll, resMember] = await Promise.all([
        fetch('/api/vault?resource=people&subResource=tags'),
        fetch(`/api/vault?resource=people&subResource=tags&memberId=${member.id}`)
      ]);
      const dataAll = await resAll.json();
      const dataMember = await resMember.json();

      if (dataAll.ok) setAllTags(dataAll.tags);
      if (dataMember.ok) setMemberTags(dataMember.tags);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAssignTag = async (tagId: string) => {
    try {
      const res = await fetch(`/api/vault?resource=people&subResource=tags&action=assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId: member.id, tagId })
      });
      if (res.ok) {
        const tag = allTags.find(t => t.id === tagId);
        if (tag && !memberTags.find(mt => mt.id === tagId)) {
          setMemberTags([...memberTags, tag]);
        }
      }
    } catch (err) { console.error(err); }
  };

  const handleRemoveTag = async (tagId: string) => {
    if (!confirm("Remove this tag?")) return;
    try {
      const res = await fetch(`/api/people?resource=tags&action=assign`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId: member.id, tagId })
      });
      if (res.ok) {
        setMemberTags(memberTags.filter(t => t.id !== tagId));
      }
    } catch (err) { console.error(err); }
  };

  const fetchFollowUps = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/people?resource=followups&memberId=${member.id}`);
      const data = await res.json();
      if (data.ok) setFollowUps(data.followUps);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 pt-24 md:p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-300 overflow-hidden flex flex-col max-h-[85vh]"
        onClick={handleContentClick}
      >
        <div className="overflow-y-auto custom-scrollbar flex-1">
          {/* Header / Cover */}
          <div className="bg-burgundy h-24 relative shrink-0">
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 bg-black/20 text-white rounded-full hover:bg-black/40 transition-colors z-10"
            >
              <UserX size={18} />
            </button>
            <button
              onClick={() => setShowQR(!showQR)}
              className={`absolute top-4 left-4 p-2 rounded-full transition-colors z-10 flex items-center gap-2 px-3 ${showQR ? 'bg-gold text-burgundy font-black' : 'bg-black/20 text-white hover:bg-black/40'}`}
            >
              <QrCode size={18} />
              {showQR && <span className="text-[10px] uppercase tracking-widest">Hide Pass</span>}
            </button>
          </div>

          {/* Profile Info & Tabs */}
          <div className="px-8 pb-8 -mt-12 relative flex flex-col items-center text-center">

            {!showQR && (
              <div className="w-24 h-24 rounded-3xl bg-white p-2 shadow-lg mb-4 cursor-pointer hover:scale-105 transition-transform" onClick={() => setActiveTab('profile')}>
                {member.avatarUrl ? (
                  <img src={member.avatarUrl} alt={member.name} className="w-full h-full rounded-2xl object-cover" />
                ) : (
                  <div className="w-full h-full bg-gold-cream text-burgundy rounded-2xl flex items-center justify-center font-black text-3xl">
                    {member.firstName ? member.firstName.charAt(0) : member.name.charAt(0)}
                  </div>
                )}
              </div>
            )}

            {showQR ? (
              <div className="w-64 bg-white p-6 rounded-[2rem] shadow-xl border-4 border-gold/20 mb-6 animate-in zoom-in-95">
                <div className="bg-white p-2 rounded-xl">
                  {passLoading && <p className="text-xs text-gray-500 py-16">Loading pass…</p>}
                  {passError && <p className="text-xs text-burgundy py-8">{passError}</p>}
                  {passPayload && (
                    <QRCode
                      value={passPayload}
                      size={200}
                      style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                      fgColor="#0d1a14"
                    />
                  )}
                </div>
                <div className="mt-4 space-y-2">
                  <p className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Official Member Pass</p>
                  <div className="bg-gray-100 py-3 px-6 rounded-2xl mt-4 inline-block border-2 border-gray-200">
                    <p className="text-xs uppercase font-black text-gray-600 mb-1 tracking-widest">Backup Code</p>
                    <p className="text-3xl font-black text-[#0d1a14] tracking-[0.2em] font-mono">{passCode || '----'}</p>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <h2 className="text-2xl font-black text-[#0d1a14] mb-1">{member.name}</h2>
                <p className="text-gray-600 font-bold text-base mb-6">{member.email}</p>

                {/* Tabs */}
                <div className="flex flex-wrap p-1 bg-gray-100 rounded-xl w-full mb-6 gap-0.5">
                  <button
                    onClick={() => setActiveTab('profile')}
                    className={`flex-1 min-w-[4.5rem] py-2.5 rounded-lg text-[11px] sm:text-sm font-bold uppercase tracking-wide transition-all ${activeTab === 'profile' ? 'bg-white text-burgundy shadow-sm' : 'text-gray-600 hover:text-[#0d1a14]'}`}
                  >
                    Profile
                  </button>
                  <button
                    onClick={() => setActiveTab('followups')}
                    className={`flex-1 min-w-[4.5rem] py-2.5 rounded-lg text-[11px] sm:text-sm font-bold uppercase tracking-wide transition-all ${activeTab === 'followups' ? 'bg-white text-burgundy shadow-sm' : 'text-gray-600 hover:text-[#0d1a14]'}`}
                  >
                    Follow Ups
                  </button>
                  <button
                    onClick={() => setActiveTab('tags')}
                    className={`flex-1 min-w-[4.5rem] py-2.5 rounded-lg text-[11px] sm:text-sm font-bold uppercase tracking-wide transition-all ${activeTab === 'tags' ? 'bg-white text-burgundy shadow-sm' : 'text-gray-600 hover:text-[#0d1a14]'}`}
                  >
                    Tags
                  </button>
                  {showFamilyAccess && (
                    <button
                      onClick={() => setActiveTab('family')}
                      className={`flex-1 min-w-[5.5rem] py-2.5 rounded-lg text-[11px] sm:text-sm font-bold uppercase tracking-wide transition-all ${activeTab === 'family' ? 'bg-white text-burgundy shadow-sm' : 'text-gray-600 hover:text-[#0d1a14]'}`}
                    >
                      Family & Access
                    </button>
                  )}
                </div>

                {activeTab === 'profile' && (
                  <div className="w-full animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <StatusBadge status={member.status} />

                    <div className="w-full grid grid-cols-2 gap-4 mt-6">
                      <div className="bg-gray-50 p-4 rounded-2xl">
                        <p className="text-xs font-black text-gray-600 uppercase tracking-widest mb-1.5">Phone</p>
                        <div className="flex items-center justify-center gap-2 text-[#0d1a14] font-bold text-base">
                          <Phone size={16} className="text-gold shrink-0" />
                          <span className="truncate">{member.phone}</span>
                        </div>
                      </div>
                      <div className="bg-gray-50 p-4 rounded-2xl">
                        <p className="text-xs font-black text-gray-600 uppercase tracking-widest mb-1.5">Birthday</p>
                        <div className="flex items-center justify-center gap-2 text-[#0d1a14] font-bold text-base">
                          <span className="text-lg">🎂</span>
                          <span>{formatMemberBirthday(member.birthday) || 'N/A'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="w-full mt-4 bg-gold-cream/40 p-4 rounded-2xl border border-gold/10">
                      <p className="text-xs font-black text-gray-600 uppercase tracking-widest mb-2">Household</p>
                      {member.household !== 'Unassigned' ? (
                        <div className="flex items-center justify-center gap-2 text-burgundy font-bold text-base">
                          <Home size={18} className="text-gold shrink-0" />
                          {member.household}
                        </div>
                      ) : (
                        <span className="text-gray-600 italic text-sm">No household assigned</span>
                      )}
                    </div>

                    <div className="w-full mt-4 bg-gray-50 p-4 rounded-2xl border border-gray-100 text-left">
                      <p className="text-xs font-black text-gray-600 uppercase tracking-widest mb-2">
                        Connect directory privacy
                      </p>
                      {privacyUnavailable ? (
                        <p className="text-sm text-gray-500 italic">
                          Privacy preferences are not available yet (apply Phase 2.8A migration).
                        </p>
                      ) : directoryPrivacy ? (
                        <div className="space-y-2">
                          <p className="text-sm font-bold text-[#0d1a14]">
                            Directory opt-in:{' '}
                            <span className={directoryPrivacy.directoryOptIn ? 'text-emerald-700' : 'text-gray-500'}>
                              {directoryPrivacy.directoryOptIn ? 'Yes' : 'No (default)'}
                            </span>
                          </p>
                          <ul className="grid grid-cols-2 gap-1.5 text-[11px] text-gray-600">
                            <li>Photo: {directoryPrivacy.showPhoto ? 'Shown' : 'Hidden'}</li>
                            <li>Phone: {directoryPrivacy.showPhone ? 'Shown' : 'Hidden'}</li>
                            <li>Email: {directoryPrivacy.showEmail ? 'Shown' : 'Hidden'}</li>
                            <li>Birthday: {directoryPrivacy.showBirthday ? 'Month/day' : 'Hidden'}</li>
                            <li>Anniversary: {directoryPrivacy.showAnniversary ? 'Month/day' : 'Hidden'}</li>
                            <li>Household: {directoryPrivacy.showHousehold ? 'Shown' : 'Hidden'}</li>
                            <li className="col-span-2">
                              Ministries: {directoryPrivacy.showMinistries ? 'Shown' : 'Hidden'}
                            </li>
                          </ul>
                          <p className="text-[10px] text-gray-400 leading-relaxed pt-1">
                            Read-only. Members set these in Connect → My Profile. Pastoral birthday above is unchanged.
                          </p>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500 italic">Loading privacy preferences…</p>
                      )}
                    </div>

                    {/* Ministry & Children */}
                    <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                      <div className="bg-gold-cream/30 p-4 rounded-2xl border border-gold/10">
                        <p className="text-xs font-black text-gray-600 uppercase tracking-widest mb-2">Ministries</p>
                        {member.ministries && member.ministries.length > 0 ? (
                          <div className="flex flex-wrap gap-2 justify-center">
                            {member.ministries.map((m, i) => (
                              <span key={i} className="px-2.5 py-1.5 bg-white rounded-lg text-xs font-bold text-burgundy shadow-sm border border-gold/5">
                                {m}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-gray-600 text-sm italic">No ministries listed</span>
                        )}
                      </div>

                      <div className="bg-gold-cream/30 p-4 rounded-2xl border border-gold/10">
                        <p className="text-xs font-black text-gray-600 uppercase tracking-widest mb-2">Children</p>
                        {member.children && member.children.length > 0 ? (
                          <div className="space-y-2">
                            {member.children.map((c, i) => (
                              <div key={i} className="flex items-center justify-between bg-white p-2.5 rounded-xl">
                                <span className="text-sm font-bold text-[#0d1a14]">{c.name}</span>
                                <span className="text-xs bg-gold/10 text-[#8A6A2E] px-2.5 py-1 rounded-full font-bold">{c.age}y</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-gray-600 text-sm italic">No children listed</span>
                        )}
                      </div>
                    </div>

                    {/* Serve Eligibility — staff-verified; uses same-UUID users.id link only */}
                    {showServeEligibility && (
                      <ServeEligibilitySection memberId={member.id} />
                    )}

                    <ConsentAcknowledgementsSection
                      memberId={member.id}
                      memberRole={member.role}
                    />

                    <div className="w-full mt-8 pt-6 border-t border-gray-100 flex gap-3">
                      <button
                        type="button"
                        onClick={() => navigate(`/church-profile?member=${encodeURIComponent(member.id)}`)}
                        className="flex-1 py-3.5 bg-white text-burgundy font-bold text-base rounded-xl border border-burgundy/20 hover:bg-burgundy/5 active:scale-95 transition-all"
                      >
                        View profile
                      </button>
                      <button
                        onClick={onEdit}
                        className="flex-1 py-3.5 bg-burgundy text-gold font-bold text-base rounded-xl shadow-lg hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2"
                      >
                        <MoreHorizontal size={18} />
                        Edit Profile
                      </button>
                    </div>
                    <div className="mt-4 text-xs text-gray-500 font-bold uppercase tracking-widest">
                      Joined {member.joinedDate}
                    </div>
                  </div>
                )}

                {activeTab === 'tags' && (
                  <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">

                    {/* Assigned Tags */}
                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 min-h-[100px]">
                      <p className="text-xs font-black text-gray-600 uppercase tracking-widest mb-3">Assigned Tags</p>
                      {loading ? (
                        <div className="flex justify-center py-4"><span className="text-sm text-gray-500 animate-pulse">Loading tags...</span></div>
                      ) : memberTags.length === 0 ? (
                        <p className="text-sm text-gray-600 italic">No tags assigned yet.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {memberTags.map(tag => (
                            <span key={tag.id} className={`inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider ${tag.color} shadow-sm border border-black/5`}>
                              {tag.name}
                              <button onClick={() => handleRemoveTag(tag.id)} className="p-0.5 hover:bg-black/10 rounded-full transition-colors"><UserX size={12} /></button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Add Tag */}
                    <div>
                      <p className="text-xs font-black text-gray-600 uppercase tracking-widest mb-2">Add Tag</p>
                      <div className="relative">
                        <select
                          onChange={(e) => {
                            if (e.target.value) {
                              handleAssignTag(e.target.value);
                              e.target.value = "";
                            }
                          }}
                          className="w-full p-4 bg-white border-2 border-gray-100 rounded-2xl text-base font-bold text-[#0d1a14] outline-none focus:border-gold appearance-none cursor-pointer"
                        >
                          <option value="">Select a tag to assign...</option>
                          {allTags
                            .filter(t => !memberTags.find(mt => mt.id === t.id))
                            .map(tag => (
                              <option key={tag.id} value={tag.id}>
                                {tag.name} ({tag.category})
                              </option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" size={18} />
                      </div>
                      <p className="text-xs text-gray-500 mt-2 text-center">Manage all tags in <span className="text-burgundy font-bold">Menu &gt; Tags</span></p>
                    </div>

                  </div>
                )}

                {activeTab === 'family' && showFamilyAccess && (
                  <FamilyAccessSection memberId={member.id} />
                )}

                {activeTab === 'followups' && (
                  <div className="w-full text-left animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-xs font-black text-gray-600 uppercase tracking-widest">History</h3>
                      <button className="text-xs font-bold text-burgundy bg-burgundy/5 px-3 py-2 rounded-lg border border-burgundy/10 hover:bg-burgundy hover:text-white transition-colors">
                        + Add Note
                      </button>
                    </div>

                    {loading ? (
                      <div className="py-8 text-center text-gray-600 text-sm font-medium">Loading history...</div>
                    ) : followUps.length === 0 ? (
                      <div className="py-8 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                        <p className="text-gray-600 text-sm font-medium">No follow-ups recorded.</p>
                      </div>
                    ) : (
                      <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
                        {followUps.map(fu => (
                          <div key={fu.id} className="bg-gray-50 p-4 rounded-2xl border border-gray-100 hover:border-gold/20 transition-colors">
                            <div className="flex justify-between items-start mb-2">
                              <span className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${fu.priority === 'Urgent' ? 'bg-red-100 text-red-700' :
                                fu.priority === 'High' ? 'bg-orange-100 text-orange-700' :
                                  'bg-blue-100 text-blue-700'
                                }`}>
                                {fu.priority}
                              </span>
                              <span className="text-xs font-bold text-gray-500">
                                {new Date(fu.created_at).toLocaleDateString()}
                              </span>
                            </div>
                            <p className="text-sm font-medium text-[#0d1a14] leading-relaxed mb-3">
                              {fu.notes}
                            </p>
                            <div className="flex items-center justify-between pt-2 border-t border-gray-200/50">
                              <span className="text-xs text-gray-600 font-bold uppercase">{fu.type}</span>
                              <div className="flex items-center gap-1.5">
                                {fu.status === 'Completed' ? (
                                  <CheckCircle2 size={14} className="text-green-500" />
                                ) : (
                                  <Clock size={14} className="text-orange-400" />
                                )}
                                <span className="text-xs font-bold text-gray-600">{fu.status}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const StatCard = ({ label, value, icon, color }: any) => (
  <div className="bg-white p-5 rounded-3xl border border-gray-50 shadow-sm flex items-center gap-4">
    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${color === 'burgundy' ? 'bg-burgundy/5 text-burgundy' : color === 'gold' ? 'bg-gold/10 text-gold' : 'bg-gray-50 text-gray-500'}`}>
      {icon}
    </div>
    <div>
      <p className="text-xs font-black text-gray-600 uppercase tracking-widest">{label}</p>
      <p className="text-lg font-black text-[#0d1a14]">{value}</p>
    </div>
  </div>
);

const StatusBadge = ({ status }: { status: string }) => (
  <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-widest border ${status === 'Active' ? 'bg-gold-cream text-[#8A6A2E] border-gold/30' :
    status === 'Visitor' ? 'bg-burgundy/5 text-burgundy border-burgundy/10' :
      'bg-gray-50 text-gray-600 border-gray-200'
    }`}>
    <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${status === 'Active' ? 'bg-gold' : status === 'Visitor' ? 'bg-burgundy' : 'bg-gray-400'}`} />
    {status}
  </span>
);

const FooterHelp = ({ title, sub, icon, color }: any) => (
  <div className="flex items-center gap-3">
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${color === 'gold' ? 'bg-gold-cream text-gold border border-gold/10' : 'bg-burgundy/5 text-burgundy border border-burgundy/10'}`}>
      {React.cloneElement(icon, { size: 20 })}
    </div>
    <div className="text-left">
      <h4 className="text-xs font-black text-[#0d1a14] uppercase tracking-tight">{title}</h4>
      <p className="text-[11px] text-gray-400 font-medium">{sub}</p>
    </div>
  </div>
);

export default MembersPage;