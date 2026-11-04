import React from 'react';
import { ShieldAlert, Home, ArrowLeft } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

const AccessDenied: React.FC = () => {
    const navigate = useNavigate();

    return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-700">
            <div className="w-24 h-24 bg-red-50 text-red-600 rounded-[2.5rem] flex items-center justify-center mb-8 shadow-inner border border-red-100 animate-bounce">
                <ShieldAlert size={48} />
            </div>
            <div className="flex flex-col items-center mb-4">
                <span className="text-[10px] font-black text-red-400 uppercase tracking-[0.4em] mb-2">Security Breach Protocol</span>
                <h1 className="text-3xl font-black text-[#0d1a14] tracking-tighter">Access Restricted<span className="text-red-500">.</span></h1>
            </div>
            <p className="text-gray-400 font-medium text-lg max-w-md mb-12 leading-relaxed">
                Your current role does not have authorization to view this secure ministry data. Please contact a Super Admin for elevated credentials.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
                <button
                    onClick={() => navigate(-1)}
                    className="flex items-center justify-center gap-2 px-8 py-4 bg-gray-100 text-gray-600 font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-gray-200 transition-all active:scale-95"
                >
                    <ArrowLeft size={18} />
                    Go Back
                </button>
                <Link
                    to="/dashboard"
                    className="flex items-center justify-center gap-2 px-8 py-4 bg-burgundy text-gold font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl shadow-burgundy/20 hover:bg-burgundy-dark transition-all active:scale-95 border-b-4 border-gold/30"
                >
                    <Home size={18} />
                    Dashboard
                </Link>
            </div>
        </div>
    );
};

export default AccessDenied;
