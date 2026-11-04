
import React, { useState, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Video,
  Search,
  Info,
  Clock,
  Share2,
  Menu,
  Star,
  X,
  CheckCircle2,
  LayoutList,
  PanelLeftClose,
  PanelLeftOpen,
  MonitorPlay,
  Zap,
  ArrowRight,
  ShieldCheck,
  ChevronRight
} from 'lucide-react';
import { useNav } from '../../App';
import { Role } from '../../types';
import { canPerform } from '../../lib/permissions';
import VideoPlayer from '../../components/Video/VideoPlayer';
import SlideDrawer from '../../components/Video/SlideDrawer';

interface VideoSource {
  id: string;
  title: string;
  type: 'YouTube' | 'Vimeo' | 'Custom';
  url: string;
  is_default: boolean;
  schedule_note?: string;
}

const VideoHubPage: React.FC = () => {
  const { userRole, setIsSidebarOpen } = useNav();
  const [sources, setSources] = useState<VideoSource[]>([]);
  const [activeSource, setActiveSource] = useState<VideoSource | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isSourcesDrawerOpen, setIsSourcesDrawerOpen] = useState(false);
  const [isDesktopSourcesOpen, setIsDesktopSourcesOpen] = useState(true);

  // New Source State
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState<VideoSource['type']>('YouTube');
  const [newUrl, setNewUrl] = useState('');
  const [newNote, setNewNote] = useState('');

  // Fetch videos from API
  const fetchVideos = async () => {
    try {
      const res = await fetch('/api/vault?resource=videos');
      const data = await res.json();
      if (data.ok) {
        setSources(data.videos);

        // Logic to set active source
        const defaultSource = data.videos.find((v: any) => v.is_default) || data.videos[0];
        if (defaultSource && !activeSource) {
          setActiveSource(defaultSource);
        }
      }
    } catch (error) {
      console.error('Failed to fetch videos:', error);
    }
  };

  useEffect(() => {
    fetchVideos();
  }, []);

  const handleAddSource = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/vault?resource=videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle,
          type: newType,
          url: newUrl,
          scheduleNote: newNote
        })
      });
      const data = await res.json();

      if (data.ok) {
        setSources(prev => [data.video, ...prev]);
        if (!activeSource) setActiveSource(data.video);
        setShowAddModal(false);
        resetForm();
        fetchVideos(); // Refresh to ensure correct sort order
      }
    } catch (error) {
      console.error('Failed to add video:', error);
      alert('Failed to add video.');
    }
  };

  const resetForm = () => {
    setNewTitle('');
    setNewType('YouTube');
    setNewUrl('');
    setNewNote('');
  };

  const deleteSource = async (id: string) => {
    if (!confirm('Are you sure you want to remove this video?')) return;

    try {
      const res = await fetch(`/api/vault?resource=videos&id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        const updated = sources.filter(s => s.id !== id);
        setSources(updated);
        if (activeSource?.id === id) setActiveSource(updated[0] || null);
      }
    } catch (error) {
      console.error('Failed to delete video:', error);
    }
  };

  const setDefaultSource = async (id: string) => {
    try {
      const res = await fetch(`/api/vault?resource=videos&id=${id}`, { method: 'PATCH' });
      if (res.ok) {
        // Optimistic update
        const updated = sources.map(s => ({
          ...s,
          is_default: s.id === id
        }));
        setSources(updated);
      }
    } catch (error) {
      console.error('Failed to set default video:', error);
    }
  };

  const copyToClipboard = () => {
    if (!activeSource) return;
    navigator.clipboard.writeText(activeSource.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const canManage = canPerform(userRole as any, 'video.manage');

  const SourceList = () => (
    <>
      <div className="p-4 border-b border-gray-100 bg-white">
        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-gold transition-colors" size={16} />
          <input
            type="text"
            placeholder="Search streams..."
            className="w-full pl-11 pr-4 py-3 bg-gray-50 rounded-2xl border border-transparent focus:border-gold/30 outline-none transition-all text-sm font-medium text-[#0d1a14]"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-4 space-y-2 custom-scrollbar bg-white">
        <p className="text-[10px] font-black text-gray-300 uppercase tracking-[0.2em] px-4 mb-2">Available Broadcasts</p>
        {sources.map((s) => (
          <div
            key={s.id}
            className={`w-full text-left p-4 rounded-[2rem] transition-all group relative border ${activeSource?.id === s.id
              ? 'bg-gold-cream border-gold/40 shadow-sm'
              : 'bg-transparent border-transparent hover:bg-gray-50'
              }`}
          >
            <div className="flex items-start gap-4 cursor-pointer" onClick={() => {
              setActiveSource(s);
              setIsSourcesDrawerOpen(false);
            }}>
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 shadow-inner ${activeSource?.id === s.id ? 'bg-burgundy text-gold' : 'bg-gray-100 text-gray-400'
                }`}>
                <Video size={24} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded bg-white border border-gray-100 text-gray-400">{s.type}</span>
                  {s.is_default && <div className="flex items-center gap-1 text-[8px] font-black text-gold uppercase"><Star size={8} fill="currentColor" /> Primary</div>}
                </div>
                <h3 className={`text-[14px] font-bold truncate leading-none mb-1 ${activeSource?.id === s.id ? 'text-burgundy' : 'text-[#0d1a14]'}`}>{s.title}</h3>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => setDefaultSource(s.id)}
                className={`flex-1 h-9 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${s.is_default ? 'bg-gold text-burgundy pointer-events-none' : 'bg-white text-gray-400 border border-gray-200 hover:bg-gold hover:text-burgundy hover:border-gold'
                  }`}
              >
                {s.is_default ? 'Primary' : 'Set Primary'}
              </button>
              {canManage && (
                <button
                  onClick={() => deleteSource(s.id)}
                  className="p-2.5 bg-red-50 text-red-400 rounded-xl hover:bg-red-500 hover:text-white transition-all shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </div>
        ))}

        {sources.length === 0 && (
          <div className="text-center py-20 opacity-20">
            <Video className="mx-auto mb-4 text-burgundy" size={48} strokeWidth={1} />
            <p className="text-xs font-black uppercase tracking-widest text-[#0d1a14]">No Sources Available</p>
          </div>
        )}
      </div>

      {canManage && (
        <div className="p-4 border-t border-gray-100 mt-auto bg-white">
          <button
            onClick={() => setShowAddModal(true)}
            className="w-full h-14 bg-burgundy text-gold rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-burgundy/10 hover:bg-burgundy-dark transition-all active:scale-95 flex items-center justify-center gap-2 border-b-4 border-gold/40"
          >
            <Plus size={18} />
            Add Stream
          </button>
        </div>
      )}
    </>
  );

  return (
    <div className="relative flex flex-col lg:flex-row h-[calc(100dvh-64px)] overflow-hidden bg-[#F9F9F7] text-[#0d1a14] font-inter">

      {/* SlideDrawer for Mobile Sources */}
      <SlideDrawer
        isOpen={isSourcesDrawerOpen}
        onClose={() => setIsSourcesDrawerOpen(false)}
        title="Broadcasts"
      >
        <SourceList />
      </SlideDrawer>

      {/* Desktop Persistent Sidebar with sliding logic */}
      <aside className={`
        hidden lg:flex w-80 bg-white border-r border-gray-100 flex-col shrink-0 transition-all duration-300 ease-in-out
        ${isDesktopSourcesOpen ? 'translate-x-0 ml-0 opacity-100' : '-translate-x-full -ml-80 opacity-0'}
      `}>
        <div className="p-8 border-b border-gray-100 bg-gold-cream/10">
          <h2 className="text-xl font-black tracking-tight flex items-center gap-3">
            <Video className="text-burgundy" size={24} />
            Broadcasts
          </h2>
          <p className="text-[10px] text-gold font-bold uppercase tracking-[0.3em] mt-1">PLCC Media Corridor</p>
        </div>
        <SourceList />
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 relative h-full">
        {/* Local Header: Shared for Desktop toggle and Mobile branding */}
        <div className="h-16 px-4 border-b border-gray-100 flex items-center justify-between shrink-0 bg-white z-50 shadow-sm md:shadow-none">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 text-gray-400 hover:text-burgundy transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center lg:hidden"
              aria-label="Main Menu"
            >
              <Menu size={24} />
            </button>
            <button
              onClick={() => setIsDesktopSourcesOpen(!isDesktopSourcesOpen)}
              className="hidden lg:flex p-2 text-gray-400 hover:text-burgundy transition-colors min-h-[44px] min-w-[44px] items-center justify-center"
              aria-label="Toggle Sources"
            >
              {isDesktopSourcesOpen ? <PanelLeftClose size={24} /> : <PanelLeftOpen size={24} />}
            </button>
            <div className="w-px h-6 bg-gray-100 mx-1" />
            <span className="text-xs font-black text-burgundy uppercase tracking-widest">PLCC <span className="text-gold">Admin</span></span>
          </div>

          <button
            onClick={() => setIsSourcesDrawerOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gold-cream text-gold rounded-xl text-[10px] font-black uppercase tracking-widest border border-gold/20 min-h-[44px] hover:bg-gold hover:text-white transition-all active:scale-95 lg:hidden"
          >
            <LayoutList size={16} />
            Sources
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-0 lg:p-8 flex flex-col items-center custom-scrollbar overscroll-contain bg-[#F9F9F7]">
          <div className="w-full max-w-6xl space-y-6 lg:space-y-12 pb-20">

            {/* Desktop Title */}
            <div className="hidden lg:block pt-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="h-1 w-12 bg-burgundy rounded-full" />
                <h2 className="text-[11px] font-black text-burgundy/40 uppercase tracking-[0.5em]">Vision Transmission</h2>
              </div>
              <h1 className="text-5xl font-black text-[#0d1a14] tracking-tighter leading-none">Video Hub<span className="text-gold">.</span></h1>
            </div>

            {/* Responsive Video Player Container */}
            <div className="w-full aspect-video bg-black lg:rounded-[3rem] overflow-hidden shadow-[0_40px_100px_rgba(29, 55, 44,0.1)] border border-gray-100 relative group">
              {activeSource ? (
                <VideoPlayer key={activeSource.id} source={activeSource} />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center px-12 text-center bg-white">
                  <div className="w-24 h-24 md:w-32 md:h-32 bg-gold-cream rounded-[2.5rem] md:rounded-[3.5rem] flex items-center justify-center mb-8 border border-gold/10 shadow-2xl relative overflow-hidden">
                    <div className="absolute inset-0 bg-gold/5 animate-pulse blur-xl" />
                    <MonitorPlay size={64} className="text-gold relative z-10" strokeWidth={1} />
                  </div>
                  <h3 className="text-xl md:text-3xl font-black text-[#0d1a14] tracking-tight mb-2 uppercase">Awaiting Signal</h3>
                  <p className="text-gray-400 text-xs md:text-base font-medium max-w-sm mx-auto uppercase tracking-widest leading-relaxed">
                    {sources.length > 0
                      ? "Select a sermon source from the vault to begin."
                      : "No active broadcast sources detected."}
                  </p>
                  {sources.length === 0 && canManage && (
                    <button
                      onClick={() => setShowAddModal(true)}
                      className="mt-10 px-8 py-4 bg-burgundy text-gold rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl hover:bg-burgundy-dark transition-all active:scale-95 flex items-center gap-3 border-b-4 border-gold/40"
                    >
                      <Plus size={16} />
                      Register First Source
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Meta Data Grid */}
            {activeSource && (
              <div className="px-6 lg:px-0 grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-12 animate-in fade-in slide-in-from-bottom-6 duration-700">
                <div className="bg-white p-8 lg:p-12 rounded-[2.5rem] border border-gray-100 shadow-sm">
                  <div className="flex items-center gap-4 mb-8">
                    <div className="w-12 h-12 rounded-2xl bg-burgundy/5 text-burgundy flex items-center justify-center shadow-inner">
                      <Info size={24} />
                    </div>
                    <h4 className="text-xl font-black text-[#0d1a14] uppercase tracking-tight">Service Narrative</h4>
                  </div>
                  <p className="text-gray-500 font-medium leading-relaxed italic text-sm md:text-base">
                    {activeSource.schedule_note || "Administrative broadcast session authorized. Sermon records are vaulted and indexed for organizational review."}
                  </p>
                </div>

                <div className="bg-white p-8 lg:p-12 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col justify-center">
                  <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-gold-cream text-gold flex items-center justify-center shadow-inner border border-gold/10">
                        <Clock size={24} />
                      </div>
                      <h4 className="text-xl font-black text-[#0d1a14] uppercase tracking-tight">Stream Protocol</h4>
                    </div>
                    <button
                      onClick={copyToClipboard}
                      className={`p-3 rounded-xl transition-all active:scale-90 min-h-[44px] min-w-[44px] flex items-center justify-center border ${copied ? 'bg-green-50 text-green-600 border-green-200' : 'bg-gray-50 text-gray-400 hover:text-burgundy border-transparent'}`}
                    >
                      {copied ? <CheckCircle2 size={20} /> : <Share2 size={20} />}
                    </button>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 font-mono text-[10px] md:text-xs text-[#0d1a14] truncate flex items-center gap-3">
                    <span className="shrink-0 text-gold font-black">ENDPOINT:</span>
                    {activeSource.url}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Add Source Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-burgundy/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white rounded-[3rem] w-full max-w-lg shadow-2xl border border-gold/30 overflow-hidden animate-in zoom-in-95">
            <div className="p-8 border-b border-gray-100 flex items-center justify-between bg-gold-cream/10">
              <h3 className="text-2xl font-black text-[#0d1a14] uppercase tracking-tight">Register Stream</h3>
              <button onClick={() => setShowAddModal(false)} className="p-2 text-gray-300 hover:text-burgundy transition-all min-h-[44px] min-w-[44px] flex items-center justify-center bg-white rounded-xl shadow-sm">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleAddSource} className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Identity Label</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  placeholder="Sunday Morning Main"
                  className="w-full h-14 px-6 bg-gray-50 rounded-2xl border border-transparent focus:bg-white focus:border-gold/30 outline-none font-bold text-[#0d1a14] transition-all shadow-inner"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Provider</label>
                  <select
                    value={newType}
                    onChange={e => setNewType(e.target.value as any)}
                    className="w-full h-14 px-6 bg-gray-50 rounded-2xl border border-transparent focus:bg-white focus:border-gold/30 outline-none font-bold text-[#0d1a14] appearance-none shadow-inner"
                  >
                    <option>YouTube</option>
                    <option>Vimeo</option>
                    <option>Custom</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">URL Endpoint</label>
                  <input
                    type="url"
                    value={newUrl}
                    onChange={e => setNewUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full h-14 px-6 bg-gray-50 rounded-2xl border border-transparent focus:bg-white focus:border-gold/30 outline-none font-bold text-[#0d1a14] transition-all shadow-inner"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Admin Narrative</label>
                <textarea
                  value={newNote}
                  onChange={e => setNewNote(e.target.value)}
                  rows={3}
                  placeholder="Broadcast instructions..."
                  className="w-full p-6 bg-gray-50 rounded-2xl border border-transparent focus:bg-white focus:border-gold/30 outline-none font-bold text-[#0d1a14] transition-all resize-none shadow-inner"
                />
              </div>
              <button
                type="submit"
                className="w-full h-16 bg-burgundy text-gold font-black text-sm uppercase tracking-[0.2em] rounded-2xl shadow-xl shadow-burgundy/20 hover:bg-burgundy-dark transition-all active:scale-95 mt-4 border-b-8 border-gold/40"
              >
                Launch Protocol
              </button>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(29, 55, 44, 0.05); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(29, 55, 44, 0.1); }
      `}</style>
    </div>
  );
};

export default VideoHubPage;
