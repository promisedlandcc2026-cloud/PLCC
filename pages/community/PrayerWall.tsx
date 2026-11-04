
import React, { useState, useMemo, useEffect } from 'react';
import {
  Heart,
  Plus,
  ShieldCheck,
  CheckCircle2,
  X,
  Sparkles,
  Search,
  Filter,
  MoreVertical,
  ArrowUpRight,
  Clock,
  MessageSquare,
  Lock,
  EyeOff,
  User,
  Send,
  Trash2,
  AlertCircle,
  ChevronRight
} from 'lucide-react';
import { useNav } from '../../App';
import { Role } from '../../types';
import { canPerform } from '../../lib/permissions';
import { fetchWithTimeout, getAuthHeaders, isAbortOrTimeoutError } from '../../lib/api';
import AskAdminTitleLink from '../../components/common/AskAdminTitleLink';
import { usePrayerWatchAccess } from '../../lib/prayerWatch';
import { Link } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { HandHeart } from 'lucide-react';

interface PrayerRequest {
  id: string;
  member: string;
  content: string;
  category: 'Healing' | 'Guidance' | 'Praise' | 'Family' | 'Financial';
  status: 'Vetting' | 'Published' | 'Confidential';
  date: string;
  prayedCount: number;
  /** Set when the Intercessors marked it Prayed in the Prayer Watch. */
  intercessor_prayed_at?: string | null;
  share_with?: string | null;
}

