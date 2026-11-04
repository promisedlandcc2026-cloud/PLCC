import React, { useState, useEffect } from 'react';
import { Mail, Briefcase, Calendar, Search, Trash2, User, Star, Music, Baby, HeartHandshake, Tv, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';
import { useNav } from '../../App';
import { authedFetch } from '../../lib/authedFetch';
import InAppWelcomeModal from '../../components/Layout/InAppWelcomeModal';
import { hasPermission } from '../../lib/permissions';
import AccessDenied from '../../components/Layout/AccessDenied';

interface TeamApplication {
    id: string;
    created_at: string;
    name: string;
    email: string;
    team_id: string;
    experience: string | null;
    status: 'new' | 'approved' | 'rejected' | 'archived';
}

const TeamApplicationsPage: React.FC = () => {
    const { userRole } = useNav();
    const [applications, setApplications] = useState<TeamApplication[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [error, setError] = useState<string | null>(null);

    const canApprove = hasPermission(userRole as any, undefined, '/people/team-applications');

    const fetchApplications = async () => {
        setLoading(true);
        try {
            const response = await authedFetch('/api/vault?resource=people&subResource=team-applications');
            const data = await response.json();
            if (!response.ok || data.ok === false) throw new Error(data.error || 'Could not load applications');
            setApplications((data.applications || []) as TeamApplication[]);
        } catch (err: any) {
            console.error('Error fetching applications:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchApplications();
    }, []);

    const handleUpdateStatus = async (id: string, newStatus: 'approved' | 'rejected') => {
        try {
            const response = await authedFetch('/api/vault?resource=people&subResource=team-applications', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, status: newStatus }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || data.ok === false) throw new Error(data.error || 'Update failed');

            setApplications(prev => prev.map(app =>
                app.id === id ? { ...app, status: newStatus } : app
            ));
        } catch (err: any) {
            alert('Failed to update status: ' + err.message);
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Are you sure you want to delete this application?')) return;
        try {
            const response = await authedFetch('/api/vault?resource=people&subResource=team-applications', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || data.ok === false) throw new Error(data.error || 'Delete failed');
            setApplications(prev => prev.filter(app => app.id !== id));
        } catch (err: any) {
            alert('Failed to delete application: ' + err.message);
        }
    };

    const getTeamIcon = (teamId: string) => {
        switch (teamId.toLowerCase()) {
            case 'worship': return <Music size={18} />;
            case 'kids': return <Baby size={18} />;
            case 'hospitality': return <HeartHandshake size={18} />;
            case 'media': return <Tv size={18} />;
            default: return <Star size={18} />;
        }
    };

    const getTeamName = (teamId: string) => {
        const map: Record<string, string> = {
            'worship': 'Worship Arts',
            'youth': 'Youth Ministry',
            'kids': 'PLCC Kids',
            'hospitality': 'Hospitality',
            'media': 'Media & Tech'
        };
        return map[teamId.toLowerCase()] || teamId;
    };

    const filtered = applications.filter(app =>
        app.name.toLowerCase().includes(search.toLowerCase()) ||
        app.email.toLowerCase().includes(search.toLowerCase()) ||
        getTeamName(app.team_id).toLowerCase().includes(search.toLowerCase())
    );

    const canView = hasPermission(userRole as any, undefined, '/people/team-applications');

    if (!canView) return <AccessDenied />;

    return (
        <div className="space-y-8 animate-in fade-in duration-500 pb-20">
            <InAppWelcomeModal
                id="team-applications"
                title="Welcome to the Ministry Talent Pipeline"
                description="Identifying and nurturing the divine gifts within our congregation for ministry excellence."
            />
            {/* Header */}
            <div>
                <h1 className="text-4xl font-extrabold text-[#0d1a14] mb-2 tracking-tight">Team Applications</h1>
                <p className="text-gray-400 font-medium">Review volunteers interested in joining ministry teams.</p>
            </div>

            {/* Controls */}
            <div className="bg-white p-4 rounded-[2rem] border border-gray-50 shadow-sm flex items-center gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={20} />
                    <input
                        type="text"
                        placeholder="Search by name, email, or team..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-12 pr-6 py-3 bg-gray-50 rounded-xl outline-none font-medium focus:bg-white focus:ring-2 focus:ring-[#C9A35A]/20 transition-all"
                    />
                </div>
            </div>

            {error && (
                <div className="p-4 bg-red-50 text-red-600 rounded-xl flex items-center gap-3 text-sm font-medium">
                    <AlertCircle size={18} />
                    {error}
                </div>
            )}

            {/* List */}
            <div className="grid grid-cols-1 gap-4">
                {filtered.map(item => (
                    <div key={item.id} className={`bg-white p-6 rounded-[2rem] border shadow-sm hover:shadow-md transition-all group relative overflow-hidden ${item.status === 'approved' ? 'border-green-100 bg-green-50/10' :
                        item.status === 'rejected' ? 'border-red-100 bg-red-50/10' :
                            'border-gray-100'
                        }`}>
                        <div className="absolute top-6 right-6 flex items-center gap-2">
                            {/* Status Badge */}
                            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${item.status === 'approved' ? 'bg-green-100 text-green-700' :
                                item.status === 'rejected' ? 'bg-red-100 text-red-700' :
                                    'bg-blue-100 text-blue-700'
                                }`}>
                                {item.status || 'NEW'}
                            </span>

                            {/* Actions (Only for Authorized Roles) */}
                            {canApprove && (item.status === 'new' || !item.status) && (
                                <>
                                    <button
                                        onClick={() => handleUpdateStatus(item.id, 'approved')}
                                        className="p-2 bg-green-50 text-green-600 hover:bg-green-100 rounded-lg transition-colors"
                                        title="Approve"
                                    >
                                        <CheckCircle2 size={18} />
                                    </button>
                                    <button
                                        onClick={() => handleUpdateStatus(item.id, 'rejected')}
                                        className="p-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                                        title="Reject"
                                    >
                                        <XCircle size={18} />
                                    </button>
                                </>
                            )}

                            <button onClick={() => handleDelete(item.id)} className="p-2 text-gray-300 hover:bg-red-50 hover:text-red-500 rounded-lg transition-colors opacity-0 group-hover:opacity-100" title="Delete">
                                <Trash2 size={16} />
                            </button>
                        </div>

                        <div className="flex flex-col md:flex-row gap-6">
                            {/* Initials */}
                            <div className="shrink-0">
                                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black ${item.status === 'approved' ? 'bg-green-100 text-green-600' :
                                    item.status === 'rejected' ? 'bg-red-100 text-red-600' :
                                        'bg-[#C9A35A]/10 text-[#C9A35A]'
                                    }`}>
                                    {item.name.charAt(0)}
                                </div>
                            </div>

                            <div className="flex-1 space-y-4">
                                <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
                                    <h3 className="text-xl font-bold text-[#1A1A1A]">{item.name}</h3>
                                    <div className="flex items-center gap-2 px-3 py-1 bg-gray-900 text-white rounded-full text-xs font-bold w-fit">
                                        {getTeamIcon(item.team_id)}
                                        {getTeamName(item.team_id)}
                                    </div>
                                </div>

                                <div className="flex flex-wrap gap-4 mt-1 text-sm text-gray-500">
                                    <div className="flex items-center gap-1.5 hover:text-[#C9A35A] transition-colors">
                                        <Mail size={14} />
                                        <a href={`mailto:${item.email}`}>{item.email}</a>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-gray-400">
                                        <Calendar size={14} />
                                        {new Date(item.created_at).toLocaleDateString()} {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                </div>

                                {item.experience && (
                                    <div className="bg-gray-50 p-4 rounded-xl text-gray-700 leading-relaxed text-sm">
                                        <Briefcase size={16} className="text-gray-400 mb-2 inline-block mr-2" />
                                        <span className="font-bold text-gray-900 mr-2">Experience:</span>
                                        {item.experience}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ))}

                {!loading && filtered.length === 0 && (
                    <div className="text-center py-20 bg-gray-50 rounded-[2rem] border border-dashed border-gray-200">
                        <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 text-gray-300 shadow-sm">
                            <User size={32} />
                        </div>
                        <p className="text-xs font-black text-gray-400 uppercase tracking-widest">No applications found</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TeamApplicationsPage;
