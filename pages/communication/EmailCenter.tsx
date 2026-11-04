import React, { useState, useEffect } from 'react';
import {
  Mail, Send, Inbox, History, Search, Filter, RefreshCw,
  ChevronRight, MoreVertical, User, MessageSquare,
  CheckCircle2, AlertCircle, Clock, Trash2, Archive,
  ArrowLeft, ShieldCheck, Loader2, X, Plus, Info, Star,
  Users, UserCheck, Shield, Heart, Zap, Briefcase, GraduationCap
} from 'lucide-react';
import ResponsivePage from '../../components/Layout/ResponsivePage';
import { useNav } from '../../App';
import { Role } from '../../types';

type Tab = 'inbox' | 'compose' | 'history';

interface Audience {
  id: string;
  label: string;
  description: string;
  count: number;
  icon: React.ReactNode;
}

const AUDIENCES: Audience[] = [
  { id: 'all_active', label: 'All Active Members', description: 'Complete verified congregation', count: 2410, icon: <Users size={18} /> },
  { id: 'pastoral', label: 'Pastoral Team', description: 'Executive spiritual leadership', count: 8, icon: <Shield size={18} /> },
  { id: 'women', label: 'Women’s Ministry', description: 'Daughters of Grace members', count: 420, icon: <Heart size={18} /> },
  { id: 'men', label: 'Men’s Ministry', description: 'Men of Valor members', count: 385, icon: <Zap size={18} /> },
  { id: 'teen', label: 'Teen Ministry', description: 'Ages 13-18 student group', count: 112, icon: <GraduationCap size={18} /> },
  { id: 'youth', label: 'Youth Ministry', description: 'Elementary & Middle school', count: 245, icon: <Star size={18} /> },
  { id: 'worship', label: 'Worship Team', description: 'Musicians, vocalists & tech', count: 34, icon: <Star size={18} /> },
  { id: 'ushers', label: 'Ushers Team', description: 'Service hosting & seating', count: 22, icon: <UserCheck size={18} /> },
  { id: 'outreach', label: 'Outreach Team', description: 'Community missions & evangelism', count: 45, icon: <Plus size={18} /> },
  { id: 'security', label: 'Security Team', description: 'Campus safety & medical first', count: 18, icon: <ShieldCheck size={18} /> },
  { id: 'welcome', label: 'Welcome Team', description: 'New visitor concierge & lobby', count: 28, icon: <Plus size={18} /> },
  { id: 'volunteers', label: 'Volunteers (All)', description: 'All active ministry servants', count: 185, icon: <Heart size={18} /> },
  { id: 'leaders', label: 'Ministry Leaders', description: 'Department heads & coordinators', count: 24, icon: <Star size={18} /> },
  { id: 'staff', label: 'Administrative Staff', description: 'Office & operational personnel', count: 12, icon: <Briefcase size={18} /> },
];

