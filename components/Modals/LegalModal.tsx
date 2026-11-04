
import React, { useState } from 'react';
import { X, Shield, FileText, Download, CheckCircle2 } from 'lucide-react';

interface LegalModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialTab?: 'privacy' | 'terms';
}

const LegalModal: React.FC<LegalModalProps> = ({ isOpen, onClose, initialTab = 'privacy' }) => {
    const [activeTab, setActiveTab] = useState<'privacy' | 'terms'>(initialTab);

    // Update active tab when modal opens with a specific intent
    React.useEffect(() => {
        if (isOpen) {
            setActiveTab(initialTab);
        }
    }, [initialTab, isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-in fade-in duration-300">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal Content */}
            <div className="relative w-full max-w-4xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-300 border border-white/20">

                {/* Header */}
                <div className="bg-burgundy text-white p-8 relative overflow-hidden shrink-0">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-gold/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>

                    <div className="relative z-10 flex justify-between items-start">
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <div className="h-1 w-8 bg-gold rounded-full" />
                                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/60">Legal Center</span>
                            </div>
                            <h2 className="text-3xl font-black uppercase tracking-tight font-serif">
                                Terms & <span className="text-gold">Privacy</span>
                            </h2>
                            <p className="text-white/60 text-sm mt-2 max-w-md font-light">
                                Transparency and trust are the pillars of our community. Please review our policies below.
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all hover:rotate-90"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    {/* Tabs */}
                    <div className="flex gap-4 mt-8 relative z-10">
                        <button
                            onClick={() => setActiveTab('privacy')}
                            className={`flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'privacy'
                                ? 'bg-white text-burgundy shadow-lg scale-105'
                                : 'bg-black/20 text-white/70 hover:bg-black/30'
                                }`}
                        >
                            <Shield size={14} />
                            Privacy Policy
                        </button>
                        <button
                            onClick={() => setActiveTab('terms')}
                            className={`flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'terms'
                                ? 'bg-white text-burgundy shadow-lg scale-105'
                                : 'bg-black/20 text-white/70 hover:bg-black/30'
                                }`}
                        >
                            <FileText size={14} />
                            Terms of Service
                        </button>
                    </div>
                </div>

                {/* Body (Scrollable) */}
                <div className="flex-1 overflow-y-auto p-8 md:p-12 bg-gray-50/50">
                    <div className="prose prose-slate max-w-none prose-headings:font-serif prose-headings:text-burgundy prose-a:text-gold prose-strong:text-burgundy">
                        {activeTab === 'privacy' ? (
                            <div className="animate-in slide-in-from-right-4 fade-in duration-500">
                                <h3 className="flex items-center gap-3 text-2xl font-bold border-b border-gray-200 pb-4 mb-6">
                                    <Shield className="text-gold" />
                                    Privacy Policy
                                </h3>
                                <p className="lead">Last Updated: February 2026</p>

                                <h4>1. Initial Provisions</h4>
                                <p>Promised Land Christian Center ("PLCC", "we", "us") is committed to protecting your privacy. This policy outlines how we collect, use, and safeguard your personal information within the Vault system.</p>

                                <h4>2. Data Collection</h4>
                                <ul>
                                    <li><strong>Personal Information:</strong> Name, contact details, and role information collected during registration.</li>
                                    <li><strong>Usage Data:</strong> System logs, feature usage, and interaction metrics to improve system performance.</li>
                                    <li><strong>Community Content:</strong> Posts, comments, and images you voluntarily share in community sections.</li>
                                </ul>

                                <h4>3. How We Use Your Data</h4>
                                <p>Your data is used strictly for:</p>
                                <ul>
                                    <li>Managing church operations and member directories.</li>
                                    <li>Facilitating community interactions and event registrations.</li>
                                    <li>Checking in children for security purposes (Guardian Hub).</li>
                                </ul>

                                <div className="bg-gold/10 p-6 rounded-2xl border border-gold/20 my-8">
                                    <h5 className="text-burgundy m-0 mb-2 font-bold flex items-center gap-2">
                                        <CheckCircle2 size={16} /> Data Security Commitment
                                    </h5>
                                    <p className="text-sm m-0 text-slate-600">
                                        We utilize industry-standard encryption and role-based access control (RBAC) to ensure your data is accessible only to authorized personnel. We do <strong>not</strong> sell your data to third parties.
                                    </p>
                                </div>

                                <h4>4. Your Rights</h4>
                                <p>You have the right to request access to, correction of, or deletion of your personal data stored in the Vault. Please contact the administration team for such requests.</p>
                            </div>
                        ) : (
                            <div className="animate-in slide-in-from-right-4 fade-in duration-500">
                                <h3 className="flex items-center gap-3 text-2xl font-bold border-b border-gray-200 pb-4 mb-6">
                                    <FileText className="text-gold" />
                                    Terms of Service
                                </h3>
                                <p className="lead">Effective Date: February 2026</p>

                                <h4>1. Acceptance of Terms</h4>
                                <p>By accessing or using the PLCC Vault (the "Service"), you agree to be bound by these Terms. If you disagree with any part of the terms, you may not access the Service.</p>

                                <h4>2. User Responsibilities</h4>
                                <p>As a user of the Vault, you agree to:</p>
                                <ul>
                                    <li>Maintain the confidentiality of your login credentials.</li>
                                    <li>Use the system only for authorized church-related activities.</li>
                                    <li>Respect the privacy of other members' data accessible to you.</li>
                                    <li>Post content that aligns with our community standards and values.</li>
                                </ul>

                                <h4>3. Prohibited Conduct</h4>
                                <p>You may not use the Service to:</p>
                                <ul>
                                    <li>Harass, abuse, or harm another person.</li>
                                    <li>Upload or transmit viruses or malicious code.</li>
                                    <li>Attempt to gain unauthorized access to restricted areas of the system.</li>
                                </ul>

                                <h4>4. Intellectual Property</h4>
                                <p>The Service and its original content (excluding content provided by users), features, and functionality are and will remain the exclusive property of Promised Land Christian Center.</p>

                                <h4>5. Termination</h4>
                                <p>We may terminate or suspend access to our Service immediately, without prior notice or liability, for any reason whatsoever, including without limitation if you breach the Terms.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 bg-white border-t border-gray-100 flex justify-between items-center shrink-0">
                    <button className="text-xs font-bold text-gray-400 uppercase tracking-widest hover:text-burgundy transition-colors flex items-center gap-2">
                        <Download size={14} /> Download PDF
                    </button>
                    <button
                        onClick={onClose}
                        className="px-8 py-3 bg-burgundy text-white rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-[#0d1a14] shadow-lg hover:shadow-xl transition-all active:scale-95"
                    >
                        I Understand
                    </button>
                </div>
            </div>
        </div>
    );
};

export default LegalModal;
