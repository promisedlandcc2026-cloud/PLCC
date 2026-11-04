import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
   Calculator, DollarSign, ShieldCheck, User, Clock,
   Loader2, CheckCircle2, Banknote, Plus, Info, Hash, Trash2,
   ChevronDown, Pencil, Layers
} from 'lucide-react';
import ResponsivePage from '../../components/Layout/ResponsivePage';
import { formatCurrency } from '../../utils/formatters';
import { useNav } from '../../App';
import { canPerform } from '../../lib/permissions';
import { apiFetch } from '../../lib/api';
import { formatAccountContact } from '../../api/_utils/authPhone';
import { useSearchParams } from 'react-router-dom';

interface DenominationCount {
   [key: string]: number;
}

interface Fund {
   id: string;
   name: string;
}

type PayType = 'Cash' | 'Check' | 'Credit/Debit' | 'Online' | 'Other';

interface GiftEntry {
   id: string;
   memberId?: string;
   memberName: string;
   amount: number;
   fundId: string;
   fundName: string;
   payType: PayType;
   checkNum?: string;
   note?: string;
   taxDeductible: boolean;
}

const PAY_TYPES: PayType[] = ['Cash', 'Check', 'Credit/Debit', 'Online', 'Other'];

const ENTRIES_MARKER = '---CM_ENTRIES---';

function encodeSessionNotes(displayNotes: string, entries: GiftEntry[]): string {
   const base = displayNotes.replace(new RegExp(`\\n?${ENTRIES_MARKER}[\\s\\S]*$`), '').trim();
   return `${base}\n${ENTRIES_MARKER}\n${JSON.stringify(entries)}`.trim();
}

function decodeSessionNotes(raw: string): { notes: string; entries: GiftEntry[] } {
   if (!raw) return { notes: '', entries: [] };
   const idx = raw.indexOf(ENTRIES_MARKER);
   if (idx === -1) return { notes: raw, entries: [] };
   const notes = raw.slice(0, idx).trim();
   try {
      const parsed = JSON.parse(raw.slice(idx + ENTRIES_MARKER.length).trim());
      return { notes, entries: Array.isArray(parsed) ? parsed : [] };
   } catch {
      return { notes: raw, entries: [] };
   }
}

function batchNameFromNotes(raw: string): string {
   const { notes } = decodeSessionNotes(raw || '');
   if (notes.startsWith('Batch:')) {
      return notes.replace(/^Batch:\s*/i, '').split('\n')[0].trim() || "Today's Giving";
   }
   return notes.split('\n')[0]?.trim() || "Today's Giving";
}

const emptyForm = (defaultFundId = '') => ({
   payType: 'Cash' as PayType,
   memberId: undefined as string | undefined,
   memberName: '',
   checkNum: '',
   amount: '' as string | number,
   fundId: defaultFundId,
   taxDeductible: true,
   note: '',
});

