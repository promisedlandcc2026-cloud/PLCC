
import React, { useState, useEffect } from 'react';
import {
    Calendar,
    User,
    Users,
    MapPin,
    CheckCircle2,
    Clock,
    Search,
    Filter,
    MoreVertical,
    Mail,
    Phone,
    ArrowRight,
    UserPlus,
    AlertCircle
} from 'lucide-react';
import { useNav } from '../../App';
import { getAuthHeaders } from '../../lib/api';
import { Role } from '../../types';
import InAppWelcomeModal from '../../components/Layout/InAppWelcomeModal';
import { hasPermission } from '../../lib/permissions';
import AccessDenied from '../../components/Layout/AccessDenied';

const PlanAVisit: React.FC = () => {
    const { userRole } = useNav();
    const [registrations, setRegistrations] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState('All');
    const [searchTerm, setSearchTerm] = useState('');

    const fetchRegistrations = async () => {
        setLoading(true);
        setError(null);
        try {
            const headers = await getAuthHeaders();
            const res = await fetch('/api/vault?resource=people&subResource=plan-a-visit', { headers });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to fetch registrations');
            setRegistrations(data.registrations || []);
        } catch (err: any) {
            console.error('Error fetching registrations:', err);
            setError(err.message || 'Failed to connect to database');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRegistrations();
    }, []);

    const updateStatus = async (id: string, newStatus: string) => {
        try {
            const headers = await getAuthHeaders();
            const res = await fetch('/api/vault?resource=people&subResource=plan-a-visit', {
                method: 'PATCH',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, status: newStatus })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to update status');
            setRegistrations(prev => prev.map(r => r.id === id ? { ...r, status: newStatus } : r));
        } catch (err: any) {
            console.error('Error updating status:', err);
            alert('Failed to update: ' + err.message);
        }
    };

    const filteredRegistrations = registrations.filter(r => {
        const matchesSearch = (r.visitor_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (r.email || '').toLowerCase().includes(searchTerm.toLowerCase());
        const matchesFilter = filter === 'All' || r.status === filter;
        return matchesSearch && matchesFilter;
    });

    const canView = hasPermission(userRole as any, undefined, '/people/plan-a-visit');

    if (!canView) return <AccessDenied />;

    return (
        <div className="space-y-8 animate-in fade-in duration-500 pb-12">
            <InAppWelcomeModal
                id="plan-a-visit"
                title="Welcome to the Guest Experience Portal"
                description="Securely manage incoming visit registrations and ensure every guest receives an Abundant welcome."
            />
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                    <h1 className="text-4xl font-extrabold text-[#0d1a14] mb-2 tracking-tight">Plan a Visit</h1>
                    <p className="text-gray-400 font-medium">Manage and follow up with guests who planned their visit via PLCC Connect.</p>
                </div>
            </div>

            <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-[2rem] border border-gray-50 shadow-sm">
                <div className="relative flex-1 w-full">
                    <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-300" size={20} />
                    <input
                        type="text"
                        placeholder="Search by name or email..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-14 pr-6 py-4 rounded-2xl bg-gray-50 border-transparent focus:bg-white focus:border-gold outline-none transition-all font-bold text-sm"
                    />
                </div>
                <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 no-scrollbar">
                    {['All', 'Pending', 'Contacted', 'Visited'].map(f => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${filter === f ? 'bg-burgundy text-gold shadow-lg shadow-burgundy/10' : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
                                }`}
                        >
                            {f}
                        </button>
                    ))}
                </div>
            </div>

            {error && (
                <div className="p-6 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-4 text-red-600 animate-in slide-in-from-top-4 duration-300">
                    <AlertCircle className="shrink-0" />
                    <div>
                        <p className="font-black text-xs uppercase tracking-widest">Database Error</p>
                        <p className="text-sm font-medium">{error}</p>
                    </div>
                </div>
            )}

            {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="h-64 bg-gray-50 animate-pulse rounded-[2.5rem]" />
                    ))}
                </div>
            ) : filteredRegistrations.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredRegistrations.map(reg => (
                        <div key={reg.id} className="bg-white rounded-[2.5rem] border border-gray-50 shadow-sm flex flex-col group hover:shadow-2xl transition-all">
                            <div className="p-8">
                                <div className="flex items-start justify-between mb-6">
                                    <div className="w-14 h-14 rounded-2xl bg-burgundy/5 text-burgundy flex items-center justify-center font-black text-xl shadow-inner group-hover:scale-110 transition-transform">
                                        {(reg.visitor_name || 'V').charAt(0)}
                                    </div>
                                    <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${reg.status === 'Pending' ? 'bg-gold-cream text-gold border-gold/20' :
                                        reg.status === 'Contacted' ? 'bg-blue-50 text-blue-500 border-blue-100' :
                                            'bg-green-50 text-green-500 border-green-100'
                                        }`}>
                                        {reg.status}
                                    </div>
                                </div>

                                <h3 className="text-xl font-black text-[#0d1a14] mb-4 tracking-tight">{reg.visitor_name}</h3>

                                <div className="space-y-4">
                                    <div className="flex items-center gap-3 text-gray-400">
                                        <Calendar size={16} className="text-gold" />
                                        <p className="text-sm font-bold">Planned for: {new Date(reg.preferred_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                                    </div>

                                    {reg.email && (
                                        <div className="flex items-center gap-3 text-gray-400">
                                            <Mail size={16} className="text-gold" />
                                            <a href={`mailto:${reg.email}`} className="text-sm font-bold hover:text-burgundy transition-colors">{reg.email}</a>
                                        </div>
                                    )}

                                    {reg.phone && (
                                        <div className="flex items-center gap-3 text-gray-400">
                                            <Phone size={16} className="text-gold" />
                                            <a href={`tel:${reg.phone}`} className="text-sm font-bold hover:text-burgundy transition-colors">{reg.phone}</a>
                                        </div>
                                    )}

                                    <div className="flex items-center gap-3 text-gray-400">
                                        <Users size={16} className="text-gold" />
                                        <p className="text-sm font-bold">Family Size: {reg.family_size}</p>
                                    </div>

                                    {reg.notes && (
                                        <div className="mt-4 p-4 bg-gray-50 rounded-2xl text-xs text-gray-600 font-medium italic border-l-4 border-gold/20">
                                            "{reg.notes}"
                                        </div>
                                    )}

                                    <div className="flex items-center gap-3 pt-2 text-gray-400">
                                        <Clock size={16} className="text-gray-300" />
                                        <p className="text-[10px] font-black uppercase tracking-widest">Registered {new Date(reg.created_at).toLocaleDateString()}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-auto border-t border-gray-50 p-6 flex gap-2">
                                <button
                                    onClick={() => updateStatus(reg.id, reg.status === 'Pending' ? 'Contacted' : reg.status === 'Contacted' ? 'Visited' : 'Pending')}
                                    className="flex-1 py-4 bg-gray-50 text-[#0d1a14] font-black text-[10px] uppercase tracking-widest rounded-2xl hover:bg-gold-cream transition-all flex items-center justify-center gap-2"
                                >
                                    {reg.status === 'Pending' ? 'Mark Contacted' : reg.status === 'Contacted' ? 'Mark Visited' : 'Reset Status'}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="py-20 text-center bg-gray-50 rounded-[3rem] border-2 border-dashed border-gray-100">
                    <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
                        <UserPlus size={32} className="text-gray-200" />
                    </div>
                    <h3 className="text-xl font-black text-[#0d1a14] mb-2">No registrations found</h3>
                    <p className="text-gray-400 font-medium max-w-xs mx-auto">New registrations from PLCC Connect will appear here automatically.</p>
                </div>
            )}
        </div>
    );
};

export default PlanAVisit;

