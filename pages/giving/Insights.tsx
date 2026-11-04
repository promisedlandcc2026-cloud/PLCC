import React, { useState, useEffect } from 'react';
import {
  TrendingUp, DollarSign, Users, Calendar,
  Sparkles, LifeBuoy, PieChart as PieIcon,
  BarChart as BarIcon, Loader2, Home, Landmark
} from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';

import { authedFetch } from '../../lib/authedFetch';
const GivingInsightsPage: React.FC = () => {
  const [period, setPeriod] = useState('30d');
  const [insights, setInsights] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => { fetchInsights(); }, [period]);

  const fetchInsights = async () => {
    setIsLoading(true);
    try {
      const res = await authedFetch(`/api/vault?resource=giving&subResource=insights&period=${period}`);
      const data = await res.json();
      if (data.ok) setInsights(data);
    } catch (err) {
      console.error('Failed to fetch insights:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const stats = insights?.stats || { totalAmount: 0, donors: 0, avgGift: 0, recurringVolume: 0 };
  const fundAlloc = insights?.fundAllocation || {};
  const recentGivers: any[] = insights?.recentGivers || [];
  const maxTrend = Math.max(...Object.values(insights?.trends || { x: 1 }).map(Number), 1);

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-[#0d1a14] mb-1 tracking-tight">Giving Insights</h1>
          <p className="text-gray-400 font-medium text-sm">Live giving data from all sources — Vault entries and home page giving.</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="bg-white border border-gray-100 px-4 py-2.5 rounded-xl text-sm font-bold text-burgundy outline-none shadow-sm cursor-pointer"
          >
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
            <option value="year">This Year</option>
            <option value="all">All Time</option>
          </select>
          {isLoading && <Loader2 className="animate-spin text-burgundy" size={18} />}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatItem label="Total Contributions" value={formatCurrency(stats.totalAmount)} icon={<DollarSign size={22} />} color="bg-burgundy text-gold" />
        <StatItem label="Unique Givers" value={stats.donors.toString()} icon={<Users size={22} />} color="bg-gold text-white" />
        <StatItem label="Average Gift" value={formatCurrency(stats.avgGift)} icon={<TrendingUp size={22} />} color="bg-gold-cream text-burgundy" />
        <StatItem label="Recurring Pledges" value={formatCurrency(stats.recurringVolume)} icon={<Calendar size={22} />} color="bg-burgundy text-gold" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-[2rem] border border-gray-50 shadow-sm flex flex-col min-h-[300px]">
          <h3 className="text-base font-black text-[#0d1a14] flex items-center gap-2 mb-6">
            <BarIcon size={18} className="text-gold" /> Daily Giving Trends
          </h3>
          <div className="flex-1 space-y-3">
            {Object.entries(insights?.trends || {}).slice(0, 10).map(([date, amount]: any) => (
              <div key={date} className="flex items-center gap-3">
                <span className="text-[10px] font-bold text-gray-400 uppercase w-24 shrink-0">{new Date(date).toLocaleDateString()}</span>
                <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-burgundy/40 rounded-full" style={{ width: `${Math.min((Number(amount) / maxTrend) * 100, 100)}%` }} />
                </div>
                <span className="font-black text-burgundy text-xs w-20 text-right">{formatCurrency(amount)}</span>
              </div>
            ))}
            {Object.keys(insights?.trends || {}).length === 0 && (
              <div className="flex-1 flex items-center justify-center border-2 border-dashed border-gray-100 rounded-2xl h-40">
                <p className="text-gray-400 font-bold text-xs uppercase tracking-widest">No trend data</p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-[2rem] border border-gray-50 shadow-sm flex flex-col min-h-[300px]">
          <h3 className="text-base font-black text-[#0d1a14] flex items-center gap-2 mb-6">
            <PieIcon size={18} className="text-gold" /> Fund Breakdown
          </h3>
          <div className="flex-1 space-y-4">
            {Object.entries(fundAlloc).map(([name, amount]: any) => (
              <div key={name} className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-[#0d1a14] truncate">{name}</p>
                  <div className="h-1.5 w-full bg-gray-100 rounded-full mt-1 overflow-hidden">
                    <div className="h-full bg-gold rounded-full" style={{ width: `${Math.min((Number(amount) / Number(stats.totalAmount || 1)) * 100, 100)}%` }} />
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-black text-burgundy">{formatCurrency(amount)}</p>
                  <p className="text-[10px] text-gray-400 font-bold">{Math.round((Number(amount) / Number(stats.totalAmount || 1)) * 100)}%</p>
                </div>
              </div>
            ))}
            {Object.keys(fundAlloc).length === 0 && (
              <div className="flex-1 flex items-center justify-center border-2 border-dashed border-gray-100 rounded-2xl h-40">
                <p className="text-gray-400 font-bold text-xs uppercase tracking-widest">No fund data</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Givers */}
      <div className="bg-white rounded-[2rem] border border-gray-50 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-50 flex items-center justify-between">
          <h3 className="text-base font-black text-[#0d1a14] flex items-center gap-2">
            <Users size={18} className="text-gold" /> Recent Givers
          </h3>
          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest bg-gray-50 px-3 py-1.5 rounded-lg">
            {recentGivers.length} records
          </span>
        </div>
        {recentGivers.length === 0 ? (
          <div className="p-12 text-center">
            <Users size={32} className="mx-auto text-gray-200 mb-3" />
            <p className="text-xs font-black text-gray-400 uppercase tracking-widest">No giving records yet</p>
            <p className="text-xs text-gray-400 font-medium mt-1">Records appear here once someone gives via the home page or Vault.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50/50">
                  <th className="px-6 py-4 text-[9px] font-black text-gray-400 uppercase tracking-widest">Giver</th>
                  <th className="px-6 py-4 text-[9px] font-black text-gray-400 uppercase tracking-widest">Amount</th>
                  <th className="px-6 py-4 text-[9px] font-black text-gray-400 uppercase tracking-widest">Fund</th>
                  <th className="px-6 py-4 text-[9px] font-black text-gray-400 uppercase tracking-widest">Date</th>
                  <th className="px-6 py-4 text-[9px] font-black text-gray-400 uppercase tracking-widest">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {recentGivers.map((g, i) => (
                  <tr key={i} className="hover:bg-gold-cream/5 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {g.avatar ? (
                          <img src={g.avatar} className="w-8 h-8 rounded-xl object-cover" alt="" />
                        ) : (
                          <div className="w-8 h-8 rounded-xl bg-burgundy text-gold flex items-center justify-center font-black text-xs shrink-0">
                            {(g.name || 'A').charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-black text-[#0d1a14]">{g.name}</p>
                          {g.email && <p className="text-[10px] text-gray-400">{g.email}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4"><span className="text-sm font-black text-burgundy">{formatCurrency(g.amount)}</span></td>
                    <td className="px-6 py-4"><span className="text-xs font-bold text-gray-600 bg-gray-50 px-2 py-1 rounded-lg">{g.fund}</span></td>
                    <td className="px-6 py-4"><span className="text-xs font-bold text-gray-400">{g.date}</span></td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border ${g.source === 'Home Page' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-burgundy/5 text-burgundy border-burgundy/10'}`}>
                        {g.source === 'Home Page' ? <Home size={9} /> : <Landmark size={9} />}
                        {g.source}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex flex-col md:flex-row items-center justify-center gap-8 pt-4 border-t border-gray-50">
        <div className="flex items-center gap-3 text-sm text-gray-400">
          <Sparkles size={16} className="text-gold" />
          <span>Need help? <button className="text-burgundy hover:underline font-bold">Ask PLCC AI</button></span>
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-400">
          <LifeBuoy size={16} className="text-burgundy" />
          <span>Missing data? <button className="text-burgundy hover:underline font-bold">Contact Support</button></span>
        </div>
      </div>
    </div>
  );
};

const StatItem = ({ label, value, icon, color }: any) => (
  <div className="bg-white p-5 rounded-2xl border border-gray-50 shadow-sm group hover:shadow-md transition-all">
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-inner mb-4 group-hover:scale-110 transition-transform ${color}`}>
      {icon}
    </div>
    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-1">{label}</p>
    <h4 className="text-xl font-black text-[#0d1a14]">{value}</h4>
  </div>
);

export default GivingInsightsPage;