const EmailCenterPage: React.FC = () => {
  const { userRole } = useNav();
  const [activeTab, setActiveTab] = useState<Tab>('inbox');
  const [messages, setMessages] = useState<any[]>([]);
  const [selectedMsg, setSelectedMsg] = useState<any>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);

  // Compose State
  const [selectedAudiences, setSelectedAudiences] = useState<string[]>([]);
  const [composeData, setComposeData] = useState({ subject: '', body: '' });
  const [isSendingCampaign, setIsSendingCampaign] = useState(false);

  useEffect(() => {
    fetchInbox();
  }, [userRole]);

  const fetchInbox = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch('/api/vault?resource=ops&subResource=email', {
        headers: { 'x-user-role': userRole }
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch (e) { console.error(e); }
    finally { setIsRefreshing(false); }
  };

  const handleReply = async () => {
    if (!replyText.trim()) return;
    setIsSendingReply(true);
    try {
      const res = await fetch('/api/vault?resource=ops&subResource=email&action=reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message_id: selectedMsg.id,
          reply_body: replyText,
          to_email: selectedMsg.from_email,
          original_subject: selectedMsg.subject,
          user_id: 'admin-1'
        })
      });
      if (res.ok) {
        setReplyText('');
        setSelectedMsg(null);
        fetchInbox();
      }
    } catch (e) { console.error(e); }
    finally { setIsSendingReply(false); }
  };

  const updateStatus = async (id: string, status: string) => {
    await fetch('/api/vault?resource=ops&subResource=email', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status })
    });
    fetchInbox();
  };

  const toggleAudience = (id: string) => {
    setSelectedAudiences(prev =>
      prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
    );
  };

  const canSend = selectedAudiences.length > 0 && composeData.subject.trim() && composeData.body.trim();

  const handleSendCampaign = () => {
    if (!canSend) return;
    setIsSendingCampaign(true);
    setTimeout(() => {
      setIsSendingCampaign(false);
      setActiveTab('history');
      setSelectedAudiences([]);
      setComposeData({ subject: '', body: '' });
    }, 2000);
  };

  return (
    <ResponsivePage>
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-[#0d1a14] mb-2 tracking-tight">Email Center</h1>
          <p className="text-gray-400 font-medium">Manage inbound communications and outbound ministry campaigns.</p>
        </div>
        <div className="bg-white p-1 rounded-2xl border border-gray-100 shadow-sm flex shrink-0 overflow-x-auto no-scrollbar">
          {[
            { id: 'inbox', label: 'Inbox', icon: <Inbox size={14} /> },
            { id: 'compose', label: 'Compose', icon: <Send size={14} /> },
            { id: 'history', label: 'History', icon: <History size={14} /> },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as Tab)}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === t.id ? 'bg-burgundy text-gold shadow-lg' : 'text-gray-400'}`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8">
        {activeTab === 'inbox' && (
          <div className="bg-white rounded-[2.5rem] border border-gray-50 shadow-sm overflow-hidden min-h-[500px]">
            <div className="p-6 border-b border-gray-50 flex items-center justify-between bg-gold-cream/5">
              <div className="flex items-center gap-4">
                <h2 className="text-lg font-black text-[#0d1a14]">Received Messages</h2>
                <button onClick={fetchInbox} className={`p-2 text-gray-400 hover:text-burgundy transition-all ${isRefreshing ? 'animate-spin' : ''}`}>
                  <RefreshCw size={18} />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest">Showing:</span>
                <span className="px-3 py-1 bg-white border border-gray-100 rounded-lg text-[10px] font-bold text-burgundy">{userRole} Scope</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left hidden md:table">
                <thead className="bg-gray-50/50">
                  <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                    <th className="px-8 py-4">Sender</th>
                    <th className="px-8 py-4">Category</th>
                    <th className="px-8 py-4">Subject</th>
                    <th className="px-8 py-4">Date</th>
                    <th className="px-8 py-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {messages.map(m => (
                    <tr
                      key={m.id}
                      onClick={() => setSelectedMsg(m)}
                      className={`cursor-pointer hover:bg-gold-cream/10 transition-colors ${m.status === 'new' ? 'font-bold bg-burgundy/[0.02]' : ''}`}
                    >
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs ${m.status === 'new' ? 'bg-burgundy text-gold' : 'bg-gray-100 text-gray-400'}`}>
                            {m.from_name.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm text-[#0d1a14] truncate">{m.from_name}</p>
                            <p className="text-[10px] text-gray-400 font-medium truncate">{m.from_email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-5">
                        <span className="px-2 py-1 bg-gold-cream/50 text-gold rounded-md text-[9px] font-black uppercase border border-gold/10">
                          {m.category}
                        </span>
                      </td>
                      <td className="px-8 py-5 text-sm text-gray-600 truncate max-w-xs">{m.subject}</td>
                      <td className="px-8 py-5 text-xs text-gray-400 font-medium">
                        {new Date(m.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-8 py-5">
                        <StatusBadge status={m.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Mobile Cards */}
              <div className="md:hidden divide-y divide-gray-50">
                {messages.map(m => (
                  <div key={m.id} onClick={() => setSelectedMsg(m)} className="p-6 space-y-3 active:bg-gray-50">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm ${m.status === 'new' ? 'bg-burgundy text-gold' : 'bg-gray-100 text-gray-400'}`}>
                          {m.from_name.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[15px] font-black text-[#0d1a14] leading-none mb-1">{m.from_name}</p>
                          <StatusBadge status={m.status} />
                        </div>
                      </div>
                      <p className="text-[10px] text-gray-400 font-bold uppercase">{new Date(m.created_at).toLocaleDateString()}</p>
                    </div>
                    <p className="text-sm font-bold text-gray-700 truncate">{m.subject}</p>
                  </div>
                ))}
              </div>

              {messages.length === 0 && (
                <div className="p-20 text-center flex flex-col items-center opacity-30">
                  <Inbox size={64} className="text-gray-300 mb-4" />
                  <p className="text-lg font-black text-[#0d1a14] uppercase tracking-widest">Inbox Clean</p>
                  <p className="text-sm font-medium text-gray-400">No communication records found for your role.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'compose' && (
          <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
            {/* Audience Selector Step */}
            <div className="bg-white p-6 md:p-10 rounded-[2.5rem] border border-gray-50 shadow-sm">
              <div className="flex items-center gap-4 mb-8">
                <div className="w-10 h-10 rounded-xl bg-gold/10 text-gold flex items-center justify-center shadow-inner">
                  <Users size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-[#0d1a14] uppercase tracking-tight">Step 1: Select Target Audience</h3>
                  <p className="text-xs text-gray-400 font-medium">Choose one or multiple church teams for this dispatch.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
                {AUDIENCES.map((audience) => {
                  const isSelected = selectedAudiences.includes(audience.id);
                  return (
                    <button
                      key={audience.id}
                      onClick={() => toggleAudience(audience.id)}
                      className={`p-4 rounded-2xl border-2 text-left transition-all relative group overflow-hidden ${isSelected
                        ? 'bg-burgundy text-gold border-gold shadow-lg shadow-burgundy/20'
                        : 'bg-gray-50 border-transparent hover:bg-white hover:border-gold/20'
                        }`}
                    >
                      <div className="flex items-start justify-between relative z-10">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-inner mb-3 transition-transform group-hover:scale-110 ${isSelected ? 'bg-gold text-burgundy' : 'bg-white text-gray-300'}`}>
                          {audience.icon}
                        </div>
                        {isSelected && (
                          <div className="bg-gold text-burgundy p-1 rounded-full animate-in zoom-in duration-300">
                            <CheckCircle2 size={12} fill="currentColor" />
                          </div>
                        )}
                      </div>
                      <h4 className={`text-sm font-black uppercase tracking-tight leading-none mb-1 ${isSelected ? 'text-white' : 'text-[#0d1a14]'}`}>{audience.label}</h4>
                      <p className={`text-[10px] font-bold ${isSelected ? 'text-gold/60' : 'text-gray-400'} line-clamp-1`}>{audience.description}</p>
                      <div className="mt-3 flex items-center justify-between">
                        <span className={`text-[9px] font-black uppercase tracking-widest ${isSelected ? 'text-white/40' : 'text-gray-300'}`}>Member Count</span>
                        <span className={`text-xs font-black ${isSelected ? 'text-gold' : 'text-burgundy'}`}>{audience.count.toLocaleString()}</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {selectedAudiences.length > 0 && (
                <div className="mt-8 p-4 bg-gold-cream/40 rounded-2xl border border-gold/10 flex items-center gap-3 animate-in slide-in-from-left-4 duration-500">
                  <div className="w-8 h-8 rounded-lg bg-burgundy flex items-center justify-center text-gold shadow-sm">
                    <Zap size={16} />
                  </div>
                  <p className="text-xs font-bold text-gray-500">
                    Targeting <span className="text-burgundy font-black">{selectedAudiences.length} groups</span>. Estimated reach: <span className="text-burgundy font-black">~{selectedAudiences.reduce((acc, id) => acc + (AUDIENCES.find(a => a.id === id)?.count || 0), 0).toLocaleString()} recipients</span> (duplicates handled automatically).
                  </p>
                </div>
              )}
            </div>

            {/* Compose Step */}
            <div className="bg-white p-8 md:p-12 rounded-[2.5rem] border border-gray-50 shadow-sm space-y-10">
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-inner ${selectedAudiences.length > 0 ? 'bg-burgundy/10 text-burgundy' : 'bg-gray-50 text-gray-200'}`}>
                  <Send size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-[#0d1a14] uppercase tracking-tight">Step 2: Message Content</h3>
                  <p className="text-xs text-gray-400 font-medium">Standardize your ministry message.</p>
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest ml-2">Subject Headline</label>
                <input
                  type="text"
                  placeholder="e.g. Sunday Service Update"
                  value={composeData.subject}
                  onChange={(e) => setComposeData({ ...composeData, subject: e.target.value })}
                  className="w-full px-6 py-4 rounded-2xl bg-gray-50 border-none outline-none font-bold text-burgundy focus:ring-4 focus:ring-burgundy/5"
                />
              </div>

              <div className="space-y-3">
                <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest ml-2">Message Body</label>
                <textarea
                  rows={10}
                  placeholder="Type your ministry update..."
                  value={composeData.body}
                  onChange={(e) => setComposeData({ ...composeData, body: e.target.value })}
                  className="w-full px-6 py-6 rounded-[2.5rem] bg-gray-50 border-none outline-none font-medium text-gray-700 resize-none leading-relaxed focus:ring-4 focus:ring-burgundy/5"
                />
              </div>

              <div className="flex flex-col md:flex-row justify-end gap-4 pt-4">
                <button className="px-10 py-5 bg-white border border-gray-100 rounded-2xl text-gray-400 font-black text-[10px] uppercase tracking-widest hover:text-burgundy transition-all">Discard Draft</button>
                <button
                  onClick={handleSendCampaign}
                  disabled={!canSend || isSendingCampaign}
                  className={`px-12 py-5 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl transition-all border-b-4 flex items-center justify-center gap-3 min-h-[60px] ${canSend && !isSendingCampaign
                    ? 'bg-burgundy text-gold shadow-burgundy/20 border-gold/40 hover:bg-burgundy-dark active:scale-95'
                    : 'bg-gray-100 text-gray-300 border-transparent cursor-not-allowed opacity-50'
                    }`}
                >
                  {isSendingCampaign ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  {isSendingCampaign ? 'Initializing Dispatch...' : 'Broadcast to Selected Groups'}
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="bg-white rounded-[2.5rem] border border-gray-50 shadow-sm overflow-hidden min-h-[400px] flex flex-col items-center justify-center text-center p-20 animate-in fade-in duration-700">
            <div className="relative mb-8">
              <div className="absolute inset-0 bg-gold/10 rounded-full blur-3xl animate-pulse" />
              <History size={64} className="text-gray-300 relative z-10" />
            </div>
            <h3 className="text-xl font-black text-[#0d1a14] uppercase tracking-widest">Campaign Ledger</h3>
            <p className="text-sm font-medium text-gray-400 mt-2 max-w-xs leading-relaxed">Your historical campaign metrics are being indexed. Dispatch records will populate shortly.</p>
            <button onClick={() => setActiveTab('compose')} className="mt-10 px-8 py-3 bg-burgundy/5 text-burgundy rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-burgundy hover:text-gold transition-all border border-burgundy/10">
              Draft New Message
            </button>
          </div>
        )}
      </div>

      {/* Message Detail Modal */}
      {selectedMsg && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 md:p-6 bg-burgundy/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white rounded-[2.5rem] w-full max-w-4xl max-h-[90vh] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 border border-gold/20">
            <div className="px-8 py-6 border-b border-gray-50 flex items-center justify-between bg-gold-cream/10 shrink-0">
              <div className="flex items-center gap-4">
                <button onClick={() => setSelectedMsg(null)} className="p-2 -ml-2 text-gray-400 hover:text-burgundy transition-all">
                  <X size={24} />
                </button>
                <div>
                  <h3 className="text-xl font-black text-[#0d1a14] tracking-tight">{selectedMsg.from_name}</h3>
                  <p className="text-[10px] text-gold font-bold uppercase tracking-widest">Category: {selectedMsg.category}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => updateStatus(selectedMsg.id, 'archived')} className="p-3 bg-white text-gray-300 hover:text-burgundy rounded-xl shadow-sm transition-all" title="Archive">
                  <Archive size={20} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 md:p-12 space-y-10 custom-scrollbar overscroll-contain">
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h4 className="text-2xl font-black text-[#0d1a14] tracking-tight">{selectedMsg.subject}</h4>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{new Date(selectedMsg.created_at).toLocaleString()}</span>
                </div>
                <div className="bg-[#fcfcfb] p-8 rounded-[2rem] border border-gray-100 text-gray-700 leading-relaxed font-medium whitespace-pre-wrap">
                  {selectedMsg.message}
                </div>
              </div>

              <div className="pt-10 border-t border-gray-50 space-y-6">
                <div className="flex items-center gap-3">
                  <MessageSquare size={18} className="text-gold" />
                  <h4 className="text-[11px] font-black text-gray-300 uppercase tracking-[0.2em]">Administrative Response</h4>
                </div>
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  rows={5}
                  placeholder="Compose your reply back to the member..."
                  className="w-full p-6 rounded-[2rem] bg-gray-50 border-none outline-none font-medium text-gray-700 resize-none shadow-inner focus:ring-4 focus:ring-burgundy/5 transition-all"
                />
                <div className="flex justify-end">
                  <button
                    onClick={handleReply}
                    disabled={isSendingReply || !replyText.trim()}
                    className="px-10 py-4 bg-burgundy text-gold font-black text-[11px] uppercase tracking-widest rounded-2xl shadow-xl shadow-burgundy/20 hover:bg-burgundy-dark transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                  >
                    {isSendingReply ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    Dispatch Reply
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </ResponsivePage>
  );
};

const StatusBadge = ({ status }: { status: string }) => {
  const styles: any = {
    new: 'bg-red-50 text-red-500 border-red-100 animate-pulse',
    read: 'bg-gold-cream text-gold border-gold/20',
    archived: 'bg-gray-50 text-gray-400 border-gray-100'
  };
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border ${styles[status]}`}>
      <span className={`w-1 h-1 rounded-full mr-1.5 ${status === 'new' ? 'bg-red-500' : status === 'read' ? 'bg-gold' : 'bg-gray-300'}`} />
      {status}
    </span>
  );
};

export default EmailCenterPage;