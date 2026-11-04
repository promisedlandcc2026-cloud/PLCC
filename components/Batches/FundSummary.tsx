
import React, { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, Layers } from 'lucide-react';
import { buildFundSummary, Transaction } from '../../utils/fundSummary';
import { formatCurrency } from '../../utils/formatters';

interface FundSummaryProps {
  transactions: Transaction[];
}

const FundSummary: React.FC<FundSummaryProps> = ({ transactions }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const stats = useMemo(() => buildFundSummary(transactions), [transactions]);

  if (stats.totalCount === 0) return null;

  return (
    <div className="bg-gray-50/50 p-4 md:p-6 rounded-[1.5rem] border border-gray-100 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers size={14} className="text-gold" />
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Fund Distribution</p>
        </div>
        {stats.uniqueFunds > 3 && (
          <button 
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-[10px] font-black text-burgundy uppercase hover:underline flex items-center gap-1 min-h-[32px]"
          >
            {isExpanded ? 'Show Less' : `Show all (${stats.uniqueFunds})`}
            {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        )}
      </div>

      <div className="space-y-2">
        {(isExpanded ? stats.allSorted : stats.top3).map((f, i) => (
          <div key={i} className="flex items-center justify-between text-[11px] md:text-xs py-1 group">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-gold/40 group-hover:bg-gold transition-colors" />
              <span className="font-bold text-gray-500">{f.name}</span>
              <span className="text-[9px] text-gray-300 font-bold uppercase">({f.count})</span>
            </div>
            <span className="font-black text-[#0d1a14]">{formatCurrency(f.total)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FundSummary;
