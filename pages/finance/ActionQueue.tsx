import React, { useState, useEffect } from 'react';
import {
   ClipboardCheck, Clock, CheckCircle2, XCircle,
   User, ShieldCheck, Loader2, History, Eye, EyeOff
} from 'lucide-react';
import ResponsivePage from '../../components/Layout/ResponsivePage';
import { formatCurrency } from '../../utils/formatters';
import { useNav } from '../../App';
import { getAuthHeaders } from '../../lib/api';

interface QueueItem {
   id: string;
   type: 'Expense' | 'Session' | 'Ledger';
   desc: string;
   requester: string;
   amount: number;
   date: string;
   raw: any;
}

interface AuditEntry {
   id: string;
   created_at: string;
   action: string;
   user_id: string | null;
   details: string | null;
   resource_type: string | null;
   resource_id: string | null;
   severity: string;
   // joined
   user_name?: string;
}

// Roles that can see the activity log
const CAN_SEE_LOG = ['SUPER_ADMIN', 'ADMIN', 'PASTOR'];

const ActionQueuePage: React.FC = () => {
   const { userRole, userId, userName } = useNav();
   const [items, setItems] = useState<QueueItem[]>([]);
   const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
   const [loading, setLoading] = useState(true);
   const [logLoading, setLogLoading] = useState(false);
   const [showLog, setShowLog] = useState(false);

   const canSeeLog = CAN_SEE_LOG.includes(userRole as string);

   const getHeaders = async (): Promise<HeadersInit> => getAuthHeaders(undefined, userId);

   useEffect(() => { fetchQueue(); }, []);

   useEffect(() => {
      if (canSeeLog && showLog) fetchAuditLog();
   }, [showLog, canSeeLog]);

   const fetchQueue = async () => {
      setLoading(true);
      try {
         const h = await getHeaders();
         const [expRes, sessRes, ledRes] = await Promise.all([
            fetch('/api/vault?resource=finance&subResource=expenses&status=Pending', { headers: h }),
            fetch('/api/vault?resource=finance&subResource=counting&status=Draft', { headers: h }),
            fetch('/api/vault?resource=finance&subResource=ledger&status=Draft', { headers: h })
         ]);

         const expData = await expRes.json();
         const sessData = await sessRes.json();
         const ledData = await ledRes.json();

         const all: QueueItem[] = [];

         if (expData.ok) {
            expData.expenses?.forEach((e: any) => all.push({
               id: e.id, type: 'Expense',
               desc: `${e.vendor} — ${e.category || 'Expense'}`,
               requester: e.requester_name || 'Unknown',
               amount: e.amount,
               date: e.created_at?.split('T')[0] || '',
               raw: e
            }));
         }
         if (sessData.ok) {
            sessData.sessions?.forEach((s: any) => all.push({
               id: s.id, type: 'Session',
               desc: `Counting Session — ${s.session_date}`,
               requester: s.lead_counter_name || 'Treasury',
               amount: s.grand_total || 0,
               date: s.session_date || '',
               raw: s
            }));
         }
         if (ledData.ok) {
            ledData.entries?.forEach((l: any) => all.push({
               id: l.id, type: 'Ledger',
               desc: `Draft Entry: ${l.description}`,
               requester: 'Finance Team',
               amount: l.amount || 0,
               date: l.transaction_date || '',
               raw: l
            }));
         }

         setItems(all.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      } catch (err) {
         console.error(err);
      } finally {
         setLoading(false);
      }
   };

   const fetchAuditLog = async () => {
      setLogLoading(true);
      try {
         const h = await getHeaders();
         // Fetch recent finance-related audit logs
         const res = await fetch('/api/vault?resource=community&subResource=audit&limit=50', { headers: h });
         const data = await res.json();
         // audit GET returns array directly (no ok wrapper)
         const logs = Array.isArray(data) ? data : (data.ok ? data.logs : []);
         if (logs) {
            // Only show Authorized/Rejected actions from the Action Queue
            const financeActions = logs.filter((l: AuditEntry) =>
               l.action?.includes('Authorized') || l.action?.includes('Rejected')
            );
            setAuditLog(financeActions);
         }
      } catch (err) {
         console.error(err);
      } finally {
         setLogLoading(false);
      }
   };

   const logAction = async (action: string, item: QueueItem, outcome: 'Authorized' | 'Rejected') => {
      try {
         const h = await getHeaders();
         await fetch('/api/vault?resource=community&subResource=audit', {
            method: 'POST',
            headers: h,
            body: JSON.stringify({
               action: `${outcome}: ${item.type} — ${item.desc}`,
               details: JSON.stringify({
                  itemId: item.id,
                  type: item.type,
                  amount: item.amount,
                  requester: item.requester,
                  outcome,
                  authorizedBy: userName,
                  authorizedById: userId
               }),
               resource_type: item.type.toLowerCase(),
               resource_id: item.id,
               severity: outcome === 'Authorized' ? 'info' : 'warning',
               user_id: userId || null
            })
         });
      } catch (e) {
         console.error('Audit log failed:', e);
      }
   };

   const authorizeItem = async (item: QueueItem) => {
      try {
         const h = await getHeaders();
         let url = '';
         let body: any = {};

         if (item.type === 'Expense') {
            url = '/api/vault?resource=finance&subResource=expenses';
            body = { id: item.id, status: 'Approved' };
         } else if (item.type === 'Session') {
            window.location.hash = '#/finance/counting';
            return;
         } else if (item.type === 'Ledger') {
            url = '/api/vault?resource=finance&subResource=ledger';
            body = { id: item.id, status: 'Finalized' };
         }

         if (url) {
            const res = await fetch(url, { method: 'PATCH', headers: h, body: JSON.stringify(body) });
            if (res.ok) {
               await logAction('Authorize', item, 'Authorized');
               setItems(prev => prev.filter(i => i.id !== item.id));
               // Refresh log if visible
               if (showLog && canSeeLog) fetchAuditLog();
            }
         }
      } catch (err) {
         console.error(err);
      }
   };

   const rejectItem = async (item: QueueItem) => {
      if (!window.confirm(`Reject "${item.desc}"?`)) return;
      try {
         const h = await getHeaders();
         let url = '';
         let body: any = {};

         if (item.type === 'Expense') {
            url = '/api/vault?resource=finance&subResource=expenses';
            body = { id: item.id, status: 'Rejected' };
         } else if (item.type === 'Ledger') {
            url = '/api/vault?resource=finance&subResource=ledger';
            body = { id: item.id, status: 'Draft' }; // keep as draft, don't finalize
         }

         if (url) {
            const res = await fetch(url, { method: 'PATCH', headers: h, body: JSON.stringify(body) });
            if (res.ok) {
               await logAction('Reject', item, 'Rejected');
               setItems(prev => prev.filter(i => i.id !== item.id));
               if (showLog && canSeeLog) fetchAuditLog();
            }
         } else {
            // For sessions just log it
            await logAction('Reject', item, 'Rejected');
            setItems(prev => prev.filter(i => i.id !== item.id));
         }
      } catch (err) {
         console.error(err);
      }
   };

   return (
      <ResponsivePage>
         {/* Header */}
         <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
               <div className="flex items-center gap-2 mb-2">
                  <ClipboardCheck size={14} className="text-gold" />
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Integrity Check</span>
               </div>
               <h1 className="text-3xl md:text-4xl font-extrabold text-[#0d1a14] mb-1 tracking-tight">Action Queue</h1>
               <p className="text-gray-400 font-medium text-sm">Review and authorize pending financial items.</p>
            </div>
            <div className="flex items-center gap-3">
               <span className="px-4 py-2 bg-white border border-gray-100 rounded-xl text-xs font-black text-burgundy shadow-sm uppercase tracking-widest">
                  {items.length} Pending
               </span>
               {/* Activity Log toggle — only for SUPER_ADMIN, ADMIN, PASTOR */}
               {canSeeLog && (
                  <button
                     onClick={() => setShowLog(v => !v)}
                     className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest border transition-all shadow-sm ${showLog ? 'bg-burgundy text-gold border-burgundy' : 'bg-white text-gray-400 border-gray-100 hover:text-burgundy hover:border-burgundy/20'}`}
                  >
                     {showLog ? <EyeOff size={14} /> : <Eye size={14} />}
                     Activity Log
                  </button>
               )}
            </div>
         </div>

         {/* Queue */}
         {loading ? (
            <div className="flex justify-center p-20">
               <Loader2 className="animate-spin text-gold" size={40} />
            </div>
         ) : (
            <div className="grid grid-cols-1 gap-4 max-w-4xl">
               {items.length === 0 && (
                  <div className="p-10 text-center text-gray-400 font-bold bg-gray-50 rounded-[2rem] border border-dashed border-gray-200">
                     <CheckCircle2 size={32} className="mx-auto text-gray-200 mb-3" />
                     All caught up — queue is empty.
                  </div>
               )}
               {items.map(item => (
                  <div key={item.id} className="bg-white p-5 md:p-7 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-5 group hover:shadow-md transition-all border-l-4 border-l-gold">
                     <div className="flex items-center gap-4">
                        <div className="w-11 h-11 rounded-xl bg-burgundy/5 text-burgundy flex items-center justify-center shrink-0 shadow-inner">
                           <Clock size={20} />
                        </div>
                        <div>
                           <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <h3 className="text-sm font-black text-[#0d1a14] leading-none">{item.desc}</h3>
                              <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded border ${
                                 item.type === 'Expense' ? 'bg-orange-50 text-orange-400 border-orange-100' :
                                 item.type === 'Session' ? 'bg-blue-50 text-blue-400 border-blue-100' :
                                 'bg-gray-50 text-gray-400 border-gray-100'
                              }`}>{item.type}</span>
                           </div>
                           <div className="flex items-center gap-2 text-[10px] font-bold text-gray-300 uppercase tracking-widest flex-wrap">
                              <User size={10} className="text-gold" />
                              <span className="text-gold">{item.requester}</span>
                              <span className="w-1 h-1 bg-gray-200 rounded-full" />
                              <span>{item.date}</span>
                           </div>
                        </div>
                     </div>

                     <div className="flex items-center justify-between md:justify-end gap-6">
                        <p className="text-lg font-black text-burgundy">{formatCurrency(item.amount)}</p>
                        <div className="flex gap-2">
                           <button
                              onClick={() => rejectItem(item)}
                              className="p-2.5 bg-red-50 text-red-400 rounded-xl hover:bg-red-500 hover:text-white transition-all active:scale-90 shadow-sm"
                              title="Reject"
                           >
                              <XCircle size={18} />
                           </button>
                           <button
                              onClick={() => authorizeItem(item)}
                              className="flex items-center gap-2 px-5 py-2.5 bg-burgundy text-gold rounded-xl font-black text-[10px] uppercase tracking-widest shadow-md hover:bg-burgundy-dark transition-all active:scale-95 border-b-2 border-gold/30"
                           >
                              <CheckCircle2 size={15} />
                              {item.type === 'Session' ? 'Review' : 'Authorize'}
                           </button>
                        </div>
                     </div>
                  </div>
               ))}
            </div>
         )}

         {/* Activity Log — SUPER_ADMIN, ADMIN, PASTOR only */}
         {canSeeLog && showLog && (
            <div className="max-w-4xl space-y-4">
               <div className="flex items-center gap-3 pt-4 border-t border-gray-100">
                  <History size={16} className="text-burgundy" />
                  <h2 className="text-sm font-black text-[#0d1a14] uppercase tracking-widest">Activity Log</h2>
                  <span className="text-[9px] font-black text-burgundy bg-burgundy/5 px-2 py-1 rounded-lg border border-burgundy/10 uppercase tracking-widest">
                     Visible to Admins & Pastors only
                  </span>
               </div>

               {logLoading ? (
                  <div className="flex justify-center py-10">
                     <Loader2 size={24} className="animate-spin text-gold/50" />
                  </div>
               ) : auditLog.length === 0 ? (
                  <div className="p-8 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                     <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">No activity recorded yet</p>
                     <p className="text-xs text-gray-400 font-medium mt-1">Actions taken on this queue will appear here.</p>
                  </div>
               ) : (
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                     <table className="w-full text-left">
                        <thead>
                           <tr className="bg-gray-50 border-b border-gray-100">
                              <th className="px-5 py-3 text-[9px] font-black text-gray-400 uppercase tracking-widest">Who</th>
                              <th className="px-5 py-3 text-[9px] font-black text-gray-400 uppercase tracking-widest">Action</th>
                              <th className="px-5 py-3 text-[9px] font-black text-gray-400 uppercase tracking-widest">When</th>
                              <th className="px-5 py-3 text-[9px] font-black text-gray-400 uppercase tracking-widest">Outcome</th>
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                           {auditLog.map(log => {
                              const details = (() => { try { return JSON.parse(log.details || '{}'); } catch { return {}; } })();
                              const isAuthorized = log.action?.includes('Authorized');
                              const isRejected = log.action?.includes('Rejected');
                              // Priority: authorizedBy in details → joined user name → user_id short → Unknown
                              const who = details.authorizedBy
                                 || (log as any).user?.name
                                 || (log.user_id ? `User ${log.user_id.slice(0, 8)}` : 'System');
                              return (
                                 <tr key={log.id} className="hover:bg-gray-50/50 transition-colors">
                                    <td className="px-5 py-4">
                                       <div className="flex items-center gap-2">
                                          <div className="w-7 h-7 rounded-lg bg-burgundy text-gold flex items-center justify-center font-black text-[10px] shrink-0 shadow-sm">
                                             {who.charAt(0).toUpperCase()}
                                          </div>
                                          <span className="text-xs font-black text-[#0d1a14]">{who}</span>
                                       </div>
                                    </td>
                                    <td className="px-5 py-4">
                                       <p className="text-xs font-bold text-gray-600 max-w-xs truncate">{log.action}</p>
                                       {details.amount && (
                                          <p className="text-[10px] text-gray-400 font-medium mt-0.5">{formatCurrency(details.amount)}</p>
                                       )}
                                    </td>
                                    <td className="px-5 py-4">
                                       <span className="text-[10px] font-bold text-gray-400">
                                          {new Date(log.created_at).toLocaleDateString()} {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                       </span>
                                    </td>
                                    <td className="px-5 py-4">
                                       <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${
                                          isAuthorized ? 'bg-green-50 text-green-600 border-green-100' :
                                          isRejected ? 'bg-red-50 text-red-500 border-red-100' :
                                          'bg-gray-50 text-gray-400 border-gray-100'
                                       }`}>
                                          {isAuthorized ? <CheckCircle2 size={9} /> : isRejected ? <XCircle size={9} /> : <Clock size={9} />}
                                          {isAuthorized ? 'Authorized' : isRejected ? 'Rejected' : 'Logged'}
                                       </span>
                                    </td>
                                 </tr>
                              );
                           })}
                        </tbody>
                     </table>
                  </div>
               )}
            </div>
         )}
      </ResponsivePage>
   );
};

export default ActionQueuePage;
