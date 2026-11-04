
import React, { useState, useEffect } from 'react';
import {
  Heart,
  Plus,
  UserPlus,
  CheckCircle,
  Users,
  Star,
  Sparkles,
  LifeBuoy,
  ChevronRight,
  ShieldCheck,
  Monitor,
  Calendar,
  Loader2,
  AlertCircle,
  X,
  Search,
  Trash2
} from 'lucide-react';
import { getAuthHeaders } from '../../lib/api';

const EventsVolunteers: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<any[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [teams, setTeams] = useState<any[]>([]);
  const [volunteers, setVolunteers] = useState<any[]>([]);

  // Roster Modal State
  const [isRosterOpen, setIsRosterOpen] = useState(false);
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
  const [memberSearch, setMemberSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Fetch Initial Data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        // 1. Fetch Upcoming Events
        const eventsRes = await fetch('/api/vault?resource=events&subResource=events&type=Service&limit=10');
        const eventsData = await eventsRes.json();

        // 2. Fetch Teams
        const teamsRes = await fetch('/api/vault?resource=people&subResource=teams');
        const teamsData = await teamsRes.json();

        if (eventsData.ok) {
          setEvents(eventsData.events);
          if (eventsData.events.length > 0) {
            setSelectedEventId(eventsData.events[0].id);
          }
        }
        if (teamsData.ok) setTeams(teamsData.teams);

      } catch (error) {
        console.error("Failed to fetch data:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Fetch Volunteers when Event Changes
  useEffect(() => {
    if (!selectedEventId) return;
    refreshVolunteers();
  }, [selectedEventId]);

  const refreshVolunteers = async () => {
    if (!selectedEventId) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/vault?resource=events&subResource=volunteers&eventId=${selectedEventId}`, { headers });
      const data = await res.json();
      if (data.ok) setVolunteers(data.volunteers);
    } catch (error) {
      console.error("Failed to fetch volunteers:", error);
    }
  };

  // Search Members for Assignment
  useEffect(() => {
    const search = async () => {
      if (!memberSearch || memberSearch.length < 2) {
        setSearchResults([]);
        return;
      }
      setIsSearching(true);
      try {
        const res = await fetch(`/api/vault?resource=people&query=${encodeURIComponent(memberSearch)}`);
        const data = await res.json();
        if (data.ok) setSearchResults(data.members);
      } catch (e) {
        console.error(e);
      } finally {
        setIsSearching(false);
      }
    };
    const t = setTimeout(search, 300);
    return () => clearTimeout(t);
  }, [memberSearch]);

  const handleAddVolunteer = async (member: any) => {
    if (!selectedEventId || !activeTeamId) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/vault?resource=events&subResource=volunteers', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: selectedEventId,
          teamId: activeTeamId,
          memberId: member.id,
          role: 'Volunteer', // Default role
          status: 'Confirmed'
        })
      });
      if (res.ok) {
        setMemberSearch(''); // Clear search
        refreshVolunteers(); // Refresh list
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRemoveVolunteer = async (id: string) => {
    if (!confirm('Remove this volunteer?')) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/vault?resource=events&subResource=volunteers&id=${id}`, { method: 'DELETE', headers });
      if (res.ok) refreshVolunteers();
    } catch (e) {
      console.error(e);
    }
  };

  const openRoster = (teamId: string) => {
    setActiveTeamId(teamId);
    setIsRosterOpen(true);
  };

  const getTeamStats = (teamId: string) => {
    const teamVolunteers = volunteers.filter(v => v.team_id === teamId);
    const confirmed = teamVolunteers.filter(v => v.status === 'Confirmed').length;
    const pending = teamVolunteers.filter(v => v.status === 'Pending').length;
    const target = 5; // Mock target
    return { count: teamVolunteers.length, confirmed, pending, target, filled: confirmed };
  };

  const selectedEvent = events.find(e => e.id === selectedEventId);
  const activeTeam = teams.find(t => t.id === activeTeamId);
  const activeVolunteers = activeTeamId ? volunteers.filter(v => v.team_id === activeTeamId) : [];

  const getIcon = (iconName: string) => {
    switch (iconName) {
      case 'Monitor': return <Monitor size={24} />;
      case 'Heart': return <Heart size={24} />;
      case 'ShieldCheck': return <ShieldCheck size={24} />;
      case 'Star': return <Star size={24} />;
      default: return <Users size={24} />;
    }
  };

  if (loading && events.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="animate-spin text-burgundy" size={48} />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12 relative">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-extrabold text-[#0d1a14] mb-2 tracking-tight">Volunteers</h1>
          <p className="text-sm text-gray-500 max-w-2xl">
            Legacy / manual staff roster assignments (event_volunteers). For member signup
            opportunities, use Serve opportunities under Events &amp; check-in.
          </p>
          <p className="text-gray-400 font-medium">Coordinate and assign ministry teams to ensure every event is fully staffed.</p>
        </div>

        <div className="flex items-center gap-3">
          {events.length > 0 ? (
            <div className="relative">
              <select
                value={selectedEventId || ''}
                onChange={(e) => setSelectedEventId(e.target.value)}
                className="appearance-none bg-white pl-4 pr-10 py-2.5 rounded-2xl border border-gray-200 text-sm font-bold text-[#0d1a14] shadow-sm focus:ring-2 focus:ring-burgundy/10 outline-none cursor-pointer"
              >
                {events.map(e => (
                  <option key={e.id} value={e.id}>
                    {new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {e.name}
                  </option>
                ))}
              </select>
              <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
            </div>
          ) : (
            <div className="px-4 py-2 bg-gray-100 rounded-xl text-xs font-bold text-gray-400">No Upcoming Events</div>
          )}
        </div>
      </div>

      {teams.length === 0 ? (
        <div className="bg-white p-12 rounded-[2.5rem] text-center border border-gray-100 shadow-sm">
          <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <Users size={32} className="text-gray-300" />
          </div>
          <h3 className="text-xl font-bold text-[#0d1a14] mb-2">No Teams Found</h3>
          <p className="text-gray-400 mb-8 max-w-md mx-auto">Get started by creating ministry teams to organize your volunteers.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {teams.map((team, i) => {
            const stats = getTeamStats(team.id);
            const isFilled = stats.filled >= stats.target;

            return (
              <div key={team.id} className="bg-white rounded-[2.5rem] border border-gray-50 shadow-sm flex flex-col group hover:shadow-2xl transition-all border-b-4 border-b-transparent hover:border-b-gold">
                <div className="p-10 flex flex-col h-full">
                  <div className="flex items-start justify-between mb-8">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-inner transition-transform group-hover:rotate-6 ${isFilled ? 'bg-gold text-white' : 'bg-gold-cream text-gold border border-gold/10'
                      }`}>
                      {getIcon(team.icon_name)}
                    </div>
                    {isFilled && (
                      <div className="bg-green-50 text-green-500 p-2 rounded-xl border border-green-100 shadow-sm">
                        <CheckCircle size={18} />
                      </div>
                    )}
                  </div>

                  <h3 className="text-xl font-black text-[#0d1a14] mb-1 tracking-tight">{team.name}</h3>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-8">
                    {team.leader?.first_name ? `Lead: ${team.leader.first_name}` : 'No Lead Assigned'}
                  </p>

                  <div className="space-y-4 pt-6 border-t border-gray-50 flex-1">
                    <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-widest mb-1">
                      <span className="text-gray-400">Staffing</span>
                      <span className={isFilled ? 'text-gold' : 'text-burgundy'}>{stats.filled} / {stats.target}</span>
                    </div>
                    <div className="h-2 w-full bg-gray-50 rounded-full overflow-hidden shadow-inner ring-1 ring-gray-100">
                      <div
                        className={`h-full transition-all duration-1000 ${isFilled ? 'bg-gold' : 'bg-burgundy opacity-80'}`}
                        style={{ width: `${Math.min(100, (stats.filled / stats.target) * 100)}%` }}
                      />
                    </div>
                  </div>

                  <div className="mt-10 flex gap-3">
                    <button onClick={() => openRoster(team.id)} className="flex-1 py-4 bg-gray-50 text-[#0d1a14] font-black text-[11px] uppercase tracking-widest rounded-xl hover:bg-gold-cream/50 transition-colors border border-transparent hover:border-gold/10">
                      Manage Roster
                    </button>
                    <button onClick={() => openRoster(team.id)} className="px-5 py-4 bg-gold-cream/30 text-gold rounded-xl border border-gold/10 hover:bg-gold-cream transition-all active:scale-95">
                      <Plus size={18} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ROSTER MODAL */}
      {isRosterOpen && activeTeam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-8 border-b border-gray-50 flex items-center justify-between bg-gray-50/50">
              <div>
                <h2 className="text-2xl font-black text-[#0d1a14]">Manage {activeTeam.name}</h2>
                <p className="text-gray-400 text-sm font-bold">
                  {selectedEvent ? new Date(selectedEvent.date).toLocaleDateString() : ''} - Staffing
                </p>
              </div>
              <button onClick={() => setIsRosterOpen(false)} className="p-2 bg-white rounded-full text-gray-400 hover:text-burgundy hover:bg-burgundy/5 transition-all">
                <X size={24} />
              </button>
            </div>

            <div className="p-8 overflow-y-auto flex-1 space-y-8">
              {/* ADD VOLUNTEER SECTION */}
              <div className="space-y-4">
                <label className="text-xs font-black text-gray-300 uppercase tracking-widest">Add New Volunteer</label>
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                  <input
                    type="text"
                    placeholder="Search member name..."
                    className="w-full pl-12 pr-4 py-4 rounded-xl bg-gray-50 border-none font-bold text-[#0d1a14] placeholder:text-gray-300 focus:ring-2 focus:ring-burgundy/10 transition-all"
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                  />
                </div>
                {searchResults.length > 0 && (
                  <div className="bg-white border border-gray-100 rounded-xl shadow-lg divide-y divide-gray-50 max-h-48 overflow-y-auto">
                    {searchResults.map(member => (
                      <button
                        key={member.id}
                        onClick={() => handleAddVolunteer(member)}
                        className="w-full p-4 text-left hover:bg-gold-cream/20 flex items-center gap-3 transition-colors"
                      >
                        <div className="w-8 h-8 rounded-full bg-burgundy/5 text-burgundy flex items-center justify-center font-bold text-xs">
                          {member.first_name[0]}
                        </div>
                        <div>
                          <p className="font-bold text-[#0d1a14] text-sm">{member.first_name} {member.last_name}</p>
                        </div>
                        <div className="ml-auto">
                          <Plus size={16} className="text-gold" />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* CURRENT ROSTER LIST */}
              <div className="space-y-4">
                <label className="text-xs font-black text-gray-300 uppercase tracking-widest">Current Roster ({activeVolunteers.length})</label>
                {activeVolunteers.length === 0 ? (
                  <div className="text-center py-10 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                    <p className="text-gray-400 font-bold text-sm">No volunteers assigned yet.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {activeVolunteers.map(vol => (
                      <div key={vol.id} className="flex items-center justify-between p-4 bg-white border border-gray-100 rounded-2xl shadow-sm hover:border-gold/30 transition-all group">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-xl bg-gold-cream text-gold flex items-center justify-center font-black">
                            {vol.member?.first_name?.[0]}
                          </div>
                          <div>
                            <p className="font-bold text-[#0d1a14]">{vol.member?.first_name} {vol.member?.last_name}</p>
                            <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider bg-gray-50 px-2 py-0.5 rounded-md inline-block mt-0.5">{vol.status}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleRemoveVolunteer(vol.id)}
                          className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        <div className="bg-gold-cream/30 p-8 rounded-[2.5rem] border border-gold/10 flex items-center gap-6 shadow-sm group">
          <div className="w-16 h-16 rounded-[1.5rem] bg-white text-gold flex items-center justify-center shrink-0 shadow-lg border border-gold/10 group-hover:scale-110 transition-transform">
            <Sparkles size={32} />
          </div>
          <div className="flex-1">
            <p className="text-lg font-black text-[#0d1a14]">AI Roster Suggestion</p>
            <p className="text-xs text-gray-400 font-medium leading-relaxed mt-1">
              {selectedEvent ? `Analyzing attendance patterns for ${selectedEvent.name}...` : 'Select an event to see AI suggestions.'}
            </p>
          </div>
        </div>
        <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 flex items-center gap-6 shadow-sm group">
          <div className="w-16 h-16 rounded-[1.5rem] bg-burgundy/5 text-burgundy flex items-center justify-center shrink-0 shadow-lg border border-burgundy/10 group-hover:scale-110 transition-transform">
            <LifeBuoy size={32} />
          </div>
          <div className="flex-1">
            <p className="text-lg font-black text-[#0d1a14]">Staffing Support</p>
            <p className="text-xs text-gray-400 font-medium leading-relaxed mt-1">Struggling to fill critical roles? Reach out to the Elders' board or <button className="text-burgundy font-bold hover:underline">Contact Support</button>.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EventsVolunteers;
