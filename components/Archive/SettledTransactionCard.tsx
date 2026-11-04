
import React from 'react';
import { Calendar, Hash, Layers, DollarSign, Download, ArrowRight } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';

interface SettledTransactionCardProps {
  batch: {
    id: string;
    name: string;
    date: string;
    depositId: string;
    total: number;
  }
}

const SettledTransactionCard: React.FC<SettledTransactionCardProps> = ({ batch }) => {
  return (
    <div className="p-6 bg-white rounded-[2rem] border border-gray-100 shadow-sm flex flex-col gap-6 active:bg-gold-cream/5 transition-colors group">
      <div className="flex justify-between items-start">
        <div className="space-y-1">
          <p className="text-[10px] font-black text-gold uppercase tracking-[0.2em] flex items-center gap-1.5">
            <Calendar size={10} />
            {batch.date}
          </p>
          <h4 className="text-lg font-black text-[#0d1a14] tracking-tight group-hover:text-burgundy transition-colors">{batch.name}</h4>
          <div className="flex items-center gap-2 mt-1">
             <Hash size={10} className="text-gray-300" />
             <p className="text-[11px] font-mono text-gray-400 bg-gray-50 px-2 py-0.5 rounded border border-gray-100">{batch.depositId}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xl font-black text-burgundy">{formatCurrency(batch.total)}</p>
          <span className="inline-flex px-2 py-0.5 rounded-full bg-green-50 text-green-600 text-[8px] font-black uppercase tracking-widest border border-green-100">Settled</span>
        </div>
      </div>

      <div className="flex gap-2">
        <button className="flex-1 py-3.5 bg-gray-50 rounded-xl text-[10px] font-black text-[#0d1a14] uppercase tracking-widest border border-transparent active:border-gold/20 flex items-center justify-center gap-2 min-h-[44px]">
          <Layers size={14} className="text-gold" />
          View Ledger
        </button>
        <button className="p-3.5 bg-burgundy/5 text-burgundy rounded-xl border border-burgundy/10 active:scale-90 min-h-[44px] min-w-[44px] flex items-center justify-center">
          <Download size={18} />
        </button>
      </div>
    </div>
  );
};

export default SettledTransactionCard;
