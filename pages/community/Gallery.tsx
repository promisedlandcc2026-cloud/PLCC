import React, { useState, useEffect, useMemo } from 'react';
import {
    Image as ImageIcon,
    Video,
    Plus,
    Search,
    Filter,
    Trash2,
    ExternalLink,
    X,
    Loader2,
    Film,
    Camera
} from 'lucide-react';
import { useNav } from '../../App';
import { GalleryItem } from '../../types';
import { canPerform } from '../../lib/permissions';
import { getAuthHeaders } from '../../lib/api';

const GalleryPage: React.FC = () => {
    const { userRole } = useNav();
    const canManage = canPerform(userRole as any, 'gallery.manage');

    const [items, setItems] = useState<GalleryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterType, setFilterType] = useState<'all' | 'image' | 'video'>('all');
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Form State
    const [newTitle, setNewTitle] = useState('');
    const [newType, setNewType] = useState<'image' | 'video'>('image');
    const [newUrl, setNewUrl] = useState('');
    const [newThumbnail, setNewThumbnail] = useState('');
    const [newDescription, setNewDescription] = useState('');
    const [newCategory, setNewCategory] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const fetchItems = async () => {
        try {
      const headers = await getAuthHeaders();
            const res = await fetch('/api/vault?resource=community&subResource=gallery', { headers });
            const data = await res.json();
            if (res.ok) setItems(data);
        } catch (e) {
            console.error("Failed to fetch gallery items", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchItems();
    }, []);

    const filteredItems = useMemo(() => {
        return items.filter(item => {
            const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                item.category?.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesType = filterType === 'all' || item.type === filterType;
            return matchesSearch && matchesType;
        });
    }, [items, searchQuery, filterType]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTitle || !newUrl) return;

        setIsSubmitting(true);
        try {
      const headers = await getAuthHeaders();
            const res = await fetch('/api/vault?resource=community&subResource=gallery', {
                method: 'POST',
                headers: { ...headers,  'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: newTitle,
                    type: newType,
                    url: newUrl,
                    thumbnail: newThumbnail,
                    description: newDescription,
                    category: newCategory
                })
            });

            if (res.ok) {
                setIsModalOpen(false);
                setNewTitle('');
                setNewUrl('');
                setNewThumbnail('');
                setNewDescription('');
                setNewCategory('');
                fetchItems();
            }
        } catch (e) {
            console.error("Failed to add gallery item", e);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this item?')) return;

        try {
      const headers = await getAuthHeaders();
            const res = await fetch(`/api/vault?resource=community&subResource=gallery&id=${id}`, { headers,
                method: 'DELETE'
            });
            if (res.ok) {
                setItems(prev => prev.filter(item => item.id !== id));
            }
        } catch (e) {
            console.error("Failed to delete item", e);
        }
    };

    return (
        <div className="flex-1 flex flex-col bg-white rounded-none lg:rounded-[2.5rem] border-none lg:border lg:border-gray-100 overflow-hidden shadow-none lg:shadow-2xl relative animate-in fade-in duration-700 h-full">
            {/* Header */}
            <div className="px-6 border-b border-gray-100 flex items-center justify-between bg-white shrink-0 h-20">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-burgundy/5 flex items-center justify-center text-burgundy">
                        <ImageIcon size={20} />
                    </div>
                    <div>
                        <h1 className="text-xl font-black text-[#0d1a14] tracking-tight">Media Gallery</h1>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Asset Management Node</p>
                    </div>
                </div>
                {canManage && (
                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="flex items-center gap-2 px-6 py-3 bg-burgundy text-gold font-black text-xs uppercase tracking-widest rounded-xl shadow-lg active:scale-95 transition-all"
                    >
                        <Plus size={18} />
                        Add Media
                    </button>
                )}
            </div>

            {/* Toolbar */}
            <div className="px-12 py-6 bg-gray-50/50 border-b border-gray-100 flex flex-col md:flex-row gap-4 items-center shrink-0">
                <div className="relative flex-1 group w-full">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-gold transition-colors" size={16} />
                    <input
                        type="text"
                        placeholder="Search assets..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-11 pr-4 py-3 bg-white border border-transparent focus:border-gold/30 rounded-2xl outline-none shadow-sm transition-all text-sm font-medium text-[#0d1a14]"
                    />
                </div>
                <div className="flex items-center gap-2 bg-white p-1.5 rounded-2xl border border-gray-100 shadow-sm w-full md:w-auto">
                    <button
                        onClick={() => setFilterType('all')}
                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filterType === 'all' ? 'bg-burgundy text-gold shadow-md' : 'text-gray-400 hover:text-burgundy'}`}
                    >
                        All
                    </button>
                    <button
                        onClick={() => setFilterType('image')}
                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filterType === 'image' ? 'bg-burgundy text-gold shadow-md' : 'text-gray-400 hover:text-burgundy'}`}
                    >
                        Images
                    </button>
                    <button
                        onClick={() => setFilterType('video')}
                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filterType === 'video' ? 'bg-burgundy text-gold shadow-md' : 'text-gray-400 hover:text-burgundy'}`}
                    >
                        Videos
                    </button>
                </div>
            </div>

            {/* Grid */}
            <div className="flex-1 overflow-y-auto px-12 py-10 custom-scrollbar">
                {loading ? (
                    <div className="flex flex-col items-center justify-center h-64 text-gray-300">
                        <Loader2 className="animate-spin mb-4" size={32} />
                        <p className="text-xs font-black uppercase tracking-widest">Initialising Assets...</p>
                    </div>
                ) : filteredItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-gray-300 opacity-50">
                        <Camera size={48} className="mb-4" />
                        <p className="text-sm font-bold uppercase tracking-widest">No assets discovered</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                        {filteredItems.map((item) => (
                            <div key={item.id} className="group bg-white rounded-[2rem] border border-gray-100 shadow-sm hover:shadow-2xl transition-all duration-500 overflow-hidden flex flex-col relative animate-in fade-in zoom-in-95">
                                <div className="aspect-video bg-gray-100 relative overflow-hidden shrink-0">
                                    {item.type === 'image' ? (
                                        <img src={item.thumbnail || item.url} alt={item.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-[#1a1a1a] text-gold/40 relative">
                                            {item.thumbnail ? (
                                                <img src={item.thumbnail} alt={item.title} className="w-full h-full object-cover opacity-50" />
                                            ) : (
                                                <Film size={48} strokeWidth={1} />
                                            )}
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <div className="w-12 h-12 rounded-full bg-burgundy/80 text-gold flex items-center justify-center shadow-2xl">
                                                    <Video size={24} fill="currentColor" />
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                                        <a href={item.url} target="_blank" rel="noopener noreferrer" className="p-3 bg-white text-burgundy rounded-xl hover:bg-gold hover:text-white transition-all shadow-xl">
                                            <ExternalLink size={20} />
                                        </a>
                                        {canManage && (
                                            <button
                                                onClick={() => handleDelete(item.id)}
                                                className="p-3 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-all shadow-xl"
                                            >
                                                <Trash2 size={20} />
                                            </button>
                                        )}
                                    </div>
                                    <div className="absolute top-4 left-4 px-3 py-1 bg-white/90 backdrop-blur rounded-lg text-[8px] font-black uppercase tracking-widest text-burgundy shadow-sm border border-white">
                                        {item.type}
                                    </div>
                                </div>
                                <div className="p-6 flex-1 flex flex-col">
                                    <h3 className="text-sm font-black text-[#0d1a14] uppercase tracking-tight truncate mb-1">{item.title}</h3>
                                    <div className="flex items-center justify-between">
                                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{item.category || 'General'}</p>
                                        <p className="text-[9px] text-gray-300 font-medium">{new Date(item.created_at).toLocaleDateString()}</p>
                                    </div>
                                    {item.description && (
                                        <p className="mt-3 text-[11px] text-gray-500 line-clamp-2 md:line-clamp-3 leading-relaxed">
                                            {item.description}
                                        </p>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-white rounded-[3rem] w-full max-w-xl shadow-2xl border border-gold/30 p-10">
                        <div className="flex items-center justify-between mb-8">
                            <h3 className="text-2xl font-black text-[#0d1a14] uppercase tracking-tighter">Initialize Asset</h3>
                            <button onClick={() => setIsModalOpen(false)} className="p-2 text-gray-300 hover:text-burgundy rounded-xl transition-all">
                                <X size={24} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Display Title</label>
                                <input
                                    type="text"
                                    required
                                    value={newTitle}
                                    onChange={e => setNewTitle(e.target.value)}
                                    className="w-full h-14 px-6 rounded-2xl bg-gray-50 border border-transparent focus:bg-white focus:border-gold outline-none transition-all font-bold text-[#0d1a14] shadow-inner"
                                    placeholder="Cinematic Shot"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Type</label>
                                    <select
                                        value={newType}
                                        onChange={e => setNewType(e.target.value as 'image' | 'video')}
                                        className="w-full h-14 px-6 rounded-2xl bg-gray-50 border border-transparent focus:bg-white focus:border-gold outline-none transition-all font-bold text-[#0d1a14] appearance-none shadow-inner"
                                    >
                                        <option value="image">Image</option>
                                        <option value="video">Video URL</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Category</label>
                                    <input
                                        type="text"
                                        value={newCategory}
                                        onChange={e => setNewCategory(e.target.value)}
                                        className="w-full h-14 px-6 rounded-2xl bg-gray-50 border border-transparent focus:bg-white focus:border-gold outline-none transition-all font-bold text-[#0d1a14] shadow-inner"
                                        placeholder="Worship"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Description</label>
                                <textarea
                                    rows={2}
                                    value={newDescription}
                                    onChange={e => setNewDescription(e.target.value)}
                                    className="w-full px-6 py-4 rounded-2xl bg-gray-50 border border-transparent focus:bg-white focus:border-gold outline-none transition-all font-medium text-gray-700 resize-none shadow-inner text-sm"
                                    placeholder="Tell us about this media..."
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Remote URL (Primary)</label>
                                    <input
                                        type="url"
                                        required
                                        value={newUrl}
                                        onChange={e => setNewUrl(e.target.value)}
                                        className="w-full h-14 px-6 rounded-2xl bg-gray-50 border border-transparent focus:bg-white focus:border-gold outline-none transition-all font-bold text-[#0d1a14] shadow-inner text-sm"
                                        placeholder="https://images.unsplash.com/..."
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Thumbnail URL (Optional)</label>
                                    <input
                                        type="url"
                                        value={newThumbnail}
                                        onChange={e => setNewThumbnail(e.target.value)}
                                        className="w-full h-14 px-6 rounded-2xl bg-gray-50 border border-transparent focus:bg-white focus:border-gold outline-none transition-all font-bold text-[#0d1a14] shadow-inner text-sm"
                                        placeholder="https://..."
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="w-full py-5 bg-burgundy text-gold rounded-2xl font-black uppercase text-xs tracking-[0.2em] shadow-xl border-b-4 border-gold/40 hover:bg-burgundy-dark transition-all disabled:opacity-50 mt-4"
                            >
                                {isSubmitting ? 'Syncing...' : 'Deploy Media'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(29, 55, 44, 0.1); border-radius: 10px; }
      `}</style>
        </div>
    );
};

export default GalleryPage;
