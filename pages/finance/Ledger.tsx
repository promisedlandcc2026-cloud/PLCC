import React, { useState, useEffect, useRef } from 'react';
import {
  Plus, Search, Download, MoreVertical, Sparkles,
  Clock, DollarSign, FileText, ArrowUpRight, TrendingDown, Landmark,
  ShieldCheck, X, Loader2, Calendar, Filter, Trash2
} from 'lucide-react';
import ResponsivePage from '../../components/Layout/ResponsivePage';
import { formatCurrency } from '../../utils/formatters';
import { canPerform } from '../../lib/permissions';
import { useNav } from '../../App';
import { apiFetch } from '../../lib/api';

interface FinanceEntry {
  id: string;
  transaction_date: string;
  description: string;
  amount: number;
  type: 'Inflow' | 'Outflow';
  category: string;
  status: 'Draft' | 'Pending' | 'Finalized';
  reference_id?: string;
  fund?: { name: string };
  fund_id: string;
  created_at: string;
}

interface Fund {
  id: string;
  name: string;
}

const TreasuryLedgerPage: React.FC = () => {
  const { userRole, userId } = useNav();
  const [entries, setEntries] = useState<FinanceEntry[]>([]);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'All' | 'Inflow' | 'Outflow'>('All');
  const [isSaving, setIsSaving] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Form State
  const [newEntry, setNewEntry] = useState<{
    date: string;
    description: string;
    amount: number;
    type: 'Inflow' | 'Outflow';
    category: string;
    fundId: string;
    status: 'Draft' | 'Pending' | 'Finalized';
  }>({
    date: new Date().toISOString().split('T')[0],
    description: '',
    amount: 0,
    type: 'Inflow',
    category: 'Offerings',
    fundId: '',
    status: 'Draft'
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [lData, fData] = await Promise.all([
        apiFetch('/api/vault?resource=finance&subResource=ledger', { userId }),
        apiFetch('/api/vault?resource=finance&subResource=funds', { userId })
      ]);

      if (lData.ok) setEntries(lData.entries);
      if (fData.ok) {
        setFunds(fData.funds);
        // Set default fund
        if (fData.funds.length > 0 && !newEntry.fundId) {
          setNewEntry(prev => ({ ...prev, fundId: fData.funds[0].id }));
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!newEntry.description || !newEntry.amount) return;
    setIsSaving(true);
    try {
      const data = await apiFetch('/api/vault?resource=finance&subResource=ledger', {
        method: 'POST',
        userId,
        body: JSON.stringify(newEntry)
      });
      if (data.ok) {
        setEntries([data.entry, ...entries]); // Optimistic update or refetch
        setIsModalOpen(false);
        setNewEntry({
          date: new Date().toISOString().split('T')[0],
          description: '',
          amount: 0,
          type: 'Inflow',
          category: 'Offerings',
          fundId: funds[0]?.id || '',
          status: 'Draft'
        });
        // Refetch to get joined fund name if needed, or just insert raw
        fetchData();
      } else {
        alert('Failed to save: ' + data.error);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const finalizeEntry = async (id: string) => {
    try {
      await apiFetch('/api/vault?resource=finance&subResource=ledger', {
        method: 'PATCH',
        userId,
        body: JSON.stringify({ id, status: 'Finalized' })
      });
      setEntries(prev => prev.map(e => e.id === id ? { ...e, status: 'Finalized' } : e));
    } catch (err) {
      console.error(err);
    }
  };

  const deleteEntry = async (id: string) => {
    if (!window.confirm('Permanently delete this ledger entry? This cannot be undone.')) return;
    try {
      await apiFetch('/api/vault?resource=finance&subResource=ledger', {
        method: 'DELETE',
        userId,
        body: JSON.stringify({ id })
      });
      setEntries(prev => prev.filter(e => e.id !== id));
      setOpenMenuId(null);
    } catch (err) {
      console.error(err);
    }
  };

  const deleteAll = async () => {
    if (!window.confirm(`Permanently delete ALL ${filteredEntries.length} visible entries? This cannot be undone.`)) return;
    try {
      await Promise.all(filteredEntries.map(e =>
        apiFetch('/api/vault?resource=finance&subResource=ledger', {
          method: 'DELETE',
          userId,
          body: JSON.stringify({ id: e.id })
        })
      ));
      const deletedIds = new Set(filteredEntries.map(e => e.id));
      setEntries(prev => prev.filter(e => !deletedIds.has(e.id)));
    } catch (err) {
      console.error(err);
      alert('Some entries may not have been deleted. Please refresh.');
    }
  };

  const downloadCSV = () => {
    if (filteredEntries.length === 0) return alert("No entries to export.");

    const headers = ['Date', 'Description', 'Type', 'Category', 'Amount', 'Fund', 'Status'];
    const rows = filteredEntries.map(e => [
      e.transaction_date,
      `"${e.description.replace(/"/g, '""')}"`,
      e.type,
      e.category,
      e.amount,
      e.fund?.name || 'General Fund',
      e.status
    ].join(','));

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Finance_Ledger_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredEntries = entries.filter(e => {
    const matchesSearch = e.description.toLowerCase().includes(search.toLowerCase()) || e.id.toLowerCase().includes(search.toLowerCase());
    const matchesType = filterType === 'All' || e.type === filterType;
    return matchesSearch && matchesType;
  });

  // Calculate Stats from real data
  const totalInflows = entries
    .filter(e => e.type === 'Inflow' && e.status === 'Finalized')
    .reduce((sum, e) => sum + Number(e.amount), 0);

  const pendingOutflows = entries
    .filter(e => e.type === 'Outflow' && e.status !== 'Finalized')
    .reduce((sum, e) => sum + Number(e.amount), 0);

  const netAssets = entries
    .filter(e => e.status === 'Finalized')
    .reduce((sum, e) => sum + (e.type === 'Inflow' ? Number(e.amount) : -Number(e.amount)), 0);

  return (
    <ResponsivePage>
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Landmark size={14} className="text-gold" />
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Treasury Protocol</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-[#0d1a14] mb-1 tracking-tight">Main Ledger</h1>
          <p className="text-gray-400 font-medium text-sm">Unified financial record of all ministry inflows and authorized expenditures.</p>
        </div>

        {canPerform(userRole, 'finance.edit') && (
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center justify-center gap-3 px-8 py-4 bg-burgundy text-gold font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl shadow-burgundy/20 hover:bg-burgundy-dark transition-all active:scale-95 border-b-4 border-gold/30"
          >
            <Plus size={18} />
            Create Entry
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatItem label="Net Liquidity" value={formatCurrency(netAssets)} sub="Total Finalized Assets" icon={<DollarSign size={24} />} color="bg-burgundy text-gold" />
        <StatItem label="Total Inflows" value={formatCurrency(totalInflows)} sub="Finalized Inflows" icon={<ArrowUpRight size={24} />} color="bg-green-50 text-green-600" />
        <StatItem label="Pending Outflows" value={formatCurrency(pendingOutflows)} sub="Awaiting Finalization" icon={<Clock size={24} />} color="bg-gold-cream text-gold" />
      </div>

      <div className="bg-white rounded-[2.5rem] border border-gray-50 shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 md:p-8 border-b border-gray-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative group flex-1 w-full md:max-w-xl">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-gold" size={20} />
            <input
              type="text"
              placeholder="Search ledger by description or ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-12 pr-6 py-4 bg-gray-50/50 rounded-2xl outline-none focus:bg-white focus:border-gold/20 transition-all text-sm font-bold text-[#0d1a14]"
            />
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <div className="bg-gray-50 p-1 rounded-xl flex items-center shrink-0">
              {(['All', 'Inflow', 'Outflow'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setFilterType(t)}
                  className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${filterType === t ? 'bg-white text-burgundy shadow-sm' : 'text-gray-400 hover:text-burgundy'}`}
                >
                  {t}
                </button>
              ))}
            </div>
            <button
              onClick={downloadCSV}
              className="p-3 bg-white border border-gray-100 text-gray-400 hover:text-burgundy rounded-xl transition-all shadow-sm"
            >
              <Download size={20} />
            </button>
            {filteredEntries.length > 0 && canPerform(userRole, 'finance.edit') && (
              <button
                onClick={deleteAll}
                className="p-3 bg-white border border-red-100 text-red-400 hover:bg-red-50 hover:text-red-600 rounded-xl transition-all shadow-sm"
                title="Delete all visible entries"
              >
                <Trash2 size={20} />
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-12 text-center text-gray-400">Loading ledger...</div>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gold-cream/10">
                  <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Entry Detail</th>
                  <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Category</th>
                  <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Net Change</th>
                  <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</th>
                  <th className="px-8 py-5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredEntries.map(entry => (
                  <tr key={entry.id} className="group hover:bg-gold-cream/5 transition-colors">
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-inner group-hover:scale-105 transition-transform ${entry.type === 'Inflow' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                          {entry.type === 'Inflow' ? <ArrowUpRight size={18} /> : <TrendingDown size={18} />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[15px] font-black text-[#0d1a14] leading-none mb-1.5 truncate">{entry.description}</p>
                          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest flex items-center gap-2">
                            <Clock size={10} />
                            {entry.transaction_date} • {entry.reference_id || entry.id.slice(0, 8)}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <span className="text-[11px] font-black text-gold uppercase tracking-widest bg-gold-cream border border-gold/10 px-2 py-1 rounded-md">{entry.category || 'General'}</span>
                    </td>
                    <td className="px-8 py-6">
                      <p className={`text-lg font-black ${entry.type === 'Inflow' ? 'text-green-600' : 'text-red-500'}`}>
                        {entry.type === 'Inflow' ? '+' : '-'}{formatCurrency(entry.amount)}
                      </p>
                      <p className="text-[9px] text-gray-300 font-bold uppercase tracking-tighter">{entry.fund?.name || 'General Fund'}</p>
                    </td>
                    <td className="px-8 py-6">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${entry.status === 'Finalized' ? 'bg-burgundy/5 text-burgundy border-burgundy/10' : 'bg-gold-cream text-gold border-gold/20 animate-pulse'
                        }`}>
                        {entry.status}
                      </span>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {entry.status === 'Draft' && canPerform(userRole, 'finance.edit') && (
                          <button
                            onClick={() => finalizeEntry(entry.id)}
                            className="px-4 py-2 bg-burgundy text-gold rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md active:scale-95 transition-all"
                          >
                            Finalize
                          </button>
                        )}
                        <div className="relative" ref={openMenuId === entry.id ? menuRef : null}>
                          <button
                            onClick={() => setOpenMenuId(openMenuId === entry.id ? null : entry.id)}
                            className="p-2 text-gray-300 hover:text-burgundy transition-all rounded-xl hover:bg-gray-50"
                          >
                            <MoreVertical size={18} />
                          </button>
                          {openMenuId === entry.id && (
                            <div className="absolute right-0 top-10 z-50 bg-white border border-gray-100 rounded-2xl shadow-2xl shadow-black/10 overflow-hidden min-w-[160px] animate-in fade-in zoom-in-95 duration-150">
                              <button
                                onClick={() => deleteEntry(entry.id)}
                                className="w-full flex items-center gap-3 px-5 py-4 text-red-500 hover:bg-red-50 text-xs font-black uppercase tracking-widest transition-colors"
                              >
                                <Trash2 size={15} />
                                Delete Entry
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Entry Modal */}
      {
        isModalOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-burgundy/60 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-white rounded-[3rem] w-full max-w-2xl shadow-[0_30px_100px_rgba(0,0,0,0.3)] overflow-hidden animate-in zoom-in-95 duration-400 border border-gold/30">
              <div className="px-10 py-8 border-b border-gray-50 flex items-center justify-between bg-gold-cream/5">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-burgundy text-gold flex items-center justify-center shadow-lg"><FileText size={24} /></div>
                  <div>
                    <h3 className="text-2xl font-black text-[#101814] tracking-tight">Manual Entry</h3>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Authorized Treasury Sequence</p>
                  </div>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="p-3 text-gray-300 hover:text-burgundy transition-all bg-white rounded-2xl shadow-sm active:scale-90">
                  <X size={24} />
                </button>
              </div>

              <div className="p-10 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Session Date</label>
                    <div className="relative group">
                      <Calendar size={18} className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-gold" />
                      <input
                        type="date"
                        value={newEntry.date}
                        onChange={e => setNewEntry({ ...newEntry, date: e.target.value })}
                        className="w-full pl-14 pr-6 py-4 rounded-[1.5rem] bg-gray-50 border border-transparent focus:bg-white focus:border-gold outline-none transition-all font-bold text-[#0d1a14] shadow-inner appearance-none"
                      />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Type</label>
                    <div className="flex p-1 bg-gray-50 rounded-2xl border border-gray-100 shadow-inner">
                      <button
                        onClick={() => setNewEntry({ ...newEntry, type: 'Inflow' })}
                        className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${newEntry.type === 'Inflow' ? 'bg-white text-green-600 shadow-sm' : 'text-gray-400'}`}
                      >
                        Inflow
                      </button>
                      <button
                        onClick={() => setNewEntry({ ...newEntry, type: 'Outflow' })}
                        className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${newEntry.type === 'Outflow' ? 'bg-white text-red-500 shadow-sm' : 'text-gray-400'}`}
                      >
                        Outflow
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Narrative / Description</label>
                  <input
                    type="text"
                    placeholder="e.g. Donation Batch #1024 or Staff Reimbursement"
                    value={newEntry.description}
                    onChange={e => setNewEntry({ ...newEntry, description: e.target.value })}
                    className="w-full px-8 py-5 rounded-[1.5rem] bg-gray-50 border border-transparent focus:bg-white focus:border-gold outline-none transition-all font-bold text-lg text-[#0d1a14] shadow-inner"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Monetary Value (USD)</label>
                    <div className="relative group">
                      <DollarSign size={18} className="absolute left-6 top-1/2 -translate-y-1/2 text-gold group-focus-within:text-burgundy" />
                      <input
                        type="number"
                        step="0.01"
                        value={newEntry.amount || ''}
                        onChange={e => setNewEntry({ ...newEntry, amount: parseFloat(e.target.value) })}
                        placeholder="0.00"
                        className="w-full pl-14 pr-8 py-5 rounded-[1.5rem] bg-gray-50 border border-transparent focus:bg-white focus:border-gold outline-none transition-all font-bold text-2xl text-burgundy shadow-inner"
                      />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Allocated Fund</label>
                    <select
                      value={newEntry.fundId}
                      onChange={e => setNewEntry({ ...newEntry, fundId: e.target.value })}
                      className="w-full px-8 py-5 rounded-[1.5rem] bg-gray-50 border border-transparent focus:bg-white focus:border-gold outline-none transition-all font-bold text-[#0d1a14] shadow-inner appearance-none"
                    >
                      {funds.map(f => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex gap-4 pt-4">
                  <button onClick={() => setIsModalOpen(false)} className="flex-1 py-5 text-gray-400 font-extrabold uppercase text-xs tracking-widest hover:text-burgundy transition-colors">Discard</button>
                  <button
                    onClick={handleSave}
                    disabled={isSaving || !newEntry.description || !newEntry.amount}
                    className="flex-[2] py-5 bg-burgundy text-gold font-black uppercase text-xs tracking-[0.2em] rounded-[1.5rem] shadow-2xl shadow-burgundy/40 border-b-4 border-gold/40 hover:bg-burgundy-dark transition-all active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50"
                  >
                    {isSaving ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
                    Record as Draft
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      }

      <div className="flex flex-col md:flex-row items-center justify-center gap-12 pt-8 border-t border-gray-100">
        <FooterHelp title="Audit Accuracy" sub="System prevents duplicate reference IDs." icon={<ShieldCheck />} color="gold" />
        <FooterHelp title="Finance Logic" sub="Ledger entries map to GL codes automatically." icon={<Sparkles />} color="burgundy" />
      </div>
    </ResponsivePage >
  );
};

const StatItem = ({ label, value, sub, icon, color }: any) => (
  <div className="bg-white p-8 rounded-[2rem] border border-gray-50 shadow-sm flex items-center gap-6 group hover:shadow-md transition-shadow">
    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-inner group-hover:rotate-3 transition-transform ${color}`}>
      {icon}
    </div>
    <div>
      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{label}</p>
      <div className="flex items-baseline gap-2">
        <h4 className="text-2xl font-black text-[#0d1a14] tracking-tight">{value}</h4>
        <span className="text-[8px] font-bold text-gray-300 uppercase truncate max-w-[100px]">{sub}</span>
      </div>
    </div>
  </div>
);

const FooterHelp = ({ title, sub, icon, color }: any) => (
  <div className="flex items-center gap-3">
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${color === 'gold' ? 'bg-gold-cream text-gold border border-gold/10' : 'bg-burgundy/5 text-burgundy border border-burgundy/10'}`}>
      {React.cloneElement(icon, { size: 20 })}
    </div>
    <div className="text-left">
      <h4 className="text-xs font-black text-[#0d1a14] uppercase tracking-tight">{title}</h4>
      <p className="text-[11px] text-gray-400 font-medium">{sub}</p>
    </div>
  </div>
);

export default TreasuryLedgerPage;