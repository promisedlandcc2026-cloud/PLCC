import React, { useState, useEffect } from 'react';
import {
   Target, TrendingUp, Sparkles, LifeBuoy, MoreVertical,
   ChevronRight, ArrowRight, ShieldCheck, DollarSign, PieChart,
   Layout, BarChart, Loader2
} from 'lucide-react';
import ResponsivePage from '../../components/Layout/ResponsivePage';
import { formatCurrency } from '../../utils/formatters';
import { useNav } from '../../App';
import { apiFetch } from '../../lib/api';

interface Budget {
   id: string;
   name: string;
   amount_limit: number;
   spent: number; // calculated from API
   fund: { name: string };
   fiscal_year: number;
}

const BudgetManagerPage: React.FC = () => {
   const { userId } = useNav();
   const [budgets, setBudgets] = useState<Budget[]>([]);
   const [loading, setLoading] = useState(true);

   useEffect(() => {
      fetchBudgets();
   }, []);

   const fetchBudgets = async () => {
      try {
         const data = await apiFetch('/api/vault?resource=finance&subResource=budgets', { userId });
         if (data.ok) {
            setBudgets(data.budgets);
         }
      } catch (err) {
         console.error(err);
      } finally {
         setLoading(false);
      }
   };

   // Helper to determine color based on utilization
   const getProgressColor = (percent: number) => {
      if (percent > 90) return 'bg-red-500 shadow-red-200';
      if (percent > 75) return 'bg-orange-400 shadow-orange-100';
      return 'bg-green-500 shadow-green-100'; // Default safe
   };

   return (
      <ResponsivePage>
         <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
               <div className="flex items-center gap-2 mb-2">
                  <Target size={14} className="text-gold" />
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Financial Strategy</span>
               </div>
               <h1 className="text-3xl md:text-4xl font-extrabold text-[#0d1a14] mb-1 tracking-tight">Budget Manager</h1>
               <p className="text-gray-400 font-medium text-sm">Assign annual targets and monitor real-time utilization across ministry channels.</p>
            </div>
            <button className="px-8 py-4 bg-burgundy text-gold font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl shadow-burgundy/20 hover:bg-burgundy-dark transition-all active:scale-95 border-b-4 border-gold/30">
               Commission New Budget
            </button>
         </div>

         {loading ? (
            <div className="flex justify-center p-20"><Loader2 className="animate-spin text-gold" size={40} /></div>
         ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
               {budgets.map((b) => {
                  const percent = Math.min(100, Math.round((b.spent / b.amount_limit) * 100)) || 0;
                  return (
                     <div key={b.id} className="bg-white p-8 md:p-10 rounded-[2.5rem] border border-gray-50 shadow-sm group hover:shadow-xl transition-all border-l-8 border-l-transparent hover:border-l-gold">
                        <div className="flex items-center justify-between mb-8">
                           <div>
                              <h3 className="text-xl font-black text-[#0d1a14] tracking-tight">{b.name}</h3>
                              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">FY {b.fiscal_year}</p>
                           </div>
                           <button className="p-2 text-gray-200 hover:text-burgundy transition-all"><MoreVertical size={20} /></button>
                        </div>

                        <div className="space-y-6">
                           <div className="flex items-end justify-between">
                              <div>
                                 <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Utilization</p>
                                 <p className="text-2xl font-black text-burgundy">{percent}%</p>
                              </div>
                              <div className="text-right">
                                 <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Cap</p>
                                 <p className="text-sm font-black text-[#0d1a14]">{formatCurrency(b.amount_limit)}</p>
                              </div>
                           </div>

                           <div className="h-3 w-full bg-gray-50 rounded-full overflow-hidden shadow-inner border border-gray-100">
                              <div className={`h-full ${getProgressColor(percent)} transition-all duration-1000 group-hover:opacity-100 opacity-80 shadow-lg`} style={{ width: `${percent}%` }} />
                           </div>

                           <div className="flex items-center justify-between pt-4 border-t border-gray-50">
                              <div className="flex items-center gap-2">
                                 <DollarSign size={14} className="text-gold" />
                                 <span className="text-xs font-bold text-gray-500">{formatCurrency(b.spent)} Expended</span>
                              </div>
                           </div>
                        </div>
                     </div>
                  );
               })}
            </div>
         )}

         <div className="bg-gold-cream/40 p-10 rounded-[3rem] border border-gold/10 flex items-center gap-10 group mt-4">
            <div className="w-20 h-20 rounded-[2rem] bg-white flex items-center justify-center text-gold shadow-lg shrink-0 border border-gold/10 group-hover:scale-110 transition-transform">
               <PieChart size={40} />
            </div>
            <div className="flex-1">
               <h4 className="text-xl font-black text-[#0d1a14] tracking-tight">AI Forecasting</h4>
               <p className="text-sm text-gray-400 font-medium leading-relaxed mt-1">
                  Based on historical trends, <span className="font-bold text-burgundy">Missions & Outreach</span> is likely to exceed budget by $5k in Q4. Ask <button className="text-burgundy font-bold hover:underline">PLCC AI</button> to simulate a re-allocation strategy.
               </p>
            </div>
         </div>
      </ResponsivePage>
   );
};

export default BudgetManagerPage;