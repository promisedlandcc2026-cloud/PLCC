
import React, { useState, useEffect } from 'react';
import {
  Tag as TagIcon,
  Search,
  Plus,
  Filter,
  MoreVertical,
  Users,
  Sparkles,
  LifeBuoy,
  FolderOpen,
  X,
  Loader2,
  Trash2
} from 'lucide-react';
import { Tag, TagCategory } from '../../types';

const TagsManagerPage: React.FC = () => {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState<{ name: string; category: TagCategory; color: string }>({
    name: '',
    category: 'Other',
    color: 'bg-gray-100 text-gray-800'
  });

  const categoryOptions: TagCategory[] = ['Spiritual', 'Service', 'Demographic', 'Event', 'Other'];

  const colorOptions = [
    { label: 'Gray', value: 'bg-gray-100 text-gray-800' },
    { label: 'Gold', value: 'bg-gold text-white' },
    { label: 'Burgundy', value: 'bg-burgundy text-gold' },
    { label: 'Blue', value: 'bg-blue-100 text-blue-800' },
    { label: 'Green', value: 'bg-green-100 text-green-800' },
    { label: 'Dark', value: 'bg-[#1a2e35] text-white' },
  ];

  useEffect(() => {
    fetchTags();
  }, []);

  const fetchTags = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/vault?resource=people&subResource=tags');
      const data = await res.json();
      if (data.ok) {
        setTags(data.tags);
      }
    } catch (err) {
      console.error("Failed to fetch tags", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/vault?resource=people&subResource=tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (data.ok) {
        setTags([...tags, { ...data.tag, count: 0 }]);
        setShowModal(false);
        setFormData({ name: '', category: 'Other', color: 'bg-gray-100 text-gray-800' });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this tag? This will remove it from all members.")) return;
    try {
      const res = await fetch('/api/vault?resource=people&subResource=tags', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      if (res.ok) {
        setTags(tags.filter(t => t.id !== id));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const filteredTags = tags.filter(tag =>
    tag.name.toLowerCase().includes(search.toLowerCase()) ||
    tag.category.toLowerCase().includes(search.toLowerCase())
  );

  const totalMembersTagged = tags.reduce((acc, curr) => acc + (curr.count || 0), 0);

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12 relative">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-extrabold text-[#0d1a14] mb-2 tracking-tight">Tags Manager</h1>
          <p className="text-gray-400 font-medium">Categorize your congregation for smarter follow-ups and reporting.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-burgundy text-gold font-bold text-sm shadow-xl shadow-burgundy/20 hover:bg-burgundy-dark transition-all active:scale-95 border-b-2 border-gold/30"
        >
          <Plus size={18} />
          Create New Tag
        </button>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-[2rem] border border-gray-50 shadow-sm flex items-center gap-5">
          <div className="w-14 h-14 rounded-2xl bg-gold-cream text-gold flex items-center justify-center shadow-inner">
            <TagIcon size={28} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Active Tags</p>
            <p className="text-2xl font-bold text-[#0d1a14]">{tags.length} Unique</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-[2rem] border border-gray-50 shadow-sm flex items-center gap-5">
          <div className="w-14 h-14 rounded-2xl bg-burgundy/5 text-burgundy flex items-center justify-center shadow-inner">
            <Users size={28} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Tagged Members</p>
            <p className="text-2xl font-bold text-[#0d1a14]">{totalMembersTagged.toLocaleString()}</p>
          </div>
        </div>
        <div className="bg-gold-cream/30 p-6 rounded-[2rem] border border-gold/10 shadow-sm flex items-center gap-5 group cursor-pointer hover:bg-gold-cream/50 transition-colors">
          <Sparkles size={28} className="text-gold" />
          <div>
            <p className="text-[10px] font-bold text-burgundy uppercase tracking-widest">Smart Cleanup</p>
            <p className="text-sm font-bold text-burgundy underline">Archive unused tags</p>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-[2.5rem] border border-gray-50 shadow-[0_8px_40px_rgba(0,0,0,0.02)] overflow-hidden min-h-[400px]">

        {/* Toolbar */}
        <div className="p-8 border-b border-gray-50 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="relative group flex-1 max-w-xl">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-gold transition-colors" size={20} />
            <input
              type="text"
              placeholder="Search tags by name or category..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-12 pr-6 py-4 bg-gray-50/50 rounded-2xl outline-none border border-transparent focus:bg-white focus:border-gold/20 focus:ring-4 focus:ring-gold/5 transition-all text-sm font-semibold text-[#0d1a14]"
            />
          </div>
          <button className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-white border border-gray-100 text-gray-400 font-bold text-sm hover:bg-gray-50">
            <Filter size={18} />
            Filters
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin text-gold" size={40} />
          </div>
        ) : filteredTags.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center mb-4">
              <TagIcon className="text-gray-300" size={32} />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-1">No tags found</h3>
            <p className="text-gray-400">Try adjusting your search or create a new tag.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gold-cream/20">
                  <th className="px-8 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">Tag Name</th>
                  <th className="px-8 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">Category</th>
                  <th className="px-8 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">Usage</th>
                  <th className="px-8 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">Preview</th>
                  <th className="px-8 py-5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredTags.map(tag => (
                  <tr key={tag.id} className="group hover:bg-gold-cream/10 transition-colors">
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform ${tag.color}`}>
                          <TagIcon size={18} />
                        </div>
                        <p className="text-[15px] font-bold text-[#0d1a14]">{tag.name}</p>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-2">
                        <FolderOpen size={14} className="text-gold" />
                        <span className="text-[13px] font-semibold text-gray-500">{tag.category}</span>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <p className="text-[14px] font-bold text-burgundy">{(tag.count || 0).toLocaleString()}</p>
                      <p className="text-[10px] text-gray-300 font-bold uppercase tracking-widest">Members</p>
                    </td>
                    <td className="px-8 py-6">
                      <span className={`inline-flex px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${tag.color} opacity-80 group-hover:opacity-100 transition-opacity`}>
                        {tag.name}
                      </span>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex justify-end gap-2">
                        <button
                          onClick={() => handleDelete(tag.id)}
                          className="p-2.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                          title="Delete Tag"
                        >
                          <Trash2 size={18} />
                        </button>
                        <button className="p-2.5 text-gray-400 hover:text-[#0d1a14] hover:bg-white rounded-xl transition-all">
                          <MoreVertical size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer Support Pointers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
        <div className="bg-white p-8 rounded-[2rem] border border-gray-50 shadow-sm flex items-start gap-5 group hover:shadow-md transition-shadow">
          <div className="w-12 h-12 rounded-2xl bg-gold-cream text-gold flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition-transform">
            <Sparkles size={24} />
          </div>
          <div>
            <h4 className="font-bold text-[#0d1a14] text-lg mb-1">Tagging Strategy</h4>
            <p className="text-sm text-gray-400 font-medium leading-relaxed">
              Need advice on how to organize your membership tags for better reporting? Ask <button className="text-burgundy font-bold hover:underline">PLCC AI</button> for industry-best taxonomies.
            </p>
          </div>
        </div>
        <div className="bg-white p-8 rounded-[2rem] border border-gray-50 shadow-sm flex items-start gap-5 group hover:shadow-md transition-shadow">
          <div className="w-12 h-12 rounded-2xl bg-burgundy/5 text-burgundy flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition-transform">
            <LifeBuoy size={24} />
          </div>
          <div>
            <h4 className="font-bold text-[#0d1a14] text-lg mb-1">Technical Mapping</h4>
            <p className="text-sm text-gray-400 font-medium leading-relaxed">
              Facing issues with bulk tagging or external data synchronization? Our technical team is ready to help. <button className="text-burgundy font-bold hover:underline">Contact Support</button>.
            </p>
          </div>
        </div>
      </div>

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0d1a14]/20 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-white/40 ring-1 ring-black/5"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-8 py-6 border-b border-gray-50 flex items-center justify-between bg-gradient-to-r from-white to-gray-50/50">
              <div>
                <h2 className="text-2xl font-extrabold text-[#0d1a14]">Create New Tag</h2>
                <p className="text-sm text-gray-400 font-medium mt-1">Define a new segment for your people.</p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleCreate} className="p-8 space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">Tag Name</label>
                  <input
                    autoFocus
                    type="text"
                    placeholder="e.g. 2024 New Member"
                    className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-gold/20 font-bold text-[#0d1a14] placeholder:text-gray-300"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">Category</label>
                    <select
                      className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-gold/20 font-bold text-[#0d1a14] appearance-none"
                      value={formData.category}
                      onChange={e => setFormData({ ...formData, category: e.target.value as TagCategory })}
                    >
                      {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">Color Theme</label>
                    <select
                      className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-gold/20 font-bold text-[#0d1a14] appearance-none"
                      value={formData.color}
                      onChange={e => setFormData({ ...formData, color: e.target.value })}
                    >
                      {colorOptions.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                </div>

                {/* Preview */}
                <div className="pt-4">
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 ml-1">Preview</label>
                  <div className="p-6 bg-gray-50/50 rounded-2xl border border-dashed border-gray-200 flex items-center justify-center">
                    <span className={`inline-flex px-4 py-2 rounded-xl text-sm font-bold uppercase tracking-wider ${formData.color} shadow-sm`}>
                      {formData.name || 'Tag Name'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-4 rounded-2xl font-bold text-gray-500 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-[2] py-4 rounded-2xl bg-[#0d1a14] text-white font-bold hover:bg-[#12231c] transition-all shadow-lg shadow-burgundy/20 active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {submitting ? <Loader2 className="animate-spin" size={20} /> : 'Create Tag'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default TagsManagerPage;
