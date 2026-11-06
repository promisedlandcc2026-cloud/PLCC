import React, { useState, useEffect } from 'react';
import { X, Sparkles, ArrowRight, ShieldCheck } from 'lucide-react';

interface InAppWelcomeModalProps {
    id: string; // Unique ID for session storage
    title: string;
    description?: string;
}

const InAppWelcomeModal: React.FC<InAppWelcomeModalProps> = ({ id, title, description }) => {
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        const hasSeen = sessionStorage.getItem(`awc_welcome_${id}`);
        if (!hasSeen) {
            setIsOpen(true);
        }
    }, [id]);

    const handleClose = () => {
        setIsOpen(false);
        sessionStorage.setItem(`awc_welcome_${id}`, 'true');
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#0d1a14]/40 backdrop-blur-md animate-in fade-in duration-500">
            <div className="relative w-full max-w-lg bg-white rounded-[3rem] shadow-2xl border-4 border-white overflow-hidden animate-in zoom-in-95 duration-500">
                {/* Branding Strip */}
                <div className="h-2 bg-gradient-to-r from-burgundy via-gold to-burgundy" />

                <div className="p-10 text-center">
                    <button
                        onClick={handleClose}
                        className="absolute top-6 right-6 p-2 text-gray-300 hover:text-burgundy transition-colors"
                    >
                        <X size={24} />
                    </button>

                    <div className="w-20 h-20 bg-burgundy/5 rounded-[2rem] flex items-center justify-center mx-auto mb-8 text-burgundy border border-burgundy/10 shadow-inner">
                        <Sparkles size={40} className="text-gold" />
                    </div>

                    <div className="space-y-4 mb-10">
                        <h2 className="text-3xl font-black text-[#0d1a14] leading-tight tracking-tighter">
                            {title}
                        </h2>
                        <p className="text-gray-400 font-medium leading-relaxed">
                            {description || "Authorized Personnel Only. Your administrative session is now synchronized with the PLCC ONE."}
                        </p>
                    </div>

                    <div className="flex flex-col gap-4">
                        <button
                            onClick={handleClose}
                            className="w-full py-5 bg-burgundy text-gold font-black text-sm uppercase tracking-widest rounded-2xl shadow-xl shadow-burgundy/20 hover:bg-burgundy-dark transition-all active:scale-95 border-b-4 border-gold/30 flex items-center justify-center gap-2 group"
                        >
                            <ShieldCheck size={18} />
                            Proceed to Module
                            <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                        </button>
                    </div>

                    <div className="mt-8 pt-8 border-t border-gray-50">
                        <p className="text-[10px] font-black text-gray-300 uppercase tracking-[0.3em]">
                            Grace & Authority • PLCC Administrative Protocol
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default InAppWelcomeModal;
