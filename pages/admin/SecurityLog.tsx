import React, { useState, useEffect } from 'react';
import {
    ShieldCheck,
    Plus,
    Search,
    Clock,
    User,
    MapPin,
    Trash2,
    Loader2,
    CheckCircle2,
    AlertCircle,
    Shield,
    History,
    Activity,
    Edit,
    X,
    Download,
    ChevronDown,
} from 'lucide-react';

import { authedFetch } from '../../lib/authedFetch';
const shiftTypes = ['Morning', 'Afternoon', 'Evening', 'Night', 'Special Event'];
const activityTypes = ['Routine Patrol', 'Incident', 'Check-in', 'Maintenance', 'Other'];

const activityTone = (activity: string) => {
    const key = String(activity || '').toLowerCase();
    if (key.includes('incident')) {
        return 'bg-red-50 text-red-700 border-red-100';
    }
    if (key.includes('check')) {
        return 'bg-emerald-50 text-emerald-700 border-emerald-100';
    }
    if (key.includes('maintenance')) {
        return 'bg-amber-50 text-amber-800 border-amber-100';
    }
    return 'bg-gold-cream/70 text-[#8A6A2E] border-gold/20';
};

const SecurityLogPage: React.FC = () => {
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [search, setSearch] = useState('');

    const [formData, setFormData] = useState({
        officer_name: '',
        shift_type: 'Morning',
        activity_type: 'Routine Patrol',
        description: '',
        location: 'Main Sanctuary',
    });
    const [editingLog, setEditingLog] = useState<any | null>(null);

    const getAuthHeaders = () => {
        const userId = localStorage.getItem('awc_user_id');
        return {
            'Content-Type': 'application/json',
            'X-User-ID': userId || '',
        };
    };

    useEffect(() => {
        fetchLogs();
    }, []);

    const fetchLogs = async () => {
        try {
            const res = await authedFetch('/api/vault?resource=tools&subResource=security_logs');
            const data = await res.json();
            if (data.ok) {
                setLogs(data.logs || []);
            } else {
                setError(data.error || 'Failed to fetch logs');
            }
        } catch (err) {
            setError('Network error: Failed to fetch security logs');
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setEditingLog(null);
        setFormData({
            officer_name: '',
            shift_type: 'Morning',
            activity_type: 'Routine Patrol',
            description: '',
            location: 'Main Sanctuary',
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        const userId = localStorage.getItem('awc_user_id');
        if (!userId) {
            alert('You must be logged in to submit a log.');
            setIsSubmitting(false);
            return;
        }

        try {
            const url = '/api/vault?resource=tools&subResource=security_logs';
            const method = editingLog ? 'PATCH' : 'POST';
            const body = editingLog ? { ...formData, id: editingLog.id } : formData;

            const res = await authedFetch(url, {
                method,
                headers: getAuthHeaders(),
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (data.ok) {
                if (editingLog) {
                    setLogs(logs.map((l) => (l.id === editingLog.id ? data.log : l)));
                } else {
                    setLogs([data.log, ...logs]);
                }
                resetForm();
                setShowSuccess(true);
                setTimeout(() => setShowSuccess(false), 3000);
            } else {
                alert(data.error || 'Failed to submit log');
            }
        } catch (err) {
            alert('Network error: Failed to submit log');
        } finally {
            setIsSubmitting(false);
        }
    };

    const deleteLog = async (id: string) => {
        if (!confirm('Delete this security log entry?')) return;
        try {
            const res = await authedFetch(`/api/vault?resource=tools&subResource=security_logs&id=${id}`, {
                method: 'DELETE',
                headers: getAuthHeaders(),
            });
            const data = await res.json();
            if (data.ok) {
                setLogs(logs.filter((l) => l.id !== id));
            }
        } catch (err) {
            alert('Failed to delete log entry');
        }
    };

    const filteredLogs = logs.filter((log) => {
        const q = search.toLowerCase().trim();
        if (!q) return true;
        return (
            String(log.officer_name || '').toLowerCase().includes(q) ||
            String(log.description || '').toLowerCase().includes(q) ||
            String(log.activity_type || '').toLowerCase().includes(q) ||
            String(log.location || '').toLowerCase().includes(q) ||
            String(log.shift_type || '').toLowerCase().includes(q)
        );
    });

    const formatTime = (dateString: string) =>
        new Date(dateString).toLocaleString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
        });

    const formatDay = (dateString: string) =>
        new Date(dateString).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });

    const downloadCSV = () => {
        if (filteredLogs.length === 0) return alert('No logs to export.');

        const headers = ['Date', 'Officer', 'Shift', 'Activity', 'Location', 'Description'];
        const rows = filteredLogs.map((log) =>
            [
                new Date(log.created_at).toLocaleString(),
                log.officer_name,
                log.shift_type,
                log.activity_type,
                log.location,
                `"${(log.description || '').replace(/"/g, '""')}"`,
            ].join(',')
        );

        const csvContent = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `Security_Log_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
                <Loader2 className="w-8 h-8 text-burgundy animate-spin" />
                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Loading security log…</p>
            </div>
        );
    }

    return (
        <div className="animate-in fade-in duration-500 space-y-8 pb-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <Shield size={16} className="text-burgundy" />
                        <p className="text-[11px] font-bold text-burgundy/50 uppercase tracking-[0.2em]">Admin</p>
                    </div>
                    <h1 className="text-2xl md:text-3xl font-black text-[#0d1a14] tracking-tight">Security Log</h1>
                    <p className="text-sm text-gray-600 font-medium mt-1">
                        Record patrols, incidents, and shift notes for campus security.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {showSuccess && (
                        <span className="hidden sm:inline-flex items-center gap-1.5 text-emerald-700 font-bold text-xs uppercase tracking-widest mr-1">
                            <CheckCircle2 size={16} /> Saved
                        </span>
                    )}
                    <button
                        type="button"
                        onClick={downloadCSV}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gold/25 bg-gold-cream text-[#8A6A2E] text-xs font-bold uppercase tracking-widest hover:bg-gold hover:text-white transition-colors"
                    >
                        <Download size={16} />
                        Export CSV
                    </button>
                </div>
            </div>

            {error && (
                <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-800 flex items-start gap-2">
                    <AlertCircle size={16} className="mt-0.5 shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            <div className="flex flex-col xl:flex-row gap-6 items-start">
                {/* New entry */}
                <aside className="w-full xl:w-[360px] xl:sticky xl:top-6 shrink-0">
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-6">
                        <div className="flex items-center justify-between gap-3 mb-5">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-burgundy text-gold flex items-center justify-center">
                                    {editingLog ? <Edit size={18} /> : <Plus size={18} />}
                                </div>
                                <div>
                                    <h2 className="text-base font-black text-[#0d1a14]">
                                        {editingLog ? 'Edit entry' : 'New entry'}
                                    </h2>
                                    <p className="text-xs text-gray-500 font-medium">
                                        {editingLog ? 'Update an existing log' : 'Add a shift activity'}
                                    </p>
                                </div>
                            </div>
                            {editingLog && (
                                <button
                                    type="button"
                                    onClick={resetForm}
                                    className="p-2 rounded-lg text-gray-400 hover:text-burgundy hover:bg-gray-50"
                                    aria-label="Cancel editing"
                                >
                                    <X size={16} />
                                </button>
                            )}
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5">
                                    Officer on duty
                                </label>
                                <div className="relative">
                                    <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                                    <input
                                        type="text"
                                        required
                                        placeholder="Full name"
                                        value={formData.officer_name}
                                        onChange={(e) => setFormData({ ...formData, officer_name: e.target.value })}
                                        className="w-full h-11 pl-10 pr-3 rounded-xl bg-gray-50 border border-gray-100 focus:bg-white focus:border-burgundy/30 outline-none text-sm font-semibold text-[#0d1a14]"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5">
                                        Shift
                                    </label>
                                    <div className="relative">
                                        <select
                                            value={formData.shift_type}
                                            onChange={(e) => setFormData({ ...formData, shift_type: e.target.value })}
                                            className="w-full h-11 appearance-none pl-3 pr-9 rounded-xl bg-gray-50 border border-gray-100 focus:bg-white focus:border-burgundy/30 outline-none text-sm font-semibold text-[#0d1a14]"
                                        >
                                            {shiftTypes.map((t) => (
                                                <option key={t} value={t}>
                                                    {t}
                                                </option>
                                            ))}
                                        </select>
                                        <ChevronDown
                                            size={14}
                                            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5">
                                        Activity
                                    </label>
                                    <div className="relative">
                                        <select
                                            value={formData.activity_type}
                                            onChange={(e) => setFormData({ ...formData, activity_type: e.target.value })}
                                            className="w-full h-11 appearance-none pl-3 pr-9 rounded-xl bg-gray-50 border border-gray-100 focus:bg-white focus:border-burgundy/30 outline-none text-sm font-semibold text-[#0d1a14]"
                                        >
                                            {activityTypes.map((t) => (
                                                <option key={t} value={t}>
                                                    {t}
                                                </option>
                                            ))}
                                        </select>
                                        <ChevronDown
                                            size={14}
                                            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5">
                                    Location
                                </label>
                                <div className="relative">
                                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                                    <input
                                        type="text"
                                        placeholder="e.g. Main Lobby"
                                        value={formData.location}
                                        onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                                        className="w-full h-11 pl-10 pr-3 rounded-xl bg-gray-50 border border-gray-100 focus:bg-white focus:border-burgundy/30 outline-none text-sm font-semibold text-[#0d1a14]"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5">
                                    Observations & notes
                                </label>
                                <textarea
                                    required
                                    placeholder="What was checked, who was involved, and any follow-up needed…"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    rows={5}
                                    className="w-full px-3.5 py-3 rounded-xl bg-gray-50 border border-gray-100 focus:bg-white focus:border-burgundy/30 outline-none text-sm font-medium text-[#0d1a14] resize-y min-h-[120px]"
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="w-full h-11 rounded-xl bg-burgundy text-gold text-xs font-black uppercase tracking-widest hover:bg-burgundy-dark transition-colors disabled:opacity-70 flex items-center justify-center gap-2"
                            >
                                {isSubmitting ? (
                                    <Loader2 size={16} className="animate-spin" />
                                ) : (
                                    <ShieldCheck size={16} />
                                )}
                                {isSubmitting ? 'Saving…' : editingLog ? 'Update entry' : 'Save entry'}
                            </button>
                        </form>
                    </div>
                </aside>

                {/* Log feed */}
                <section className="flex-1 w-full min-w-0 space-y-4">
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="px-4 sm:px-5 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center gap-3">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                                <input
                                    type="text"
                                    placeholder="Search officer, activity, location, or notes…"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="w-full h-11 pl-10 pr-3 rounded-xl bg-gray-50 border border-gray-100 focus:bg-white focus:border-burgundy/30 outline-none text-sm font-medium text-[#0d1a14]"
                                />
                            </div>
                            <p className="text-xs font-semibold text-gray-500 sm:whitespace-nowrap">
                                {filteredLogs.length} {filteredLogs.length === 1 ? 'entry' : 'entries'}
                            </p>
                        </div>

                        {filteredLogs.length === 0 ? (
                            <div className="px-6 py-16 text-center">
                                <div className="w-14 h-14 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center mx-auto mb-4">
                                    <History size={28} className="text-gray-300" />
                                </div>
                                <h3 className="text-base font-black text-[#0d1a14]">No log entries yet</h3>
                                <p className="text-sm text-gray-500 font-medium mt-1 max-w-sm mx-auto">
                                    {search
                                        ? 'Nothing matches that search. Try a different officer or activity.'
                                        : 'Add the first patrol or incident note using the form.'}
                                </p>
                            </div>
                        ) : (
                            <ul className="divide-y divide-gray-100">
                                {filteredLogs.map((log) => {
                                    const multiLine = String(log.description || '').includes('\n');
                                    return (
                                        <li key={log.id} className="px-4 sm:px-5 py-5 hover:bg-gray-50/70 transition-colors">
                                            <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                                                <div className="flex sm:flex-col items-center sm:items-start gap-2 sm:min-w-[88px] shrink-0">
                                                    <div className="w-9 h-9 rounded-lg bg-burgundy/5 text-burgundy border border-burgundy/10 flex items-center justify-center">
                                                        <Clock size={16} />
                                                    </div>
                                                    <div className="sm:text-left">
                                                        <p className="text-sm font-bold text-[#0d1a14] leading-none">
                                                            {formatTime(log.created_at)}
                                                        </p>
                                                        <p className="text-[11px] font-semibold text-gray-500 mt-1 uppercase tracking-wide">
                                                            {formatDay(log.created_at)}
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="flex-1 min-w-0 space-y-3">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide bg-burgundy/5 text-burgundy border border-burgundy/10">
                                                            <User size={11} />
                                                            {log.officer_name}
                                                        </span>
                                                        <span
                                                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide border ${activityTone(
                                                                log.activity_type
                                                            )}`}
                                                        >
                                                            <Activity size={11} />
                                                            {log.activity_type}
                                                        </span>
                                                        {log.location && (
                                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wide bg-gray-50 text-gray-600 border border-gray-100">
                                                                <MapPin size={11} />
                                                                {log.location}
                                                            </span>
                                                        )}
                                                        <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                                                            {log.shift_type} shift
                                                        </span>
                                                    </div>

                                                    <div
                                                        className={
                                                            multiLine
                                                                ? 'rounded-xl border border-gray-100 bg-gray-50/80 px-3.5 py-3 overflow-x-auto'
                                                                : ''
                                                        }
                                                    >
                                                        <p
                                                            className={
                                                                multiLine
                                                                    ? 'text-[12px] leading-relaxed text-gray-700 font-mono whitespace-pre'
                                                                    : 'text-sm text-gray-700 font-medium leading-relaxed whitespace-pre-wrap'
                                                            }
                                                        >
                                                            {log.description}
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="flex sm:flex-col gap-1 shrink-0 self-end sm:self-start">
                                                    <button
                                                        type="button"
                                                        title="Edit"
                                                        onClick={() => {
                                                            setEditingLog(log);
                                                            setFormData({
                                                                officer_name: log.officer_name,
                                                                shift_type: log.shift_type,
                                                                activity_type: log.activity_type,
                                                                description: log.description,
                                                                location: log.location || '',
                                                            });
                                                            window.scrollTo({ top: 0, behavior: 'smooth' });
                                                        }}
                                                        className="p-2.5 rounded-lg text-gray-400 hover:text-burgundy hover:bg-burgundy/5 transition-colors"
                                                    >
                                                        <Edit size={16} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        title="Delete"
                                                        onClick={() => deleteLog(log.id)}
                                                        className="p-2.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>

                    <p className="text-xs text-gray-500 font-medium px-1 flex items-start gap-2">
                        <AlertCircle size={14} className="mt-0.5 text-gold shrink-0" />
                        Entries are stored for administrative review. Export a CSV copy when you need an offline record.
                    </p>
                </section>
            </div>
        </div>
    );
};

export default SecurityLogPage;
