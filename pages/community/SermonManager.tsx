
import React, { useState, useEffect } from 'react';
import {
    BookOpen,
    Quote,
    Plus,
    Trash2,
    Edit2,
    Calendar,
    User,
    FileText,
    Search,
    X,
    Save,
    ChevronRight,
    Sparkles
} from 'lucide-react';
import { useNav } from '../../App';
import { canPerform } from '../../lib/permissions';
import { getAuthHeaders } from '../../lib/api';

interface Sermon {
    id: string;
    title: string;
    scripture: string;
    book: string;
    version: string;
    speaker: string;
    outline: { id: number; text: string; missingWord: string }[];
    date: string;
    body?: string | null;
    rhemanotes_session_url?: string | null;
    rhemanotes_study_url?: string | null;
    rhemanotes_study_title?: string | null;
}

interface Inspiration {
    id: string;
    text: string;
    reference: string;
    publish_date: string;
}

const SermonManager: React.FC = () => {
    const { userRole } = useNav();
    const [activeTab, setActiveTab] = useState<'sermons' | 'inspiration'>('sermons');
    const [sermons, setSermons] = useState<Sermon[]>([]);
    const [inspirations, setInspirations] = useState<Inspiration[]>([]);
    const [loading, setLoading] = useState(true);

    // Modal states
    const [showSermonModal, setShowSermonModal] = useState(false);
    const [showInspirationModal, setShowInspirationModal] = useState(false);
    const [editingSermon, setEditingSermon] = useState<Sermon | null>(null);
    const [editingInspiration, setEditingInspiration] = useState<Inspiration | null>(null);

    // Form states - Sermon
    const [sTitle, setSTitle] = useState('');
    const [sScripture, setSScripture] = useState('');
    const [sBook, setSBook] = useState('');
    const [sVersion, setSVersion] = useState('KJV');
    const [sSpeaker, setSSpeaker] = useState('Pastor Grace Hiire');
    const [sDate, setSDate] = useState(new Date().toISOString().split('T')[0]);
    const [sOutline, setSOutline] = useState<{ id: number; text: string; missingWord: string }[]>([]);
    const [sBody, setSBody] = useState('');
    const [sendingId, setSendingId] = useState<string | null>(null);

    // Form states - Inspiration
    const [iText, setIText] = useState('');
    const [iReference, setIReference] = useState('');
    const [iDate, setIDate] = useState(new Date().toISOString().split('T')[0]);

    const fetchData = async () => {
        setLoading(true);
        try {
      const headers = await getAuthHeaders();
            const [sRes, iRes] = await Promise.all([
                fetch('/api/vault?resource=community&subResource=sermons', { headers }),
                fetch('/api/vault?resource=community&subResource=inspiration', { headers })
            ]);
            const sData = await sRes.json();
            const iData = await iRes.json();

            if (sData.ok) setSermons(sData.sermons);
            if (iData.ok) setInspirations(iData.inspiratons || iData.inspirations || []);
        } catch (err) {
            console.error('Failed to fetch spiritual content:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleSaveSermon = async (e: React.FormEvent) => {
        e.preventDefault();
        const payload = {
            title: sTitle,
            scripture: sScripture,
            book: sBook,
            version: sVersion,
            speaker: sSpeaker,
            date: sDate,
            outline: sOutline,
            body: sBody.trim()
        };

        try {
      const headers = await getAuthHeaders();
            const method = editingSermon ? 'PATCH' : 'POST';
            const body = editingSermon ? { ...payload, id: editingSermon.id } : payload;

            const res = await fetch('/api/vault?resource=community&subResource=sermons', {
                method,
                headers: { ...headers,  'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (res.ok) {
                setShowSermonModal(false);
                fetchData();
                resetSermonForm();
            }
        } catch (err) {
            console.error('Save sermon failed:', err);
        }
    };

    const handleSaveInspiration = async (e: React.FormEvent) => {
        e.preventDefault();
        const payload = {
            text: iText,
            reference: iReference,
            publish_date: iDate
        };

        try {
      const headers = await getAuthHeaders();
            const method = editingInspiration ? 'PATCH' : 'POST';
            const body = editingInspiration ? { ...payload, id: editingInspiration.id } : payload;

            const res = await fetch('/api/vault?resource=community&subResource=inspiration', {
                method,
                headers: { ...headers,  'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (res.ok) {
                setShowInspirationModal(false);
                fetchData();
                resetInspirationForm();
            }
        } catch (err) {
            console.error('Save inspiration failed:', err);
        }
    };

    const deleteSermon = async (id: string) => {
        if (!confirm('Permanently delete this sermon guide?')) return;
        try {
      const headers = await getAuthHeaders();
            await fetch(`/api/vault?resource=community&subResource=sermons&id=${id}`, { headers, method: 'DELETE' });
            fetchData();
        } catch (err) {
            console.error('Delete sermon failed:', err);
        }
    };

    const sendToRhemaNotes = async (sermon: Sermon) => {
        setSendingId(sermon.id);
        try {
            const headers = await getAuthHeaders();
            const res = await fetch('/api/vault?resource=rhemanotes&action=send', {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ sermonId: sermon.id }),
            });
            const data = await res.json();
            if (!res.ok || !data.ok) throw new Error(data.error || 'Send failed');
            setSermons((current) =>
                current.map((row) =>
                    row.id === sermon.id ? { ...row, rhemanotes_session_url: data.url } : row
                )
            );
            if (data.url) window.open(data.url, '_blank', 'noopener,noreferrer');
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Could not send to RhemaNotes');
        } finally {
            setSendingId(null);
        }
    };

    const deleteInspiration = async (id: string) => {
        if (!confirm('Permanently delete this daily word?')) return;
        try {
      const headers = await getAuthHeaders();
            await fetch(`/api/vault?resource=community&subResource=inspiration&id=${id}`, { headers, method: 'DELETE' });
            fetchData();
        } catch (err) {
            console.error('Delete inspiration failed:', err);
        }
    };

    const resetSermonForm = () => {
        setSTitle('');
        setSScripture('');
        setSBook('');
        setSVersion('KJV');
        setSSpeaker('Pastor Grace Hiire');
        setSDate(new Date().toISOString().split('T')[0]);
        setSOutline([]);
        setSBody('');
        setEditingSermon(null);
    };

    const resetInspirationForm = () => {
        setIText('');
        setIReference('');
        setIDate(new Date().toISOString().split('T')[0]);
        setEditingInspiration(null);
    };

    const addOutlinePoint = () => {
        setSOutline([...sOutline, { id: Date.now(), text: '', missingWord: '' }]);
    };

    const updateOutlinePoint = (id: number, field: 'text' | 'missingWord', value: string) => {
        setSOutline(sOutline.map(p => p.id === id ? { ...p, [field]: value } : p));
    };

    const removeOutlinePoint = (id: number) => {
        setSOutline(sOutline.filter(p => p.id !== id));
    };

    const canManage = canPerform(userRole as any, 'community.manage');

    return (
        <div className="flex flex-col h-[calc(100dvh-64px)] overflow-hidden bg-[#F9F9F7] text-[#0d1a14] font-inter">
            {/* Local Header */}
            <div className="bg-white border-b border-gray-100 p-8 shrink-0">
                <div className="max-w-7xl mx-auto">
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <div className="h-1 w-12 bg-burgundy rounded-full" />
                                <h2 className="text-[11px] font-black text-burgundy/40 uppercase tracking-[0.5em]">Spiritual Repository</h2>
                            </div>
                            <h1 className="text-4xl lg:text-5xl font-black tracking-tighter">Sermon Manager<span className="text-gold">.</span></h1>
                        </div>

                        <div className="flex bg-gray-100 p-1 rounded-2xl">
                            <button
                                onClick={() => setActiveTab('sermons')}
                                className={`px-8 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'sermons' ? 'bg-white text-burgundy shadow-sm' : 'text-gray-400 hover:text-burgundy'}`}
                            >
                                Sermons
                            </button>
                            <button
                                onClick={() => setActiveTab('inspiration')}
                                className={`px-8 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'inspiration' ? 'bg-white text-burgundy shadow-sm' : 'text-gray-400 hover:text-burgundy'}`}
                            >
                                Daily Word
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
                <div className="max-w-7xl mx-auto">
                    {activeTab === 'sermons' ? (
                        <div className="space-y-6">
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest">Sermon Archive</h3>
                                {canManage && (
                                    <button
                                        onClick={() => { resetSermonForm(); setShowSermonModal(true); }}
                                        className="flex items-center gap-2 px-6 py-3 bg-burgundy text-gold rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-burgundy/10 hover:bg-burgundy-dark transition-all active:scale-95"
                                    >
                                        <Plus size={16} /> New Sermon
                                    </button>
                                )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {sermons.map(s => (
                                    <div key={s.id} className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm group hover:border-gold/30 transition-all">
                                        <div className="flex items-center gap-4 mb-6">
                                            <div className="w-12 h-12 rounded-2xl bg-gold-cream text-gold flex items-center justify-center shadow-inner">
                                                <BookOpen size={24} />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <span className="text-[10px] font-black text-gold uppercase tracking-widest block mb-1">
                                                    {new Date(s.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                </span>
                                                <h4 className="text-lg font-black text-[#0d1a14] truncate group-hover:text-burgundy transition-colors">{s.title}</h4>
                                            </div>
                                        </div>

                                        <div className="space-y-3 mb-8">
                                            <div className="flex items-center gap-2 text-xs font-bold text-gray-500">
                                                <User size={14} className="text-gold" />
                                                {s.speaker}
                                            </div>
                                            <div className="flex items-center gap-2 text-xs font-bold text-gray-500">
                                                <Quote size={14} className="text-gold" />
                                                {s.scripture} ({s.version})
                                            </div>
                                        </div>

                                        <div className="flex flex-col gap-2 pt-6 border-t border-gray-50">
                                            <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => {
                                                    setEditingSermon(s);
                                                    setSTitle(s.title);
                                                    setSScripture(s.scripture);
                                                    setSBook(s.book);
                                                    setSVersion(s.version);
                                                    setSSpeaker(s.speaker);
                                                    setSDate(s.date);
                                                    setSOutline(s.outline || []);
                                                    setSBody(s.body || '');
                                                    setShowSermonModal(true);
                                                }}
                                                className="flex-1 min-h-11 bg-gray-50 text-gray-400 hover:bg-gold-cream hover:text-gold rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all"
                                            >
                                                <Edit2 size={14} /> Edit
                                            </button>
                                            <button
                                                onClick={() => deleteSermon(s.id)}
                                                className="min-h-11 min-w-11 p-2.5 bg-red-50 text-red-400 rounded-xl hover:bg-red-500 hover:text-white transition-all"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                            </div>
                                            {s.rhemanotes_study_url ? (
                                                <>
                                                    {s.rhemanotes_study_title ? (
                                                        <p className="text-[11px] font-bold text-gray-400 truncate">
                                                            {s.rhemanotes_study_title}
                                                        </p>
                                                    ) : null}
                                                    <a
                                                        href={s.rhemanotes_study_url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="min-h-11 rounded-xl border border-gold/40 text-burgundy text-[10px] font-black uppercase tracking-widest flex items-center justify-center px-3 text-center"
                                                    >
                                                        Open study guide
                                                    </a>
                                                </>
                                            ) : null}
                                            {canManage ? (
                                                <div className="flex flex-col gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => sendToRhemaNotes(s)}
                                                        disabled={sendingId === s.id}
                                                        className="min-h-11 rounded-xl bg-burgundy text-gold text-[10px] font-black uppercase tracking-widest disabled:opacity-60"
                                                    >
                                                        {sendingId === s.id
                                                            ? 'Sending…'
                                                            : s.rhemanotes_session_url
                                                              ? 'Send again'
                                                              : 'Send to RhemaNotes'}
                                                    </button>
                                                    {s.rhemanotes_session_url ? (
                                                        <a
                                                            href={s.rhemanotes_session_url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="min-h-11 rounded-xl border border-gold/40 text-burgundy text-[10px] font-black uppercase tracking-widest flex items-center justify-center"
                                                        >
                                                            Open in RhemaNotes
                                                        </a>
                                                    ) : null}
                                                </div>
                                            ) : null}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest">Inspiration Log</h3>
                                {canManage && (
                                    <button
                                        onClick={() => { resetInspirationForm(); setShowInspirationModal(true); }}
                                        className="flex items-center gap-2 px-6 py-3 bg-burgundy text-gold rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-burgundy/10 hover:bg-burgundy-dark transition-all active:scale-95"
                                    >
                                        <Plus size={16} /> New Word
                                    </button>
                                )}
                            </div>

                            <div className="bg-white rounded-[2.5rem] border border-gray-100 overflow-hidden shadow-sm">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="bg-gold-cream/10 border-b border-gray-50">
                                            <th className="px-8 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Publish Date</th>
                                            <th className="px-8 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Message</th>
                                            <th className="px-8 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Reference</th>
                                            <th className="px-8 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {inspirations.map(i => (
                                            <tr key={i.id} className="group hover:bg-gray-50 transition-colors">
                                                <td className="px-8 py-6">
                                                    <span className="text-xs font-black text-burgundy">{new Date(i.publish_date).toLocaleDateString()}</span>
                                                </td>
                                                <td className="px-8 py-6 max-w-md">
                                                    <p className="text-sm font-bold text-[#0d1a14] line-clamp-2">{i.text}</p>
                                                </td>
                                                <td className="px-8 py-6">
                                                    <span className="text-xs font-black text-gold uppercase tracking-tighter">{i.reference}</span>
                                                </td>
                                                <td className="px-8 py-6 text-right">
                                                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                                        <button
                                                            onClick={() => {
                                                                setEditingInspiration(i);
                                                                setIText(i.text);
                                                                setIReference(i.reference);
                                                                setIDate(i.publish_date);
                                                                setShowInspirationModal(true);
                                                            }}
                                                            className="p-2.5 text-gray-400 hover:text-gold transition-colors"
                                                        >
                                                            <Edit2 size={16} />
                                                        </button>
                                                        <button
                                                            onClick={() => deleteInspiration(i.id)}
                                                            className="p-2.5 text-gray-400 hover:text-red-500 transition-colors"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Sermon Modal */}
            {showSermonModal && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-burgundy/60 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-[#F9F9F7] rounded-[3rem] w-full max-w-4xl shadow-2xl border border-gold/30 overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[85vh]">
                        <div className="p-8 border-b border-gray-100 flex items-center justify-between bg-white">
                            <div>
                                <h3 className="text-2xl font-black text-[#0d1a14] uppercase tracking-tight">{editingSermon ? 'Update' : 'Launch'} Sermon Guide</h3>
                                <p className="text-[10px] text-gold font-bold uppercase tracking-[0.2em] mt-1">Sermon Documentation Protocol</p>
                            </div>
                            <button onClick={() => setShowSermonModal(false)} className="p-2 text-gray-300 hover:text-burgundy transition-all bg-gray-50 rounded-xl">
                                <X size={24} />
                            </button>
                        </div>

                        <form onSubmit={handleSaveSermon} className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Sermon Title</label>
                                        <input
                                            type="text"
                                            value={sTitle}
                                            onChange={e => setSTitle(e.target.value)}
                                            placeholder="The Sound of Victory"
                                            className="w-full h-14 px-6 bg-white rounded-2xl border border-transparent focus:border-gold/30 outline-none font-bold text-[#0d1a14] shadow-sm transition-all"
                                            required
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Service Date</label>
                                            <input
                                                type="date"
                                                value={sDate}
                                                onChange={e => setSDate(e.target.value)}
                                                className="w-full h-14 px-6 bg-white rounded-2xl border border-transparent focus:border-gold/30 outline-none font-bold text-[#0d1a14] shadow-sm transition-all"
                                                required
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Translation</label>
                                            <select
                                                value={sVersion}
                                                onChange={e => setSVersion(e.target.value)}
                                                className="w-full h-14 px-6 bg-white rounded-2xl border border-transparent focus:border-gold/30 outline-none font-bold text-[#0d1a14] shadow-sm transition-all appearance-none"
                                            >
                                                <option>KJV</option>
                                                <option>NKJV</option>
                                                <option>NIV</option>
                                                <option>AMP</option>
                                                <option>ESV</option>
                                                <option>MSG</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Speaker / Messenger</label>
                                        <input
                                            type="text"
                                            value={sSpeaker}
                                            onChange={e => setSSpeaker(e.target.value)}
                                            className="w-full h-14 px-6 bg-white rounded-2xl border border-transparent focus:border-gold/30 outline-none font-bold text-[#0d1a14] shadow-sm transition-all"
                                            required
                                        />
                                    </div>

                                    <div className="grid grid-cols-3 gap-4">
                                        <div className="col-span-1 space-y-2">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Book</label>
                                            <input
                                                type="text"
                                                value={sBook}
                                                onChange={e => setSBook(e.target.value)}
                                                placeholder="Psalms"
                                                className="w-full h-14 px-6 bg-white rounded-2xl border border-transparent focus:border-gold/30 outline-none font-bold text-[#0d1a14] shadow-sm transition-all"
                                                required
                                            />
                                        </div>
                                        <div className="col-span-2 space-y-2">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Primary Scripture Reference</label>
                                            <input
                                                type="text"
                                                value={sScripture}
                                                onChange={e => setSScripture(e.target.value)}
                                                placeholder="Psalm 23:1-6"
                                                className="w-full h-14 px-6 bg-white rounded-2xl border border-transparent focus:border-gold/30 outline-none font-bold text-[#0d1a14] shadow-sm transition-all"
                                                required
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Interactive Outline</label>
                                        <button
                                            type="button"
                                            onClick={addOutlinePoint}
                                            className="text-[10px] font-black text-gold hover:text-burgundy uppercase tracking-widest flex items-center gap-1 transition-colors"
                                        >
                                            <Plus size={12} /> Add Point
                                        </button>
                                    </div>

                                    <div className="space-y-4 bg-white p-6 rounded-3xl border border-gray-100 min-h-[300px]">
                                        {sOutline.length === 0 && (
                                            <div className="h-full flex flex-col items-center justify-center text-center py-12 opacity-20">
                                                <FileText size={48} strokeWidth={1} className="mb-4 text-burgundy" />
                                                <p className="text-[10px] font-black uppercase tracking-widest">No outline points configured</p>
                                            </div>
                                        )}
                                        {sOutline.map((point, index) => (
                                            <div key={point.id} className="p-4 bg-gray-50 rounded-2xl space-y-3 relative group">
                                                <button
                                                    type="button"
                                                    onClick={() => removeOutlinePoint(point.id)}
                                                    className="absolute -top-2 -right-2 w-7 h-7 bg-white text-red-400 rounded-full shadow-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500 hover:text-white"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                                <div className="flex items-center gap-3">
                                                    <span className="w-6 h-6 rounded-lg bg-burgundy/10 text-burgundy text-[10px] font-black flex items-center justify-center shrink-0">{index + 1}</span>
                                                    <input
                                                        type="text"
                                                        value={point.text}
                                                        onChange={(e) => updateOutlinePoint(point.id, 'text', e.target.value)}
                                                        placeholder="Fools despise wisdom and ________."
                                                        className="flex-1 bg-transparent border-none outline-none text-xs font-bold text-[#0d1a14]"
                                                    />
                                                </div>
                                                <div className="flex items-center gap-2 pl-9 bg-gold-cream/30 p-2 rounded-xl">
                                                    <Sparkles size={12} className="text-gold" />
                                                    <span className="text-[8px] font-black text-gold uppercase tracking-widest">Fill:</span>
                                                    <input
                                                        type="text"
                                                        value={point.missingWord}
                                                        onChange={(e) => updateOutlinePoint(point.id, 'missingWord', e.target.value)}
                                                        placeholder="instruction"
                                                        className="bg-transparent border-none outline-none text-[10px] font-black text-burgundy placeholder:text-burgundy/20 w-full"
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Message</label>
                                <textarea
                                    value={sBody}
                                    onChange={(e) => setSBody(e.target.value)}
                                    rows={6}
                                    maxLength={50000}
                                    placeholder="Paste or write the sermon message. RhemaNotes uses this, plus the scripture and outline, as the study transcript."
                                    className="w-full min-h-32 p-6 bg-white rounded-2xl border border-transparent focus:border-gold/30 outline-none font-bold text-[#0d1a14] shadow-sm transition-all"
                                />
                            </div>

                            <div className="pt-8 border-t border-gray-100 space-y-3">
                                <button
                                    type="submit"
                                    className="w-full h-16 bg-burgundy text-gold font-black text-sm uppercase tracking-[0.2em] rounded-2xl shadow-xl shadow-burgundy/20 hover:bg-burgundy-dark transition-all active:scale-95 border-b-8 border-gold/40"
                                >
                                    Authorize Content Deployment
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Inspiration Modal */}
            {showInspirationModal && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-burgundy/60 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-[#F9F9F7] rounded-[3rem] w-full max-w-lg shadow-2xl border border-gold/30 overflow-hidden animate-in zoom-in-95 flex flex-col">
                        <div className="p-8 border-b border-gray-100 flex items-center justify-between bg-white">
                            <div>
                                <h3 className="text-2xl font-black text-[#0d1a14] uppercase tracking-tight">{editingInspiration ? 'Refine' : 'Register'} Daily Word</h3>
                                <p className="text-[10px] text-gold font-bold uppercase tracking-[0.2em] mt-1">Spiritual Feed Broadcast</p>
                            </div>
                            <button onClick={() => setShowInspirationModal(false)} className="p-2 text-gray-300 hover:text-burgundy transition-all bg-gray-50 rounded-xl">
                                <X size={24} />
                            </button>
                        </div>

                        <form onSubmit={handleSaveInspiration} className="p-8 space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Publish Date</label>
                                <input
                                    type="date"
                                    value={iDate}
                                    onChange={e => setIDate(e.target.value)}
                                    className="w-full h-14 px-6 bg-white rounded-2xl border border-transparent focus:border-gold/30 outline-none font-bold text-[#0d1a14] shadow-sm transition-all"
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Scripture Reference</label>
                                <input
                                    type="text"
                                    value={iReference}
                                    onChange={e => setIReference(e.target.value)}
                                    placeholder="Jeremiah 29:11"
                                    className="w-full h-14 px-6 bg-white rounded-2xl border border-transparent focus:border-gold/30 outline-none font-bold text-[#0d1a14] shadow-sm transition-all"
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Message Content</label>
                                <textarea
                                    value={iText}
                                    onChange={e => setIText(e.target.value)}
                                    rows={4}
                                    placeholder="Type the daily inspiration message here..."
                                    className="w-full p-6 bg-white rounded-2xl border border-transparent focus:border-gold/30 outline-none font-bold text-[#0d1a14] shadow-sm transition-all resize-none"
                                    required
                                />
                            </div>

                            <button
                                type="submit"
                                className="w-full h-16 bg-burgundy text-gold font-black text-sm uppercase tracking-[0.2em] rounded-2xl shadow-xl shadow-burgundy/20 hover:bg-burgundy-dark transition-all active:scale-95 border-b-8 border-gold/40"
                            >
                                Pulse Stream Update
                            </button>
                        </form>
                    </div>
                </div>
            )}

            <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(29, 55, 44, 0.05); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(29, 55, 44, 0.1); }
      `}</style>
        </div>
    );
};

export default SermonManager;
