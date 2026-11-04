import React, { useState, useEffect, useMemo } from 'react';
import {
  Landmark, Search, Download, ShieldCheck, ArrowRight,
  Clock, CheckCircle2, FileText, Plus, X, UserCheck, User,
  Upload, Link, Loader2, Building2, CreditCard, MoreVertical, Trash2
} from 'lucide-react';
import ResponsivePage from '../../components/Layout/ResponsivePage';
import { formatCurrency } from '../../utils/formatters';
import { useNav } from '../../App';
import { getAuthHeaders } from '../../lib/api';

interface Deposit {
  id: string;
  deposit_date: string;
  bank_name: string;
  account_name: string;
  amount: number;
  type: string;
  status: 'Pending' | 'Submitted' | 'Reconciled';
  depositor: string;
  verifier?: string;
  linked_sessions: { id: string; name: string; amount: number }[];
  notes?: string;
}

interface CountingSession {
  id: string;
  session_date: string;
  lead_counter_name: string;
  grand_total: number;
  status: string;
}

const BankDepositsPage: React.FC = () => {
  const { userName, userId } = useNav();
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [sessions, setSessions] = useState<CountingSession[]>([]);
  const [staff, setStaff] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const [selectedSessions, setSelectedSessions] = useState<string[]>([]);
  const [newDeposit, setNewDeposit] = useState({
    bankName: '',
    accountName: '',
    type: 'Combined Cash & Check',
    verifier: '',
    notes: ''
  });

  const getHeaders = async () => getAuthHeaders(undefined, userId);

  const fetchData = async () => {
    setLoading(true);
    try {
      const headers = await getHeaders();
      const [depRes, sessRes, usersRes] = await Promise.all([
        fetch('/api/vault?resource=finance&subResource=deposits', { headers }),
        fetch('/api/vault?resource=finance&subResource=counting', { headers }),
        fetch('/api/vault?resource=users', { headers })
      ]);
      const depData = await depRes.json();
      const sessData = await sessRes.json();
      const usersData = await usersRes.json();

      if (depData.ok) setDeposits(depData.deposits || []);
      if (sessData.ok) setSessions((sessData.sessions || []).filter((s: CountingSession) => s.status !== 'Archived'));
      if (usersData.ok) setStaff((usersData.users || []).map((u: any) => ({ id: u.id, name: u.name })).filter((u: any) => u.name));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const calculateNewTotal = useMemo(() => {
    return sessions
      .filter(s => selectedSessions.includes(s.id))
      .reduce((acc, s) => acc + (s.grand_total || 0), 0);
  }, [selectedSessions, sessions]);

  const handleCreateDeposit = async () => {
    if (selectedSessions.length === 0 && calculateNewTotal === 0) return;
    setIsSaving(true);
    try {
      const headers = await getHeaders();
      const linkedSessions = sessions
        .filter(s => selectedSessions.includes(s.id))
        .map(s => ({ id: s.id, name: `${s.session_date} — ${s.lead_counter_name}`, amount: s.grand_total }));

      const res = await fetch('/api/vault?resource=finance&subResource=deposits', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          bankName: newDeposit.bankName || 'Unspecified Bank',
          accountName: newDeposit.accountName || 'General Account',
          amount: calculateNewTotal,
          type: newDeposit.type,
          depositor: userName,
          depositorId: userId,
          verifier: newDeposit.verifier || null,
          linkedSessions,
          notes: newDeposit.notes
        })
      });
      const data = await res.json();
      if (data.ok) {
        setDeposits(prev => [data.deposit, ...prev]);
        setIsModalOpen(false);
        setSelectedSessions([]);
        setNewDeposit({ bankName: '', accountName: '', type: 'Combined Cash & Check', verifier: '', notes: '' });
      } else {
        alert('Failed to save: ' + data.error);
      }
    } catch (err) {
      console.error(err);
      alert('Error saving deposit.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      const headers = await getHeaders();
      const res = await fetch('/api/vault?resource=finance&subResource=deposits', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ id, status })
      });
      if (res.ok) {
        setDeposits(prev => prev.map(d => d.id === id ? { ...d, status: status as any } : d));
        setOpenMenuId(null);
      }
    } catch (err) { console.error(err); }
  };

  const downloadCSV = () => {
    if (filtered.length === 0) return;
    const rows = filtered.map(d => [
      d.deposit_date, d.bank_name, d.account_name, d.type, d.amount, d.status, d.depositor, d.verifier || ''
    ].join(','));
    const csv = ['Date,Bank,Account,Type,Amount,Status,Depositor,Verifier', ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Bank_Deposits_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const filtered = deposits.filter(d =>
    d.bank_name?.toLowerCase().includes(search.toLowerCase()) ||
    d.account_name?.toLowerCase().includes(search.toLowerCase()) ||
    d.id?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <ResponsivePage>
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-gold animate-pulse shadow-[0_0_8px_#C9A35A]" />
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Treasury: Account Transfers</span>
          </div>
          <h1 className="text-3xl md:text-5xl font-black text-[#0d1a14] tracking-tighter leading-none">Bank Deposits<span className="text-gold">.</span></h1>
          <p className="text-gray-400 font-medium text-sm md:text-lg mt-2">Formal registry of funds committed to external banking institutions.</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={downloadCSV} className="flex items-center gap-2 px-6 py-4 rounded-2xl bg-white border border-gray-100 text-gray-500 font-black text-[10px] uppercase tracking-widest hover:text-burgundy transition-all active:scale-95 shadow-sm">
            <Download size={16} />
            Export
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 px-8 py-4 rounded-2xl bg-burgundy text-gold font-black text-[10px] uppercase tracking-widest shadow-xl shadow-burgundy/20 hover:bg-burgundy-dark transition-all active:scale-95 border-b-4 border-gold/40"
          >
            <Plus size={18} />
            Log New Deposit
          </button>
        </div>
      </div>

      <div className="bg-white rounded-[3rem] border border-gray-50 shadow-sm overflow-hidden flex flex-col">
        <div className="p-8 border-b border-gray-50 flex flex-col md:flex-row md:items-center justify-between gap-6 bg-gold-cream/5">
          <div className="relative group flex-1 max-w-xl">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-gold" size={20} />
            <input
              type="text"
              placeholder="Search by Bank, ID, or Account..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-12 pr-6 py-4 bg-gray-50/50 rounded-2xl outline-none focus:bg-white transition-all text-sm font-bold text-[#0d1a14]"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-16 text-center text-gray-400 font-bold">Loading deposits...</div>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50/50">
                  <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Settlement Info</th>
                  <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Accountability</th>
                  <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Source Sessions</th>
                  <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Status</th>
                  <th className="px-8 py-5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(dep => (
                  <tr key={dep.id} className="group hover:bg-gold-cream/5 transition-colors">
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-burgundy/5 text-burgundy flex items-center justify-center shadow-inner group-hover:scale-105 transition-transform shrink-0">
                          <Landmark size={24} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[16px] font-black text-[#0d1a14] leading-none mb-1.5">{formatCurrency(dep.amount)}</p>
                          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest truncate">{dep.bank_name} • {dep.account_name}</p>
                          <p className="text-[9px] text-gray-300 font-bold mt-0.5">{dep.deposit_date} • {dep.type}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <User size={12} className="text-gold" />
                          <span className="text-[12px] font-bold text-gray-600">{dep.depositor}</span>
                        </div>
                        {dep.verifier && (
                          <div className="flex items-center gap-2">
                            <UserCheck size={12} className="text-green-500" />
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tight">Verified by {dep.verifier}</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {(dep.linked_sessions || []).map((s: any, i: number) => (
                          <span key={i} className="text-[9px] font-black uppercase tracking-tighter bg-gray-50 text-gray-400 px-2 py-1 rounded-md border border-gray-100 whitespace-nowrap">
                            {s.name || s}
                          </span>
                        ))}
                        {(!dep.linked_sessions || dep.linked_sessions.length === 0) && (
                          <span className="text-[9px] text-gray-300 font-medium">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-8 py-6 text-center">
                      <StatusBadge status={dep.status} />
                    </td>
                    <td className="px-8 py-6 text-right">
                      <div className="relative">
                        <button
                          onClick={() => setOpenMenuId(openMenuId === dep.id ? null : dep.id)}
                          className="p-2 text-gray-200 hover:text-burgundy transition-all rounded-xl hover:bg-gray-50"
                        >
                          <MoreVertical size={20} />
                        </button>
                        {openMenuId === dep.id && (
                          <div className="absolute right-0 top-10 z-50 bg-white border border-gray-100 rounded-2xl shadow-2xl min-w-[180px] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                            {dep.status !== 'Reconciled' && (
                              <button
                                onClick={() => handleStatusChange(dep.id, 'Reconciled')}
                                className="w-full flex items-center gap-3 px-5 py-4 text-green-600 hover:bg-green-50 text-xs font-black uppercase tracking-widest transition-colors"
                              >
                                <CheckCircle2 size={14} />
                                Mark Reconciled
                              </button>
                            )}
                            {dep.status === 'Submitted' && (
                              <button
                                onClick={() => handleStatusChange(dep.id, 'Pending')}
                                className="w-full flex items-center gap-3 px-5 py-4 text-gray-500 hover:bg-gray-50 text-xs font-black uppercase tracking-widest transition-colors"
                              >
                                <Clock size={14} />
                                Set Pending
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!loading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-8 py-20 text-center text-gray-400 font-bold text-sm">
                      No deposits recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* NEW DEPOSIT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-burgundy/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white rounded-[3rem] w-full max-w-4xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-500 border border-gold/30 flex flex-col md:flex-row h-full max-h-[85vh]">

            {/* Left: Session Selection */}
            <div className="w-full md:w-80 bg-gray-50 border-r border-gray-100 flex flex-col shrink-0">
              <div className="p-8 border-b border-gray-100 bg-white">
                <h4 className="text-[11px] font-black text-gold uppercase tracking-[0.2em] mb-1">Step 1</h4>
                <h3 className="text-xl font-black text-[#0d1a14]">Link Source Sessions</h3>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                {sessions.length === 0 && (
                  <p className="text-xs text-gray-400 font-medium p-4 text-center">No counting sessions available.</p>
                )}
                {sessions.map(session => {
                  const isSelected = selectedSessions.includes(session.id);
                  return (
                    <button
                      key={session.id}
                      onClick={() => setSelectedSessions(prev => isSelected ? prev.filter(id => id !== session.id) : [...prev, session.id])}
                      className={`w-full p-5 rounded-2xl border-2 text-left transition-all ${isSelected ? 'bg-burgundy text-gold border-gold shadow-lg' : 'bg-white border-transparent hover:border-gray-200'}`}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-[9px] font-black uppercase tracking-widest opacity-60">{session.session_date}</span>
                        {isSelected && <CheckCircle2 size={14} className="text-gold" />}
                      </div>
                      <p className={`text-sm font-black tracking-tight ${isSelected ? 'text-white' : 'text-[#0d1a14]'}`}>{session.lead_counter_name}</p>
                      <p className={`text-lg font-black mt-1 ${isSelected ? 'text-gold' : 'text-burgundy'}`}>{formatCurrency(session.grand_total || 0)}</p>
                      <span className={`text-[9px] font-bold uppercase tracking-widest ${isSelected ? 'text-white/50' : 'text-gray-400'}`}>{session.status}</span>
                    </button>
                  );
                })}
              </div>
              <div className="p-8 border-t border-gray-100 bg-white text-center">
                <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest mb-1">Total to Deposit</p>
                <p className="text-2xl font-black text-burgundy">{formatCurrency(calculateNewTotal)}</p>
              </div>
            </div>

            {/* Right: Deposit Form */}
            <div className="flex-1 overflow-y-auto p-10 space-y-8 custom-scrollbar">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-2xl font-black text-[#0d1a14] tracking-tight uppercase">Bank Instructions</h3>
                  <p className="text-sm text-gray-400 font-medium">Capture settlement and accountability data.</p>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="p-3 text-gray-300 hover:text-burgundy transition-all bg-gray-50 rounded-2xl">
                  <X size={24} />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Receiving Institution</label>
                  <div className="relative group">
                    <Building2 size={18} className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-gold" />
                    <input
                      type="text"
                      placeholder="e.g. Chase Bank"
                      value={newDeposit.bankName}
                      onChange={e => setNewDeposit({ ...newDeposit, bankName: e.target.value })}
                      className="w-full pl-14 pr-6 py-4 rounded-[1.5rem] bg-gray-50 border-none outline-none focus:ring-8 focus:ring-burgundy/5 focus:bg-white transition-all font-bold text-[#0d1a14] shadow-inner"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Target Account</label>
                  <div className="relative group">
                    <CreditCard size={18} className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-gold" />
                    <input
                      type="text"
                      placeholder="e.g. Main Operating"
                      value={newDeposit.accountName}
                      onChange={e => setNewDeposit({ ...newDeposit, accountName: e.target.value })}
                      className="w-full pl-14 pr-6 py-4 rounded-[1.5rem] bg-gray-50 border-none outline-none focus:ring-8 focus:ring-burgundy/5 focus:bg-white transition-all font-bold text-[#0d1a14] shadow-inner"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Assigned Verifier</label>
                  <div className="relative group">
                    <UserCheck size={18} className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-gold" />
                    <select
                      value={newDeposit.verifier}
                      onChange={e => setNewDeposit({ ...newDeposit, verifier: e.target.value })}
                      className="w-full pl-14 pr-6 py-4 rounded-[1.5rem] bg-gray-50 border-none outline-none focus:ring-8 focus:ring-burgundy/5 focus:bg-white transition-all font-bold text-[#0d1a14] shadow-inner appearance-none"
                    >
                      <option value="">Select Verifier (Optional)</option>
                      {staff.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Deposit Type</label>
                  <select
                    value={newDeposit.type}
                    onChange={e => setNewDeposit({ ...newDeposit, type: e.target.value })}
                    className="w-full px-6 py-4 rounded-[1.5rem] bg-gray-50 border-none outline-none focus:ring-8 focus:ring-burgundy/5 focus:bg-white transition-all font-bold text-[#0d1a14] shadow-inner appearance-none"
                  >
                    <option>Combined Cash & Check</option>
                    <option>Cash Only</option>
                    <option>Checks Only</option>
                    <option>Digital Batch Reconciliation</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Internal Notes</label>
                <textarea
                  rows={3}
                  placeholder="Add any specific details regarding this bank drop..."
                  value={newDeposit.notes}
                  onChange={e => setNewDeposit({ ...newDeposit, notes: e.target.value })}
                  className="w-full p-6 rounded-[1.5rem] bg-gray-50 border-none outline-none focus:ring-8 focus:ring-burgundy/5 focus:bg-white transition-all font-medium text-gray-700 shadow-inner resize-none"
                />
              </div>

              <div className="pt-4 flex flex-col sm:flex-row justify-end gap-4">
                <div className="flex-1 flex items-center gap-4 text-gray-400">
                  <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center font-black text-xs shrink-0">
                    {userName?.charAt(0) || 'U'}
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest leading-none mb-1">Depositor</p>
                    <p className="text-[12px] font-bold">{userName}</p>
                  </div>
                </div>
                <button
                  onClick={handleCreateDeposit}
                  disabled={isSaving || (selectedSessions.length === 0 && calculateNewTotal === 0)}
                  className="px-12 py-5 bg-burgundy text-gold rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-2xl shadow-burgundy/20 hover:bg-burgundy-dark transition-all active:scale-95 border-b-4 border-gold/40 flex items-center justify-center gap-3 disabled:opacity-50"
                >
                  {isSaving ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
                  Submit Deposit Record
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        <div className="bg-gold-cream/30 p-10 rounded-[3rem] border border-gold/10 flex items-center gap-8 shadow-sm group">
          <div className="w-16 h-16 rounded-[1.5rem] bg-white text-gold flex items-center justify-center shadow-lg border border-gold/10 group-hover:scale-110 transition-transform shrink-0">
            <ShieldCheck size={32} />
          </div>
          <div className="flex-1">
            <h4 className="text-xl font-black text-[#0d1a14] tracking-tight leading-none mb-1.5 uppercase">Immutable History</h4>
            <p className="text-sm text-gray-400 font-medium leading-relaxed">Deposit records cannot be deleted once verified. All corrections require an authorized variance note.</p>
          </div>
        </div>
        <div className="bg-white p-10 rounded-[3rem] border border-gray-100 flex items-center gap-8 shadow-sm group">
          <div className="w-16 h-16 rounded-[1.5rem] bg-burgundy/5 text-burgundy flex items-center justify-center shadow-lg border border-burgundy/10 group-hover:scale-110 transition-transform shrink-0">
            <Link size={32} />
          </div>
          <div className="flex-1">
            <h4 className="text-xl font-black text-[#0d1a14] tracking-tight leading-none mb-1.5 uppercase">Session Linking</h4>
            <p className="text-sm text-gray-400 font-medium leading-relaxed">Each deposit is linked to its source counting sessions for full traceability and audit compliance.</p>
          </div>
        </div>
      </div>
    </ResponsivePage>
  );
};

const StatusBadge = ({ status }: { status: string }) => {
  const styles: any = {
    Pending: 'bg-gray-50 text-gray-400 border-gray-100',
    Submitted: 'bg-gold-cream text-gold border-gold/20 animate-pulse',
    Reconciled: 'bg-green-50 text-green-600 border-green-100'
  };
  const icons: any = {
    Pending: <Clock size={10} className="mr-1.5" />,
    Submitted: <ArrowRight size={10} className="mr-1.5" />,
    Reconciled: <CheckCircle2 size={10} className="mr-1.5" />
  };
  return (
    <span className={`inline-flex items-center px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider border shadow-sm ${styles[status] || styles.Pending}`}>
      {icons[status] || icons.Pending}
      {status}
    </span>
  );
};

export default BankDepositsPage;
