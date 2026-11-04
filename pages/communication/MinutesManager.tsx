import React, { useState, useEffect, useRef } from 'react';
import { Plus, FileText, Calendar, Filter, Search, Trash2, X, Save, AlertCircle, Type, ChevronDown, CheckCircle, Clock, Bell, ShieldAlert, Eye, Pen, RotateCcw } from 'lucide-react';
import { useSearchParams, Link } from 'react-router-dom';
import { useNav } from '../../App';
import { MeetingMinutes } from '../../types';
import { getAuthHeaders } from '../../lib/api';
import MinutesRecorder from '../../components/Minutes/MinutesRecorder';
import AskAdminTitleLink from '../../components/common/AskAdminTitleLink';
import {
  clearHuddleMinutesDraft,
  huddleMinutesPrefill,
  loadHuddleMinutesDraft,
} from '../../api/_utils/minutesRecorder.js';

const MinutesManager: React.FC = () => {
    const { userId, userRole } = useNav();
    const [minutes, setMinutes] = useState<MeetingMinutes[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filterDept, setFilterDept] = useState<string>('ALL');
    const [confirmDelete, setConfirmDelete] = useState<{ id: string; title: string } | null>(null);
    const [sendingReminder, setSendingReminder] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);

    // Form State
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [formData, setFormData] = useState({
        title: '',
        meeting_date: new Date().toISOString().split('T')[0],
        department: 'Leadership',
        summary: '',
        content: '',
        require_signature: true,
        deadline: '',
        parent_id: null as string | null,
        audio_url: '' as string,
        transcript: '' as string,
        typed_signature: '' as string,
        secretary_signature: '' as string,
    });
    const [searchParams] = useSearchParams();
    const sigCanvasRef = useRef<HTMLCanvasElement>(null);
    const [sigDrawing, setSigDrawing] = useState(false);

    const fetchMinutes = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/minutes?resource=minutes');
            const data = await res.json();
            if (data.ok) {
                setMinutes(data.documents || []);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchMinutes();
    }, []);

    useEffect(() => {
        if (searchParams.get('action') !== 'create') return;
        const huddle = searchParams.get('huddle') === '1';
        const prefill = huddleMinutesPrefill({
            channelName: searchParams.get('title') || searchParams.get('channel'),
            department: searchParams.get('dept'),
        });
        const draft = huddle || searchParams.get('fromDraft') === '1' ? loadHuddleMinutesDraft() : null;
        setFormData((prev) => ({
            ...prev,
            title: huddle ? prefill.title : prev.title || prefill.title,
            department: searchParams.get('dept') || prev.department,
            transcript: draft?.transcript || prev.transcript,
            audio_url: draft?.audioUrl || prev.audio_url,
            content: draft?.transcript
                ? `Meeting transcript (draft — edit before publishing)\n\n${draft.transcript}`
                : prev.content,
            summary: draft?.summary || prev.summary,
        }));
        setIsFormOpen(true);
    }, [searchParams]);

    const captureSecretarySignature = () => {
        const canvas = sigCanvasRef.current;
        if (!canvas) return;
        const blank = document.createElement('canvas');
        blank.width = canvas.width;
        blank.height = canvas.height;
        if (canvas.toDataURL() === blank.toDataURL()) return;
        setFormData((prev) => ({ ...prev, secretary_signature: canvas.toDataURL('image/png') }));
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setFormError(null);

        try {
            const payload = {
                ...formData,
                deadline: formData.deadline || null,
                requesterRole: userRole,
                created_by: userId,
            };

            const headers = await getAuthHeaders();
            const res = await fetch('/api/vault?resource=minutes', {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to create minutes');

            clearHuddleMinutesDraft();

            setFormData({
                title: '',
                meeting_date: new Date().toISOString().split('T')[0],
                department: 'Leadership',
                summary: '',
                content: '',
                require_signature: true,
                deadline: '',
                parent_id: null,
                audio_url: '',
                transcript: '',
                typed_signature: '',
                secretary_signature: '',
            });
            setIsFormOpen(false);
            fetchMinutes();
        } catch (err: any) {
            setFormError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id: string) => {
        setDeleting(true);
        try {
            const res = await fetch(`/api/minutes?id=${id}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to delete');
            setMinutes(prev => prev.filter(m => m.id !== id));
        } catch (err: any) {
            console.error(err);
            alert(err.message || 'Failed to delete minutes');
        } finally {
            setDeleting(false);
            setConfirmDelete(null);
        }
    };

    const departments = ['Leadership', 'Policy', 'Youth', 'Worship', 'Finance', 'Media', 'Staff'];

    const filtered = minutes.filter(m =>
        m.is_latest !== false &&
        (filterDept === 'ALL' || m.department === filterDept) &&
        (m.title.toLowerCase().includes(search.toLowerCase()) || m.summary?.toLowerCase().includes(search.toLowerCase()))
    );

    // ── Role Tiers ─────────────────────────────────────────────────────────────
    const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN', 'PASTOR', 'SECRETARY', 'ASST_SECRETARY', 'ADMIN_STAFF', 'FIRST_LADY', 'FINANCE'];
    const MEMBER_ROLES = ['MEMBER', 'GUEST', 'PARENT', 'TEACHER', 'YOUTH', 'USER'];
    const isAdmin = ADMIN_ROLES.includes(userRole);
    const isMember = MEMBER_ROLES.includes(userRole);
    const isLeader = !isAdmin && !isMember; // MINISTRY_LEADER, STAFF, WORSHIP_TEAM, etc.

    const roleBadge = isAdmin
        ? { label: 'Administrator', color: 'bg-[#0d1a14] text-[#C9A35A]' }
        : isLeader
            ? { label: 'Ministry Leader', color: 'bg-emerald-800 text-emerald-200' }
            : { label: 'Member', color: 'bg-gray-200 text-gray-600' };

    const handleSendReminders = async (mode: 'manual' | 'due' | 'overdue') => {
        try {
            const res = await fetch(`/api/minutes?action=send-reminders&mode=${mode}&requesterRole=${userRole}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to send reminders');
            alert(`✅ Sent reminders to ${data.remindedCount} leader(s) across ${data.documentsScanned} document(s).`);
        } catch (err: any) {
            alert(err.message || 'Failed to send reminders');
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500 pb-20 p-6">

            {/* ── Delete Confirmation Modal ─────────────────────────────── */}
            {confirmDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-150">
                    <div className="bg-white rounded-[2rem] shadow-2xl shadow-red-900/10 w-full max-w-sm overflow-hidden">
                        <div className="bg-red-700 p-6">
                            <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center mb-3">
                                <Trash2 size={24} className="text-white" />
                            </div>
                            <h3 className="text-white font-black text-lg leading-tight">Delete Minutes?</h3>
                            <p className="text-white/70 text-sm font-medium mt-1">This action cannot be undone.</p>
                        </div>
                        <div className="p-6">
                            <p className="text-gray-700 font-medium text-sm mb-6">
                                Are you sure you want to permanently delete{' '}
                                <span className="font-black text-gray-900">"{confirmDelete.title}"</span>?
                                All acknowledgements and signatures will also be removed.
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setConfirmDelete(null)}
                                    disabled={deleting}
                                    className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 font-bold text-sm hover:bg-gray-50 transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => handleDelete(confirmDelete.id)}
                                    disabled={deleting}
                                    className="flex-1 py-3 rounded-xl bg-red-600 text-white font-black text-sm hover:bg-red-700 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                                >
                                    {deleting ? (
                                        <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Deleting...</>
                                    ) : (
                                        <><Trash2 size={14} />Delete</>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <h1 className="text-4xl font-extrabold text-[#0d1a14] tracking-tight">Meeting Minutes</h1>
                        <AskAdminTitleLink />
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${roleBadge.color}`}>{roleBadge.label}</span>
                    </div>
                    <p className="text-gray-400 font-medium">
                        Create, record, and track leadership minutes. Path: Connect → Minutes (or Community → Meeting Minutes).
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {isAdmin && (
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-400 font-medium hidden md:block">Reminders:</span>
                            <button onClick={() => handleSendReminders('due')} title="Send reminders for minutes due within 48h" className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-amber-200 text-amber-700 bg-amber-50 font-bold text-xs hover:bg-amber-100 transition-all">
                                <Bell size={13} /><span className="hidden sm:inline">Due Soon</span>
                            </button>
                            <button onClick={() => handleSendReminders('overdue')} title="Send overdue reminders" className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-200 text-red-600 bg-red-50 font-bold text-xs hover:bg-red-100 transition-all">
                                <ShieldAlert size={13} /><span className="hidden sm:inline">Overdue</span>
                            </button>
                        </div>
                    )}
                    {isAdmin && !isFormOpen && (
                        <button
                            onClick={() => setIsFormOpen(true)}
                            className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-[#0d1a14] text-[#C9A35A] font-bold text-sm shadow-lg hover:scale-105 transition-all"
                        >
                            <Plus size={18} /> New minutes
                        </button>
                    )}
                    {isMember && (
                        <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-gray-100 text-gray-500 text-xs font-bold">
                            <Eye size={14} /> View Only Access
                        </div>
                    )}
                </div>
            </div>

            {isFormOpen && (
                <div className="bg-white rounded-[2rem] border border-gold/20 shadow-xl overflow-hidden animate-in slide-in-from-top-4">
                    <div className="bg-[#0d1a14]/5 p-6 border-b border-gold/10 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-[#0d1a14] text-[#C9A35A] flex items-center justify-center shadow-md">
                                <FileText size={20} />
                            </div>
                            <div>
                                <h3 className="font-bold text-[#0d1a14]">New meeting minutes</h3>
                                <p className="text-xs text-gray-500 uppercase tracking-widest">Record during the meeting, or type / paste notes</p>
                            </div>
                        </div>
                        <button onClick={() => setIsFormOpen(false)} className="p-2 hover:bg-white rounded-full transition-colors text-gray-400">
                            <X size={20} />
                        </button>
                    </div>

                    <form onSubmit={handleCreate} className="p-8 space-y-6">
                        {formError && (
                            <div className="p-4 bg-red-50 text-red-600 rounded-xl flex items-center gap-3 text-sm font-medium">
                                <AlertCircle size={18} />
                                {formError}
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="md:col-span-2 space-y-2">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block ml-1">Title</label>
                                <input
                                    required
                                    type="text"
                                    value={formData.title}
                                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                                    placeholder="e.g. Leadership Strategy Meeting"
                                    className="w-full p-4 bg-gray-50 rounded-xl font-medium text-gray-900 border border-transparent focus:bg-white focus:border-[#C9A35A] outline-none transition-all"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block ml-1">Meeting Date</label>
                                <input
                                    required
                                    type="date"
                                    value={formData.meeting_date}
                                    onChange={e => setFormData({ ...formData, meeting_date: e.target.value })}
                                    className="w-full p-4 bg-gray-50 rounded-xl font-medium text-gray-900 border border-transparent focus:bg-white focus:border-[#C9A35A] outline-none transition-all"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block ml-1">Department</label>
                                <div className="relative">
                                    <select
                                        value={formData.department}
                                        onChange={e => setFormData({ ...formData, department: e.target.value })}
                                        className="w-full p-4 bg-gray-50 rounded-xl font-medium text-gray-900 border border-transparent focus:bg-white focus:border-[#C9A35A] outline-none transition-all appearance-none"
                                    >
                                        {departments.map(d => <option key={d} value={d}>{d}</option>)}
                                    </select>
                                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block ml-1">Acknowledgement Required?</label>
                                <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl">
                                    <input
                                        type="checkbox"
                                        checked={formData.require_signature}
                                        onChange={e => setFormData({ ...formData, require_signature: e.target.checked })}
                                        className="w-5 h-5 accent-[#0d1a14]"
                                    />
                                    <span className="text-sm font-medium text-gray-700">Digital acknowledgement required by leaders</span>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block ml-1">Executive Summary</label>
                            <input
                                type="text"
                                value={formData.summary}
                                onChange={e => setFormData({ ...formData, summary: e.target.value })}
                                placeholder="Short overview of the meeting..."
                                className="w-full p-4 bg-gray-50 rounded-xl font-medium text-gray-900 border border-transparent focus:bg-white focus:border-[#C9A35A] outline-none transition-all"
                            />
                        </div>

                        <MinutesRecorder
                            disabled={submitting}
                            getAuthHeaders={getAuthHeaders}
                            onError={(msg) => setFormError(msg || null)}
                            onTranscribed={({ transcript, summary, audioUrl }) => {
                                setFormData((prev) => ({
                                    ...prev,
                                    transcript,
                                    audio_url: audioUrl || prev.audio_url,
                                    content: transcript
                                        ? `Meeting transcript (draft — edit before publishing)\n\n${transcript}`
                                        : prev.content,
                                    summary: summary || prev.summary,
                                }));
                            }}
                        />

                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block ml-1">Full Minutes Details</label>
                            <textarea
                                required
                                rows={8}
                                value={formData.content}
                                onChange={e => setFormData({ ...formData, content: e.target.value })}
                                placeholder="Paste or type the full meeting notes here..."
                                className="w-full p-4 bg-gray-50 rounded-xl font-medium text-gray-900 border border-transparent focus:bg-white focus:border-[#C9A35A] outline-none transition-all resize-none"
                            />
                        </div>

                        <div className="rounded-2xl border border-gray-100 p-4 space-y-3">
                            <p className="text-[10px] font-black uppercase tracking-widest text-[#0d1a14]">Secretary signature (on PDF)</p>
                            <p className="text-xs text-gray-500">Draw your hand signature and type your legal name. Both appear on the branded PDF emailed to ministry leaders.</p>
                            <canvas
                                ref={sigCanvasRef}
                                width={560}
                                height={140}
                                className="w-full bg-gray-50 rounded-xl border border-dashed border-[#0d1a14]/20 touch-none cursor-crosshair"
                                onMouseDown={(e) => {
                                    const c = sigCanvasRef.current;
                                    if (!c) return;
                                    const ctx = c.getContext('2d');
                                    if (!ctx) return;
                                    const r = c.getBoundingClientRect();
                                    ctx.beginPath();
                                    ctx.moveTo((e.clientX - r.left) * (c.width / r.width), (e.clientY - r.top) * (c.height / r.height));
                                    setSigDrawing(true);
                                }}
                                onMouseMove={(e) => {
                                    if (!sigDrawing) return;
                                    const c = sigCanvasRef.current;
                                    if (!c) return;
                                    const ctx = c.getContext('2d');
                                    if (!ctx) return;
                                    const r = c.getBoundingClientRect();
                                    ctx.strokeStyle = '#0d1a14';
                                    ctx.lineWidth = 2.2;
                                    ctx.lineCap = 'round';
                                    ctx.lineTo((e.clientX - r.left) * (c.width / r.width), (e.clientY - r.top) * (c.height / r.height));
                                    ctx.stroke();
                                }}
                                onMouseUp={() => { setSigDrawing(false); captureSecretarySignature(); }}
                                onMouseLeave={() => { setSigDrawing(false); captureSecretarySignature(); }}
                            />
                            <div className="flex flex-col sm:flex-row gap-3">
                                <input
                                    type="text"
                                    value={formData.typed_signature}
                                    onChange={(e) => setFormData({ ...formData, typed_signature: e.target.value })}
                                    placeholder="Typed legal name"
                                    className="flex-1 p-3 bg-gray-50 rounded-xl font-medium text-gray-900 outline-none focus:bg-white focus:border-[#C9A35A] border border-transparent"
                                />
                                <button
                                    type="button"
                                    onClick={() => {
                                        const c = sigCanvasRef.current;
                                        if (!c) return;
                                        c.getContext('2d')?.clearRect(0, 0, c.width, c.height);
                                        setFormData({ ...formData, secretary_signature: '' });
                                    }}
                                    className="inline-flex items-center justify-center gap-1.5 px-4 py-3 rounded-xl border border-gray-200 text-gray-500 text-xs font-bold"
                                >
                                    <RotateCcw size={14} /> Clear
                                </button>
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
                            <button
                                type="button"
                                onClick={() => {
                                    setIsFormOpen(false);
                                    setFormData({ ...formData, parent_id: null });
                                }}
                                disabled={submitting}
                                className="px-6 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-50 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={submitting}
                                className="px-8 py-3 bg-[#0d1a14] text-[#C9A35A] rounded-xl font-bold shadow-lg hover:scale-102 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50"
                            >
                                <Save size={18} /> {submitting ? 'Saving...' : formData.parent_id ? 'Publish Revision' : 'Publish Minutes'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <div className="bg-white p-4 rounded-[2rem] border border-gray-50 shadow-sm flex flex-col md:flex-row items-center gap-4">
                <div className="relative flex-1 w-full">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={20} />
                    <input
                        type="text"
                        placeholder="Search title or summary..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-12 pr-6 py-3 bg-gray-50 rounded-xl outline-none font-medium focus:bg-white focus:ring-2 focus:ring-[#C9A35A]/20 transition-all"
                    />
                </div>
                <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-2 md:pb-0">
                    <button
                        onClick={() => setFilterDept('ALL')}
                        className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${filterDept === 'ALL' ? 'bg-[#0d1a14] text-white shadow-md' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}
                    >
                        All Depts
                    </button>
                    {departments.map(d => (
                        <button
                            key={d}
                            onClick={() => setFilterDept(d)}
                            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${filterDept === d ? 'bg-[#0d1a14] text-white shadow-md' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}
                        >
                            {d}
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filtered.map(item => (
                    <div key={item.id} className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm hover:shadow-md transition-all group relative flex flex-col">
                        {isAdmin && (
                            <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                                <button onClick={() => setConfirmDelete({ id: item.id, title: item.title })} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        )}

                        <div className="flex items-start gap-4 mb-4">
                            <div className="w-12 h-12 rounded-2xl bg-burgundy/5 text-burgundy flex items-center justify-center text-xl shrink-0">
                                <FileText size={24} />
                            </div>
                            <div>
                                <span className="text-[10px] font-black text-gold uppercase tracking-widest block mb-1">
                                    {item.department}
                                </span>
                                <h3 className="font-bold text-[#1A1A1A] line-clamp-2 leading-tight">{item.title}</h3>
                            </div>
                        </div>

                        {item.summary && (
                            <p className="text-gray-500 text-sm leading-relaxed line-clamp-3 mb-4 flex-1">
                                {item.summary}
                            </p>
                        )}

                        <div className="flex items-center justify-between pt-4 border-t border-gray-50 mt-auto">
                            <div className="flex flex-col">
                                <span className="text-[10px] font-black font-medium text-gray-400 uppercase tracking-tighter">
                                    {new Date(item.meeting_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                </span>
                                <span className="text-[9px] font-bold text-gold">v{item.version}</span>
                            </div>
                            <div className="flex gap-2">
                                {isAdmin && (
                                    <>
                                        <button
                                            onClick={async () => {
                                                setSendingReminder(item.id);
                                                try {
                                                    const res = await fetch(`/api/minutes?action=send-reminders&documentId=${item.id}&requesterRole=${userRole}`);
                                                    const data = await res.json();
                                                    if (!res.ok) throw new Error(data.error || 'Failed to send reminders');
                                                    alert(data.remindedCount > 0
                                                        ? `✅ Sent reminders to ${data.remindedCount} leader(s).`
                                                        : '✅ No pending signatures found — everyone has already signed.');
                                                } catch (err: any) {
                                                    alert(err.message || 'Failed to send reminders');
                                                } finally {
                                                    setSendingReminder(null);
                                                }
                                            }}
                                            disabled={sendingReminder === item.id}
                                            className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors border border-amber-100 disabled:opacity-60"
                                            title="Send Reminders to pending signers"
                                        >
                                            {sendingReminder === item.id
                                                ? <span className="w-3.5 h-3.5 border-2 border-amber-400/40 border-t-amber-600 rounded-full animate-spin block" />
                                                : <Bell size={14} />}
                                        </button>
                                        <button
                                            onClick={() => {
                                                setFormData({
                                                    title: item.title,
                                                    meeting_date: item.meeting_date,
                                                    department: item.department,
                                                    summary: item.summary || '',
                                                    content: item.content || '',
                                                    require_signature: item.require_signature,
                                                    deadline: item.deadline || '',
                                                    parent_id: item.parent_id || item.id,
                                                    audio_url: '',
                                                    transcript: '',
                                                    typed_signature: '',
                                                    secretary_signature: '',
                                                });
                                                setIsFormOpen(true);
                                            }}
                                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-blue-100"
                                            title="Upload New Version"
                                        >
                                            <Plus size={14} />
                                        </button>
                                    </>
                                )}
                                <Link
                                    to={`/communication/minutes/${item.id}`}
                                    className="px-4 py-2 bg-burgundy/5 text-burgundy text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-burgundy hover:text-white transition-all"
                                >
                                    View
                                </Link>
                            </div>
                        </div>

                        {item.require_signature && (
                            <div className="absolute -top-2 -left-2 px-3 py-1 bg-gold text-[#0d1a14] text-[9px] font-black rounded-lg shadow-sm transform-gpu -rotate-2">
                                SIGNATURE REQD
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {!loading && filtered.length === 0 && (
                <div className="text-center py-20 bg-gray-50 rounded-[2rem] border border-dashed border-gray-200">
                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 text-gray-300 shadow-sm">
                        <FileText size={32} />
                    </div>
                    <p className="text-xs font-black text-gray-400 uppercase tracking-widest">No minutes found</p>
                    <p className="text-[10px] text-gray-300 mt-1">Formal documentation will appear here.</p>
                </div>
            )}
        </div>
    );
};

export default MinutesManager;
