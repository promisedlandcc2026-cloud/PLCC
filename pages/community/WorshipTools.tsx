import React, { useState } from 'react';
import {
  Music,
  Plus,
  FileText,
  Mic2,
  Sparkles,
  ChevronRight,
  Calendar,
  Clock,
  MoreVertical,
  Download,
  Share2,
  Settings,
  GripVertical,
  Search,
  CheckCircle2,
  X,
  LayoutList,
  Menu,
  Maximize2,
  Copy,
  PanelLeftClose,
  PanelLeftOpen,
  ArrowRight,
  ShieldCheck,
  Bot
} from 'lucide-react';
import { useNav } from '../../App';
import { canPerform } from '../../lib/permissions';
import SlideDrawer from '../../components/Video/SlideDrawer';
import { getAuthHeaders } from '../../lib/api';

interface Song {
  id: string;
  title: string;
  key: string;
  bpm: number;
  length: string;
  lead: string;
  type: 'Worship' | 'Praise';
  lyrics: string;
}

const WorshipToolsPage: React.FC = () => {
  const { setIsSidebarOpen, userRole } = useNav();
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isDesktopLibraryOpen, setIsDesktopLibraryOpen] = useState(true);
  const [activeLyricsSong, setActiveLyricsSong] = useState<Song | null>(null);
  const [activeSetlist] = useState('Sunday Morning Service');
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [editingSong, setEditingSong] = useState<Partial<Song> | null>(null);

  // API State
  const [songs, setSongs] = useState<Song[]>([]);
  const [setlistLibrary, setSetlistLibrary] = useState<{ id: string; name: string; date: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  // Dynamic AI Strategy Analysis
  const strategyText = React.useMemo(() => {
    if (songs.length === 0) return "Vault ready for set initialization. Add songs to begin rehearsal plotting.";
    if (songs.length === 1) return `Focus on the thematic depth of "${songs[0].title}". Ensure ${songs[0].lead} is comfortable with the ${songs[0].key} transposition.`;

    // Analyze transitions
    const transitions = [];
    for (let i = 0; i < songs.length - 1; i++) {
      const current = songs[i];
      const next = songs[i + 1];
      if (current.key !== next.key) {
        transitions.push(`A bridge is recommended from "${current.title}" (${current.key}) into "${next.title}" (${next.key}).`);
      }
      if (Math.abs(current.bpm - next.bpm) > 15) {
        transitions.push(`Warning: Significant tempo jump detected between "${current.title}" (${current.bpm} BPM) and "${next.title}" (${next.bpm} BPM). Plot a gradual transition.`);
      }
    }

    if (transitions.length > 0) return transitions[0]; // Return the most critical first or join them
    return "Flow analysis complete. Set progression is harmonically stable. Ready for soundcheck.";
  }, [songs]);

  React.useEffect(() => {
    const fetchData = async () => {
      try {
      const headers = await getAuthHeaders();
        const [songsRes, setlistsRes] = await Promise.all([
          fetch('/api/vault?resource=community&subResource=worship&type=songs', { headers }),
          fetch('/api/vault?resource=community&subResource=worship&type=setlists', { headers })
        ]);

        if (songsRes.ok) {
          const songsData = await songsRes.json();
          // Transform if necessary
          setSongs(songsData.map((s: any) => ({
            id: s.id,
            title: s.title,
            key: s.key || 'C',
            bpm: s.bpm || 70,
            length: '5:00', // Default
            lead: s.lead_vocal || 'Worship Team',
            type: 'Worship', // Default
            lyrics: s.lyrics || ''
          })));
        }

        if (setlistsRes.ok) {
          const setlistsData = await setlistsRes.json();
          setSetlistLibrary(setlistsData.map((s: any) => ({
            id: s.id,
            name: s.title || 'Untitled Set',
            date: new Date(s.date).toLocaleDateString(),
            count: (Array.isArray(s.songs) ? s.songs.length : 0)
          })));
        }
      } catch (error) {
        console.error("Failed to fetch worship data", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const saveSong = async (songData: Partial<Song>) => {
    try {
      const headers = await getAuthHeaders();
      // Harmonize fields for backend: lead -> lead_vocal
      const payload = {
        ...songData,
        lead_vocal: songData.lead
      };
      // Remove frontend-only fields that might cause issues if not stripped
      const { type, length, lead, ...finalPayload } = payload as any;

      const res = await fetch('/api/vault?resource=community&subResource=worship&type=songs', {
        method: 'POST',
        headers: { ...headers,  'Content-Type': 'application/json' },
        body: JSON.stringify(finalPayload)
      });
      if (res.ok) {
        const saved = await res.json();
        const transformed: Song = {
          id: saved.id,
          title: saved.title,
          key: saved.key || 'C',
          bpm: saved.bpm || 70,
          length: '5:00',
          lead: saved.lead_vocal || 'Worship Team',
          type: 'Worship',
          lyrics: saved.lyrics || ''
        };
        setSongs(prev => {
          const exists = prev.find(s => s.id === saved.id);
          if (exists) return prev.map(s => s.id === saved.id ? transformed : s);
          return [transformed, ...prev];
        });
        setIsEditorOpen(false);
        setEditingSong(null);
      }
    } catch (e) {
      console.error(e);
      alert("Failed to save song.");
    }
  };

  const deleteSong = async (id: string) => {
    if (!confirm("Remove this song from the vault forever?")) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/vault?resource=community&subResource=worship&type=songs&id=${id}`, { headers, method: 'DELETE' });
      if (res.ok) {
        setSongs(prev => prev.filter(s => s.id !== id));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const deleteSetlist = async (id: string) => {
    if (!confirm("Are you sure you want to delete this service draft?")) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/vault?resource=community&subResource=worship&type=setlists&id=${id}`, { headers, method: 'DELETE' });
      if (res.ok) {
        setSetlistLibrary(prev => prev.filter(s => s.id !== id));
      }
    } catch (e) {
      console.error(e);
      alert("Failed to delete setlist.");
    }
  };

  const handleDownloadSong = (song: Song) => {
    const content = `
TITLE: ${song.title}
KEY: ${song.key}
BPM: ${song.bpm}
LEAD: ${song.lead}

LYRICS:
${song.lyrics || 'No lyrics provided.'}
    `.trim();

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${song.title.replace(/\s+/g, '_')}_Lyrics.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const showProjectingNotice = (type: string, songTitle: string) => {
    alert(`${type} for "${songTitle}" is currently being indexed in the ledger. Digital transcribing in progress.`);
  };

  const LibraryContent = () => (
    <div className="flex flex-col h-full bg-[#111] text-white">
      <div className="p-4 border-b border-white/5">
        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-gold transition-colors" size={16} />
          <input
            type="text"
            placeholder="Search archives..."
            className="w-full pl-11 pr-4 py-3 bg-white/5 rounded-2xl border border-transparent focus:border-gold/30 outline-none transition-all text-sm font-medium text-white"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-4 space-y-2 custom-scrollbar">
        <p className="text-[9px] font-black text-white/20 uppercase tracking-[0.2em] px-4 mb-2">Historical Sets</p>
        {setlistLibrary.map((set, i) => (
          <div
            key={i}
            className="w-full text-left p-4 rounded-3xl transition-all hover:bg-white/5 group border border-transparent hover:border-white/5 flex items-center justify-between"
          >
            <button
              onClick={() => setIsLibraryOpen(false)}
              className="flex items-center gap-4 flex-1 min-w-0"
            >
              <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-gold shadow-inner group-hover:scale-105 transition-transform">
                <Calendar size={18} />
              </div>
              <div className="min-w-0">
                <h4 className="text-sm font-bold truncate">{set.name}</h4>
                <p className="text-[10px] text-white/40 font-medium uppercase tracking-widest">{set.date}</p>
              </div>
            </button>
            {canPerform(userRole, 'worship.edit') && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteSetlist(set.id);
                }}
                className="p-2 opacity-0 group-hover:opacity-100 text-white/20 hover:text-red-500 transition-all active:scale-95"
                title="Delete Setlist"
              >
                <X size={16} />
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="p-4 border-t border-white/5">
        {canPerform(userRole, 'worship.edit') && (
          <div className="space-y-3">
            <button
              onClick={() => {
                setEditingSong({ title: '', key: 'C', bpm: 70, lead: 'Worship Team', lyrics: '' });
                setIsEditorOpen(true);
              }}
              className="w-full py-3 bg-white/5 text-gold border border-gold/20 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-gold hover:text-burgundy transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              <Music size={14} />
              Add New Song
            </button>
            <button
              onClick={async () => {
                try {
      const headers = await getAuthHeaders();
                  const res = await fetch('/api/vault?resource=community&subResource=worship&type=setlists', {
                    method: 'POST',
                    headers: { ...headers,  'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      title: `New Service Draft - ${new Date().toLocaleDateString()}`,
                      date: new Date().toISOString(),
                      songs: []
                    })
                  });
                  if (res.ok) {
                    const newSet = await res.json();
                    setSetlistLibrary(prev => [{
                      id: newSet.id,
                      name: newSet.title,
                      date: new Date(newSet.date).toLocaleDateString(),
                      count: 0
                    }, ...prev]);
                    alert("New setlist draft created in the vault.");
                  }
                } catch (e) {
                  console.error(e);
                  alert("Failed to initialize draft.");
                }
              }}
              className="w-full py-4 bg-gold text-burgundy rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-white transition-all active:scale-95 shadow-lg flex items-center justify-center gap-2"
            >
              <Plus size={16} />
              Draft New Set
            </button>
          </div>
        )}
      </div>
    </div >
  );

  return (
    <div className="flex-1 flex flex-col lg:flex-row h-[calc(100dvh-64px)] overflow-hidden bg-white font-inter">

      {/* Slide-out Library for Mobile - Improved smooth entry */}
      <SlideDrawer
        isOpen={isLibraryOpen}
        onClose={() => setIsLibraryOpen(false)}
        title="Worship Vault"
      >
        <LibraryContent />
      </SlideDrawer>

      {/* Persistent Sidebar for Desktop with sliding logic */}
      <aside className={`
        hidden lg:flex w-80 bg-[#111] border-r border-white/5 flex-col shrink-0 transition-all duration-500 cubic-bezier(0.4, 0, 0.2, 1)
        ${isDesktopLibraryOpen ? 'translate-x-0 ml-0 opacity-100' : '-translate-x-full -ml-80 opacity-0'}
      `}>
        <div className="p-8 border-b border-white/5">
          <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-3">
            <Music className="text-gold" size={20} />
            Worship Vault
          </h2>
          <p className="text-[10px] text-gold/40 font-bold uppercase tracking-widest mt-1">PLCC Admin Library</p>
        </div>
        <LibraryContent />
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 h-full bg-[#f9fafb]">
        {/* Local Header */}
        <header className="h-16 px-4 md:px-8 border-b border-gray-100 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 text-gray-400 hover:text-burgundy lg:hidden"
            >
              <Menu size={24} />
            </button>
            <button
              onClick={() => setIsDesktopLibraryOpen(!isDesktopLibraryOpen)}
              className="hidden lg:flex p-2 text-gray-400 hover:text-gold transition-colors"
            >
              {isDesktopLibraryOpen ? <PanelLeftClose size={22} /> : <PanelLeftOpen size={22} />}
            </button>
            <div className="w-px h-6 bg-gray-100 mx-1" />
            <h2 className="text-sm md:text-lg font-black text-[#0d1a14] uppercase tracking-tight truncate max-w-[200px]">
              {activeSetlist}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsLibraryOpen(true)}
              className="lg:hidden p-2 text-gold hover:bg-gold-cream rounded-xl transition-all"
            >
              <LayoutList size={22} />
            </button>
            <button className="flex items-center gap-2 px-4 py-2 bg-burgundy text-gold rounded-xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-burgundy/20 active:scale-95 transition-all">
              <Share2 size={14} />
              <span className="hidden sm:inline">Share Set</span>
            </button>
          </div>
        </header>

        {/* Setlist Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 md:space-y-10 custom-scrollbar overscroll-contain">
          <div className="max-w-5xl mx-auto space-y-8">
            <div className="flex items-center justify-between border-b border-gray-100 pb-8">
              <div>
                <h1 className="text-3xl md:text-4xl font-black text-[#0d1a14] tracking-tight">Active Setlist<span className="text-gold">.</span></h1>
                <p className="text-gray-400 font-medium text-sm mt-1">Oct 27, 2024 • Sunday Morning Worship</p>
              </div>
              {canPerform(userRole, 'worship.edit') && (
                <button className="p-3 bg-white border border-gray-100 rounded-2xl text-gold hover:bg-gold-cream transition-all shadow-sm">
                  <Settings size={20} />
                </button>
              )}
            </div>

            <div className="space-y-4">
              {songs.map((song) => (
                <div key={song.id} className="bg-white rounded-[2rem] border border-gray-100 shadow-sm hover:shadow-xl hover:border-gold/20 transition-all duration-500 overflow-hidden group">
                  <div className="p-6 md:p-8 flex items-center gap-6">
                    {canPerform(userRole, 'worship.edit') && (
                      <div className="cursor-grab text-gray-200 hover:text-gold transition-colors">
                        <GripVertical size={20} />
                      </div>
                    )}

                    <div className={`w-12 h-12 md:w-14 md:h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-inner group-hover:scale-110 transition-transform ${song.type === 'Worship' ? 'bg-burgundy text-gold' : 'bg-gold text-white'
                      }`}>
                      <Music size={24} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="text-lg font-black text-[#0d1a14] truncate">{song.title}</h3>
                        <span className="px-2 py-0.5 rounded-md bg-gray-50 border border-gray-100 text-[8px] font-black text-gray-400 uppercase tracking-widest">{song.type}</span>
                      </div>
                      <div className="flex items-center gap-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                        <span className="text-gold">Key: {song.key}</span>
                        <span className="w-1 h-1 bg-gray-200 rounded-full" />
                        <span>{song.bpm} BPM</span>
                        <span className="w-1 h-1 bg-gray-200 rounded-full" />
                        <span>{song.length}</span>
                      </div>
                    </div>

                    <div className="hidden md:flex flex-col items-end gap-1 shrink-0">
                      <p className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">Lead Vocal</p>
                      <p className="text-[13px] font-black text-burgundy uppercase">{song.lead}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setActiveLyricsSong(activeLyricsSong?.id === song.id ? null : song)}
                        className={`p-3 rounded-xl transition-all ${activeLyricsSong?.id === song.id ? 'bg-burgundy text-gold shadow-lg' : 'bg-gray-50 text-gray-400 hover:text-burgundy'
                          }`}
                        title="Lyrics View"
                      >
                        <FileText size={20} />
                      </button>
                      {canPerform(userRole, 'worship.edit') && (
                        <>
                          <button
                            onClick={() => {
                              setEditingSong(song);
                              setIsEditorOpen(true);
                            }}
                            className="p-3 bg-gray-50 text-gray-400 hover:text-gold rounded-xl transition-all"
                            title="Edit Song"
                          >
                            <Settings size={20} />
                          </button>
                          <button
                            onClick={() => deleteSong(song.id)}
                            className="p-3 bg-gray-50 text-gray-400 hover:text-red-500 rounded-xl transition-all"
                            title="Delete Song"
                          >
                            <X size={20} />
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => handleDownloadSong(song)}
                        className="p-3 bg-gray-50 text-gray-400 hover:text-burgundy rounded-xl transition-all"
                        title="Download Lyrics"
                      >
                        <Download size={20} />
                      </button>
                    </div>
                  </div>

                  {activeLyricsSong?.id === song.id && (
                    <div className="px-8 pb-10 pt-4 bg-[#fcfcfb] border-t border-gray-50 animate-in slide-in-from-top-4 duration-500">
                      <div className="max-w-2xl mx-auto">
                        <div className="flex items-center justify-between mb-8">
                          <p className="text-[10px] font-black text-gold uppercase tracking-[0.3em]">Projection Preview</p>
                          <div className="flex gap-2">
                            <button className="p-2 bg-white text-gray-300 hover:text-gold rounded-lg shadow-sm transition-all"><Copy size={14} /></button>
                            <button className="p-2 bg-white text-gray-300 hover:text-gold rounded-lg shadow-sm transition-all"><Maximize2 size={14} /></button>
                          </div>
                        </div>
                        <div className="whitespace-pre-wrap font-medium text-lg md:text-xl text-[#0d1a14] leading-relaxed italic text-center">
                          {song.lyrics}
                        </div>
                        <div className="mt-10 pt-8 border-t border-gray-100 flex items-center justify-center gap-8">
                          <button
                            onClick={() => showProjectingNotice('Chord Sheet', song.title)}
                            className="text-[10px] font-black text-burgundy uppercase tracking-widest hover:underline"
                          >
                            View Chords
                          </button>
                          <div className="w-1.5 h-1.5 bg-gold rounded-full" />
                          <button
                            onClick={() => showProjectingNotice('Stage Plot', song.title)}
                            className="text-[10px] font-black text-burgundy uppercase tracking-widest hover:underline"
                          >
                            Stage Setup
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="bg-gold-cream/30 p-10 rounded-[3rem] border border-gold/10 flex items-center justify-between gap-10 group mt-10 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-6 opacity-5 rotate-12 transition-transform group-hover:scale-110 pointer-events-none">
                <Sparkles size={120} className="text-gold" />
              </div>
              <div className="flex items-center gap-8 relative z-10">
                <div className="w-16 h-16 rounded-[1.5rem] bg-white text-gold flex items-center justify-center shadow-lg border border-gold/10 group-hover:scale-110 transition-transform">
                  <Mic2 size={32} />
                </div>
                <div>
                  <h4 className="text-xl font-black text-[#0d1a14] tracking-tight">AI Rehearsal Strategy</h4>
                  <p className="text-sm text-gray-400 font-medium leading-relaxed max-w-md mt-1">{strategyText}</p>
                </div>
              </div>
              <button
                onClick={() => setIsReviewModalOpen(true)}
                className="px-10 py-5 bg-burgundy text-gold font-black text-xs uppercase tracking-[0.2em] rounded-2xl shadow-xl shadow-burgundy/20 hover:bg-burgundy-dark transition-all active:scale-95 border-b-4 border-gold/40 relative z-10 shrink-0"
              >
                Review Set
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Song Editor Modal */}
      {isEditorOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-burgundy/60 backdrop-blur-md animate-in fade-in duration-300" onClick={() => setIsEditorOpen(false)} />
          <div className="bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl relative z-10 overflow-hidden animate-in zoom-in-95 duration-300 border border-gold/20">
            <div className="p-8 border-b border-gray-50 flex items-center justify-between bg-[#fcfcfb]">
              <div>
                <h3 className="text-2xl font-black text-[#0d1a14] tracking-tight">{editingSong?.id ? 'Edit Vault Item' : 'New Vault Item'}</h3>
                <p className="text-[10px] text-gold font-bold uppercase tracking-[0.2em] mt-1">Worship Resource Registry</p>
              </div>
              <button onClick={() => setIsEditorOpen(false)} className="p-3 text-gray-300 hover:text-burgundy bg-white rounded-2xl border border-gray-100 transition-all active:scale-95">
                <X size={20} />
              </button>
            </div>

            <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Song Title</label>
                  <input
                    type="text"
                    value={editingSong?.title || ''}
                    onChange={e => setEditingSong(prev => ({ ...prev, title: e.target.value }))}
                    className="w-full px-6 py-4 bg-gray-50 rounded-2xl border border-transparent focus:bg-white focus:border-gold/20 transition-all font-bold text-[#0d1a14] outline-none"
                    placeholder="e.g. Way Maker"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Musical Key</label>
                  <input
                    type="text"
                    value={editingSong?.key || ''}
                    onChange={e => setEditingSong(prev => ({ ...prev, key: e.target.value }))}
                    className="w-full px-6 py-4 bg-gray-50 rounded-2xl border border-transparent focus:bg-white focus:border-gold/20 transition-all font-bold text-[#0d1a14] outline-none"
                    placeholder="e.g. C, G, Am"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">BPM (Tempo)</label>
                  <input
                    type="number"
                    value={editingSong?.bpm || ''}
                    onChange={e => setEditingSong(prev => ({ ...prev, bpm: parseInt(e.target.value) }))}
                    className="w-full px-6 py-4 bg-gray-50 rounded-2xl border border-transparent focus:bg-white focus:border-gold/20 transition-all font-bold text-[#0d1a14] outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Lead Vocal</label>
                  <input
                    type="text"
                    value={editingSong?.lead || ''}
                    onChange={e => setEditingSong(prev => ({ ...prev, lead: e.target.value }))}
                    className="w-full px-6 py-4 bg-gray-50 rounded-2xl border border-transparent focus:bg-white focus:border-gold/20 transition-all font-bold text-[#0d1a14] outline-none"
                    placeholder="Worship Leader Name"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Lyrics Content</label>
                <textarea
                  value={editingSong?.lyrics || ''}
                  onChange={e => setEditingSong(prev => ({ ...prev, lyrics: e.target.value }))}
                  className="w-full px-6 py-4 bg-gray-50 rounded-[2rem] border border-transparent focus:bg-white focus:border-gold/20 transition-all font-medium text-[#0d1a14] outline-none min-h-[200px] resize-none leading-relaxed italic"
                  placeholder="Enter stanzas here..."
                />
              </div>
            </div>

            <div className="p-8 bg-[#fcfcfb] border-t border-gray-50 flex gap-4">
              <button
                onClick={() => setIsEditorOpen(false)}
                className="flex-1 py-4 bg-white border border-gray-100 text-gray-400 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-gray-50 transition-all active:scale-95"
              >
                Discard
              </button>
              <button
                onClick={() => saveSong(editingSong || {})}
                className="flex-[2] py-4 bg-burgundy text-gold rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-burgundy-dark transition-all active:scale-95 shadow-xl shadow-burgundy/20 border-b-4 border-gold/30"
              >
                Committal to Vault
              </button>
            </div>
          </div>
        </div>
      )
      }

      {/* Set Review Modal */}
      {isReviewModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-xl animate-in fade-in duration-500" onClick={() => setIsReviewModalOpen(false)} />
          <div className="bg-white w-full max-w-xl rounded-[3rem] shadow-2xl relative z-20 overflow-hidden animate-in zoom-in-95 duration-300 border border-gold/30 p-10">
            <div className="text-center mb-10">
              <div className="w-20 h-20 bg-gold-cream rounded-[2.5rem] flex items-center justify-center text-gold mx-auto mb-6 shadow-xl border border-gold/10">
                <ShieldCheck size={40} />
              </div>
              <h3 className="text-3xl font-black text-[#0d1a14] tracking-tighter uppercase">Service Intelligence Report</h3>
              <p className="text-[10px] text-gold font-bold uppercase tracking-[0.3em] mt-2">Harmonic & Temporal Flow Analysis</p>
            </div>

            <div className="space-y-6">
              <div className="bg-gray-50 rounded-3xl p-6 border border-gray-100">
                <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest mb-4">Set Progression</p>
                <div className="flex flex-wrap gap-3">
                  {songs.length > 0 ? songs.map((s, i) => (
                    <div key={s.id} className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl border border-gray-100 shadow-sm">
                      <span className="text-[10px] font-black text-gold">{i + 1}</span>
                      <span className="text-xs font-bold text-[#0d1a14]">{s.key}</span>
                      <span className="w-1 h-3 bg-gray-100 rounded-full" />
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-tight truncate max-w-[80px]">{s.title}</span>
                    </div>
                  )) : <p className="text-xs font-bold text-gray-400 italic">No harmonic data to index.</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="bg-gray-50 rounded-3xl p-6 border border-gray-100">
                  <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest mb-2">Total Load</p>
                  <p className="text-2xl font-black text-[#0d1a14]">{songs.length} <span className="text-sm text-gray-400">Songs</span></p>
                </div>
                <div className="bg-gray-50 rounded-3xl p-6 border border-gray-100">
                  <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest mb-2">Est. Duration</p>
                  <p className="text-2xl font-black text-[#0d1a14]">{songs.length * 5} <span className="text-sm text-gray-400">Min</span></p>
                </div>
              </div>

              <div className="bg-burgundy/5 rounded-3xl p-6 border border-burgundy/10 italic">
                <div className="flex items-center gap-3 mb-2">
                  <Bot size={16} className="text-gold" />
                  <span className="text-[10px] font-black text-burgundy uppercase tracking-widest">Protocol Insight</span>
                </div>
                <p className="text-xs font-medium text-[#0d1a14] leading-relaxed">
                  {strategyText}
                </p>
              </div>
            </div>

            <button
              onClick={() => setIsReviewModalOpen(false)}
              className="w-full py-5 bg-burgundy text-gold rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-burgundy-dark transition-all active:scale-95 shadow-xl border-b-4 border-gold/40 mt-10"
            >
              Close Intelligence Report
            </button>
          </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(201, 163, 90, 0.1); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(201, 163, 90, 0.2); }
      `}</style>
    </div>
  );
};

// Fixed: Added missing default export
export default WorshipToolsPage;
