
import React, { useState, useEffect } from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import {
    Plus,
    Search,
    Trash2,
    Edit2,
    MessageSquare,
    Calendar,
    User,
    Tag,
    ExternalLink,
    Save,
    X,
    Image as ImageIcon
} from 'lucide-react';
import { useNav } from '../../App';
import { getAuthHeaders } from '../../lib/api';

interface CommunityVoice {
    id: string;
    title: string;
    excerpt: string;
    content: string;
    author: string;
    author_image_url?: string;
    published_date: string;
    category: string;
    image_url: string;
    comments: any[];
    status: 'published' | 'draft' | 'archived';
    created_at?: string;
}

const CommunityVoices: React.FC = () => {
    const { userRole, userId } = useNav();
    const [posts, setPosts] = useState<CommunityVoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('All');

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingPost, setEditingPost] = useState<CommunityVoice | null>(null);
    const [formData, setFormData] = useState<Partial<CommunityVoice>>({
        title: '',
        excerpt: '',
        content: '',
        author: '',
        author_image_url: '',
        category: '',
        image_url: '',
        status: 'published'
    });

    const categories = ['All', 'Spiritual Growth', 'Prayer & Worship', 'Family & Parenting', 'Testimony', 'Community Outreach', 'Worship', 'Leadership'];

    useEffect(() => {
        fetchPosts();
    }, []);

    const fetchPosts = async () => {
        try {
      const headers = await getAuthHeaders();
            setLoading(true);
            const res = await fetch('/api/vault?resource=community&subResource=voices', { headers });
            const data = await res.json();
            if (Array.isArray(data)) {
                setPosts(data);
            }
        } catch (error) {
            console.error('Failed to fetch voices:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this post?')) return;
        try {
      const headers = await getAuthHeaders();
            await fetch(`/api/vault?resource=community&subResource=voices&id=${id}`, { headers,
                method: 'DELETE'
            });
            setPosts(posts.filter(p => p.id !== id));
        } catch (e) {
            console.error('Delete failed:', e);
        }
    };

    const handleSave = async () => {
        try {
      const headers = await getAuthHeaders();
            const isEdit = !!editingPost;
            const method = isEdit ? 'PATCH' : 'POST';
            const body = isEdit ? { ...formData, id: editingPost.id } : formData;

            const res = await fetch('/api/vault?resource=community&subResource=voices', {
                method,
                headers: { ...headers, 
                    'Content-Type': 'application/json',
                    'X-User-ID': userId || ''
                },
                body: JSON.stringify(body)
            });

            if (res.ok) {
                setIsModalOpen(false);
                setEditingPost(null);
                setFormData({ title: '', excerpt: '', content: '', author: '', author_image_url: '', category: '', image_url: '', status: 'published' });
                fetchPosts();
            }
        } catch (e) {
            console.error('Save failed:', e);
        }
    };

    const openEdit = (post: CommunityVoice) => {
        setEditingPost(post);
        setFormData(post);
        setIsModalOpen(true);
    };

    const openNew = () => {
        setEditingPost(null);
        setFormData({
            title: '',
            excerpt: '',
            content: '',
            author: '',
            author_image_url: '',
            category: '',
            image_url: '',
            status: 'published',
            published_date: new Date().toISOString().split('T')[0]
        });
        setIsModalOpen(true);
    };

    const filteredPosts = posts.filter(post => {
        const matchesSearch = post.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            post.author.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesCategory = selectedCategory === 'All' || post.category === selectedCategory;
        return matchesSearch && matchesCategory;
    });

    const quillModules = {
        toolbar: [
            [{ 'header': [1, 2, 3, false] }],
            ['bold', 'italic', 'underline', 'strike'],
            [{ 'list': 'ordered' }, { 'list': 'bullet' }],
            ['link', 'clean']
        ],
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="h-1 w-8 bg-burgundy rounded-full" />
                        <h2 className="text-[10px] font-black text-burgundy/60 uppercase tracking-widest">Community Hub</h2>
                    </div>
                    <h1 className="text-3xl md:text-4xl font-black text-[#0d1a14] uppercase tracking-tighter">
                        Community Voices<span className="text-gold">.</span>
                    </h1>
                    <p className="text-gray-400 font-medium mt-2">Manage blog posts, testimonies, and community reflections.</p>
                </div>
                <button
                    onClick={openNew}
                    className="px-6 py-4 bg-burgundy text-gold font-black uppercase tracking-widest text-xs rounded-xl shadow-lg hover:shadow-burgundy/20 active:scale-95 transition-all flex items-center gap-3"
                >
                    <Plus size={16} />
                    Create New Post
                </button>
            </div>

            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-gold transition-colors" size={18} />
                    <input
                        type="text"
                        placeholder="Search posts or authors..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full h-12 pl-12 pr-4 bg-white rounded-xl border border-gray-100 focus:border-gold focus:ring-4 focus:ring-gold/5 outline-none font-bold text-sm transition-all"
                    />
                </div>
                <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0 no-scrollbar">
                    {categories.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setSelectedCategory(cat)}
                            className={`px-4 h-12 rounded-xl whitespace-nowrap text-xs font-black uppercase tracking-wider transition-all border ${selectedCategory === cat
                                ? 'bg-burgundy text-white border-burgundy shadow-lg shadow-burgundy/20'
                                : 'bg-white text-gray-400 border-gray-100 hover:border-gray-200'
                                }`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {loading ? (
                    [...Array(3)].map((_, i) => (
                        <div key={i} className="bg-white rounded-[2rem] h-[400px] animate-pulse bg-gray-50 border border-gray-100" />
                    ))
                ) : filteredPosts.length > 0 ? (
                    filteredPosts.map(post => (
                        <div key={post.id} className="group bg-white rounded-[2.5rem] p-6 border border-gray-100 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col h-full relative overflow-hidden">
                            {/* Image Overlay */}
                            <div className="absolute top-0 left-0 w-full h-48 bg-gray-100 -z-10">
                                {post.image_url && <img src={post.image_url} className="w-full h-full object-cover opacity-90 group-hover:scale-105 transition-transform duration-700" alt={post.title} />}
                                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-white" />
                            </div>

                            <div className="mt-32 flex flex-col flex-1">
                                <div className="flex justify-between items-start mb-4">
                                    <span className="bg-white/80 backdrop-blur-md px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest text-burgundy border border-gray-100 shadow-sm">
                                        {post.category}
                                    </span>
                                    <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border shadow-sm ${post.status === 'published' ? 'bg-green-50 text-green-600 border-green-100' : 'bg-gray-100 text-gray-500 border-gray-200'
                                        }`}>
                                        {post.status}
                                    </span>
                                </div>

                                <h3 className="text-xl font-black text-[#0d1a14] leading-tight mb-2 line-clamp-2">{post.title}</h3>
                                <p className="text-xs text-gray-400 font-medium line-clamp-3 mb-6 flex-1" dangerouslySetInnerHTML={{ __html: post.excerpt }}></p>

                                <div className="space-y-4 pt-6 border-t border-gray-50">
                                    <div className="flex items-center justify-between text-xs text-gray-400 font-bold uppercase tracking-wider">
                                        <div className="flex items-center gap-2">
                                            {post.author_image_url ? (
                                                <img src={post.author_image_url} className="w-6 h-6 rounded-full object-cover" alt={post.author} />
                                            ) : (
                                                <User size={14} />
                                            )}
                                            {post.author}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <MessageSquare size={14} /> {post.comments?.length || 0}
                                        </div>
                                    </div>

                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => openEdit(post)}
                                            className="flex-1 py-3 bg-gray-50 hover:bg-gold hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                                        >
                                            Edit
                                        </button>
                                        <button
                                            onClick={() => handleDelete(post.id)}
                                            className="px-4 py-3 bg-red-50 hover:bg-red-500 hover:text-white rounded-xl text-red-500 transition-all"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="col-span-full py-20 text-center">
                        <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6 text-gray-300">
                            <Calendar size={32} />
                        </div>
                        <p className="text-gray-400 font-medium">No posts found matching your criteria.</p>
                    </div>
                )}
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[150] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-white w-full max-w-4xl rounded-[2.5rem] shadow-2xl p-8 max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-8">
                            <h3 className="text-2xl font-black text-[#0d1a14] uppercase tracking-tight">
                                {editingPost ? 'Edit Post' : 'New Reflection'}
                            </h3>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Title</label>
                                    <input
                                        value={formData.title}
                                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                        className="w-full h-12 px-4 bg-gray-50 rounded-xl border-none outline-none focus:ring-2 focus:ring-gold text-sm font-bold"
                                        placeholder="Title of query..."
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Author</label>
                                    <input
                                        value={formData.author}
                                        onChange={(e) => setFormData({ ...formData, author: e.target.value })}
                                        className="w-full h-12 px-4 bg-gray-50 rounded-xl border-none outline-none focus:ring-2 focus:ring-gold text-sm font-bold"
                                        placeholder="Author name"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Author Image URL</label>
                                    <div className="relative">
                                        <ImageIcon size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" />
                                        <input
                                            value={formData.author_image_url}
                                            onChange={(e) => setFormData({ ...formData, author_image_url: e.target.value })}
                                            className="w-full h-12 pl-12 pr-4 bg-gray-50 rounded-xl border-none outline-none focus:ring-2 focus:ring-gold text-sm font-bold"
                                            placeholder="https://..."
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Category</label>
                                    <select
                                        value={formData.category}
                                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                        className="w-full h-12 px-4 bg-gray-50 rounded-xl border-none outline-none focus:ring-2 focus:ring-gold text-sm font-bold"
                                    >
                                        <option value="">Select Category</option>
                                        {categories.filter(c => c !== 'All').map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Main Image URL</label>
                                    <div className="relative">
                                        <ExternalLink size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" />
                                        <input
                                            value={formData.image_url}
                                            onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                                            className="w-full h-12 pl-12 pr-4 bg-gray-50 rounded-xl border-none outline-none focus:ring-2 focus:ring-gold text-sm font-bold"
                                            placeholder="https://images.unsplash.com/..."
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Status</label>
                                    <select
                                        value={formData.status}
                                        onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                                        className="w-full h-12 px-4 bg-gray-50 rounded-xl border-none outline-none focus:ring-2 focus:ring-gold text-sm font-bold"
                                    >
                                        <option value="published">Published</option>
                                        <option value="draft">Draft</option>
                                        <option value="archived">Archived</option>
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Excerpt (Short Description)</label>
                                <textarea
                                    value={formData.excerpt}
                                    onChange={(e) => setFormData({ ...formData, excerpt: e.target.value })}
                                    className="w-full h-24 p-4 bg-gray-50 rounded-xl border-none outline-none focus:ring-2 focus:ring-gold text-sm font-medium resize-none"
                                    placeholder="Brief summary..."
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Full Content</label>
                                <div className="bg-gray-50 rounded-xl overflow-hidden border border-transparent focus-within:border-gold focus-within:ring-2 focus-within:ring-gold transition-all">
                                    <ReactQuill
                                        theme="snow"
                                        value={formData.content}
                                        onChange={(content) => setFormData({ ...formData, content })}
                                        modules={quillModules}
                                        className="h-64 mb-12"
                                    />
                                </div>
                            </div>

                            <button
                                onClick={handleSave}
                                className="w-full h-16 bg-burgundy text-gold font-black uppercase tracking-widest rounded-2xl shadow-lg hover:shadow-xl hover:shadow-burgundy/20 active:scale-95 transition-all flex items-center justify-center gap-3"
                            >
                                <Save size={20} />
                                Save Post
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CommunityVoices;
