import React, { useState, useEffect } from 'react';
import {
  Plus, Settings, PieChart, MoreVertical, ArrowRight,
  Sparkles, LifeBuoy, Loader2, X, DollarSign, Target,
  CheckCircle2, Trash2, ToggleLeft, ToggleRight
} from 'lucide-react';
import ResponsivePage from '../../components/Layout/ResponsivePage';
import { formatCurrency } from '../../utils/formatters';
import { useNav } from '../../App';
import { canPerform } from '../../lib/permissions';
import { apiFetch } from '../../lib/api';

interface Fund {
  id: string;
  name: string;
  description?: string;
  balance?: number;
  goal?: number;
  is_active: boolean;
  color?: string;
}

const COLORS = [
  'bg-burgundy', 'bg-gold', 'bg-[#1a2e35]', 'bg-gray-700',
  'bg-emerald-700', 'bg-blue-800', 'bg-purple-800', 'bg-rose-700'
];

const FundManagementPage: React.FC = () => {
  const { userRole, userId } = useNav();
  const [funds, setFunds] = useState<Fund[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFund, setEditingFund] = useState<Fund | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', description: '', goal: '', color: COLORS[0] });

  const canEdit = canPerform(userRole, 'finance.edit');

  const fetchFunds = async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/api/vault?resource=finance&subResource=funds', { userId });
      if (data.ok) setFunds(data.funds || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchFunds(); }, []);

  const openCreate = () => {
    setEditingFund(null);
    setForm({ name: '', description: '', goal: '', color: COLORS[0] });
    setIsModalOpen(true);
  };

  const openEdit = (fund: Fund) => {
    setEditingFund(fund);
    setForm({
      name: fund.name,
      description: fund.description || '',
      goal: fund.goal ? String(fund.goal) : '',
      color: fund.color || COLORS[0]
    });
    setOpenMenuId(null);
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setIsSaving(true);
    try {
      const payload = {
        name: form.name,
        description: form.description,
        goal: form.goal ? parseFloat(form.goal) : null,
        color: form.color,
        isActive: true
      };
      const method = editingFund ? 'PATCH' : 'POST';
      const body = editingFund ? { id: editingFund.id, ...payload } : payload;
      const data = await apiFetch('/api/vault?resource=finance&subResource=funds', {
        method, userId, body: JSON.stringify(body)
      });
      if (data.ok) {
        await fetchFunds();
        setIsModalOpen(false);
      } else {
        alert(data.error || 'Failed to save fund');
      }
    } catch (err: any) { console.error(err); alert(err.message || 'Failed to save fund'); }
    finally { setIsSaving(false); }
  };

  const toggleActive = async (fund: Fund) => {
    try {
      await apiFetch('/api/vault?resource=finance&subResource=funds', {
        method: 'PATCH',
        userId,
        body: JSON.stringify({ id: fund.id, isActive: !fund.is_active })
      });
      setFunds(prev => prev.map(f => f.id === fund.id ? { ...f, is_active: !f.is_active } : f));
      setOpenMenuId(null);
    } catch (err) { console.error(err); }
  };

  const activeFunds = funds.filter(f => f.is_active !== false);
  const inactiveFunds = funds.filter(f => f.is_active === false);

  return (
    <ResponsivePage>
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-[#0d1a14] tracking-tight">Fund Management</h1>
          <p className="text-gray-400 text-sm font-medium mt-1">Organize contributions across ministry buckets.</p>
        </div>
        {canEdit && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-5 py-3 rounded-xl bg-burgundy text-gold font-black text-xs uppercase tracking-widest shadow-lg shadow-burgundy/20 hover:bg-burgundy-dark transition-all active:scale-95 border-b-2 border-gold/30 self-start sm:self-auto"
          >
            <Plus size={16} />
            New Fund
          </button>
        )}
      </div>

      {/* Fund Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-burgundy/30" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {activeFunds.map(fund => {
              const pct = fund.goal && fund.balance ? Math.min((fund.balance / fund.goal) * 100, 100) : 0;
              const colorClass = fund.color || COLORS[0];
              return (
                <div key={fund.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all group flex flex-col overflow-hidden">
                  {/* Color bar */}
                  <div className={`h-1.5 w-full ${colorClass}`} />

                  <div className="p-5 flex flex-col flex-1">
                    {/* Top row */}
                    <div className="flex items-start justify-between mb-3">
                      <div className={`w-10 h-10 rounded-xl ${colorClass} flex items-center justify-center text-white shadow-sm shrink-0`}>
                        <PieChart size={18} />
                      </div>
                      <div className="relative">
                        <button
                          onClick={() => setOpenMenuId(openMenuId === fund.id ? null : fund.id)}
                          className="p-1.5 text-gray-300 hover:text-burgundy hover:bg-gray-50 rounded-lg transition-all"
                        >
                          <MoreVertical size={16} />
                        </button>
                        {openMenuId === fund.id && (
                          <div className="absolute right-0 top-8 z-50 bg-white border border-gray-100 rounded-xl shadow-xl min-w-[160px] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                            {canEdit && (
                              <button
                                onClick={() => openEdit(fund)}
                                className="w-full flex items-center gap-3 px-4 py-3 text-gray-600 hover:bg-gray-50 text-xs font-black uppercase tracking-widest"
                              >
                                <Settings size={13} /> Edit Fund
                              </button>
                            )}
                            <button
                              onClick={() => toggleActive(fund)}
                              className="w-full flex items-center gap-3 px-4 py-3 text-amber-600 hover:bg-amber-50 text-xs font-black uppercase tracking-widest"
                            >
                              <ToggleLeft size={13} /> Deactivate
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Name & desc */}
                    <h3 className="text-base font-black text-[#0d1a14] leading-tight mb-1">{fund.name}</h3>
                    {fund.description && (
                      <p className="text-xs text-gray-400 font-medium leading-relaxed mb-3 line-clamp-2">{fund.description}</p>
                    )}

                    {/* Balance */}
                    <div className="mt-auto pt-3 border-t border-gray-50 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest">Balance</span>
                        <span className="text-sm font-black text-burgundy">{formatCurrency(fund.balance || 0)}</span>
                      </div>
                      {fund.goal && (
                        <>
                          <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full ${colorClass} opacity-80 transition-all duration-700`} style={{ width: `${pct}%` }} />
                          </div>
                          <div className="flex items-center justify-between text-[10px] font-bold text-gray-400">
                            <span>{Math.round(pct)}% of goal</span>
                            <span>{formatCurrency(fund.goal)}</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Empty state */}
            {activeFunds.length === 0 && (
              <div className="col-span-full py-16 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                <PieChart size={32} className="mx-auto text-gray-200 mb-3" />
                <p className="text-xs font-black text-gray-400 uppercase tracking-widest">No funds yet</p>
                {canEdit && (
                  <button onClick={openCreate} className="mt-4 text-xs font-black text-burgundy hover:underline uppercase tracking-widest">
                    Create your first fund
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Inactive funds */}
          {inactiveFunds.length > 0 && (
            <div>
              <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest mb-3">Inactive Funds</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {inactiveFunds.map(fund => (
                  <div key={fund.id} className="bg-gray-50 rounded-xl border border-gray-100 p-4 flex items-center justify-between opacity-60">
                    <div>
                      <p className="text-sm font-black text-gray-500">{fund.name}</p>
                      <p className="text-[10px] text-gray-400 font-medium">{formatCurrency(fund.balance || 0)}</p>
                    </div>
                    {canEdit && (
                      <button
                        onClick={() => toggleActive(fund)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-[10px] font-black text-gray-500 hover:text-burgundy hover:border-burgundy/20 transition-all"
                      >
                        <ToggleRight size={12} /> Restore
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Footer helpers */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
        <div className="bg-white p-6 rounded-2xl border border-gray-50 shadow-sm flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-gold-cream text-gold flex items-center justify-center shrink-0">
            <Sparkles size={18} />
          </div>
          <div>
            <h4 className="font-black text-[#0d1a14] text-sm mb-1">Fund Allocation Help</h4>
            <p className="text-xs text-gray-400 font-medium leading-relaxed">Not sure how to categorize a multi-fund gift? Ask <button className="text-burgundy font-bold hover:underline">PLCC AI</button> for guidance.</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-gray-50 shadow-sm flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-burgundy/5 text-burgundy flex items-center justify-center shrink-0">
            <LifeBuoy size={18} />
          </div>
          <div>
            <h4 className="font-black text-[#0d1a14] text-sm mb-1">Technical Audit</h4>
            <p className="text-xs text-gray-400 font-medium leading-relaxed">Need to merge funds or resolve a discrepancy? <button className="text-burgundy font-bold hover:underline">Contact Support</button>.</p>
          </div>
        </div>
      </div>

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full sm:max-w-md rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300 overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-50 flex items-center justify-between">
              <h3 className="text-lg font-black text-[#0d1a14]">{editingFund ? 'Edit Fund' : 'New Fund'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="p-2 text-gray-300 hover:text-burgundy rounded-xl transition-all">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Fund Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Building Fund"
                  className="w-full px-4 py-3 rounded-xl bg-gray-50 outline-none focus:bg-white focus:ring-4 focus:ring-burgundy/5 font-bold text-[#0d1a14] transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Description</label>
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  placeholder="Brief description of this fund's purpose..."
                  className="w-full px-4 py-3 rounded-xl bg-gray-50 outline-none focus:bg-white focus:ring-4 focus:ring-burgundy/5 font-medium text-gray-700 transition-all resize-none text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Annual Goal (Optional)</label>
                <div className="relative">
                  <DollarSign size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gold" />
                  <input
                    type="number"
                    value={form.goal}
                    onChange={e => setForm({ ...form, goal: e.target.value })}
                    placeholder="0.00"
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-gray-50 outline-none focus:bg-white focus:ring-4 focus:ring-burgundy/5 font-bold text-[#0d1a14] transition-all"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Color</label>
                <div className="flex gap-2 flex-wrap">
                  {COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setForm({ ...form, color: c })}
                      className={`w-8 h-8 rounded-lg ${c} transition-all ${form.color === c ? 'ring-2 ring-offset-2 ring-burgundy scale-110' : 'opacity-60 hover:opacity-100'}`}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => setIsModalOpen(false)} className="flex-1 py-3 text-gray-400 font-black text-xs uppercase tracking-widest hover:text-burgundy transition-colors">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || !form.name.trim()}
                className="flex-[2] py-3 bg-burgundy text-gold font-black text-xs uppercase tracking-widest rounded-xl shadow-lg hover:bg-burgundy-dark transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSaving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                {editingFund ? 'Save Changes' : 'Create Fund'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </ResponsivePage>
  );
};

export default FundManagementPage;
