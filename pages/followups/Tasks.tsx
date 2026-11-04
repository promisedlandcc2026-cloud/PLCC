import React, { useState, useEffect } from 'react';
import {
    Search, Plus, Filter, CheckCircle2, Clock,
    AlertCircle, Archive, User as UserIcon, Calendar,
    MoreVertical, Edit2, Trash2
} from 'lucide-react';
import {
    FollowUp, FollowUpStatus, FollowUpPriority, FollowUpType,
    Role
} from '../../types';
import { useNav } from '../../App';
import { getAuthHeaders } from '../../lib/api';

export default function FollowUps() {
    const { userId } = useNav();
    const [followUps, setFollowUps] = useState<FollowUp[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState<string>('All');
    const [searchQuery, setSearchQuery] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingItem, setEditingItem] = useState<FollowUp | null>(null);

    // Form State
    const [formData, setFormData] = useState<Partial<FollowUp>>({
        status: FollowUpStatus.Pending,
        priority: FollowUpPriority.Medium,
        type: FollowUpType.General,
        notes: '',
        member_id: '',
        assigned_to_id: userId || ''
    });

    // Data for selectors
    const [members, setMembers] = useState<any[]>([]);
    const [staff, setStaff] = useState<any[]>([]); // For assignee

    useEffect(() => {
        fetchFollowUps();
        fetchMembers();
    }, []);

    const fetchFollowUps = async () => {
        setLoading(true);
        try {
            const headers = await getAuthHeaders();
            const res = await fetch('/api/vault?resource=people&subResource=followups', { headers });
            const data = await res.json();
            if (data.ok) {
                setFollowUps(data.followUps);
            }
        } catch (err) {
            console.error("Error fetching follow ups:", err);
        } finally {
            setLoading(false);
        }
    };

    const fetchMembers = async () => {
        try {
            const headers = await getAuthHeaders();
            const res = await fetch('/api/vault?resource=people', { headers });
            const data = await res.json();
            if (data.ok) {
                setMembers(data.members);
                // rudimentary filter for staff/assignees - simplistic for now
                setStaff(data.members.filter((m: any) =>
                    ['PASTOR', 'STAFF', 'ADMIN', 'MINISTRY_LEADER', 'FINANCE', 'SECRETARY'].includes(m.role || '')
                    || true // Actually, let's allow assigning to anyone for now until roles are stricter
                ));
            }
        } catch (err) {
            console.error("Error fetching members:", err);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const url = '/api/vault?resource=people&subResource=followups';
            const method = editingItem ? 'PATCH' : 'POST';
            const body = editingItem ? { id: editingItem.id, ...formData } : formData;

            const headers = await getAuthHeaders();
            const res = await fetch(url, {
                method,
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (res.ok) {
                setShowModal(false);
                setEditingItem(null);
                setFormData({
                    status: FollowUpStatus.Pending,
                    priority: FollowUpPriority.Medium,
                    type: FollowUpType.General,
                    notes: '',
                    member_id: '',
                    assigned_to_id: userId || ''
                });
                fetchFollowUps();
            }
        } catch (err) {
            console.error("Error saving follow up:", err);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this follow up?')) return;
        try {
            const headers = await getAuthHeaders();
            await fetch('/api/vault?resource=people&subResource=followups', {
                method: 'DELETE',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ id })
            });
            fetchFollowUps();
        } catch (err) {
            console.error("Error deleting:", err);
        }
    };

    const getPriorityColor = (p: string) => {
        switch (p) {
            case 'Urgent': return 'text-red-600 bg-red-50 border-red-200';
            case 'High': return 'text-orange-600 bg-orange-50 border-orange-200';
            case 'Medium': return 'text-blue-600 bg-blue-50 border-blue-200';
            default: return 'text-gray-600 bg-gray-50 border-gray-200';
        }
    };

    const getStatusIcon = (s: string) => {
        switch (s) {
            case 'Completed': return <CheckCircle2 className="w-4 h-4 text-green-500" />;
            case 'In Progress': return <Clock className="w-4 h-4 text-blue-500" />;
            case 'Archived': return <Archive className="w-4 h-4 text-gray-500" />;
            default: return <AlertCircle className="w-4 h-4 text-yellow-500" />;
        }
    };

    const filteredItems = followUps.filter(item => {
        const matchesStatus = filterStatus === 'All' || item.status === filterStatus;
        const searchLower = searchQuery.toLowerCase();
        const searchMatch =
            item.notes?.toLowerCase().includes(searchLower) ||
            item.member?.first_name.toLowerCase().includes(searchLower) ||
            item.member?.last_name?.toLowerCase().includes(searchLower);

        return matchesStatus && searchMatch;
    });

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Follow Ups</h1>
                    <p className="text-gray-500">Track pastoral care and member outreach</p>
                </div>
                <button
                    onClick={() => {
                        setEditingItem(null);
                        setFormData({
                            status: FollowUpStatus.Pending,
                            priority: FollowUpPriority.Medium,
                            type: FollowUpType.General,
                            notes: '',
                            member_id: '',
                            assigned_to_id: userId || ''
                        });
                        setShowModal(true);
                    }}
                    className="flex items-center gap-2 bg-burgundy text-white px-4 py-2 rounded-lg hover:bg-burgundy/90 transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    New Follow Up
                </button>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search by name or notes..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-burgundy/20"
                    />
                </div>
                <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0">
                    {['All', 'Pending', 'In Progress', 'Completed', 'Archived'].map(status => (
                        <button
                            key={status}
                            onClick={() => setFilterStatus(status)}
                            className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${filterStatus === status
                                ? 'bg-burgundy text-white'
                                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                                }`}
                        >
                            {status}
                        </button>
                    ))}
                </div>
            </div>

            {/* List */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                {loading ? (
                    <div className="p-8 text-center text-gray-500">Loading...</div>
                ) : filteredItems.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">No follow ups found.</div>
                ) : (
                    <div className="divide-y divide-gray-100">
                        {filteredItems.map(item => (
                            <div key={item.id} className="p-3 sm:px-5 hover:bg-gray-50/80 transition-all group border-b last:border-0 border-gray-100">
                                <div className="flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-4 flex-1 min-w-0">
                                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${item.priority === 'Urgent' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' :
                                            item.priority === 'High' ? 'bg-orange-500' :
                                                item.priority === 'Medium' ? 'bg-blue-500' : 'bg-gray-300'
                                            }`} />

                                        <div className="flex-1 min-w-0">
                                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-0.5">
                                                <h3 className="font-bold text-gray-900 text-sm sm:text-base truncate">
                                                    {item.member?.first_name} {item.member?.last_name}
                                                </h3>
                                                <div className="flex items-center gap-1.5">
                                                    <span className={`px-2 py-0.5 text-[10px] sm:text-xs font-bold rounded-full border ${getPriorityColor(item.priority)} uppercase tracking-wider`}>
                                                        {item.priority}
                                                    </span>
                                                    <span className="flex items-center gap-1 text-[10px] sm:text-xs font-bold text-gray-400 bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-full uppercase tracking-wider">
                                                        {getStatusIcon(item.status)}
                                                        {item.status}
                                                    </span>
                                                </div>
                                            </div>

                                            <p className="text-gray-500 text-xs sm:text-sm line-clamp-1 mb-1 font-medium">{item.notes}</p>

                                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] sm:text-[11px] font-bold uppercase tracking-widest text-gray-300">
                                                <span className="flex items-center gap-1.5">
                                                    <Calendar className="w-3 h-3 text-gold" />
                                                    {item.due_date ? new Date(item.due_date).toLocaleDateString() : 'No date'}
                                                </span>
                                                <span className="flex items-center gap-1.5">
                                                    <UserIcon className="w-3 h-3 text-burgundy" />
                                                    {item.assigned_to?.first_name} {item.assigned_to?.last_name || 'Unassigned'}
                                                </span>
                                                <span className="bg-gray-100/50 px-2 py-0.5 rounded text-gray-400">
                                                    {item.type}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                        <button
                                            onClick={() => {
                                                setEditingItem(item);
                                                setFormData(item);
                                                setShowModal(true);
                                            }}
                                            className="p-1.5 text-gray-400 hover:text-burgundy hover:bg-burgundy/5 rounded-lg transition-colors"
                                        >
                                            <Edit2 className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(item.id)}
                                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <h3 className="font-semibold text-gray-900">
                                {editingItem ? 'Edit Follow Up' : 'New Follow Up'}
                            </h3>
                            <button
                                onClick={() => setShowModal(false)}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                &times;
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            {/* Member Selection */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Member *</label>
                                <select
                                    required
                                    value={formData.member_id}
                                    onChange={e => setFormData({ ...formData, member_id: e.target.value })}
                                    className="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-burgundy/20 outline-none"
                                >
                                    <option value="">Select Member</option>
                                    {members.map(m => (
                                        <option key={m.id} value={m.id}>
                                            {m.first_name} {m.last_name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                                    <select
                                        value={formData.type}
                                        onChange={e => setFormData({ ...formData, type: e.target.value as FollowUpType })}
                                        className="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-burgundy/20 outline-none"
                                    >
                                        {Object.values(FollowUpType).map(t => (
                                            <option key={t} value={t}>{t}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                                    <select
                                        value={formData.priority}
                                        onChange={e => setFormData({ ...formData, priority: e.target.value as FollowUpPriority })}
                                        className="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-burgundy/20 outline-none"
                                    >
                                        {Object.values(FollowUpPriority).map(p => (
                                            <option key={p} value={p}>{p}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                                    <select
                                        value={formData.status}
                                        onChange={e => setFormData({ ...formData, status: e.target.value as FollowUpStatus })}
                                        className="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-burgundy/20 outline-none"
                                    >
                                        {Object.values(FollowUpStatus).map(s => (
                                            <option key={s} value={s}>{s}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                                    <input
                                        type="date"
                                        value={formData.due_date || ''}
                                        onChange={e => setFormData({ ...formData, due_date: e.target.value })}
                                        className="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-burgundy/20 outline-none"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Assigned To</label>
                                <select
                                    value={formData.assigned_to_id || ''}
                                    onChange={e => setFormData({ ...formData, assigned_to_id: e.target.value })}
                                    className="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-burgundy/20 outline-none"
                                >
                                    <option value="">Unassigned</option>
                                    {members.map(m => (
                                        <option key={m.id} value={m.id}>
                                            {m.first_name} {m.last_name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                                <textarea
                                    rows={3}
                                    value={formData.notes || ''}
                                    onChange={e => setFormData({ ...formData, notes: e.target.value })}
                                    className="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-burgundy/20 outline-none"
                                    placeholder="Enter details..."
                                />
                            </div>

                            <div className="flex justify-end gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-burgundy text-white rounded-lg hover:bg-burgundy/90"
                                >
                                    {editingItem ? 'Update' : 'Create'} Follow Up
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
