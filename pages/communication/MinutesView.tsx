import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, FileText, Calendar, ShieldCheck, Clock, CheckCircle, AlertCircle, User, Globe, Type, RotateCcw, Pen, Eye } from 'lucide-react';
import { useNav } from '../../App';
import { MeetingMinutes, MinuteAcknowledgement } from '../../types';

// ─── Signature Pad Component ──────────────────────────────────────────────────
interface SignaturePadProps {
    onSave: (dataUrl: string, typedName: string) => void;
    onClose: () => void;
}

const SignaturePad: React.FC<SignaturePadProps> = ({ onSave, onClose }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [hasStrokes, setHasStrokes] = useState(false);
    const [typedName, setTypedName] = useState('');
    const lastPos = useRef<{ x: number; y: number } | null>(null);

    const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        if ('touches' in e) {
            return {
                x: (e.touches[0].clientX - rect.left) * scaleX,
                y: (e.touches[0].clientY - rect.top) * scaleY,
            };
        }
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY,
        };
    };

    const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
        e.preventDefault();
        const canvas = canvasRef.current;
        if (!canvas) return;
        const pos = getPos(e, canvas);
        lastPos.current = pos;
        setIsDrawing(true);
    };

    const draw = (e: React.MouseEvent | React.TouchEvent) => {
        e.preventDefault();
        if (!isDrawing || !canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx || !lastPos.current) return;

        const pos = getPos(e, canvas);
        ctx.beginPath();
        ctx.moveTo(lastPos.current.x, lastPos.current.y);
        ctx.lineTo(pos.x, pos.y);
        ctx.strokeStyle = '#0d1a14';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
        lastPos.current = pos;
        setHasStrokes(true);
    };

    const stopDrawing = () => {
        setIsDrawing(false);
        lastPos.current = null;
    };

    const clearCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        setHasStrokes(false);
    }, []);

    const handleSave = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const dataUrl = canvas.toDataURL('image/png');
        onSave(dataUrl, typedName.trim());
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-[2.5rem] shadow-2xl shadow-burgundy/20 w-full max-w-xl overflow-hidden">
                {/* Header */}
                <div className="bg-[#0d1a14] p-6 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#C9A35A]/20 flex items-center justify-center">
                            <Pen size={20} className="text-[#C9A35A]" />
                        </div>
                        <div>
                            <h3 className="text-white font-black text-sm">Digital Signature</h3>
                            <p className="text-white/50 text-[10px] font-bold uppercase tracking-widest">Sign to Acknowledge</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/60 hover:bg-white/20 transition-colors text-lg font-bold"
                    >
                        ×
                    </button>
                </div>

                {/* Canvas Area */}
                <div className="p-6">
                    <p className="text-xs text-gray-400 font-medium mb-3 text-center">Sign your name in the box below</p>
                    <div className="relative rounded-2xl border-2 border-dashed border-[#0d1a14]/20 bg-gray-50 overflow-hidden">
                        <canvas
                            ref={canvasRef}
                            width={560}
                            height={200}
                            className="w-full touch-none cursor-crosshair"
                            onMouseDown={startDrawing}
                            onMouseMove={draw}
                            onMouseUp={stopDrawing}
                            onMouseLeave={stopDrawing}
                            onTouchStart={startDrawing}
                            onTouchMove={draw}
                            onTouchEnd={stopDrawing}
                        />
                        {!hasStrokes && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <p className="text-gray-300 text-sm font-bold italic">Draw your signature here</p>
                            </div>
                        )}
                        {/* Baseline */}
                        <div className="absolute bottom-10 left-10 right-10 border-b border-gray-200" />
                    </div>
                    <label className="block mt-4 text-[10px] font-black uppercase tracking-widest text-gray-400">
                        Typed legal name
                    </label>
                    <input
                        type="text"
                        value={typedName}
                        onChange={(e) => setTypedName(e.target.value)}
                        placeholder="Type your full name"
                        className="mt-1 w-full p-3 bg-gray-50 rounded-xl font-medium text-gray-900 outline-none focus:bg-white border border-transparent focus:border-[#C9A35A]"
                    />
                </div>

                {/* Actions */}
                <div className="px-6 pb-6 flex items-center justify-between gap-3">
                    <button
                        onClick={clearCanvas}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-400 font-bold text-xs hover:border-red-200 hover:text-red-400 transition-all"
                    >
                        <RotateCcw size={14} />
                        Clear
                    </button>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onClose}
                            className="px-6 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-bold text-xs hover:bg-gray-50 transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={!hasStrokes || !typedName.trim()}
                            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#0d1a14] text-[#C9A35A] font-black text-xs hover:scale-105 active:scale-95 transition-all shadow-lg disabled:opacity-40 disabled:scale-100"
                        >
                            <ShieldCheck size={14} />
                            Confirm Signature
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ─── Main View ────────────────────────────────────────────────────────────────
const MinutesView: React.FC = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { userId, userRole } = useNav();
    const [doc, setDoc] = useState<MeetingMinutes | null>(null);
    const [acknowledgements, setAcknowledgements] = useState<MinuteAcknowledgement[]>([]);
    const [history, setHistory] = useState<MeetingMinutes[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [showSignaturePad, setShowSignaturePad] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [docRes, ackRes] = await Promise.all([
                fetch(`/api/minutes?resource=minutes&id=${id}`),
                fetch(`/api/minutes?resource=minutes&subResource=acknowledgements&documentId=${id}`)
            ]);

            const docData = await docRes.json();
            const ackData = await ackRes.json();

            if (docData.ok) {
                const currentDoc = docData.document;
                setDoc(currentDoc);

                // Fetch full version history
                if (currentDoc.parent_id) {
                    const histRes = await fetch(`/api/minutes?resource=minutes&parentId=${currentDoc.parent_id}`);
                    const histData = await histRes.json();
                    if (histData.ok) setHistory(histData.documents || []);
                }
            }
            if (ackData.ok) setAcknowledgements(ackData.acknowledgements || []);
        } catch (err) {
            console.error(err);
            setError("Failed to load document data.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [id]);

    const handleAcknowledgeWithSignature = async (signatureDataUrl: string, typedName: string) => {
        if (!userId) return;
        setShowSignaturePad(false);
        setSubmitting(true);
        try {
            const res = await fetch('/api/minutes?resource=minutes&subResource=acknowledgements', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    documentId: id,
                    userId,
                    signatureData: signatureDataUrl,
                    typedName,
                    requesterRole: userRole,
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to record acknowledgement');
            fetchData();
        } catch (err: any) {
            alert(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    // Quick ack without signature (for non-signature docs)
    const handleAcknowledge = async () => {
        if (!userId) return;
        setSubmitting(true);
        try {
            const res = await fetch('/api/minutes?resource=minutes&subResource=acknowledgements', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ documentId: id, userId, requesterRole: userRole })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to record acknowledgement');
            fetchData();
        } catch (err: any) {
            alert(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    const hasSigned = acknowledgements.some(a => a.user_id === userId);
    const myAck = acknowledgements.find(a => a.user_id === userId);

    // ── Role Tiers ────────────────────────────────────────────────────────────
    const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN', 'PASTOR', 'SECRETARY', 'ASST_SECRETARY', 'ADMIN_STAFF', 'FIRST_LADY', 'FINANCE'];
    const MEMBER_ROLES = ['MEMBER', 'GUEST', 'PARENT', 'TEACHER', 'YOUTH', 'USER'];
    const isAdmin = ADMIN_ROLES.includes(userRole);
    const isMember = MEMBER_ROLES.includes(userRole);
    const isLeader = !isAdmin && !isMember;

    if (loading) return <div className="p-20 text-center text-burgundy font-bold animate-pulse">Establishing secure handshake...</div>;
    if (!doc) return <div className="p-20 text-center text-red-500 font-bold">Document not found or access denied.</div>;

    return (
        <>
            {showSignaturePad && (
                <SignaturePad
                    onSave={handleAcknowledgeWithSignature}
                    onClose={() => setShowSignaturePad(false)}
                />
            )}

            <div className="min-h-screen bg-[#F9F9F7] p-6 lg:p-12 pb-32 animate-in fade-in duration-500">
                {/* Navigation Header */}
                <div className="max-w-5xl mx-auto mb-10 flex items-center justify-between">
                    <button
                        onClick={() => navigate('/communication/minutes')}
                        className="flex items-center gap-2 text-gray-400 hover:text-burgundy transition-colors font-bold text-sm group"
                    >
                        <div className="p-2 bg-white rounded-xl shadow-sm group-hover:shadow-md border border-gray-100 transition-all">
                            <ChevronLeft size={20} />
                        </div>
                        Back to Registry
                    </button>
                    <div className="flex items-center gap-3">
                        <a
                            href={`/api/minutes?resource=minutes&subResource=pdf&id=${id}`}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0d1a14] text-[#C9A35A] text-[10px] font-black uppercase tracking-widest"
                        >
                            <FileText size={14} /> Download PDF
                        </a>
                        <span className="text-[10px] font-black text-gold uppercase tracking-[0.3em]">Minutes Protocol</span>
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    </div>
                </div>

                <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-10">
                    {/* Main Content */}
                    <div className="lg:col-span-2 space-y-8">
                        <div className="bg-white rounded-[2.5rem] shadow-xl shadow-burgundy/5 border border-white overflow-hidden">
                            <div className="bg-[#0d1a14] p-10 text-white relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-64 h-64 bg-gold/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl pointer-events-none" />
                                <div className="relative z-10">
                                    <span className="inline-block px-3 py-1 bg-gold text-[#0d1a14] text-[10px] font-black rounded-lg mb-4 uppercase tracking-widest">
                                        {doc.department} Registry
                                    </span>
                                    <h1 className="text-3xl font-black tracking-tight mb-4">{doc.title}</h1>
                                    <div className="flex flex-wrap items-center gap-6 text-white/60 text-xs font-bold uppercase tracking-widest">
                                        <div className="flex items-center gap-2">
                                            <Calendar size={14} className="text-gold" />
                                            Meeting: {new Date(doc.meeting_date).toLocaleDateString()}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Clock size={14} className="text-gold" />
                                            Published: {new Date(doc.created_at).toLocaleDateString()}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Type size={14} className="text-gold" />
                                            Version: {doc.version} {doc.is_latest && <span className="text-emerald-400 font-black italic">(Latest)</span>}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="p-10">
                                <div className="mb-8 flex items-center gap-4 border-b border-gold/30 pb-6">
                                    <img src="/images/awc-logo.png" alt="Promised Land Christian Center" className="h-14 w-14 object-contain" />
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#0d1a14]">Promised Land Christian Center</p>
                                        <p className="text-xs text-gray-500 font-medium">Official Meeting Minutes</p>
                                    </div>
                                </div>
                                {doc.summary && (
                                    <div className="mb-10 p-6 bg-[#F9F9F7] rounded-3xl border-l-4 border-gold italic text-gray-600 font-medium">
                                        <h4 className="not-italic font-black text-[10px] text-gray-400 uppercase tracking-widest mb-2">Executive Summary</h4>
                                        "{doc.summary}"
                                    </div>
                                )}
                                <div className="prose prose-burgundy max-w-none">
                                    <h4 className="font-black text-[10px] text-gray-400 uppercase tracking-widest mb-6 border-b pb-2">Record Details</h4>
                                    <div className="text-gray-700 leading-relaxed whitespace-pre-wrap font-medium">
                                        {doc.content}
                                    </div>
                                </div>
                            </div>

                            {/* Signing Footer ── Role-Gated ─────────────────── */}
                            {doc.require_signature && (
                                <div className={`p-10 border-t ${hasSigned ? 'bg-emerald-50/50' : isMember ? 'bg-gray-50/50' : 'bg-amber-50/30'}`}>
                                    {/* MEMBER: read-only banner */}
                                    {isMember && !hasSigned && (
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-2xl bg-gray-200 flex items-center justify-center flex-shrink-0">
                                                <Eye size={22} className="text-gray-500" />
                                            </div>
                                            <div>
                                                <h3 className="text-base font-black text-gray-600 leading-none mb-1">View Only</h3>
                                                <p className="text-sm text-gray-400 font-medium">
                                                    As a Member, you can read this document but cannot sign it. Contact a Ministry Leader or Administrator.
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {/* LEADER / ADMIN: sign or receipt */}
                                    {!isMember && (
                                        hasSigned ? (
                                            <div className="space-y-4">
                                                <div className="flex items-center gap-6">
                                                    <div className="w-16 h-16 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20">
                                                        <ShieldCheck size={32} />
                                                    </div>
                                                    <div>
                                                        <h3 className="text-xl font-black text-emerald-900 leading-none mb-1">Authenticated Receipt</h3>
                                                        <p className="text-sm text-emerald-700 font-medium">
                                                            You acknowledged this record on {new Date(myAck?.signed_at || '').toLocaleString()}
                                                        </p>
                                                    </div>
                                                </div>
                                                {myAck?.signature_data && (
                                                    <div className="mt-4 p-4 bg-white rounded-2xl border border-emerald-100">
                                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">Your Signature</p>
                                                        <img src={myAck.signature_data} alt="Your signature" className="h-16 w-auto max-w-full object-contain" />
                                                        {myAck.typed_name ? (
                                                            <p className="mt-2 text-sm italic text-[#0d1a14] font-medium">{myAck.typed_name}</p>
                                                        ) : null}
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="space-y-6">
                                                <div>
                                                    <h3 className="text-xl font-black text-[#0d1a14] leading-none mb-2">Acknowledgement Pending</h3>
                                                    <p className="text-sm text-gray-500 font-medium max-w-md">
                                                        By signing below, you confirm that you have read and understood the details of this communication record.
                                                    </p>
                                                </div>
                                                <div className="flex flex-col sm:flex-row gap-3">
                                                    <button
                                                        onClick={() => setShowSignaturePad(true)}
                                                        disabled={submitting}
                                                        className="flex items-center justify-center gap-3 px-8 py-4 bg-[#0d1a14] text-[#C9A35A] rounded-2xl font-black uppercase tracking-widest shadow-xl hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100"
                                                    >
                                                        <Pen size={18} />
                                                        {submitting ? 'PROCESSING...' : 'Sign & Acknowledge'}
                                                    </button>
                                                    <button
                                                        onClick={handleAcknowledge}
                                                        disabled={submitting}
                                                        className="flex items-center justify-center gap-3 px-8 py-4 border-2 border-[#0d1a14] text-[#0d1a14] rounded-2xl font-black uppercase tracking-widest hover:bg-[#0d1a14]/5 transition-all disabled:opacity-50"
                                                    >
                                                        <CheckCircle size={18} />
                                                        Read Only (No Sign)
                                                    </button>
                                                </div>
                                            </div>
                                        )
                                    )}

                                    {/* MEMBER already signed (edge case) */}
                                    {isMember && hasSigned && (
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                                                <CheckCircle size={22} />
                                            </div>
                                            <p className="text-sm font-black text-emerald-800">You marked this as read on {new Date(myAck?.signed_at || '').toLocaleString()}.</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Non-signature docs: Leader/Admin only Mark as Read */}
                            {!doc.require_signature && !hasSigned && !isMember && (
                                <div className="p-10 border-t bg-blue-50/30">
                                    <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                                        <div>
                                            <h3 className="text-xl font-black text-[#0d1a14] leading-none mb-2">Mark as Read</h3>
                                            <p className="text-sm text-gray-500 font-medium">Confirm you've reviewed this document.</p>
                                        </div>
                                        <button
                                            onClick={handleAcknowledge}
                                            disabled={submitting}
                                            className="flex items-center gap-2 px-8 py-4 bg-[#0d1a14] text-[#C9A35A] rounded-2xl font-black uppercase tracking-widest shadow-xl hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
                                        >
                                            <CheckCircle size={18} />
                                            {submitting ? 'PROCESSING...' : 'I HAVE READ THIS'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Sidebar */}
                    <div className="space-y-6">
                        {/* Version History */}
                        {history.length > 1 && (
                            <div className="bg-white rounded-[2rem] p-8 border border-gray-100 shadow-sm animate-in slide-in-from-right-4">
                                <h4 className="font-black text-[10px] text-gray-400 uppercase tracking-[0.3em] mb-6 flex items-center gap-2">
                                    <Clock size={14} className="text-gold" />
                                    Version History
                                </h4>
                                <div className="space-y-3">
                                    {history.map(h => (
                                        <button
                                            key={h.id}
                                            onClick={() => navigate(`/communication/minutes/${h.id}`)}
                                            className={`w-full text-left p-4 rounded-2xl transition-all border ${h.id === id
                                                ? 'bg-[#0d1a14] text-white border-gold/30 shadow-lg'
                                                : 'bg-gray-50 text-gray-700 border-transparent hover:border-gold/20'
                                                }`}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-xs font-black">Version {h.version}</span>
                                                {h.is_latest && (
                                                    <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded italic ${h.id === id ? 'bg-gold text-[#0d1a14]' : 'bg-emerald-500/20 text-emerald-600'}`}>
                                                        Latest
                                                    </span>
                                                )}
                                            </div>
                                            <p className={`text-[9px] font-bold uppercase tracking-tighter mt-1 ${h.id === id ? 'text-white/60' : 'text-gray-400'}`}>
                                                {new Date(h.created_at).toLocaleDateString()}
                                            </p>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Receipt Log ─ Role-Gated Visibility ─ */}
                        <div className="bg-white rounded-[2rem] p-8 border border-gray-100 shadow-sm">
                            <h4 className="font-black text-[10px] text-gray-400 uppercase tracking-[0.3em] mb-6 flex items-center gap-2">
                                <ShieldCheck size={14} className="text-gold" />
                                Receipt Log ({acknowledgements.length})
                            </h4>
                            {isMember ? (
                                /* Members see only count, not names or signatures */
                                <div className="text-center py-6">
                                    <p className="text-gray-400 font-bold text-sm">{acknowledgements.length} acknowledgement{acknowledgements.length !== 1 ? 's' : ''} recorded</p>
                                    <p className="text-[10px] text-gray-300 font-medium mt-1">Signature details visible to leadership only.</p>
                                </div>
                            ) : (
                                <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                                    {acknowledgements.length === 0 ? (
                                        <div className="text-center py-10 opacity-40">
                                            <Clock size={32} className="mx-auto mb-2" />
                                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">No signatures yet</p>
                                        </div>
                                    ) : (
                                        acknowledgements.map(ack => (
                                            <div key={ack.id} className="group">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-lg bg-burgundy/5 flex items-center justify-center text-burgundy flex-shrink-0">
                                                        <User size={14} />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center justify-between gap-2">
                                                            <p className="text-xs font-black text-gray-800 truncate">{ack.user?.name || 'Unknown Leader'}</p>
                                                            <div className="flex items-center gap-1 text-[8px] font-black text-emerald-500 uppercase tracking-tighter flex-shrink-0">
                                                                <CheckCircle size={8} /> {ack.signature_data ? 'Signed' : 'Read'}
                                                            </div>
                                                        </div>
                                                        <p className="text-[9px] text-gray-400 font-bold uppercase tracking-tighter mt-0.5">
                                                            {new Date(ack.signed_at).toLocaleString()}
                                                        </p>
                                                    </div>
                                                </div>
                                                {/* Admin: see ALL signatures. Leader: see only own. Member: none (handled above) */}
                                                {ack.signature_data && (isAdmin || (isLeader && ack.user_id === userId)) && (
                                                    <div className="ml-11 mt-2 p-3 bg-gray-50 rounded-xl border border-gray-100">
                                                        <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Digital Signature</p>
                                                        <img
                                                            src={ack.signature_data}
                                                            alt={`${ack.user?.name}'s signature`}
                                                            className="h-10 w-auto max-w-full object-contain"
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}

                            {isAdmin && (
                                <div className="mt-6 pt-4 border-t border-dashed border-gray-100">
                                    <p className="text-[10px] text-gray-400 font-bold italic text-center leading-tight">
                                        Digital fingerprinting active. Signatures stored securely.
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Official Document Card */}
                        <div className="bg-emerald-900 rounded-[2rem] p-8 text-white relative overflow-hidden shadow-xl shadow-emerald-950/20">
                            <Globe className="absolute -bottom-4 -right-4 w-24 h-24 text-white/10" />
                            <h5 className="font-black text-[9px] text-emerald-400 uppercase tracking-[0.4em] mb-4">Official Document</h5>
                            <p className="text-xs font-medium text-emerald-50/80 leading-relaxed mb-6">
                                This record is part of the Promised Land Christian Center leadership archives.
                            </p>
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center backdrop-blur-md">
                                    <FileText size={20} className="text-gold" />
                                </div>
                                <div>
                                    <p className="text-[10px] font-black tracking-tight">DOCUMENT ID</p>
                                    <p className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest">{doc.id.split('-')[0]}***</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};

export default MinutesView;