const CountingSessionPage: React.FC = () => {
   const { userName, userRole, userId } = useNav();
   const [searchParams] = useSearchParams();
   const [sessionId, setSessionId] = useState<string | null>(null);
   const [isLocked, setIsLocked] = useState(false);
   const [isSaving, setIsSaving] = useState(false);
   const [sessionRef, setSessionRef] = useState('');
   const [batchDate, setBatchDate] = useState(new Date().toISOString().slice(0, 10));
   const [batchName, setBatchName] = useState("Today's Giving");
   const [batchNumber, setBatchNumber] = useState(1);
   const [funds, setFunds] = useState<Fund[]>([]);
   const [giftEntries, setGiftEntries] = useState<GiftEntry[]>([]);
   const [editingId, setEditingId] = useState<string | null>(null);
   const [cashOpen, setCashOpen] = useState(false);
   const [form, setForm] = useState(emptyForm());
   const [cashCounts, setCashCounts] = useState<DenominationCount>({
      '100': 0, '50': 0, '20': 0, '10': 0, '5': 0, '1': 0, 'coins': 0
   });
   const [notes, setNotes] = useState('');
   const [loading, setLoading] = useState(true);
   const [toast, setToast] = useState<string | null>(null);

   useEffect(() => {
      const init = async () => {
         await fetchFunds();
         const qid = searchParams.get('id');
         if (qid) {
            setLoading(true);
            try {
               await loadSessionDetails(qid);
            } finally {
               setLoading(false);
            }
         } else {
            await fetchLatestSession();
         }
      };
      init();
   }, [searchParams]);

   useEffect(() => {
      if (!toast) return;
      const t = setTimeout(() => setToast(null), 2500);
      return () => clearTimeout(t);
   }, [toast]);

   useEffect(() => {
      if (funds.length && !form.fundId) {
         setForm((f) => ({ ...f, fundId: funds[0].id }));
      }
   }, [funds]);

   const fetchFunds = async () => {
      try {
         const data = await apiFetch('/api/vault?resource=finance&subResource=funds', { userId });
         if (data.ok) {
            setFunds(data.funds || []);
            if (data.funds?.[0]?.id) {
               setForm((f) => (f.fundId ? f : { ...f, fundId: data.funds[0].id }));
            }
         }
      } catch (err) {
         console.error('Failed to fetch funds', err);
      }
   };

   const fetchLatestSession = async () => {
      try {
         setLoading(true);
         const data = await apiFetch('/api/vault?resource=finance&subResource=counting&status=Draft', { userId });
         if (data.ok && data.sessions?.length > 0) {
            await loadSessionDetails(data.sessions[0].id);
         } else {
            setSessionRef(`NEW-${Date.now().toString().slice(-6)}`);
         }
      } catch (err) {
         console.error('Failed to fetch sessions', err);
      } finally {
         setLoading(false);
      }
   };

   const loadSessionDetails = async (id: string) => {
      try {
         const data = await apiFetch(`/api/vault?resource=finance&subResource=counting&id=${id}`, { userId });
         if (data.ok && data.session) {
            const s = data.session;
            setSessionId(s.id);
            setSessionRef(s.id.slice(0, 8).toUpperCase());
            setIsLocked(s.status === 'Locked' || s.status === 'Archived');
            setBatchDate((s.session_date || '').slice(0, 10) || new Date().toISOString().slice(0, 10));
            setBatchName(batchNameFromNotes(s.notes || ''));
            setBatchNumber(1);

            const decoded = decodeSessionNotes(s.notes || '');
            setNotes(decoded.notes.replace(/^Batch:\s*[^\n]*\n?/, '').trim());
            setGiftEntries(decoded.entries);

            if (s.counts) {
               const newCounts = { '100': 0, '50': 0, '20': 0, '10': 0, '5': 0, '1': 0, 'coins': 0 };
               Object.entries(s.counts).forEach(([k, v]) => {
                  newCounts[k] = Number(v);
               });
               setCashCounts(newCounts);
            }
         }
      } catch (err) {
         console.error(err);
      }
   };

   const cashDenomTotal = useMemo(() => {
      return Object.entries(cashCounts).reduce((acc: number, [denom, count]) => {
         const c = Number(count) || 0;
         if (denom === 'coins') return acc + c;
         return acc + (parseInt(denom) * c);
      }, 0);
   }, [cashCounts]);

   const entriesTotal = useMemo(
      () => giftEntries.reduce((s, e) => s + (Number(e.amount) || 0), 0),
      [giftEntries]
   );

   const cashFromEntries = useMemo(
      () => giftEntries.filter((e) => e.payType === 'Cash').reduce((s, e) => s + e.amount, 0),
      [giftEntries]
   );
   const checksFromEntries = useMemo(
      () => giftEntries.filter((e) => e.payType === 'Check').reduce((s, e) => s + e.amount, 0),
      [giftEntries]
   );
   const digitalFromEntries = useMemo(
      () => giftEntries.filter((e) => e.payType !== 'Cash' && e.payType !== 'Check').reduce((s, e) => s + e.amount, 0),
      [giftEntries]
   );

   const grandTotal = entriesTotal > 0 ? entriesTotal : cashDenomTotal;

   const handleCashChange = (denom: string, val: string) => {
      if (isLocked) return;
      setCashCounts((prev) => ({ ...prev, [denom]: parseFloat(val) || 0 }));
   };

   const fundName = (id: string) => funds.find((f) => f.id === id)?.name || '—';

   const saveGiftEntry = () => {
      if (isLocked) return;
      const amount = typeof form.amount === 'string' ? parseFloat(form.amount) : Number(form.amount);
      if (!amount || amount <= 0) {
         setToast('Enter an amount');
         return;
      }
      if (!form.fundId) {
         setToast('Select an account / fund');
         return;
      }
      const name = form.memberName.trim() || 'Anonymous';
      const entry: GiftEntry = {
         id: editingId || `e-${Date.now()}`,
         memberId: form.memberId,
         memberName: name,
         amount,
         fundId: form.fundId,
         fundName: fundName(form.fundId),
         payType: form.payType,
         checkNum: form.payType === 'Check' ? form.checkNum : undefined,
         note: form.note.trim() || undefined,
         taxDeductible: form.taxDeductible,
      };

      setGiftEntries((prev) => {
         if (editingId) return prev.map((e) => (e.id === editingId ? entry : e));
         return [...prev, entry];
      });
      setEditingId(null);
      setForm((f) => ({
         ...emptyForm(f.fundId || funds[0]?.id || ''),
         payType: f.payType,
         memberId: f.memberId,
         memberName: f.memberName,
      }));
      setToast(editingId ? 'Entry updated' : 'Entry saved');
   };

   const loosePlate = () => {
      if (isLocked) return;
      if (!funds[0]?.id && !form.fundId) {
         setToast('Create a fund in Fund Management first');
         return;
      }
      const fundId = form.fundId || funds[0].id;
      const amount = typeof form.amount === 'string' ? parseFloat(form.amount) : Number(form.amount);
      if (!amount || amount <= 0) {
         setToast('Enter the loose plate amount first');
         return;
      }
      setGiftEntries((prev) => [
         ...prev,
         {
            id: `e-${Date.now()}`,
            memberName: 'Loose Plate',
            amount,
            fundId,
            fundName: fundName(fundId),
            payType: 'Cash',
            taxDeductible: true,
            note: form.note.trim() || undefined,
         },
      ]);
      setForm((f) => ({ ...f, amount: '', note: '' }));
      setToast('Loose plate entry added');
   };

   const editEntry = (entry: GiftEntry) => {
      if (isLocked) return;
      setEditingId(entry.id);
      setForm({
         payType: entry.payType,
         memberId: entry.memberId,
         memberName: entry.memberName,
         checkNum: entry.checkNum || '',
         amount: entry.amount,
         fundId: entry.fundId,
         taxDeductible: entry.taxDeductible,
         note: entry.note || '',
      });
   };

   const deleteEntry = (id: string) => {
      if (isLocked) return;
      setGiftEntries((prev) => prev.filter((e) => e.id !== id));
      if (editingId === id) {
         setEditingId(null);
         setForm(emptyForm(funds[0]?.id || ''));
      }
   };

   const buildGivingTransactions = () =>
      giftEntries
         .filter((e) => e.amount > 0 && e.fundId)
         .map((e) => ({
            memberId: e.memberId,
            fundId: e.fundId,
            amount: e.amount,
            source: e.payType === 'Online' ? 'Online Giving' : e.payType,
            notes: [
               e.memberName && e.memberName !== 'Anonymous' ? `Donor: ${e.memberName}` : null,
               e.checkNum ? `Check #${e.checkNum}` : null,
               e.taxDeductible === false ? 'Non-deductible' : null,
               e.note,
            ]
               .filter(Boolean)
               .join(' · ') || undefined,
         }));

   const displayNotesForSave = () => {
      const batchLine = `Batch: ${batchName}`;
      const rest = notes.trim();
      return rest ? `${batchLine}\n${rest}` : batchLine;
   };

   const saveSession = async (finalize: boolean = false) => {
      setIsSaving(true);
      try {
         const url = '/api/vault?resource=finance&subResource=counting';
         const givingTransactions = buildGivingTransactions();
         const encodedNotes = encodeSessionNotes(displayNotesForSave(), giftEntries);
         const cashTotal = cashFromEntries || cashDenomTotal;
         const checksTotal = checksFromEntries;
         const digitalTotal = digitalFromEntries;
         const total = grandTotal;

         if (!sessionId) {
            const created = await apiFetch(url, {
               method: 'POST',
               userId,
               body: JSON.stringify({
                  date: batchDate,
                  leadCounter: userName || 'Staff',
                  name: batchName,
                  notes: encodedNotes,
               }),
            });
            if (!created.ok || !created.session) {
               alert('Save failed: ' + (created.error || 'unknown'));
               return;
            }
            setSessionId(created.session.id);
            setSessionRef(created.session.id.slice(0, 8).toUpperCase());

            const patched = await apiFetch(url, {
               method: 'PATCH',
               userId,
               body: JSON.stringify({
                  id: created.session.id,
                  status: finalize ? 'Locked' : 'Draft',
                  notes: encodedNotes,
                  cashTotal,
                  checksTotal,
                  digitalTotal,
                  grandTotal: total,
                  counts: cashCounts,
                  givingTransactions: finalize ? givingTransactions : undefined,
               }),
            });
            if (!patched.ok) {
               alert('Save failed: ' + patched.error);
               return;
            }
            if (finalize) setIsLocked(true);
            else setToast('Draft saved');
            return;
         }

         const data = await apiFetch(url, {
            method: 'PATCH',
            userId,
            body: JSON.stringify({
               id: sessionId,
               status: finalize ? 'Locked' : 'Draft',
               notes: encodedNotes,
               cashTotal,
               checksTotal,
               digitalTotal,
               grandTotal: total,
               counts: cashCounts,
               givingTransactions: finalize ? givingTransactions : undefined,
            }),
         });

         if (data.ok) {
            if (finalize) {
               setIsLocked(true);
               setToast('Session locked');
            } else {
               setToast('Draft saved');
            }
         } else {
            alert('Save failed: ' + data.error);
         }
      } catch (err) {
         console.error(err);
         alert('Error saving session');
      } finally {
         setIsSaving(false);
      }
   };

   const resetSession = () => {
      if (!window.confirm('Start a FRESH session? This will clear the current form.')) return;
      setSessionId(null);
      setIsLocked(false);
      setCashCounts({ '100': 0, '50': 0, '20': 0, '10': 0, '5': 0, '1': 0, 'coins': 0 });
      setGiftEntries([]);
      setNotes('');
      setBatchDate(new Date().toISOString().slice(0, 10));
      setBatchName("Today's Giving");
      setForm(emptyForm(funds[0]?.id || ''));
      setEditingId(null);
      setSessionRef(`NEW-${Date.now().toString().slice(-6)}`);
   };

   const canEdit = canPerform(userRole, 'finance.edit');
   const formatBatchDate = (iso: string) => {
      if (!iso || iso.length < 10) return '—';
      const [y, m, d] = iso.slice(0, 10).split('-');
      return `${m}/${d}/${y}`;
   };

   if (loading) {
      return (
         <ResponsivePage>
            <div className="flex items-center justify-center h-[50vh]">
               <Loader2 className="animate-spin text-gold" size={48} />
            </div>
         </ResponsivePage>
      );
   }

   return (
      <ResponsivePage>
         <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-6">
            <div className="space-y-3">
               <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-burgundy flex items-center justify-center text-gold shadow-lg shadow-burgundy/20">
                     <Calculator size={20} />
                  </div>
                  <div>
                     <span className="block text-xs font-bold text-gold uppercase tracking-widest">Contribution Entry</span>
                     <h1 className="text-3xl md:text-4xl font-black text-[#0d1a14] tracking-tight leading-none">
                        Counting Session<span className="text-gold">.</span>
                     </h1>
                  </div>
               </div>
               <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-semibold text-[#0d1a14]">
                  <span>Batch Date: <span className="text-burgundy">{formatBatchDate(batchDate)}</span></span>
                  <span>Batch #: <span className="text-burgundy">{batchNumber}</span></span>
                  <span className="truncate max-w-xs">Batch Name: <span className="text-burgundy">{batchName}</span></span>
               </div>
               <div className="flex items-center gap-6 text-xs text-gray-400 font-medium">
                  <span className="flex items-center gap-1.5"><User size={14} /> Lead: {userName}</span>
                  <span className="flex items-center gap-1.5"><Clock size={14} /> Ref: #{sessionRef}</span>
               </div>
            </div>

            <div className="flex flex-wrap gap-3">
               {isLocked ? (
                  <button
                     type="button"
                     onClick={resetSession}
                     className="min-h-[44px] px-6 rounded-xl bg-white border border-gray-100 text-sm font-bold text-gray-500 hover:text-burgundy"
                  >
                     Start New Session
                  </button>
               ) : (
                  <>
                     <button
                        type="button"
                        onClick={() => saveSession(false)}
                        disabled={!canEdit || isSaving}
                        className="min-h-[44px] px-5 rounded-xl bg-white border border-gray-200 text-sm font-bold text-gray-600 hover:border-gold disabled:opacity-50"
                     >
                        {isSaving ? 'Saving…' : 'Save Draft'}
                     </button>
                     <button
                        type="button"
                        onClick={() => {
                           if (window.confirm('Finalize this session? This posts gifts to the ledger and locks the batch.')) {
                              saveSession(true);
                           }
                        }}
                        disabled={isSaving || grandTotal === 0 || !canEdit}
                        className="min-h-[44px] px-6 rounded-xl bg-burgundy text-gold text-sm font-bold hover:bg-burgundy-dark disabled:opacity-50 inline-flex items-center gap-2"
                     >
                        {isSaving ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                        Finalize & Lock
                     </button>
                  </>
               )}
            </div>
         </div>

         <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 items-start">
            <div className="xl:col-span-2 space-y-6">
               {/* Gift Entry */}
               <div className={`bg-white rounded-[1.75rem] border border-gray-100 shadow-sm overflow-hidden ${isLocked ? 'opacity-90' : ''}`}>
                  <div className="px-5 md:px-6 py-4 border-b border-gray-50 bg-[#F9F9F7] flex items-center justify-between gap-3">
                     <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-white border border-gold/20 text-burgundy flex items-center justify-center">
                           <Layers size={20} />
                        </div>
                        <div>
                           <h2 className="text-lg font-black text-[#0d1a14]">Gift Entry</h2>
                           <p className="text-sm text-gray-400">Name → Amount → Account → Save Entry</p>
                        </div>
                     </div>
                     {editingId && (
                        <span className="text-xs font-bold text-burgundy bg-burgundy/5 px-3 py-1.5 rounded-lg">Editing</span>
                     )}
                  </div>

                  <div className="p-5 md:p-6 space-y-5">
                     <div className="flex flex-wrap gap-2">
                        {!isLocked && (
                           <>
                              <button
                                 type="button"
                                 onClick={saveGiftEntry}
                                 className="min-h-[44px] px-5 rounded-xl bg-burgundy text-gold text-sm font-bold hover:bg-burgundy-dark inline-flex items-center gap-2"
                              >
                                 <Plus size={16} /> {editingId ? 'Update Entry' : 'Save Entry'}
                              </button>
                              <button
                                 type="button"
                                 onClick={() => {
                                    setEditingId(null);
                                    setForm((f) => ({
                                       ...emptyForm(f.fundId || funds[0]?.id || ''),
                                       payType: f.payType,
                                    }));
                                 }}
                                 className="min-h-[44px] px-4 rounded-xl border border-gray-200 text-sm font-bold text-gray-500 hover:bg-gray-50"
                              >
                                 Clear Entry
                              </button>
                              <button
                                 type="button"
                                 onClick={loosePlate}
                                 className="min-h-[44px] px-4 rounded-xl border border-gold/30 bg-gold-cream/40 text-sm font-bold text-[#0d1a14] hover:bg-gold-cream"
                              >
                                 Loose Plate
                              </button>
                           </>
                        )}
                     </div>

                     <fieldset disabled={isLocked} className="space-y-2">
                        <legend className="text-xs font-bold text-gray-400 mb-2">Payment type</legend>
                        <div className="flex flex-wrap gap-2">
                           {PAY_TYPES.map((pt) => (
                              <label
                                 key={pt}
                                 className={`inline-flex items-center gap-2 min-h-[44px] px-4 rounded-xl border cursor-pointer text-sm font-semibold ${
                                    form.payType === pt
                                       ? 'border-burgundy bg-burgundy/5 text-burgundy'
                                       : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                                 }`}
                              >
                                 <input
                                    type="radio"
                                    name="payType"
                                    className="accent-burgundy"
                                    checked={form.payType === pt}
                                    onChange={() => setForm((f) => ({ ...f, payType: pt }))}
                                 />
                                 {pt}
                              </label>
                           ))}
                        </div>
                     </fieldset>

                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <label className="block space-y-1.5">
                           <span className="text-xs font-bold text-gray-400">Name / Env #</span>
                           <MemberSearchInput
                              disabled={isLocked}
                              value={form.memberName}
                              onSelect={(m) => {
                                 setForm((f) => ({
                                    ...f,
                                    memberId: m.id,
                                    memberName: `${m.first_name} ${m.last_name}`.trim(),
                                 }));
                              }}
                              onChangeText={(text) => {
                                 setForm((f) => ({ ...f, memberName: text, memberId: undefined }));
                              }}
                              placeholder="Start typing a name…"
                           />
                        </label>
                        {form.payType === 'Check' && (
                           <label className="block space-y-1.5">
                              <span className="text-xs font-bold text-gray-400">Check #</span>
                              <div className="relative">
                                 <Hash size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
                                 <input
                                    type="text"
                                    disabled={isLocked}
                                    value={form.checkNum}
                                    onChange={(e) => setForm((f) => ({ ...f, checkNum: e.target.value }))}
                                    className="w-full min-h-[44px] pl-10 pr-3 rounded-xl bg-gray-50 border border-transparent focus:bg-white focus:border-gold outline-none text-sm font-semibold text-[#0d1a14]"
                                 />
                              </div>
                           </label>
                        )}
                     </div>

                     <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <label className="block space-y-1.5">
                           <span className="text-xs font-bold text-gray-400">Amount</span>
                           <div className="relative">
                              <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gold" />
                              <input
                                 type="number"
                                 step="0.01"
                                 disabled={isLocked}
                                 value={form.amount}
                                 onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                                 placeholder="0.00"
                                 className="w-full min-h-[44px] pl-10 pr-3 rounded-xl bg-gray-50 border border-transparent focus:bg-white focus:border-gold outline-none text-base font-bold text-[#0d1a14]"
                              />
                           </div>
                        </label>
                        <label className="block space-y-1.5 md:col-span-2">
                           <span className="text-xs font-bold text-gray-400">Account / Fund</span>
                           <select
                              disabled={isLocked}
                              value={form.fundId}
                              onChange={(e) => setForm((f) => ({ ...f, fundId: e.target.value }))}
                              className="w-full min-h-[44px] px-3 rounded-xl bg-gray-50 border border-transparent focus:bg-white focus:border-gold outline-none text-sm font-semibold text-[#0d1a14]"
                           >
                              <option value="">Select account</option>
                              {funds.map((f) => (
                                 <option key={f.id} value={f.id}>{f.name}</option>
                              ))}
                           </select>
                           {funds.length === 0 && (
                              <p className="text-xs text-amber-700 mt-1">No funds yet — add them in Fund Management (Accounts).</p>
                           )}
                        </label>
                     </div>

                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                        <label className="block space-y-1.5">
                           <span className="text-xs font-bold text-gray-400">Note</span>
                           <input
                              type="text"
                              disabled={isLocked}
                              value={form.note}
                              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                              className="w-full min-h-[44px] px-3 rounded-xl bg-gray-50 border border-transparent focus:bg-white focus:border-gold outline-none text-sm font-medium text-[#0d1a14]"
                           />
                        </label>
                        <label className="inline-flex items-center gap-3 min-h-[44px] text-sm font-semibold text-[#0d1a14] cursor-pointer">
                           <input
                              type="checkbox"
                              disabled={isLocked}
                              checked={form.taxDeductible}
                              onChange={(e) => setForm((f) => ({ ...f, taxDeductible: e.target.checked }))}
                              className="w-5 h-5 rounded border-gray-300 text-burgundy focus:ring-burgundy"
                           />
                           Tax deductible
                        </label>
                     </div>
                  </div>
               </div>

               {/* Entry Log */}
               <div className="bg-white rounded-[1.75rem] border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-5 md:px-6 py-4 border-b border-gray-50 flex flex-wrap items-center justify-between gap-3">
                     <h3 className="text-lg font-black text-[#0d1a14]">Entry Log</h3>
                     <p className="text-sm font-bold text-burgundy">
                        Total entered: {formatCurrency(entriesTotal)}
                     </p>
                  </div>

                  {/* Mobile cards */}
                  <div className="md:hidden space-y-3 p-4">
                     {giftEntries.length === 0 ? (
                        <p className="text-center text-gray-400 text-sm py-10">No entries yet — save a gift above.</p>
                     ) : (
                        giftEntries.map((e) => (
                           <div key={e.id} className="rounded-2xl border border-gray-100 p-4">
                              <div className="flex justify-between gap-3">
                                 <div className="min-w-0">
                                    <p className="font-bold text-[#0d1a14] truncate">{e.memberName}</p>
                                    <p className="text-sm text-gray-400">{e.fundName} · {e.payType}</p>
                                 </div>
                                 <p className="font-black text-burgundy tabular-nums">{formatCurrency(e.amount)}</p>
                              </div>
                              {!isLocked && (
                                 <div className="flex gap-2 mt-3">
                                    <button type="button" onClick={() => editEntry(e)} className="min-h-[44px] px-3 rounded-xl bg-gray-50 text-sm font-bold text-gray-600 inline-flex items-center gap-1">
                                       <Pencil size={14} /> Edit
                                    </button>
                                    <button type="button" onClick={() => deleteEntry(e.id)} className="min-h-[44px] px-3 rounded-xl bg-rose-50 text-sm font-bold text-rose-600 inline-flex items-center gap-1">
                                       <Trash2 size={14} /> Delete
                                    </button>
                                 </div>
                              )}
                           </div>
                        ))
                     )}
                  </div>

                  <div className="hidden md:block overflow-x-auto">
                     <table className="w-full min-w-[640px] text-sm text-left">
                        <thead>
                           <tr className="bg-[#F9F9F7] text-xs font-bold text-gray-400 border-b border-gray-100">
                              <th className="px-4 py-3">Name</th>
                              <th className="px-4 py-3">Account</th>
                              <th className="px-4 py-3">Pay type</th>
                              <th className="px-4 py-3">Check #</th>
                              <th className="px-4 py-3 text-right">Amount</th>
                              <th className="px-4 py-3">Note</th>
                              {!isLocked && <th className="px-4 py-3 w-24" />}
                           </tr>
                        </thead>
                        <tbody>
                           {giftEntries.length === 0 ? (
                              <tr>
                                 <td colSpan={7} className="px-4 py-14 text-center text-gray-400">
                                    No entries yet — save a gift above.
                                 </td>
                              </tr>
                           ) : (
                              giftEntries.map((e, i) => (
                                 <tr key={e.id} className={`border-b border-gray-50 ${i % 2 === 0 ? 'bg-white' : 'bg-[#fcfcfc]'}`}>
                                    <td className="px-4 py-3 font-semibold text-[#0d1a14]">{e.memberName}</td>
                                    <td className="px-4 py-3 text-gray-600">{e.fundName}</td>
                                    <td className="px-4 py-3 text-gray-600">{e.payType}</td>
                                    <td className="px-4 py-3 text-gray-400">{e.checkNum || '—'}</td>
                                    <td className="px-4 py-3 text-right font-black text-burgundy tabular-nums">{formatCurrency(e.amount)}</td>
                                    <td className="px-4 py-3 text-gray-400 truncate max-w-[140px]">{e.note || '—'}</td>
                                    {!isLocked && (
                                       <td className="px-4 py-3">
                                          <div className="flex gap-1 justify-end">
                                             <button type="button" onClick={() => editEntry(e)} className="p-2.5 min-h-[44px] min-w-[44px] rounded-lg hover:bg-gray-50 text-gray-400 hover:text-burgundy" aria-label="Edit">
                                                <Pencil size={16} />
                                             </button>
                                             <button type="button" onClick={() => deleteEntry(e.id)} className="p-2.5 min-h-[44px] min-w-[44px] rounded-lg hover:bg-rose-50 text-gray-400 hover:text-rose-600" aria-label="Delete">
                                                <Trash2 size={16} />
                                             </button>
                                          </div>
                                       </td>
                                    )}
                                 </tr>
                              ))
                           )}
                        </tbody>
                     </table>
                  </div>
               </div>

               {/* Cash calculator — secondary */}
               <div className="bg-white rounded-[1.75rem] border border-gray-100 shadow-sm overflow-hidden">
                  <button
                     type="button"
                     onClick={() => setCashOpen((o) => !o)}
                     className="w-full px-5 md:px-6 py-4 flex items-center justify-between gap-3 text-left hover:bg-[#F9F9F7]/80"
                  >
                     <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gold-cream/60 text-burgundy flex items-center justify-center">
                           <Banknote size={20} />
                        </div>
                        <div>
                           <h3 className="text-base font-black text-[#0d1a14]">Cash calculator</h3>
                           <p className="text-sm text-gray-400">Denomination aid · {formatCurrency(cashDenomTotal)}</p>
                        </div>
                     </div>
                     <ChevronDown size={20} className={`text-gray-400 transition-transform ${cashOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {cashOpen && (
                     <div className="px-5 md:px-6 pb-6 border-t border-gray-50">
                        <p className="text-sm text-gray-500 py-3">
                           Count bills here for reconciliation. Use <strong>Loose Plate</strong> or Gift Entry to record cash gifts with an account.
                        </p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                           {['100', '50', '20', '10', '5', '1'].map((denom) => (
                              <label key={denom} className="block space-y-1.5">
                                 <span className="text-xs font-bold text-gray-400">${denom} bills</span>
                                 <input
                                    type="number"
                                    disabled={isLocked}
                                    value={cashCounts[denom] || ''}
                                    onChange={(e) => handleCashChange(denom, e.target.value)}
                                    placeholder="0"
                                    className="w-full min-h-[44px] px-3 rounded-xl bg-gray-50 text-center font-bold text-[#0d1a14] outline-none focus:bg-white focus:ring-2 focus:ring-burgundy/20"
                                 />
                              </label>
                           ))}
                           <label className="block space-y-1.5 col-span-2">
                              <span className="text-xs font-bold text-gray-400">Loose coins & other</span>
                              <div className="relative">
                                 <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gold" />
                                 <input
                                    type="number"
                                    step="0.01"
                                    disabled={isLocked}
                                    value={cashCounts.coins || ''}
                                    onChange={(e) => handleCashChange('coins', e.target.value)}
                                    placeholder="0.00"
                                    className="w-full min-h-[44px] pl-10 pr-3 rounded-xl bg-gray-50 font-bold text-[#0d1a14] outline-none focus:bg-white focus:ring-2 focus:ring-burgundy/20"
                                 />
                              </div>
                           </label>
                        </div>
                     </div>
                  )}
               </div>
            </div>

            {/* Summary */}
            <div className="space-y-6 sticky top-8">
               <div className="bg-white rounded-[1.75rem] border border-gray-100 p-6 md:p-8 shadow-sm">
                  <h3 className="text-lg font-black text-[#0d1a14] mb-6">Session Summary</h3>
                  <div className="space-y-4">
                     <SummaryRow label="Gift entries" value={entriesTotal} icon={<Layers size={16} />} />
                     <SummaryRow label="Cash (entries)" value={cashFromEntries} icon={<Banknote size={16} />} />
                     <SummaryRow label="Checks" value={checksFromEntries} icon={<DollarSign size={16} />} />
                     <SummaryRow label="Card / Online / Other" value={digitalFromEntries} icon={<DollarSign size={16} />} />
                     {cashDenomTotal > 0 && (
                        <SummaryRow label="Cash calculator" value={cashDenomTotal} icon={<Calculator size={16} />} />
                     )}
                     <div className="pt-4 border-t border-gray-100 flex justify-between items-end">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Grand total</p>
                        <p className="text-3xl font-black text-burgundy">{formatCurrency(grandTotal)}</p>
                     </div>
                     <label className="block space-y-2 pt-2">
                        <span className="text-xs font-bold text-gray-400">Session notes</span>
                        <textarea
                           rows={4}
                           disabled={isLocked}
                           value={notes}
                           onChange={(e) => setNotes(e.target.value)}
                           placeholder="Variances or special instructions…"
                           className="w-full p-4 rounded-2xl bg-gray-50 text-sm text-gray-600 outline-none focus:bg-white focus:ring-2 focus:ring-burgundy/20 resize-none"
                        />
                     </label>
                     {isLocked ? (
                        <div className="flex flex-col items-center gap-3 pt-4">
                           <div className="w-14 h-14 rounded-full bg-green-500 text-white flex items-center justify-center">
                              <CheckCircle2 size={28} />
                           </div>
                           <p className="text-sm font-black text-green-600">Session Locked</p>
                           <p className="text-xs text-gray-400">Ref: #{sessionRef}</p>
                        </div>
                     ) : (
                        <div className="bg-gold-cream/40 p-4 rounded-2xl border border-gold/10 flex items-start gap-3">
                           <Info size={16} className="text-gold shrink-0 mt-0.5" />
                           <p className="text-sm text-gray-600">
                              Finalize posts {formatCurrency(grandTotal)} to the ledger and locks this batch. Save Draft anytime to keep your entry log.
                           </p>
                        </div>
                     )}
                  </div>
               </div>
            </div>
         </div>

         {toast && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-5 py-3 rounded-2xl bg-[#0d1a14] text-gold text-sm font-bold shadow-xl">
               {toast}
            </div>
         )}
      </ResponsivePage>
   );
};

const MemberSearchInput: React.FC<{
   disabled?: boolean;
   onSelect: (member: any) => void;
   onChangeText?: (text: string) => void;
   value: string;
   placeholder?: string;
}> = ({ disabled, onSelect, onChangeText, value, placeholder }) => {
   const [search, setSearch] = useState(value);
   const [results, setResults] = useState<any[]>([]);
   const [isSearching, setIsSearching] = useState(false);
   const [isOpen, setIsOpen] = useState(false);
   const wrapperRef = useRef<HTMLDivElement>(null);

   useEffect(() => {
      setSearch(value);
   }, [value]);

   useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
         if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
            setIsOpen(false);
         }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
   }, []);

   useEffect(() => {
      const performSearch = async () => {
         if (!search || search.length < 2) {
            setResults([]);
            return;
         }
         setIsSearching(true);
         try {
            const res = await fetch(`/api/vault?resource=people&query=${encodeURIComponent(search)}`);
            const data = await res.json();
            if (data.ok) {
               setResults(data.members || []);
               setIsOpen(true);
            }
         } catch (e) {
            console.error(e);
         } finally {
            setIsSearching(false);
         }
      };
      const t = setTimeout(performSearch, 300);
      return () => clearTimeout(t);
   }, [search]);

   return (
      <div className="relative" ref={wrapperRef}>
         <input
            type="text"
            disabled={disabled}
            value={search}
            onChange={(e) => {
               setSearch(e.target.value);
               onChangeText?.(e.target.value);
               setIsOpen(true);
            }}
            placeholder={placeholder || 'Search Member…'}
            className="w-full min-h-[44px] px-4 rounded-xl bg-gray-50 border border-transparent focus:bg-white focus:border-gold outline-none font-semibold text-[#0d1a14] text-sm"
         />
         {isOpen && (results.length > 0 || isSearching) && (
            <div className="absolute z-50 left-0 right-0 mt-2 bg-white border border-gray-100 rounded-xl shadow-2xl max-h-60 overflow-y-auto">
               {isSearching ? (
                  <div className="p-4 text-center">
                     <Loader2 size={20} className="animate-spin text-gold mx-auto" />
                  </div>
               ) : (
                  results.map((m) => (
                     <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                           onSelect(m);
                           setSearch(`${m.first_name} ${m.last_name}`);
                           setIsOpen(false);
                        }}
                        className="w-full p-4 text-left hover:bg-gold-cream/20 flex items-center gap-3 border-b last:border-0 border-gray-50 min-h-[44px]"
                     >
                        <div className="w-8 h-8 rounded-full bg-burgundy/5 text-burgundy flex items-center justify-center font-bold text-xs">
                           {m.first_name?.[0] || '?'}
                        </div>
                        <div>
                           <p className="font-bold text-[#0d1a14] text-sm">{m.first_name} {m.last_name}</p>
                           <p className="text-xs text-gray-400">{formatAccountContact(m.email, m.phone) || m.email}</p>
                        </div>
                     </button>
                  ))
               )}
            </div>
         )}
      </div>
   );
};

const SummaryRow = ({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) => (
   <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
         <div className="text-gray-300">{icon}</div>
         <span className="text-sm font-semibold text-gray-500">{label}</span>
      </div>
      <span className="text-sm font-black text-[#0d1a14]">{formatCurrency(value)}</span>
   </div>
);

export default CountingSessionPage;
