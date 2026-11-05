import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  Filter,
  Download,
  Sparkles,
  LifeBuoy,
  ArrowRight,
  AlertCircle,
  RefreshCw,
  Undo2,
  Clock,
  ShieldAlert,
  FileSpreadsheet,
  FileText,
  Calendar,
  Layers,
  ArrowUpRight,
  TrendingDown,
  XCircle,
  Settings2,
  ChevronRight,
  ShieldCheck,
  Printer,
  Globe,
  Fingerprint,
  Mail,
  ChevronDown
} from 'lucide-react';
import { useNav } from '../../App';
import { apiFetch } from '../../lib/api';

import { formatCurrency } from '../../utils/formatters';
interface TransactionsPageProps {
  title: string;
}

const TransactionsPage: React.FC<TransactionsPageProps> = ({ title }) => {
  const { userId } = useNav();
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState('Last 30 Days');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<any[]>([]);

  const isFailed = title.toLowerCase().includes('failed');
  const isRefunds = title.toLowerCase().includes('refunds');
  const isDisputes = title.toLowerCase().includes('disputes');
  const isExport = title.toLowerCase().includes('export');

  useEffect(() => {
    const fetchTransactions = async () => {
      setLoading(true);
      try {
        const data = await apiFetch('/api/vault?resource=giving', { userId });
        if (data.ok) {
          // Map backend data to frontend structure
          const mapped = data.transactions.map((tx: any) => ({
            id: tx.id.slice(0, 8).toUpperCase(),
            donor: tx.member ? `${tx.member.first_name} ${tx.member.last_name}` : 'Anonymous',
            amount: Number(tx.amount),
            fund: tx.fund?.name || 'General Fund',
            method: tx.source,
            status: 'Completed',
            date: new Date(tx.transaction_date).toLocaleDateString(),
            fee: Number(tx.amount) * 0.029 + 0.30,
            ip: tx.ip || 'Unknown',
            gateway: tx.source
          }));
          setTransactions(mapped);
        }
      } catch (err) {
        console.error("Failed to fetch transactions:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchTransactions();
  }, [title, userId]);

  const filtered = useMemo(() => {
    return transactions.filter(tx =>
      tx.donor.toLowerCase().includes(search.toLowerCase()) ||
      tx.fund.toLowerCase().includes(search.toLowerCase()) ||
      tx.id.toLowerCase().includes(search.toLowerCase())
    );
  }, [transactions, search]);

  const toggleDetails = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  if (isExport) {
    return <ExportView />;
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-2 h-2 rounded-full ${isFailed ? 'bg-red-500' : isDisputes ? 'bg-orange-500' : 'bg-gold'} animate-pulse`} />
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Ledger: {title.split(' ')[0]}</span>
          </div>
          <h1 className="text-4xl font-extrabold text-[#0d1a14] mb-1 tracking-tight">{title}</h1>
          <p className="text-gray-400 font-medium">Monitoring the spiritual and financial flow of our community.</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="bg-white border border-gray-100 px-5 py-3 rounded-2xl text-xs font-bold text-burgundy shadow-sm outline-none focus:ring-4 focus:ring-burgundy/5"
          >
            <option>Last 24 Hours</option>
            <option>Last 7 Days</option>
            <option>Last 30 Days</option>
            <option>Year to Date</option>
          </select>
          <button className="p-3 bg-burgundy text-gold rounded-2xl shadow-xl shadow-burgundy/20 active:scale-95 transition-all border-b-2 border-gold/40">
            <Download size={20} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {isFailed ? (
          <>
            <StatCard label="Total Failed" value={formatCurrency(0)} sub="0 Transactions" icon={<XCircle className="text-red-500" />} color="bg-red-50" />
            <StatCard label="Recovery Rate" value="0%" sub="Successful Retries" icon={<RefreshCw className="text-burgundy" />} color="bg-burgundy/5" />
            <StatCard label="Critical Issues" value="0" sub="Manual resolution needed" icon={<AlertCircle className="text-red-400" />} color="bg-red-50/50" />
          </>
        ) : isDisputes ? (
          <>
            <StatCard label="Open Disputes" value={formatCurrency(0)} sub="0 Active" icon={<ShieldAlert className="text-orange-500" />} color="bg-orange-50" />
            <StatCard label="Win Rate" value="100%" sub="Last 12 Months" icon={<TrendingDown className="text-green-500 rotate-180" />} color="bg-green-50" />
            <StatCard label="Next Deadline" value="None" sub="Bank response due" icon={<Clock className="text-orange-400" />} color="bg-white" />
          </>
        ) : isRefunds ? (
          <>
            <StatCard label="Refunded Today" value={formatCurrency(0)} sub="0 Actions" icon={<Undo2 className="text-gray-400" />} color="bg-gray-50" />
            <StatCard label="Avg Processing" value="0 Days" sub="Settlement speed" icon={<Clock className="text-gold" />} color="bg-gold-cream/30" />
            <StatCard label="Refund Ratio" value="0%" sub="of gross giving" icon={<ArrowRight className="text-gray-400" />} color="bg-white" />
          </>
        ) : (
          <>
            <StatCard label="Gross Volume" value={formatCurrency(transactions.reduce((acc, curr) => acc + curr.amount, 0))} sub="Successful gifts" icon={<ArrowUpRight className="text-green-500" />} color="bg-green-50" />
            <StatCard label="Total Donors" value={new Set(transactions.map(t => t.donor)).size.toString()} sub="Unique contributors" icon={<Sparkles className="text-gold" />} color="bg-gold-cream/40" />
            <StatCard label="Avg Gift" value={formatCurrency(transactions.length ? transactions.reduce((acc, curr) => acc + curr.amount, 0) / transactions.length : 0)} sub="per transaction" icon={<RefreshCw className="text-burgundy" />} color="bg-burgundy/5" />
          </>
        )}
      </div>

      <div className="bg-white rounded-[2.5rem] border border-gray-50 shadow-[0_8px_40px_rgba(0,0,0,0.02)] overflow-hidden">
        <div className="p-8 border-b border-gray-50 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="relative group flex-1 max-w-xl">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-gold transition-colors" size={20} />
            <input
              type="text"
              placeholder={`Search ${title.toLowerCase()}...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-12 pr-6 py-4 bg-gray-50/50 rounded-2xl outline-none border border-transparent focus:bg-white focus:border-gold/20 focus:ring-4 focus:ring-gold/5 transition-all text-sm font-semibold text-[#0d1a14]"
            />
          </div>
          <button className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-white border border-gray-100 text-gray-500 font-bold text-sm hover:bg-gray-50 transition-all">
            <Filter size={18} className="text-gold" />
            Filters
          </button>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-20 text-center flex flex-col items-center gap-4">
              <RefreshCw className="text-gold animate-spin" size={40} />
              <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Accessing records...</p>
            </div>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gold-cream/20">
                  <th className="px-8 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">Donor</th>
                  <th className="px-8 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">Amount</th>
                  <th className="px-8 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">
                    {isDisputes ? 'Reason' : 'Fund'}
                  </th>
                  <th className="px-8 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">
                    {isDisputes ? 'Deadline' : isFailed ? 'Failure Reason' : 'Status'}
                  </th>
                  <th className="px-8 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">Date</th>
                  <th className="px-8 py-5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((tx: any) => (
                  <React.Fragment key={tx.id}>
                    <tr className={`group transition-colors ${expandedId === tx.id ? 'bg-gold-cream/30' : 'hover:bg-gold-cream/10'}`}>
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-4">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-[13px] shadow-sm transition-transform group-hover:scale-110 ${isFailed ? 'bg-red-50 text-red-500' : isDisputes ? 'bg-orange-50 text-orange-500' : 'bg-burgundy text-gold'
                            }`}>
                            {tx.donor === 'Anonymous' ? '?' : tx.donor.charAt(0)}
                          </div>
                          <div>
                            <p className="text-[14px] font-bold text-[#0d1a14]">{tx.donor}</p>
                            <p className="text-[10px] text-gray-300 font-bold uppercase tracking-widest">{tx.id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <p className={`text-[15px] font-bold ${isFailed ? 'text-red-500' : 'text-burgundy'}`}>{formatCurrency(tx.amount)}</p>
                        <p className="text-[10px] text-gray-400 font-medium mt-0.5">{tx.method}</p>
                      </td>
                      <td className="px-8 py-6">
                        <span className="text-[13px] font-semibold text-[#0d1a14] opacity-70 group-hover:opacity-100 transition-opacity">
                          {isDisputes ? 'Fraud Claim' : tx.fund}
                        </span>
                      </td>
                      <td className="px-8 py-6">
                        {isFailed ? (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider bg-red-50 text-red-500 border border-red-100 animate-pulse">
                            <AlertCircle size={10} className="mr-1.5" />
                            {tx.reason}
                          </span>
                        ) : isDisputes ? (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider bg-orange-50 text-orange-600 border border-orange-100">
                            <Clock size={10} className="mr-1.5" />
                            {tx.deadline}
                          </span>
                        ) : isRefunds ? (
                          <div className="flex flex-col">
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider bg-gray-50 text-gray-400 border border-gray-200 w-fit">
                              Refunded
                            </span>
                            <span className="text-[8px] text-gold font-bold mt-1 uppercase">Ref: {tx.originalId}</span>
                          </div>
                        ) : (
                          <span className={`inline-flex items-center px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider border transition-all ${tx.status === 'Completed' ? 'bg-gold-cream text-gold border-gold/20 shadow-sm' :
                              tx.status === 'Failed' ? 'bg-red-50 text-red-500 border-red-100' :
                                'bg-gray-50 text-gray-400 border-gray-100'
                            }`}>
                            {tx.status}
                          </span>
                        )}
                      </td>
                      <td className="px-8 py-6 text-[13px] font-semibold text-gray-400">
                        {tx.date}
                      </td>
                      <td className="px-8 py-6 text-right">
                        <button
                          onClick={() => toggleDetails(tx.id)}
                          className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 ${expandedId === tx.id
                              ? 'bg-burgundy text-gold shadow-lg'
                              : 'bg-white border border-gray-100 text-gray-400 hover:text-burgundy'
                            }`}
                        >
                          {expandedId === tx.id ? 'Close' : 'Details'}
                        </button>
                      </td>
                    </tr>
                    {expandedId === tx.id && (
                      <tr className="bg-gold-cream/10">
                        <td colSpan={6} className="px-8 py-0">
                          <div className="py-8 border-t border-gold/10 animate-in slide-in-from-top-2 duration-300">
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                              <div className="space-y-4">
                                <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest">Financial Breakdown</p>
                                <div className="bg-white p-5 rounded-[1.5rem] border border-gray-50 shadow-sm space-y-3">
                                  <div className="flex justify-between items-center text-xs">
                                    <span className="text-gray-400">Gross Amount</span>
                                    <span className="font-bold text-[#0d1a14]">{formatCurrency(tx.amount)}</span>
                                  </div>
                                  <div className="flex justify-between items-center text-xs">
                                    <span className="text-gray-400">Processing Fee</span>
                                    <span className="font-bold text-red-400">-{formatCurrency(tx.fee)}</span>
                                  </div>
                                  <div className="pt-2 border-t border-gray-50 flex justify-between items-center text-sm">
                                    <span className="font-black text-gold uppercase text-[10px]">Net Ministry</span>
                                    <span className="font-black text-burgundy">{formatCurrency(tx.amount - tx.fee)}</span>
                                  </div>
                                </div>
                              </div>

                              <div className="space-y-4">
                                <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest">Digital Fingerprint</p>
                                <div className="bg-white p-5 rounded-[1.5rem] border border-gray-50 shadow-sm space-y-4">
                                  <div className="flex items-center gap-3">
                                    <Globe size={14} className="text-gold" />
                                    <div>
                                      <p className="text-[8px] font-black text-gray-300 uppercase leading-none mb-1">Source IP</p>
                                      <p className="text-[11px] font-mono font-bold text-gray-500">{tx.ip}</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <Fingerprint size={14} className="text-gold" />
                                    <div>
                                      <p className="text-[8px] font-black text-gray-300 uppercase leading-none mb-1">Gateway</p>
                                      <p className="text-[11px] font-bold text-gray-500">{tx.gateway} (v2.4)</p>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <div className="md:col-span-2 flex flex-col justify-end gap-3">
                                <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest">Available Actions</p>
                                <div className="grid grid-cols-2 gap-3">
                                  <button className="flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-white border border-gray-100 text-gray-500 font-bold text-[11px] uppercase tracking-widest hover:bg-gold-cream/40 transition-all">
                                    <Printer size={14} className="text-gold" />
                                    Print Receipt
                                  </button>
                                  <button className="flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-white border border-gray-100 text-gray-500 font-bold text-[11px] uppercase tracking-widest hover:bg-gold-cream/40 transition-all">
                                    <Mail size={14} className="text-gold" />
                                    Email Donor
                                  </button>
                                  <button className="flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-white border border-gray-100 text-gray-500 font-bold text-[11px] uppercase tracking-widest hover:bg-gold-cream/40 transition-all">
                                    <FileText size={14} className="text-gold" />
                                    Ledger Entry
                                  </button>
                                  <button className="flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-burgundy/5 border border-burgundy/10 text-burgundy font-black text-[11px] uppercase tracking-widest hover:bg-burgundy hover:text-gold transition-all">
                                    <Undo2 size={14} />
                                    Issue Refund
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-center justify-center gap-8 pt-4 border-t border-gray-50">
        <div className="flex items-center gap-3 text-sm font-semibold text-gray-400">
          <Sparkles size={18} className="text-gold" />
          <span>Automate your financial audits? <button className="text-burgundy hover:underline">Ask PLCC AI</button></span>
        </div>
        <div className="flex items-center gap-3 text-sm font-semibold text-gray-400">
          <LifeBuoy size={18} className="text-burgundy" />
          <span>Discrepancy in records? <button className="text-burgundy hover:underline">Contact Tech Support</button></span>
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ label, value, sub, icon, color }: any) => (
  <div className={`p-8 rounded-[2.5rem] border border-gray-50 shadow-sm flex items-center gap-6 group hover:shadow-md transition-all ${color || 'bg-white'}`}>
    <div className="w-14 h-14 rounded-2xl bg-white shadow-inner flex items-center justify-center shrink-0 border border-gray-100 group-hover:scale-105 transition-transform">
      {icon}
    </div>
    <div className="min-w-0">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-1">{label}</p>
      <div className="flex items-baseline gap-2">
        <h4 className="text-2xl font-black text-[#0d1a14]">{value}</h4>
        <span className="text-[9px] font-bold text-gray-300 uppercase tracking-tighter truncate">{sub}</span>
      </div>
    </div>
  </div>
);

const ExportView = () => {
  const [format, setFormat] = useState('CSV');

  return (
    <div className="space-y-12 animate-in fade-in duration-700 pb-12 pt-4">
      <div className="max-w-4xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-1 w-12 bg-gold rounded-full" />
          <h2 className="text-[11px] font-black text-gold uppercase tracking-[0.5em]">System Tool</h2>
        </div>
        <h1 className="text-5xl font-black text-[#0d1a14] tracking-tighter leading-none">Export Engine<span className="text-gold">.</span></h1>
        <p className="text-gray-400 font-medium text-lg mt-4 leading-relaxed">Package your financial records for audit, reconciliation, or external accounting.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-white rounded-[3.5rem] border border-gray-100 shadow-sm p-12 space-y-10">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-gray-300 uppercase tracking-widest ml-2">Date Horizon</label>
                <div className="relative">
                  <Calendar size={18} className="absolute left-6 top-1/2 -translate-y-1/2 text-gold" />
                  <select className="w-full pl-14 pr-8 py-5 rounded-[2rem] bg-gray-50 border-none outline-none focus:ring-4 focus:ring-gold/5 font-bold text-[#0d1a14] appearance-none shadow-inner">
                    <option>Current Quarter (Q4)</option>
                    <option>Last 30 Days</option>
                    <option>Year to Date (2024)</option>
                    <option>Full Archive</option>
                  </select>
                </div>
              </div>
              <div className="space-y-3">
                <label className="text-[10px] font-black text-gray-300 uppercase tracking-widest ml-2">Fund Filter</label>
                <div className="relative">
                  <Layers size={18} className="absolute left-6 top-1/2 -translate-y-1/2 text-gold" />
                  <select className="w-full pl-14 pr-8 py-5 rounded-[2rem] bg-gray-50 border-none outline-none focus:ring-4 focus:ring-gold/5 font-bold text-[#0d1a14] appearance-none shadow-inner">
                    <option>All Primary Funds</option>
                    <option>General Fund Only</option>
                    <option>Building Fund</option>
                    <option>Missions & Outreach</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-[10px] font-black text-gray-300 uppercase tracking-widest ml-2">Deliverable Format</label>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { id: 'CSV', icon: <FileSpreadsheet size={20} />, label: 'Universal (CSV)' },
                  { id: 'XLSX', icon: <Settings2 size={20} />, label: 'Excel (XLSX)' },
                  { id: 'PDF', icon: <FileText size={20} />, label: 'Audit PDF' },
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setFormat(f.id)}
                    className={`flex flex-col items-center gap-3 p-6 rounded-[2rem] border-2 transition-all active:scale-95 ${format === f.id ? 'bg-burgundy border-gold text-gold shadow-2xl shadow-burgundy/20' : 'bg-white border-gray-50 text-gray-300 hover:border-gray-100'
                      }`}
                  >
                    {f.icon}
                    <span className="text-[10px] font-black uppercase tracking-widest">{f.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-8 border-t border-gray-50">
              <button className="w-full py-6 bg-burgundy text-gold font-black uppercase text-sm tracking-[0.3em] rounded-[2rem] shadow-2xl shadow-burgundy/30 hover:bg-burgundy-dark active:scale-95 transition-all border-b-8 border-gold/40 flex items-center justify-center gap-4 group">
                <Download size={24} className="group-hover:-translate-y-1 transition-transform" />
                Generate & Secure Package
              </button>
            </div>
          </div>

          <div className="bg-gold-cream/40 p-10 rounded-[3rem] border border-gold/10 flex items-center gap-8 shadow-sm">
            <div className="w-20 h-20 rounded-[2rem] bg-white flex items-center justify-center text-gold shadow-lg shrink-0">
              <ShieldCheck size={40} />
            </div>
            <div>
              <h4 className="text-xl font-black text-[#0d1a14]">Compliance Guarantee</h4>
              <p className="text-gray-400 font-medium leading-relaxed mt-1">All exports generate an internal audit ID for tracking and are encrypted with AES-256 before being staged for download.</p>
            </div>
          </div>
        </div>

        <div className="space-y-8">
          <div className="bg-white rounded-[3rem] border border-gray-100 p-10 shadow-sm">
            <div className="flex items-center justify-between mb-10">
              <h3 className="text-xl font-black text-[#0d1a14]">History</h3>
              <p className="text-[10px] font-bold text-gold uppercase tracking-widest">v2.1</p>
            </div>

            <div className="space-y-6">
              {[
                { name: 'Q3_Reconciliation.csv', time: '2h ago', size: '1.2MB' },
                { name: 'Missions_Audit_2024.pdf', time: 'Yesterday', size: '4.5MB' },
                { name: 'General_Fund_Sept.xlsx', time: '3 days ago', size: '840KB' },
              ].map((exp, i) => (
                <div key={i} className="flex items-center justify-between group cursor-pointer">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-gray-50 text-gray-300 flex items-center justify-center group-hover:bg-burgundy group-hover:text-gold transition-all">
                      <FileText size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-bold text-[#0d1a14] truncate group-hover:text-burgundy transition-colors">{exp.name}</p>
                      <p className="text-[10px] text-gray-300 font-bold uppercase mt-0.5">{exp.time} • {exp.size}</p>
                    </div>
                  </div>
                  <ChevronRight size={14} className="text-gray-200 group-hover:text-gold transition-colors" />
                </div>
              ))}
            </div>
          </div>

          <div className="bg-[#fcfcfb] p-10 rounded-[3rem] border border-gray-100 flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-white rounded-[1.5rem] shadow-sm flex items-center justify-center mb-6">
              <LifeBuoy size={32} className="text-burgundy/20" />
            </div>
            <h4 className="text-lg font-black text-[#0d1a14]">Technical Help</h4>
            <p className="text-xs text-gray-400 font-medium leading-relaxed mt-2 mb-8">Need a specialized CSV schema for integration with Sage or NetSuite?</p>
            <button className="w-full py-4 bg-white border border-gray-100 rounded-2xl text-burgundy font-black text-[11px] uppercase tracking-widest shadow-sm hover:shadow-md transition-all">
              Request Template
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TransactionsPage;