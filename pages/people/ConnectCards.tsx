import React, { useState, useEffect } from 'react';
import { Mail, Phone, Calendar, Search, Trash2, CheckCircle2, User, MessageSquare, AlertCircle, XCircle } from 'lucide-react';
import { useNav } from '../../App';
import { Role } from '../../types';
import InAppWelcomeModal from '../../components/Layout/InAppWelcomeModal';
import { hasPermission } from '../../lib/permissions';
import AccessDenied from '../../components/Layout/AccessDenied';
import { supabase } from '../../lib/supabase';

interface ConnectCard {
    id: string;
    created_at: string;
    name: string;
    email: string;
    phone: string | null;
    message: string | null;
    status: 'new' | 'approved' | 'rejected' | 'archived';
}

const ConnectCardsPage: React.FC = () => {
    const { userRole, userId } = useNav();
    const [submissions, setSubmissions] = useState<ConnectCard[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [error, setError] = useState<string | null>(null);

    const canApprove = hasPermission(userRole as any, undefined, '/people/connect-cards');

    const getHeaders = async () => {
        const headers: HeadersInit = { 'Content-Type': 'application/json' };
        try {
            const { data } = await supabase!.auth.getSession();
            if (data.session?.access_token) headers['Authorization'] = `Bearer ${data.session.access_token}`;
        } catch {}
        if (userId) headers['X-User-ID'] = userId;
        return headers;
    };

    const fetchSubmissions = async () => {
        setLoading(true);
        try {
            const headers = await getHeaders();
            const res = await fetch('/api/vault?resource=people&subResource=connect-cards', { headers });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to load');
            setSubmissions(data.cards || []);
        } catch (err: any) {
            console.error('Error fetching connect cards:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchSubmissions(); }, []);

    const handleUpdateStatus = async (id: string, newStatus: 'approved' | 'rejected') => {
        try {
            const headers = await getHeaders();
            const res = await fetch('/api/vault?resource=people&subResource=connect-cards', {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ id, status: newStatus })
            });
            if (!res.ok) throw new Error('Failed to update');
            setSubmissions(prev => prev.map(s => s.id === id ? { ...s, status: newStatus } : s));
        } catch (err: any) {
            alert('Failed to update status: ' + err.message);
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Are you sure you want to delete this submission?')) return;
        try {
            const headers = await getHeaders();
            const res = await fetch('/api/vault?resource=people&subResource=connect-cards', {
                method: 'DELETE',
                headers,
                body: JSON.stringify({ id })
            });
            if (!res.ok) throw new Error('Failed to delete');
            setSubmissions(prev => prev.filter(s => s.id !== id));
        } catch (err: any) {
            alert('Failed to delete submission: ' + err.message);
        }
    };

    const filtered = submissions.filter(s =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.email.toLowerCase().includes(search.toLowerCase()) ||
        (s.message && s.message.toLowerCase().includes(search.toLowerCase()))
    );

    const canView = hasPermission(userRole as any, undefined, '/people/connect-cards');

    if (!canView) return <AccessDenied />;

    return (
        <div className="space-y-8 animate-in fade-in duration-500 pb-20">
            <InAppWelcomeModal
                id="connect-cards"
                title="Welcome to the Connectivity & Prayer Hub"
                description="Heart-to-heart administrative oversight for church connections and prayer requests."
            />
            {/* Header */}
            <div>
                <h1 className="text-4xl font-extrabold text-[#0d1a14] mb-2 tracking-tight">Connect Cards</h1>
                <p className="text-gray-400 font-medium">View and manage visitor submissions and prayer requests.</p>
            </div>

            {/* Controls */}
            <div className="bg-white p-4 rounded-[2rem] border border-gray-50 shadow-sm flex items-center gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={20} />
                    <input
                        type="text"
                        placeholder="Search by name, email, or message..."
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
                            {canApprove && item.status === 'new' && (
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
                                        'bg-[#0d1a14]/5 text-[#0d1a14]'
                                    }`}>
                                    {item.name.charAt(0)}
                                </div>
                            </div>

                            <div className="flex-1 space-y-4">
                                <div>
                                    <h3 className="text-xl font-bold text-[#1A1A1A]">{item.name}</h3>
                                    <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-500">
                                        <div className="flex items-center gap-1.5 hover:text-[#C9A35A] transition-colors">
                                            <Mail size={14} />
                                            <a href={`mailto:${item.email}`}>{item.email}</a>
                                        </div>
                                        {item.phone && (
                                            <div className="flex items-center gap-1.5 hover:text-[#C9A35A] transition-colors">
                                                <Phone size={14} />
                                                <a href={`tel:${item.phone}`}>{item.phone}</a>
                                            </div>
                                        )}
                                        <div className="flex items-center gap-1.5 text-gray-400">
                                            <Calendar size={14} />
                                            {new Date(item.created_at).toLocaleDateString()} {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    </div>
                                </div>

                                {item.message && (
                                    <div className="bg-gray-50 p-4 rounded-xl text-gray-700 leading-relaxed text-sm">
                                        <MessageSquare size={16} className="text-gray-400 mb-2 inline-block mr-2" />
                                        {item.message}
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
                        <p className="text-xs font-black text-gray-400 uppercase tracking-widest">No submissions found</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ConnectCardsPage;
