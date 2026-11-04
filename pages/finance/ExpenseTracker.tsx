import React, { useState, useEffect } from 'react';
import {
  TrendingDown, Plus, Search, Filter, MoreVertical,
  CheckCircle2, Clock, AlertCircle, FileText, ArrowRight,
  ShieldCheck, Loader2, X, CreditCard, User, Tag
} from 'lucide-react';
import ResponsivePage from '../../components/Layout/ResponsivePage';
import { formatCurrency } from '../../utils/formatters';
import { canPerform } from '../../lib/permissions';
import { useNav } from '../../App';
import { apiFetch } from '../../lib/api';

interface Expense {
  id: string;
  vendor: string;
  amount: number;
  created_at: string; // date
  category: string;
  status: 'Pending' | 'Approved' | 'Paid' | 'Declined';
  requester_name: string;
  description: string;
}

const ExpenseTrackerPage: React.FC = () => {
  const { userRole, userName, userId } = useNav();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // New Request Form
  const [newRequest, setNewRequest] = useState<{
    vendor: string;
    amount: number;
    category: string;
    description: string;
    requester: string;
  }>({
    vendor: '',
    amount: 0,
    category: 'Ministry Supplies',
    description: '',
    requester: userName || 'Staff'
  });

  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchExpenses();
  }, []);

  const fetchExpenses = async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/api/vault?resource=finance&subResource=expenses', { userId });
      if (data.ok) {
        setExpenses(data.expenses);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newRequest.vendor || !newRequest.amount) return;
    setIsSaving(true);
    try {
      const data = await apiFetch('/api/vault?resource=finance&subResource=expenses', {
        method: 'POST',
        userId,
        body: JSON.stringify(newRequest)
      });
      if (data.ok) {
        setExpenses([data.expense, ...expenses]);
        setIsModalOpen(false);
        setNewRequest({
          vendor: '',
          amount: 0,
          category: 'Ministry Supplies',
          description: '',
          requester: userName || 'Staff'
        });
      } else {
        alert('Error: ' + data.error);
      }
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Failed to create expense');
    } finally {
      setIsSaving(false);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    // Check permission?
    if (!canPerform(userRole, 'finance.admin')) return;

    try {
      await apiFetch('/api/vault?resource=finance&subResource=expenses', {
        method: 'PATCH',
        userId,
        body: JSON.stringify({
          id,
          status,
          createLedgerEntry: status === 'Paid' // Auto-create ledger entry if paid
        })
      });
      setExpenses(prev => prev.map(e => e.id === id ? { ...e, status: status as any } : e));
    } catch (err) {
      console.error(err);
    }
  };

  const filteredExpenses = expenses.filter(e => {
    const matchSearch = e.vendor.toLowerCase().includes(search.toLowerCase()) || e.requester_name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'All' || e.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <ResponsivePage>
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown size={14} className="text-red-500" />
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Treasury Outflow</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-[#0d1a14] mb-1 tracking-tight">Expense Tracker</h1>
          <p className="text-gray-400 font-medium text-sm">Monitor ministry spending and manage reimbursement workflows.</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center justify-center gap-3 px-8 py-4 bg-burgundy text-gold font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl shadow-burgundy/20 hover:bg-burgundy-dark transition-all active:scale-95 border-b-4 border-gold/30"
        >
          <Plus size={18} />
          New Payout Request
        </button>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-gray-50 shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 md:p-8 border-b border-gray-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative group flex-1 w-full md:max-w-xl">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-gold" size={20} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search vendors or request IDs..."
              className="w-full pl-12 pr-6 py-4 bg-gray-50/50 rounded-2xl outline-none focus:bg-white focus:border-gold/20 transition-all text-sm font-bold text-[#0d1a14]"
            />
          </div>
          <div className="flex gap-2">
            {['All', 'Pending', 'Approved', 'Paid'].map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${statusFilter === s ? 'bg-burgundy text-gold' : 'bg-gray-50 text-gray-400 hover:text-burgundy'}`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-12 text-center text-gray-400">Loading expenses...</div>
          ) : (
            <table className="w-full text-left">
              <thead className="bg-gray-50/50">
                <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  <th className="px-8 py-4">Vendor & ID</th>
                  <th className="px-8 py-4">Requester</th>
                  <th className="px-8 py-4">Category</th>
                  <th className="px-8 py-4">Amount</th>
                  <th className="px-8 py-4">Status</th>
                  <th className="px-8 py-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredExpenses.map(exp => (
                  <tr key={exp.id} className="group hover:bg-gold-cream/5 transition-colors">
                    <td className="px-8 py-6">
                      <div>
                        <p className="text-[15px] font-black text-[#0d1a14] leading-none mb-1.5">{exp.vendor}</p>
                        <div className="flex items-center gap-2">
                          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{exp.created_at.split('T')[0]}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6 text-sm font-bold text-gray-500">{exp.requester_name}</td>
                    <td className="px-8 py-6">
                      <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">{exp.category}</span>
                    </td>
                    <td className="px-8 py-6 font-black text-red-500 text-base">{formatCurrency(exp.amount)}</td>
                    <td className="px-8 py-6">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${exp.status === 'Paid' ? 'bg-green-50 text-green-600 border-green-100' :
                        exp.status === 'Pending' ? 'bg-orange-50 text-orange-600 border-orange-100 animate-pulse' :
                          exp.status === 'Declined' ? 'bg-red-50 text-red-600 border-red-100' :
                            'bg-gold-cream text-gold border-gold/20'
                        }`}>
                        {exp.status}
                      </span>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <div className="flex justify-end gap-2">
                        {canPerform(userRole, 'finance.admin') && exp.status === 'Pending' && (
                          <>
                            <button onClick={() => updateStatus(exp.id, 'Approved')} className="p-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-100"><CheckCircle2 size={16} /></button>
                            <button onClick={() => updateStatus(exp.id, 'Declined')} className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100"><X size={16} /></button>
                          </>
                        )}
                        {canPerform(userRole, 'finance.admin') && exp.status === 'Approved' && (
                          <button onClick={() => updateStatus(exp.id, 'Paid')} className="px-3 py-1 bg-burgundy text-gold rounded-lg text-[10px] font-bold uppercase hover:opacity-90">Mark Paid</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-burgundy/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white rounded-[3rem] w-full max-w-xl shadow-2xl p-10 animate-in zoom-in-95">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-black text-[#0d1a14]">New Expense Request</h3>
              <button onClick={() => setIsModalOpen(false)}><X className="text-gray-400 hover:text-burgundy" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Vendor / Payee</label>
                <input className="w-full p-4 bg-gray-50 rounded-2xl font-bold" placeholder="e.g. Office Depot" value={newRequest.vendor} onChange={e => setNewRequest({ ...newRequest, vendor: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Amount</label>
                <input type="number" className="w-full p-4 bg-gray-50 rounded-2xl font-bold" placeholder="0.00" value={newRequest.amount || ''} onChange={e => setNewRequest({ ...newRequest, amount: parseFloat(e.target.value) })} />
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Category</label>
                <select className="w-full p-4 bg-gray-50 rounded-2xl font-bold" value={newRequest.category} onChange={e => setNewRequest({ ...newRequest, category: e.target.value })}>
                  <option>Ministry Supplies</option>
                  <option>Operations</option>
                  <option>Hospitality</option>
                  <option>Facilities</option>
                  <option>Education</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Reason</label>
                <textarea className="w-full p-4 bg-gray-50 rounded-2xl font-bold" rows={3} placeholder="Brief description..." value={newRequest.description} onChange={e => setNewRequest({ ...newRequest, description: e.target.value })} />
              </div>
              <button
                onClick={handleCreate}
                disabled={isSaving}
                className="w-full py-4 bg-burgundy text-gold font-black uppercase tracking-widest rounded-2xl mt-4 hover:bg-burgundy-dark transition-all"
              >
                {isSaving ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}

    </ResponsivePage>
  );
};

export default ExpenseTrackerPage;