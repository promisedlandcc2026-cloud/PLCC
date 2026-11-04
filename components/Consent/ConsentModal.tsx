import React, { useState, useRef, useEffect } from 'react';
import { X, CheckCircle2, AlertTriangle, FileText, PenTool, Loader2 } from 'lucide-react';
import ConsentNoticeDocument from './ConsentNoticeDocument';

interface ConsentForm {
    form_id: string;
    form_title: string;
    form_type: string;
    form_content: string;
    requires_signature: boolean;
}

interface ConsentModalProps {
    isOpen: boolean;
    onClose: () => void;
    childName: string;
    childId: string;
    parentId: string;
    missingConsents: ConsentForm[];
    onConsentsCompleted: () => void;
    /** checkin = block check-in until signed; collect = staff desk; selfserve = member signed from Forms tab */
    mode?: 'checkin' | 'collect' | 'selfserve';
}

const ConsentModal: React.FC<ConsentModalProps> = ({
    isOpen,
    onClose,
    childName,
    childId,
    parentId,
    missingConsents,
    onConsentsCompleted,
    mode = 'checkin',
}) => {
    const [currentFormIndex, setCurrentFormIndex] = useState(0);
    const [signatureName, setSignatureName] = useState('');
    const [isDrawing, setIsDrawing] = useState(false);
    const [signatureData, setSignatureData] = useState<string | null>(null);
    const [agreedToTerms, setAgreedToTerms] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [signatureMethod, setSignatureMethod] = useState<'typed' | 'drawn'>('typed');
    
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawingActive, setIsDrawingActive] = useState(false);

    const currentForm = missingConsents[currentFormIndex];
    const isLastForm = currentFormIndex === missingConsents.length - 1;
    const isAdultSelfSign = Boolean(childId && parentId && childId === parentId);

    useEffect(() => {
        if (isOpen) {
            // Reset state when modal opens
            setCurrentFormIndex(0);
            setSignatureName('');
            setSignatureData(null);
            setAgreedToTerms(false);
            setSignatureMethod('typed');
        }
    }, [isOpen]);

    // Canvas drawing functions
    const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        setIsDrawingActive(true);
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const rect = canvas.getBoundingClientRect();
        const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
        const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

        ctx.beginPath();
        ctx.moveTo(x, y);
        setIsDrawing(true);
    };

    const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        if (!isDrawing) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const rect = canvas.getBoundingClientRect();
        const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
        const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

        ctx.lineTo(x, y);
        ctx.strokeStyle = '#0d1a14';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.stroke();
    };

    const stopDrawing = () => {
        setIsDrawing(false);
        if (isDrawingActive && canvasRef.current) {
            setSignatureData(canvasRef.current.toDataURL());
        }
    };

    const clearSignature = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        setSignatureData(null);
        setIsDrawingActive(false);
    };

    const handleSubmitConsent = async () => {
        if (!agreedToTerms) {
            alert('Please agree to the terms before continuing');
            return;
        }

        if (currentForm.requires_signature) {
            if (signatureMethod === 'typed' && !signatureName.trim()) {
                alert('Please type your full name to sign');
                return;
            }
            if (signatureMethod === 'drawn' && !signatureData) {
                alert('Please draw your signature');
                return;
            }
        }

        setIsSubmitting(true);

        try {
            let authHeader = '';
            try {
                const { supabase } = await import('../../lib/supabase');
                const session = supabase ? (await supabase.auth.getSession()).data.session : null;
                if (session?.access_token) authHeader = `Bearer ${session.access_token}`;
            } catch {
                /* fall through — some kiosk flows may rely on admin client */
            }
            if (!authHeader) {
                const token = localStorage.getItem('awc_auth_token');
                if (token && token.split('.').length === 3) authHeader = `Bearer ${token}`;
            }

            const response = await fetch('/api/vault?resource=consent&action=submit', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(authHeader ? { Authorization: authHeader } : {}),
                },
                body: JSON.stringify({
                    child_id: childId,
                    parent_id: parentId,
                    child_name: childName,
                    consent_form_id: currentForm.form_id,
                    status: 'granted',
                    signature_method: signatureMethod,
                    signed_name: signatureMethod === 'typed' ? signatureName : 'Digital Signature',
                    signature_data: signatureMethod === 'drawn' ? signatureData : null,
                })
            });

            const result = await response.json();

            if (result.ok) {
                // Move to next form or complete
                if (isLastForm) {
                    onConsentsCompleted();
                    onClose();
                } else {
                    setCurrentFormIndex(currentFormIndex + 1);
                    setSignatureName('');
                    setSignatureData(null);
                    setAgreedToTerms(false);
                    setSignatureMethod('typed');
                    clearSignature();
                }
            } else {
                alert('Failed to submit consent: ' + result.error);
            }
        } catch (error) {
            console.error('Error submitting consent:', error);
            alert('Failed to submit consent. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen || !currentForm) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="absolute inset-0 bg-burgundy/60 backdrop-blur-sm" onClick={onClose} />
            
            <div className="relative bg-white w-full max-w-3xl max-h-[90vh] rounded-[3rem] shadow-2xl flex flex-col overflow-hidden border-8 border-white">
                {/* Header */}
                <div className="px-8 py-6 border-b border-gray-100 bg-burgundy/5">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-burgundy/10 flex items-center justify-center">
                                <FileText className="text-burgundy" size={24} />
                            </div>
                            <div>
                                <p className="text-xs font-black text-gold uppercase tracking-widest">
                                    {mode === 'selfserve'
                                        ? 'Read · Acknowledge · Sign'
                                        : `E-Sign Required (${currentFormIndex + 1} of ${missingConsents.length})`}
                                </p>
                                <h3 className="text-2xl font-black text-burgundy tracking-tight">{currentForm.form_title}</h3>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="w-10 h-10 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-gray-400 hover:text-burgundy hover:scale-110 transition-all"
                        >
                            <X size={20} />
                        </button>
                    </div>
                    <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 flex items-start gap-2">
                        <AlertTriangle className="text-yellow-600 shrink-0 mt-0.5" size={16} />
                        <p className="text-xs text-yellow-800 font-medium">
                            {mode === 'selfserve' ? (
                                isAdultSelfSign ? (
                                <>
                                    You are signing <strong>{currentForm.form_title}</strong> for <strong>yourself</strong>
                                    {childName && childName !== 'You' ? <> ({childName})</> : null}.
                                    Scroll to read the form, check acknowledge, then type your name or draw with your finger. Saved on file when you submit.
                                </>
                                ) : (
                                <>
                                    You are signing <strong>{currentForm.form_title}</strong> for <strong>{childName}</strong>.
                                    Scroll to read the form, check acknowledge, then type your name or draw with your finger. Saved on file when you submit.
                                </>
                                )
                            ) : mode === 'collect' ? (
                                <>
                                    Collecting e-signatures for <strong>{childName}</strong>. Parent/guardian must type or draw a signature for each required form.
                                </>
                            ) : (
                                <>
                                    <strong>{childName}</strong> cannot be checked in until all required consent forms are e-signed.
                                </>
                            )}
                        </p>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                    {mode === 'selfserve' && (
                        <p className="text-[10px] font-black text-burgundy uppercase tracking-widest mb-3">1 · Read the form</p>
                    )}
                    <div className="prose prose-sm max-w-none">
                        <ConsentNoticeDocument
                            title={currentForm.form_title}
                            content={currentForm.form_content}
                            compact
                        />
                    </div>

                    {/* Agreement Checkbox */}
                    <div className="mt-6 bg-burgundy/5 p-6 rounded-2xl border border-burgundy/10">
                        {mode === 'selfserve' && (
                            <p className="text-[10px] font-black text-burgundy uppercase tracking-widest mb-3">2 · Acknowledge</p>
                        )}
                        <label className="flex items-start gap-3 cursor-pointer group">
                            <input
                                type="checkbox"
                                checked={agreedToTerms}
                                onChange={(e) => setAgreedToTerms(e.target.checked)}
                                className="mt-1 w-5 h-5 rounded border-2 border-burgundy text-burgundy focus:ring-burgundy cursor-pointer"
                            />
                            <span className="text-sm font-bold text-burgundy group-hover:text-gold transition-colors">
                                I have read and agree to the terms outlined in this consent form. I understand that this consent is legally binding and will remain in effect for one year from today's date.
                            </span>
                        </label>
                    </div>

                    {/* Signature Section */}
                    {currentForm.requires_signature && (
                        <div className="mt-6">
                            {mode === 'selfserve' && (
                                <p className="text-[10px] font-black text-burgundy uppercase tracking-widest mb-3">3 · Type or draw</p>
                            )}
                            <h4 className="text-lg font-black text-burgundy mb-4 flex items-center gap-2">
                                <PenTool size={20} />
                                Signature Required
                            </h4>

                            {/* Signature Method Toggle */}
                            <div className="flex gap-2 mb-4">
                                <button
                                    onClick={() => setSignatureMethod('typed')}
                                    className={`flex-1 px-4 py-3 rounded-xl font-bold text-sm transition-all ${
                                        signatureMethod === 'typed'
                                            ? 'bg-burgundy text-gold'
                                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                                >
                                    Type Name
                                </button>
                                <button
                                    onClick={() => setSignatureMethod('drawn')}
                                    className={`flex-1 px-4 py-3 rounded-xl font-bold text-sm transition-all ${
                                        signatureMethod === 'drawn'
                                            ? 'bg-burgundy text-gold'
                                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                                >
                                    Draw Signature
                                </button>
                            </div>

                            {signatureMethod === 'typed' ? (
                                <div>
                                    <label className="block text-sm font-black text-burgundy uppercase tracking-widest mb-2">
                                        Type Your Full Name
                                    </label>
                                    <input
                                        type="text"
                                        value={signatureName}
                                        onChange={(e) => setSignatureName(e.target.value)}
                                        placeholder="John Doe"
                                        className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-burgundy focus:ring-2 focus:ring-burgundy/20 font-serif text-2xl italic"
                                    />
                                    {signatureName && (
                                        <div className="mt-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
                                            <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Preview:</p>
                                            <p className="font-serif text-3xl italic text-burgundy">{signatureName}</p>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div>
                                    <label className="block text-sm font-black text-burgundy uppercase tracking-widest mb-2">
                                        Draw Your Signature
                                    </label>
                                    <div className="border-2 border-gray-200 rounded-xl overflow-hidden bg-white">
                                        <canvas
                                            ref={canvasRef}
                                            width={600}
                                            height={200}
                                            onMouseDown={startDrawing}
                                            onMouseMove={draw}
                                            onMouseUp={stopDrawing}
                                            onMouseLeave={stopDrawing}
                                            onTouchStart={startDrawing}
                                            onTouchMove={draw}
                                            onTouchEnd={stopDrawing}
                                            className="w-full cursor-crosshair touch-none"
                                            style={{ touchAction: 'none' }}
                                        />
                                    </div>
                                    <button
                                        onClick={clearSignature}
                                        className="mt-2 px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm font-bold hover:bg-gray-200 transition-colors"
                                    >
                                        Clear Signature
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-8 py-6 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between">
                    <div className="text-xs text-gray-500">
                        {isAdultSelfSign ? (
                            <>
                                <p className="font-bold">Signing for: <span className="text-burgundy">{childName || 'Yourself'}</span></p>
                                <p className="text-[10px] mt-0.5">Adult self-sign</p>
                            </>
                        ) : (
                            <>
                                <p className="font-bold">Parent/Guardian: <span className="text-burgundy">You</span></p>
                                <p>Child: <span className="font-bold text-burgundy">{childName}</span></p>
                            </>
                        )}
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="px-6 py-3 bg-gray-200 text-gray-700 rounded-xl font-black text-sm uppercase tracking-widest hover:bg-gray-300 transition-all"
                        >
                            Cancel Check-In
                        </button>
                        <button
                            onClick={handleSubmitConsent}
                            disabled={!agreedToTerms || isSubmitting}
                            className="px-8 py-3 bg-burgundy text-gold rounded-xl font-black text-sm uppercase tracking-widest hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center gap-2"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="animate-spin" size={16} />
                                    Submitting...
                                </>
                            ) : isLastForm ? (
                                <>
                                    <CheckCircle2 size={16} />
                                    Complete & Check In
                                </>
                            ) : (
                                <>
                                    Next Form ({currentFormIndex + 2}/{missingConsents.length})
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ConsentModal;