const PrayerWallPage: React.FC = () => {
  const { userRole } = useNav();
  const isAdmin = canPerform(userRole as any, 'prayer.manage');

  const [activeTab, setActiveTab] = useState<'wall' | 'vetting' | 'pastor'>('wall');
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // API State
  const [prayers, setPrayers] = useState<PrayerRequest[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch Prayers
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchPrayers = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetchWithTimeout(
        '/api/vault?resource=community&subResource=prayer',
        { headers },
        55_000
      );
      const data = await res.json().catch(() => null);
      if (res.ok && Array.isArray(data)) {
        const formatted = data.map((p: any) => ({
          ...p,
          member: p.member_name,
          date: new Date(p.created_at).toLocaleDateString(),
          // API column is prayed_count; UI uses prayedCount
          prayedCount: Number(p.prayed_count ?? p.prayedCount ?? 0) || 0,
        }));
        setPrayers(formatted);
      } else if (!res.ok) {
        setLoadError((data && data.error) || 'Could not load prayer requests.');
      }
    } catch (error) {
      console.error("Failed to fetch prayers", error);
      setLoadError(
        isAbortOrTimeoutError(error)
          ? 'Timed out waiting for the database. Tap Retry.'
          : 'Could not load prayer requests.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrayers();
  }, []);

  const filteredPrayers = useMemo(() => {
    let list = [...prayers];

    if (!isAdmin) {
      list = list.filter(p => p.status === 'Published');
    } else {
      if (activeTab === 'wall') list = list.filter(p => p.status === 'Published');
      if (activeTab === 'vetting') list = list.filter(p => p.status === 'Vetting');
      if (activeTab === 'pastor') list = list.filter(p => p.status === 'Confidential');
    }

    if (searchQuery) {
      list = list.filter(p =>
        p.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.member.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    return list;
  }, [prayers, isAdmin, activeTab, searchQuery]);

  const approvePrayer = async (id: string) => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/vault?resource=community&subResource=prayer', {
        method: 'PATCH',
        headers: { ...headers,  'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'Published' })
      });
      if (res.ok) {
        fetchPrayers();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const deletePrayer = async (id: string) => {
    if (!confirm("Are you sure you want to delete this request?")) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/vault?resource=community&subResource=prayer&id=${id}`, { headers, method: 'DELETE' });
      if (res.ok) {
        setPrayers(prev => prev.filter(p => p.id !== id));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handlePray = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    // Optimistic update (coerce so missing/undefined never becomes NaN)
    setPrayers((prev) =>
      prev.map((p) =>
        p.id === id
          ? { ...p, prayedCount: (Number(p.prayedCount) || 0) + 1 }
          : p
      )
    );

    try {
      const headers = await getAuthHeaders();
      await fetch('/api/vault?resource=community&subResource=prayer', {
        method: 'PATCH',
        headers: { ...headers,  'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'pray' })
      });
    } catch (e) {
      console.error("Failed to record prayer", e);
    }
  };

  // Submit Handler
  const [newPrayerCategory, setNewPrayerCategory] = useState("Healing");
  const [newPrayerShareWith, setNewPrayerShareWith] = useState<'wall' | 'intercessors' | 'pastor'>('wall');
  const [newPrayerContent, setNewPrayerContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!newPrayerContent) return;
    setIsSubmitting(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/vault?resource=community&subResource=prayer', {
        method: 'POST',
        headers: { ...headers,  'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: newPrayerCategory,
          share_with: newPrayerShareWith,
          content: newPrayerContent,
          member_name: userName || 'Anonymous',
          user_id: userId // Pass the logged-in user ID
        })
      });

      if (res.ok) {
        const created = await res.json().catch(() => null);
        setIsSubmitModalOpen(false);
        setNewPrayerContent("");
        fetchPrayers();
        alert(
          created?.status === 'Published'
            ? "Your prayer request is on the wall."
            : created?.status === 'Confidential'
              ? created?.share_with === 'intercessors'
                ? "Your prayer request was sent privately to the Intercessors."
                : "Your prayer request was sent privately to the Pastor."
              : "Prayer request submitted for review."
        );
      } else {
        const errorData = await res.json();
        const msg = errorData.error || errorData.details || "Unknown error";
        console.error("Submission failed:", errorData);
        alert(`Submission failed: ${msg}`);
      }
    } catch (e: any) {
      console.error(e);
      alert(`Failed to submit: ${e.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const { userName, userId } = useNav(); // Get user name and ID for submission
  const prayerWatch = usePrayerWatchAccess(userId, userRole);

  return (
    <div className="flex-1 flex flex-col bg-white rounded-none lg:rounded-[2.5rem] border-none lg:border lg:border-gray-100 overflow-hidden shadow-none lg:shadow-2xl relative animate-in fade-in duration-700 min-h-0 h-full">
      {/* Refined Header: More distinct and compact on mobile */}
      <div className="px-4 md:px-6 border-b border-gray-100 flex items-center justify-between bg-[#fdfdfd] shrink-0 h-14 md:h-20 shadow-sm md:shadow-none">
        <div className="flex items-center gap-2 md:gap-3">
          <Heart size={18} className="text-burgundy md:w-5 md:h-5" fill="currentColor" />
          <h1 className="text-base md:text-xl font-black text-[#0d1a14] tracking-tight">Prayer Wall</h1>
          <AskAdminTitleLink />
        </div>
        <button
          onClick={() => setIsSubmitModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 md:px-4 md:py-2 bg-burgundy text-gold font-black text-[10px] md:text-[11px] uppercase tracking-widest rounded-lg md:rounded-xl shadow-lg active:scale-95 transition-all"
        >
          <Plus size={14} className="md:w-4 md:h-4" />
          Submit
        </button>
      </div>

      {/* Main Content Scrollable Area */}
      <div className="flex-1 overflow-y-auto px-4 md:px-12 py-5 md:py-10 space-y-6 md:space-y-8 bg-[#fafafa]/30 custom-scrollbar overscroll-contain scrolling-touch">
        {prayerWatch.allowed && (
          <Link
            to="/community/prayer-watch"
            className="flex items-center gap-3 rounded-2xl bg-white border border-burgundy/15 p-4 shadow-sm hover:border-burgundy/30 transition-colors"
          >
            <span className="w-10 h-10 rounded-xl bg-burgundy flex items-center justify-center shrink-0">
              <HandHeart size={20} className="text-gold" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-black text-[#0d1a14]">Intercessors Prayer Watch</span>
              <span className="block text-xs text-gray-500">Live Huddle and every prayer request, side by side</span>
            </span>
          </Link>
        )}

        {/* Search & Tabs Header */}
        <div className="space-y-4 max-w-4xl mx-auto w-full">
          {isAdmin && (
            <div className="bg-white p-1 rounded-xl md:rounded-2xl border border-gray-100 shadow-sm flex items-center overflow-hidden">
              <button
                onClick={() => setActiveTab('wall')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg md:rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'wall' ? 'bg-burgundy text-gold shadow-md' : 'text-gray-400'}`}
              >
                Wall
              </button>
              <button
                onClick={() => setActiveTab('vetting')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg md:rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'vetting' ? 'bg-burgundy text-gold shadow-md' : 'text-gray-400'}`}
              >
                Vetting
                {prayers.filter(p => p.status === 'Vetting').length > 0 && (
                  <span className="w-3.5 h-3.5 bg-gold text-burgundy rounded-full flex items-center justify-center text-[7px] font-black">{prayers.filter(p => p.status === 'Vetting').length}</span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('pastor')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg md:rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'pastor' ? 'bg-burgundy text-gold shadow-md' : 'text-gray-400'}`}
              >
                Secret
              </button>
            </div>
          )}

          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-gold transition-colors" size={16} />
            <input
              type="text"
              placeholder="Search requests..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-2.5 bg-white border border-gray-100 rounded-xl md:rounded-2xl outline-none shadow-sm focus:ring-4 focus:ring-burgundy/5 transition-all text-sm font-bold text-[#0d1a14]"
            />
          </div>
        </div>

        {/* Prayers Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 max-w-7xl mx-auto w-full">
          {filteredPrayers.length > 0 ? filteredPrayers.map((prayer) => (
            <div
              key={prayer.id}
              className="bg-white rounded-[1.5rem] md:rounded-[2rem] border border-gray-50 shadow-sm hover:shadow-xl transition-all duration-500 flex flex-col group relative overflow-hidden"
            >
              <div className="p-6 md:p-8 flex flex-col h-full relative z-10">
                <div className="flex items-center justify-between mb-4 md:mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-gold-cream text-gold flex items-center justify-center font-black shadow-inner border border-gold/10 text-xs">
                      {prayer.member === 'Anonymous' ? '?' : prayer.member.charAt(0)}
                    </div>
                    <div>
                      <p className="text-xs md:text-[13px] font-black text-[#0d1a14] leading-none mb-1">{prayer.member}</p>
                      <p className="text-[8px] md:text-[9px] text-gray-400 font-bold uppercase tracking-widest">{prayer.date}</p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[7px] md:text-[8px] font-black uppercase tracking-widest border bg-gold-cream/50 text-gold border-gold/10">
                    {prayer.category}
                  </span>
                </div>

                <div className="flex-1">
                  <p className="text-sm md:text-[15px] text-gray-700 font-medium leading-relaxed italic">"{prayer.content}"</p>
                  {prayer.share_with === 'intercessors' && (
                    <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-burgundy/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-burgundy">
                      🤝 Intercessors only · not on the wall
                    </p>
                  )}
                  {prayer.intercessor_prayed_at && prayer.share_with !== 'intercessors' && (
                    <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-700">
                      🙏 Prayed for by the Intercessors
                    </p>
                  )}
                </div>

                <div className="mt-6 md:mt-8 pt-4 md:pt-6 border-t border-gray-50 flex items-center justify-between">
                  <button
                    onClick={(e) => handlePray(prayer.id, e)}
                    className="flex items-center gap-2 group/pray transition-all active:scale-90"
                  >
                    <div className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-burgundy text-gold flex items-center justify-center shadow-lg group-hover/pray:scale-110 transition-transform">
                      <Heart size={12} className="md:w-3.5 md:h-3.5" fill="currentColor" />
                    </div>
                    <span className="text-[11px] md:text-[12px] font-black text-[#0d1a14]">{prayer.prayedCount}</span>
                  </button>

                  {isAdmin && (
                    <div className="flex items-center gap-1">
                      {prayer.status === 'Vetting' && prayer.share_with !== 'intercessors' && (
                        <button
                          onClick={() => approvePrayer(prayer.id)}
                          className="p-1.5 md:p-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-all shadow-sm border border-green-200"
                        >
                          <CheckCircle2 size={14} className="md:w-4 md:h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => deletePrayer(prayer.id)}
                        className="p-1.5 md:p-2 bg-red-50 text-red-400 rounded-lg hover:bg-red-100 transition-all shadow-sm border border-red-200"
                      >
                        <Trash2 size={14} className="md:w-4 md:h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )) : loading ? (
            <div className="col-span-full py-24 text-center text-gray-400">
              <p className="text-sm font-bold uppercase tracking-widest">Loading prayer requests…</p>
            </div>
          ) : loadError ? (
            <div className="col-span-full py-16 text-center space-y-4">
              <p className="text-sm font-semibold text-red-800">{loadError}</p>
              <button
                type="button"
                onClick={() => void fetchPrayers()}
                className="min-h-[44px] rounded-xl bg-[#0d1a14] px-5 text-sm font-black text-white"
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="col-span-full py-24 text-center opacity-40">
              <Heart size={48} className="text-gray-200 mx-auto mb-4" />
              <p className="text-lg font-bold text-gray-400 uppercase tracking-widest">The wall is quiet</p>
            </div>
          )}
        </div>
      </div>

      {/* SUBMIT MODAL — bottom sheet on phones so the send button is always within thumb reach.
          Portaled to <body> so no parent layout can trap or clip it. */}
      {isSubmitModalOpen && createPortal(
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center sm:p-4 bg-burgundy/60 backdrop-blur-md animate-in fade-in duration-300 pointer-events-auto">
          <div className="bg-white rounded-t-[2rem] sm:rounded-[2.5rem] md:rounded-[3rem] w-full max-w-lg shadow-[0_20px_80px_rgba(0,0,0,0.3)] overflow-hidden animate-in slide-in-from-bottom-8 sm:zoom-in-95 duration-300 border border-gold/30 flex flex-col max-h-[92dvh] sm:max-h-[90dvh]">
            <div className="shrink-0 px-6 md:px-10 py-5 md:py-8 border-b border-gray-50 flex items-center justify-between bg-gold-cream/10">
              <div>
                <h3 className="text-xl md:text-2xl font-black text-[#101814] tracking-tight">Share Request</h3>
                <p className="text-[10px] md:text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">Intercessory Circle</p>
              </div>
              <button onClick={() => setIsSubmitModalOpen(false)} aria-label="Close" className="p-2 md:p-3 text-gray-300 hover:text-burgundy hover:bg-white rounded-2xl transition-all shadow-sm">
                <X size={24} />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain scrolling-touch p-6 md:p-10 space-y-6 md:space-y-8">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Category</label>
                <select
                  value={newPrayerCategory}
                  onChange={(e) => setNewPrayerCategory(e.target.value)}
                  className="w-full px-6 py-4 rounded-[1.2rem] md:rounded-[1.5rem] bg-gray-50 border border-transparent focus:bg-white focus:border-gold outline-none transition-all font-bold text-[#0d1a14] appearance-none shadow-inner"
                >
                  <option>Healing</option>
                  <option>Guidance</option>
                  <option>Praise Report</option>
                  <option>Family</option>
                  <option>Financial</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Content</label>
                <textarea
                  rows={4}
                  value={newPrayerContent}
                  onChange={(e) => setNewPrayerContent(e.target.value)}
                  placeholder="What can we pray for today?"
                  className="w-full px-6 py-4 rounded-[1.5rem] bg-gray-50 border border-transparent focus:bg-white focus:border-gold outline-none transition-all font-medium text-gray-700 resize-none shadow-inner"
                />
              </div>
              <div className="space-y-2" role="radiogroup" aria-label="Who should pray">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Who should pray</p>
                {([
                  ['wall', '🙏 Prayer Wall + Intercessors', 'The church stands in agreement, and the Intercessors pray over it.'],
                  ['intercessors', '🤝 Intercessors only', 'Private. Not on the Prayer Wall. Only the Intercessors and the Pastor see it.'],
                  ['pastor', '🔒 Pastor only', 'Only the Pastor sees it.'],
                ] as const).map(([value, label, hint]) => (
                  <label
                    key={value}
                    className={`flex items-start gap-3 rounded-[1.2rem] border px-4 py-3 cursor-pointer transition-colors ${
                      newPrayerShareWith === value ? 'border-burgundy bg-burgundy/5' : 'border-gray-100 bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="vault-prayer-share"
                      value={value}
                      checked={newPrayerShareWith === value}
                      onChange={() => setNewPrayerShareWith(value)}
                      className="mt-1 accent-[#1d372c]"
                    />
                    <span>
                      <span className="block text-sm font-black text-[#0d1a14]">{label}</span>
                      <span className="block text-xs text-gray-500">{hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
            {/* Always-visible footer: never scrolls away. */}
            <div className="shrink-0 flex gap-3 md:gap-4 px-6 md:px-10 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:pb-8 border-t border-gray-100 bg-white">
              <button
                onClick={() => setIsSubmitModalOpen(false)}
                className="flex-1 py-4 text-gray-400 font-extrabold uppercase text-xs tracking-widest hover:text-burgundy transition-colors"
              >
                Discard
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex-[2] py-4 bg-burgundy text-gold font-black uppercase text-[11px] md:text-xs tracking-[0.15em] rounded-[1.2rem] md:rounded-[1.5rem] shadow-xl md:shadow-2xl shadow-burgundy/40 border-b-4 border-gold/40 hover:bg-burgundy-dark transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSubmitting
                  ? 'Sending...'
                  : newPrayerShareWith === 'pastor'
                    ? 'Send to Pastor'
                    : newPrayerShareWith === 'intercessors'
                      ? 'Send to Intercessors'
                      : 'Post to Prayer Wall'}
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(29, 55, 44, 0.05); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(29, 55, 44, 0.1); }
        .scrolling-touch { -webkit-overflow-scrolling: touch; }
      `}</style>
    </div>
  );
};

export default PrayerWallPage;