
import React, { useState, useEffect } from 'react';
import { Users, ShieldCheck, Heart, Monitor, UserPlus, MoreVertical, Star, Sparkles, LifeBuoy, ChevronRight, Search, Plus, Edit2, Trash2, FolderPlus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useNav } from '../../App';

interface Ministry {
  id: string;
  name: string;
  description?: string;
}

interface Team {
  id: string;
  name: string;
  description?: string;
  leader_id?: string;
  color?: string;
  icon_name?: string;
  category?: string; // Legacy
  ministry_id?: string;
  memberCount?: number;
  isJoined?: boolean;
  members?: {
    id: string;
    firstName: string;
    lastName: string;
    avatarUrl?: string;
    role?: string;
  }[];
  leader?: {
    first_name: string;
    last_name: string;
    avatar_url?: string;
  };
}

const TeamsPage: React.FC = () => {
  const { userRole, userId } = useNav();

  /* API State */
  const [ministries, setMinistries] = useState<Ministry[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  /* Modals State */
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [isMinistryModalOpen, setIsMinistryModalOpen] = useState(false);

  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [editingMinistry, setEditingMinistry] = useState<Ministry | null>(null);

  /* Data for Selects */
  const [members, setMembers] = useState<any[]>([]);

  /* Team Members Modal State */
  const [viewingTeam, setViewingTeam] = useState<Team | null>(null);
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
  const [memberToAdd, setMemberToAdd] = useState('');

  /* Forms State */
  const [teamForm, setTeamForm] = useState({
    name: '',
    description: '',
    leaderId: '',
    color: 'bg-burgundy',
    iconName: 'Star',
    ministryId: ''
  });

  const [ministryForm, setMinistryForm] = useState({
    name: '',
    description: ''
  });

  /* Auth Helper */
  const getAuthHeaders = async () => {
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    try {
      const { data } = await supabase!.auth.getSession();
      if (data.session?.access_token) {
        headers['Authorization'] = `Bearer ${data.session.access_token}`;
      }
    } catch (e) {
      console.warn("Failed to get session", e);
    }

    if (userId) {
      headers['X-User-ID'] = userId;
    }
    return headers;
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const [minRes, teamRes, memRes] = await Promise.all([
        fetch('/api/vault?resource=people&subResource=ministries'),
        fetch(`/api/vault?resource=people&subResource=teams${userId ? `&userId=${userId}` : ''}`),
        fetch('/api/vault?resource=people')
      ]);

      const minData = await minRes.json();
      const teamData = await teamRes.json();
      const memData = await memRes.json();

      if (minData.ok && Array.isArray(minData.ministries)) setMinistries(minData.ministries);
      if (teamData.ok && Array.isArray(teamData.teams)) setTeams(teamData.teams);
      if (memData.ok && Array.isArray(memData.members)) setMembers(memData.members);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [userId]);

  /* Handlers */
  const handleTeamSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = '/api/vault?resource=people&subResource=teams';
      const method = editingTeam ? 'PATCH' : 'POST';
      const payload = {
        ...teamForm,
        ministryId: teamForm.ministryId || null,
        leaderId: teamForm.leaderId || null
      };

      const body = editingTeam ? { id: editingTeam.id, ...payload } : payload;
      const headers = await getAuthHeaders();

      const res = await fetch(url, {
        method,
        headers,
        body: JSON.stringify(body)
      });

      if (res.ok) {
        await fetchData();
        setIsTeamModalOpen(false);
        setEditingTeam(null);
        setTeamForm({ name: '', description: '', leaderId: '', color: 'bg-burgundy', iconName: 'Star', ministryId: '' });
      } else {
        const err = await res.json().catch(() => ({}));
        console.error("Save Team Error:", err);
        alert(`Failed to save team: ${err.error || err.details || 'Unknown Error'}`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleMinistrySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = '/api/vault?resource=people&subResource=ministries';
      const method = editingMinistry ? 'PATCH' : 'POST';
      const body = editingMinistry ? { id: editingMinistry.id, ...ministryForm } : ministryForm;
      const headers = await getAuthHeaders();

      const res = await fetch(url, {
        method,
        headers,
        body: JSON.stringify(body)
      });

      if (res.ok) {
        fetchData();
        setIsMinistryModalOpen(false);
        setEditingMinistry(null);
        setMinistryForm({ name: '', description: '' });
      } else {
        const err = await res.json().catch(() => ({}));
        console.error("Save Ministry Error:", err);
        alert(`Failed to save ministry: ${err.error || 'Unknown Error'}`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const deleteTeam = async (id: string) => {
    if (!confirm('Delete this team?')) return;
    const headers = await getAuthHeaders();
    await fetch('/api/vault?resource=people&subResource=teams', {
      method: 'DELETE',
      headers,
      body: JSON.stringify({ id })
    });
    fetchData();
  };

  const deleteMinistry = async (id: string) => {
    if (!confirm('Delete this ministry? This may orphan teams.')) return;
    const headers = await getAuthHeaders();
    await fetch('/api/vault?resource=people&subResource=ministries', {
      method: 'DELETE',
      headers,
      body: JSON.stringify({ id })
    });
    fetchData();
  };

  const joinTeam = async (teamId: string) => {
    if (!userId) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/vault?resource=people&subResource=teams&action=join`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ teamId, memberId: userId })
      });

      if (res.ok) {
        await fetchData(); // Wait for refresh
      } else {
        const err = await res.json().catch(() => ({}));
        console.error("Join failed:", err);
        alert(`Failed to join team: ${err.error || err.details || 'System Error'}`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const leaveTeam = async (teamId: string) => {
    if (!userId) return;
    if (!confirm('Leave this team?')) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/vault?resource=people&subResource=teams&action=leave`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ teamId, memberId: userId })
      });

      if (res.ok) {
        await fetchData(); // Wait for refresh
      } else {
        const err = await res.json().catch(() => ({}));
        console.error("Leave failed:", err);
        alert(`Failed to leave team: ${err.error || 'System Error'}`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const openTeamModal = (team?: Team, preselectedMinistryId?: string) => {
    if (team) {
      setEditingTeam(team);
      setTeamForm({
        name: team.name,
        description: team.description || '',
        leaderId: team.leader_id || '',
        color: team.color || 'bg-burgundy',
        iconName: team.icon_name || 'Star',
        ministryId: team.ministry_id || ''
      });
    } else {
      setEditingTeam(null);
      setTeamForm({
        name: '',
        description: '',
        leaderId: '',
        color: 'bg-burgundy',
        iconName: 'Star',
        ministryId: preselectedMinistryId || ''
      });
    }
    setIsTeamModalOpen(true);
  };

  const openMinistryModal = (min?: Ministry) => {
    if (min) {
      setEditingMinistry(min);
      setMinistryForm({ name: min.name, description: min.description || '' });
    } else {
      setEditingMinistry(null);
      setMinistryForm({ name: '', description: '' });
    }
    setIsMinistryModalOpen(true);
  };

  /* Members Handlers */
  const openMembersModal = (team: Team) => {
    setViewingTeam(team);
    setIsMembersModalOpen(true);
    setMemberToAdd('');
  };

  const addMemberToTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!viewingTeam || !memberToAdd) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/vault?resource=people&subResource=teams&action=join`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ teamId: viewingTeam.id, memberId: memberToAdd })
      });
      if (res.ok) {
        await fetchData();
        setMemberToAdd('');
      } else {
        const err = await res.json().catch(() => ({}));
        console.error("Add Member Error:", err);
        alert(`Failed to add member: ${err.error || 'Unknown Error'}`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const removeMemberFromTeam = async (memberId: string) => {
    if (!viewingTeam) return;
    if (!confirm('Remove this member?')) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/vault?resource=people&subResource=teams&action=leave`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ teamId: viewingTeam.id, memberId })
      });
      if (res.ok) {
        await fetchData();
      } else {
        const err = await res.json().catch(() => ({}));
        console.error("Remove Member Error:", err);
        alert(`Failed to remove member: ${err.error || 'Unknown Error'}`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Sync viewingTeam with updated teams data
  useEffect(() => {
    if (viewingTeam) {
      const updated = teams.find(t => t.id === viewingTeam.id);
      if (updated) setViewingTeam(updated);
    }
  }, [teams]);

  // Group teams by ministry
  const groupedTeams = React.useMemo(() => {
    const groups: Record<string, Team[]> = {};
    ministries.forEach(m => groups[m.id] = []);
    groups['other'] = [];

    teams.forEach(t => {
      if (t.ministry_id && groups[t.ministry_id]) {
        groups[t.ministry_id].push(t);
      } else {
        groups['other'].push(t);
      }
    });
    return groups;
  }, [ministries, teams]);

  const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';
  const isTeamLeader = (team: Team) => userId === team.leader_id;
  const canManageTeam = (team: Team) => isAdmin || isTeamLeader(team);

  return (
    <div className="pb-40 px-4 md:px-8 max-w-[1600px] mx-auto animate-in fade-in duration-700">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12 pt-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-1 w-12 bg-burgundy rounded-full" />
            <span className="text-[10px] font-black text-burgundy/60 uppercase tracking-[0.3em]">Organization</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-black text-[#0d1a14] tracking-tighter uppercase leading-none">
            Ministry <span className="text-gold">Teams</span>
          </h1>
          <p className="text-gray-400 font-medium text-lg mt-4 max-w-2xl">
            Coordinate volunteer rotations, manage departmental leadership, and organize the structural hierarchy of your organization.
          </p>
        </div>

        {isAdmin && (
          <div className="flex gap-3">
            <button
              onClick={() => openMinistryModal()}
              className="flex items-center gap-2 px-6 py-4 bg-white text-burgundy font-black text-[10px] uppercase tracking-widest rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all active:scale-95"
            >
              <FolderPlus size={18} />
              New Ministry
            </button>
            <button
              onClick={() => openTeamModal()}
              className="flex items-center gap-2 px-6 py-4 bg-burgundy text-gold font-black text-[10px] uppercase tracking-widest rounded-2xl shadow-xl shadow-burgundy/20 hover:bg-burgundy-dark hover:shadow-2xl transition-all active:scale-95 border-b-4 border-gold/20"
            >
              <UserPlus size={18} />
              New Team
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-12 h-12 border-4 border-gray-100 border-t-burgundy rounded-full animate-spin" />
          <p className="text-gray-300 font-black text-xs uppercase tracking-widest">Syncing Directory...</p>
        </div>
      ) : (
        <div className="space-y-16">
          {ministries.map(ministry => (
            <div key={ministry.id} className="scroll-mt-24">
              <div className="flex items-center justify-between mb-8 group">
                <div>
                  <h2 className="text-2xl md:text-3xl font-black text-[#0d1a14] tracking-tight uppercase flex items-center gap-3">
                    {ministry.name}
                    {isAdmin && (
                      <button onClick={() => openMinistryModal(ministry)} className="opacity-0 group-hover:opacity-100 p-2 text-gray-300 hover:text-gold transition-all">
                        <Edit2 size={16} />
                      </button>
                    )}
                  </h2>
                  {ministry.description && <p className="text-gray-400 font-medium mt-1">{ministry.description}</p>}
                </div>
                {isAdmin && (
                  <button
                    onClick={() => openTeamModal(undefined, ministry.id)}
                    className="hidden group-hover:flex items-center gap-2 px-4 py-2 bg-gray-50 text-gray-400 font-bold text-xs rounded-xl hover:bg-burgundy/5 hover:text-burgundy transition-all"
                  >
                    <Plus size={14} /> Add Team to {ministry.name}
                  </button>
                )}
              </div>

              {groupedTeams[ministry.id]?.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {groupedTeams[ministry.id].map(team =>
                    <TeamCard
                      key={team.id}
                      team={team}
                      isAdmin={isAdmin} // Pass global admin
                      canManage={canManageTeam(team)} // Pass specific manage permission 
                      onEdit={openTeamModal}
                      onDelete={deleteTeam}
                      onJoin={joinTeam}
                      onLeave={leaveTeam}
                      onViewMembers={openMembersModal}
                      userId={userId}
                    />
                  )}
                </div>
              ) : (
                <div className="p-8 border-2 border-dashed border-gray-100 rounded-3xl text-center text-gray-300 font-bold text-sm bg-gray-50/50">
                  No teams assigned to this ministry yet.
                </div>
              )}
            </div>
          ))}

          {/* Other Teams Section */}
          {groupedTeams['other'].length > 0 && (
            <div className="pt-8 border-t border-gray-100">
              <h2 className="text-2xl font-black text-gray-400 tracking-tight uppercase mb-8">Uncategorized Teams</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {groupedTeams['other'].map(team =>
                  <TeamCard
                    key={team.id}
                    team={team}
                    isAdmin={isAdmin}
                    canManage={canManageTeam(team)}
                    onEdit={openTeamModal}
                    onDelete={deleteTeam}
                    onJoin={joinTeam}
                    onLeave={leaveTeam}
                    onViewMembers={openMembersModal}
                    userId={userId}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Members Modal */}
      {isMembersModalOpen && viewingTeam && (
        <div className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-2xl p-8 md:p-10 shadow-2xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-black text-[#0d1a14] uppercase">
                {viewingTeam.name} <span className="text-gold">Members</span>
              </h2>
              <button onClick={() => setIsMembersModalOpen(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:bg-gray-200">
                &times;
              </button>
            </div>

            {/* Add Member Form (Admins/Leaders) */}
            {canManageTeam(viewingTeam) && (
              <form onSubmit={addMemberToTeam} className="mb-8 p-6 bg-gray-50 rounded-2xl border border-gray-100">
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Add Member</h3>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <select
                      className="w-full h-12 px-4 bg-white rounded-xl font-bold text-[#0d1a14] outline-none focus:ring-2 focus:ring-burgundy/20 appearance-none shadow-sm"
                      value={memberToAdd}
                      onChange={e => setMemberToAdd(e.target.value)}
                    >
                      <option value="">Select a member...</option>
                      {members
                        .filter(m => !viewingTeam.members?.some(tm => tm.id === m.id)) // Filter out already joined
                        .map(m => (
                          <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>
                        ))}
                    </select>
                    <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 rotate-90 text-gray-400 pointer-events-none" size={16} />
                  </div>
                  <button type="submit" disabled={!memberToAdd} className="px-6 bg-burgundy text-gold rounded-xl font-black uppercase text-[10px] tracking-widest disabled:opacity-50 disabled:cursor-not-allowed hover:bg-burgundy-dark transition-colors">
                    Add
                  </button>
                </div>
              </form>
            )}

            {/* Members List */}
            <div className="space-y-4">
              {viewingTeam.members && viewingTeam.members.length > 0 ? (
                viewingTeam.members.map(member => (
                  <div key={member.id} className="flex items-center justify-between p-4 bg-white border border-gray-100 rounded-2xl shadow-sm hover:shadow-md transition-all">
                    <div className="flex items-center gap-4">
                      {member.avatarUrl ? (
                        <img src={member.avatarUrl} alt={member.firstName} className="w-10 h-10 rounded-full object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-burgundy/10 text-burgundy flex items-center justify-center font-black text-sm">
                          {member.firstName?.charAt(0)}
                        </div>
                      )}
                      <div>
                        <p className="font-bold text-[#0d1a14]">{member.firstName} {member.lastName}</p>
                        <p className="text-xs text-gray-400 font-medium capitalize">{member.role}</p>
                      </div>
                    </div>

                    {canManageTeam(viewingTeam) && (
                      <button
                        onClick={() => removeMemberFromTeam(member.id)}
                        className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                        title="Remove Member"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-center py-10 text-gray-400 italic">No members in this team yet.</div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* Ministry Modal */}
      {isMinistryModalOpen && (
        <div className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-lg p-8 md:p-10 shadow-2xl animate-in zoom-in-95">
            <h2 className="text-2xl font-black text-[#0d1a14] uppercase mb-8">{editingMinistry ? 'Edit Ministry' : 'New Ministry'}</h2>
            <form onSubmit={handleMinistrySubmit} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Ministry Name</label>
                <input className="w-full h-14 px-6 bg-gray-50 rounded-2xl font-bold text-[#0d1a14] outline-none focus:ring-2 focus:ring-burgundy/20 transition-all" value={ministryForm.name} onChange={e => setMinistryForm({ ...ministryForm, name: e.target.value })} placeholder="e.g. Worship Arts" required />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Description</label>
                <textarea className="w-full h-32 p-6 bg-gray-50 rounded-2xl font-bold text-[#0d1a14] outline-none focus:ring-2 focus:ring-burgundy/20 transition-all resize-none" value={ministryForm.description} onChange={e => setMinistryForm({ ...ministryForm, description: e.target.value })} placeholder="Describe the ministry's purpose..." />
              </div>
              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setIsMinistryModalOpen(false)} className="flex-1 h-14 rounded-xl font-black text-gray-400 hover:bg-gray-50 transition-colors uppercase tracking-widest text-xs">Cancel</button>
                <button type="submit" className="flex-1 h-14 bg-burgundy text-gold rounded-xl font-black uppercase tracking-widest text-xs shadow-lg shadow-burgundy/20 hover:bg-burgundy-dark transition-all active:scale-95">Save Ministry</button>
              </div>
              {editingMinistry && (
                <button type="button" onClick={() => { setIsMinistryModalOpen(false); deleteMinistry(editingMinistry.id); }} className="w-full text-red-400 font-black text-[10px] uppercase tracking-widest hover:text-red-600 mt-4">Delete Ministry</button>
              )}
            </form>
          </div>
        </div>
      )}

      {/* Team Modal */}
      {isTeamModalOpen && (
        <div className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-xl p-8 md:p-10 shadow-2xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-black text-[#0d1a14] uppercase mb-8">{editingTeam ? 'Edit Team' : 'New Team'}</h2>
            <form onSubmit={handleTeamSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Team Name</label>
                  <input className="w-full h-14 px-6 bg-gray-50 rounded-2xl font-bold text-[#0d1a14] outline-none focus:ring-2 focus:ring-burgundy/20 transition-all" value={teamForm.name} onChange={e => setTeamForm({ ...teamForm, name: e.target.value })} placeholder="e.g. Choir" required />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Ministry</label>
                  <div className="relative">
                    <select className="w-full h-14 px-6 bg-gray-50 rounded-2xl font-bold text-[#0d1a14] outline-none focus:ring-2 focus:ring-burgundy/20 transition-all appearance-none" value={teamForm.ministryId} onChange={e => setTeamForm({ ...teamForm, ministryId: e.target.value })}>
                      <option value="">Select Ministry...</option>
                      {ministries.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                    <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 rotate-90 text-gray-400 pointer-events-none" size={16} />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Description</label>
                <textarea className="w-full h-24 p-6 bg-gray-50 rounded-2xl font-bold text-[#0d1a14] outline-none focus:ring-2 focus:ring-burgundy/20 transition-all resize-none" value={teamForm.description} onChange={e => setTeamForm({ ...teamForm, description: e.target.value })} placeholder="Team responsibilities..." />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Team Leader</label>
                <div className="relative">
                  <select className="w-full h-14 px-6 bg-gray-50 rounded-2xl font-bold text-[#0d1a14] outline-none focus:ring-2 focus:ring-burgundy/20 transition-all appearance-none" value={teamForm.leaderId} onChange={e => setTeamForm({ ...teamForm, leaderId: e.target.value })}>
                    <option value="">No Leader Assigned</option>
                    {members.map(m => <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>)}
                  </select>
                  <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 rotate-90 text-gray-400 pointer-events-none" size={16} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Color Theme</label>
                  <div className="relative">
                    <select className="w-full h-14 px-6 bg-gray-50 rounded-2xl font-bold text-[#0d1a14] outline-none focus:ring-2 focus:ring-burgundy/20 transition-all appearance-none" value={teamForm.color} onChange={e => setTeamForm({ ...teamForm, color: e.target.value })}>
                      <option value="bg-burgundy">Burgundy</option>
                      <option value="bg-gold">Gold</option>
                      <option value="bg-[#1a2e35]">Navy</option>
                      <option value="bg-gray-800">Dark</option>
                      <option value="bg-white">White</option>
                    </select>
                    <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 rotate-90 text-gray-400 pointer-events-none" size={16} />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Icon</label>
                  <div className="relative">
                    <select className="w-full h-14 px-6 bg-gray-50 rounded-2xl font-bold text-[#0d1a14] outline-none focus:ring-2 focus:ring-burgundy/20 transition-all appearance-none" value={teamForm.iconName} onChange={e => setTeamForm({ ...teamForm, iconName: e.target.value })}>
                      <option value="Star">Star</option>
                      <option value="Heart">Heart</option>
                      <option value="ShieldCheck">Shield</option>
                      <option value="Users">Users</option>
                      <option value="Monitor">Monitor</option>
                      <option value="Sparkles">Sparkles</option>
                    </select>
                    <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 rotate-90 text-gray-400 pointer-events-none" size={16} />
                  </div>
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setIsTeamModalOpen(false)} className="flex-1 h-14 rounded-xl font-black text-gray-400 hover:bg-gray-50 transition-colors uppercase tracking-widest text-xs">Cancel</button>
                <button type="submit" className="flex-1 h-14 bg-burgundy text-gold rounded-xl font-black uppercase tracking-widest text-xs shadow-lg shadow-burgundy/20 hover:bg-burgundy-dark transition-all active:scale-95">Save Team</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

const TeamCard: React.FC<{ team: Team, isAdmin: boolean, canManage: boolean, onEdit: (t: Team) => void, onDelete: (id: string) => void, onJoin: (id: string) => void, onLeave: (id: string) => void, onViewMembers: (t: Team) => void, userId?: string }> = ({ team, isAdmin, canManage, onEdit, onDelete, onJoin, onLeave, onViewMembers, userId }) => {
  const IconComponent = { Star, Heart, Monitor, ShieldCheck, Users, Sparkles }[team.icon_name || 'Star'] || Star;
  const isLight = team.color === 'bg-white' || team.color === 'bg-gold';
  const textColor = isLight ? 'text-[#0d1a14]' : 'text-gold';
  const subTextColor = isLight ? 'text-burgundy/60' : 'text-white/60';

  return (
    <div className="bg-white rounded-[2.5rem] border border-gray-50 shadow-sm hover:shadow-xl transition-all duration-500 overflow-hidden flex flex-col h-full group">
      <div className={`p-8 ${team.color || 'bg-burgundy'} ${textColor} relative overflow-hidden`}>
        {/* Ambient Bg */}
        <div className="absolute top-0 right-0 p-4 opacity-10 rotate-12 group-hover:scale-150 transition-transform duration-700">
          <IconComponent size={140} />
        </div>

        <div className={`w-14 h-14 rounded-2xl ${isLight ? 'bg-burgundy/5' : 'bg-white/10'} backdrop-blur-sm flex items-center justify-center mb-6 shadow-sm ring-1 ring-white/20 relative z-10`}>
          <IconComponent size={28} />
        </div>

        <h3 className="text-xl font-black tracking-tight leading-tight relative z-10 mb-2">{team.name}</h3>
        {team.leader ? (
          <div className="flex items-center gap-2 relative z-10">
            <div className={`w-6 h-6 rounded-full ${isLight ? 'bg-burgundy text-gold' : 'bg-white text-burgundy'} flex items-center justify-center font-bold text-[10px]`}>
              {team.leader.first_name.charAt(0)}
            </div>
            <span className={`text-xs font-bold ${subTextColor}`}>{team.leader.first_name} {team.leader.last_name || ''}</span>
          </div>
        ) : (
          <span className={`text-[10px] font-bold uppercase tracking-widest ${subTextColor} opacity-60`}>Needs Leader</span>
        )}
      </div>

      <div className="p-6 flex-1 flex flex-col justify-between gap-6">
        <div>
          <p className="text-gray-500 text-sm font-medium leading-relaxed line-clamp-3 mb-4">
            {team.description || "No description provided."}
          </p>
          <button onClick={() => onViewMembers(team)} className="w-full flex items-center justify-between hover:bg-gray-50 p-2 -mx-2 rounded-lg transition-colors group/members">
            <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest group-hover/members:text-burgundy transition-colors">Active Members</span>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-400 group-hover/members:text-burgundy">View All</span>
              <span className="text-sm font-black text-burgundy bg-burgundy/5 px-3 py-1 rounded-lg">
                {team.memberCount || 0}
              </span>
            </div>
          </button>
        </div>

        <div className="flex gap-2 pt-4 border-t border-gray-50">
          {team.isJoined ? (
            <button onClick={() => onLeave(team.id)} className="flex-1 h-12 rounded-xl bg-gray-100 text-gray-500 font-bold text-xs uppercase tracking-wide hover:bg-red-50 hover:text-red-500 transition-colors">
              Leave
            </button>
          ) : (
            <button onClick={() => onJoin(team.id)} className="flex-1 h-12 rounded-xl bg-gold-cream text-gold font-black text-xs uppercase tracking-wide hover:bg-gold hover:text-white transition-colors shadow-sm">
              Join Team
            </button>
          )}

          {canManage && (
            <button onClick={() => onEdit(team)} className="w-12 h-12 rounded-xl border border-gray-100 flex items-center justify-center text-gray-400 hover:text-burgundy hover:border-burgundy/20 transition-colors">
              <Edit2 size={16} />
            </button>
          )}
          {isAdmin && (
            <button onClick={() => onDelete(team.id)} className="w-12 h-12 rounded-xl border border-gray-100 flex items-center justify-center text-gray-400 hover:text-red-500 hover:border-red-100 transition-colors">
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default TeamsPage;
