
import React, { useState } from 'react';
import { ShieldCheck, AlertCircle, CheckCircle2, X, AlertTriangle, Loader2 } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';

interface ReconcileConfirmModalProps {
  batchName: string;
  actualTotal: number;
  expectedTotal: number;
  onConfirm: (notes?: string) => void;
  onCancel: () => void;
}

const ReconcileConfirmModal: React.FC<ReconcileConfirmModalProps> = ({ 
  batchName, actualTotal, expectedTotal, onConfirm, onCancel 
}) => {
  const [confirmedActual, setConfirmedActual] = useState(false);
  const [confirmedVariance, setConfirmedVariance] = useState(false);
  const [reviewNotes, setReviewNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const variance = Math.abs(expectedTotal - actualTotal);
  const variancePercent = expectedTotal > 0 ? (variance / expectedTotal) * 100 : 0;

  const isWarning = variance > 50 || variancePercent > 2;
  const isHigh = variance > 200 || variancePercent > 5;

  const isValid = confirmedActual && confirmedVariance && (!isHigh || reviewNotes.trim().length >= 10);

  const handleFinalSubmit = async () => {
    if (!isValid) return;
    setIsSubmitting(true);
    // Mimic API delay
    await new Promise(r => setTimeout(r, 1000));
    onConfirm(isHigh ? reviewNotes : undefined);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center bg-burgundy/60 backdrop-blur-md animate-in fade-in duration-300 px-0 md:px-4">
      <div className="bg-white rounded-t-[2.5rem] md:rounded-[2.5rem] w-full max-w-lg shadow-2xl overflow-hidden animate-in slide-in-from-bottom-8 duration-500 border border-gold/20 max-h-[90vh] flex flex-col">
        
        <div className="p-6 md:p-8 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
             <ShieldCheck size={24} className="text-gold" />
             <h3 className="text-xl font-black text-[#0d1a14] uppercase tracking-tight">Authorize Settlement</h3>
          </div>
          <button onClick={onCancel} className="p-2 text-gray-300 hover:text-red-500 min-h-[44px] min-w-[44px]">
             <X size={24} />
          </button>
        </div>

        <div className="p-6 md:p-10 space-y-8 overflow-y-auto flex-1 custom-scrollbar">
          <div className="text-center">
             <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest mb-1">Final Verification</p>
             <h4 className="text-lg font-bold text-gray-500">{batchName}</h4>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 p-6 rounded-[1.75rem] border border-gray-100">
              <p className="text-[10px] font-black text-gray-400 uppercase mb-2">Computed Actual</p>
              <p className="text-xl font-black text-burgundy">{formatCurrency(actualTotal)}</p>
            </div>
            <div className={`p-6 rounded-[1.75rem] border ${variance === 0 ? 'bg-green-50 border-green-100' : 'bg-orange-50 border-orange-100'}`}>
              <p className="text-[10px] font-black text-gray-400 uppercase mb-2">Net Variance</p>
              <p className={`text-xl font-black ${variance === 0 ? 'text-green-600' : 'text-orange-600'}`}>
                {formatCurrency(variance)}
              </p>
            </div>
          </div>

          {isWarning && (
            <div className={`p-6 rounded-[2rem] border flex items-start gap-4 ${isHigh ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
              {isHigh ? <AlertCircle className="text-red-500 shrink-0" size={24} /> : <AlertTriangle className="text-amber-500 shrink-0" size={24} />}
              <div>
                <h5 className={`text-sm font-black uppercase tracking-tight ${isHigh ? 'text-red-700' : 'text-amber-700'}`}>
                  {isHigh ? 'High Variance Detected' : 'Variance Warning'}
                </h5>
                <p className={`text-xs font-medium mt-1 leading-relaxed ${isHigh ? 'text-red-600' : 'text-amber-600'}`}>
                  Current variance is {variancePercent.toFixed(2)}%. This session requires manual reconciliation notes before deposit authorization.
                </p>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <label className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl cursor-pointer group hover:bg-gold-cream/30 transition-colors min-h-[56px]">
              <input 
                type="checkbox" 
                checked={confirmedActual} 
                onChange={(e) => setConfirmedActual(e.target.checked)}
                className="w-6 h-6 rounded-lg text-burgundy border-gray-300 focus:ring-burgundy" 
              />
              <span className="text-xs font-bold text-gray-600">Confirm computed actual of {formatCurrency(actualTotal)} is correct.</span>
            </label>

            <label className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl cursor-pointer group hover:bg-gold-cream/30 transition-colors min-h-[56px]">
              <input 
                type="checkbox" 
                checked={confirmedVariance} 
                onChange={(e) => setConfirmedVariance(e.target.checked)}
                className="w-6 h-6 rounded-lg text-burgundy border-gray-300 focus:ring-burgundy" 
              />
              <span className="text-xs font-bold text-gray-600">Acknowledge variance of {formatCurrency(variance)}.</span>
            </label>

            {isHigh && (
              <div className="space-y-3 animate-in fade-in slide-in-from-top-4 duration-300">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Manual Review Notes (Min. 10 chars)</label>
                <textarea 
                  rows={3}
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="Explain the source of this discrepancy..."
                  className="w-full p-5 rounded-[1.5rem] bg-gray-50 border border-transparent focus:bg-white focus:border-red-300 focus:ring-8 focus:ring-red-50 outline-none text-sm font-medium text-gray-700 resize-none transition-all shadow-inner"
                />
              </div>
            )}
          </div>
        </div>

        <div className="p-6 md:p-8 bg-gray-50 border-t border-gray-100 flex flex-col sm:flex-row gap-3 shrink-0">
          <button 
            onClick={onCancel}
            className="flex-1 py-4 text-gray-400 font-black text-xs uppercase tracking-widest hover:text-burgundy min-h-[44px]"
          >
            Go Back
          </button>
          <button 
            disabled={!isValid || isSubmitting}
            onClick={handleFinalSubmit}
            className={`flex-[2] py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all active:scale-95 shadow-xl flex items-center justify-center gap-3 min-h-[44px] ${
              isValid ? 'bg-burgundy text-gold shadow-burgundy/20 border-b-4 border-gold/40' : 'bg-gray-200 text-gray-400 cursor-not-allowed border-none'
            }`}
          >
            {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
            Authorize Deposit
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReconcileConfirmModal;
