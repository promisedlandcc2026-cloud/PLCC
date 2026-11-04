
import React, { useState, useEffect } from 'react';
import {
  Plus,
  MessageSquare,
  Mail,
  FileText,
  Copy,
  CheckSquare,
  Loader2,
  X,
  Trash2
} from 'lucide-react';
import { FollowUpTemplate } from '../../types';

import { authedFetch } from '../../lib/authedFetch';
const FollowUpTemplatesPage: React.FC = () => {
  const [templates, setTemplates] = useState<FollowUpTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newTemplate, setNewTemplate] = useState<{ id?: string; name: string; type: string; subject: string; content: string }>({ name: '', type: 'Email', subject: '', content: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const res = await authedFetch('/api/tools?resource=followup_templates');
      const data = await res.json();
      if (data.ok) setTemplates(data.templates);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (tmpl: FollowUpTemplate) => {
    setNewTemplate({
      id: tmpl.id,
      name: tmpl.name,
      type: tmpl.type,
      subject: tmpl.subject || '',
      content: tmpl.content
    });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const method = (newTemplate as any).id ? 'PATCH' : 'POST';
      const res = await authedFetch('/api/tools?resource=followup_templates', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTemplate)
      });
      if (res.ok) {
        await fetchTemplates();
        setIsModalOpen(false);
        setNewTemplate({ name: '', type: 'Email', subject: '', content: '' });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'SMS': return <MessageSquare size={24} />;
      case 'Email': return <Mail size={24} />;
      case 'Task': return <CheckSquare size={24} />;
      default: return <FileText size={24} />;
    }
  };

  const getColor = (type: string) => {
    switch (type) {
      case 'SMS': return 'bg-burgundy/5 text-burgundy';
      case 'Email': return 'bg-gold/10 text-gold';
      case 'Task': return 'bg-[#1a2e35]/5 text-[#1a2e35]';
      default: return 'bg-gray-50 text-gray-500';
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-extrabold text-[#0d1a14] mb-2 tracking-tight">Care Templates</h1>
          <p className="text-gray-400 font-medium">Standardize outreach with reusable scripts and tasks.</p>
        </div>
        <button
          onClick={() => { setNewTemplate({ name: '', type: 'Email', subject: '', content: '' }); setIsModalOpen(true); }}
          className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-burgundy text-gold font-bold text-sm shadow-xl shadow-burgundy/20 hover:bg-burgundy-dark transition-all active:scale-95 border-b-2 border-gold/30"
        >
          <Plus size={18} />
          New Template
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-gray-300" size={32} /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {templates.map(tmpl => (
            <div key={tmpl.id} className="bg-white rounded-[2.5rem] border border-gray-50 shadow-sm flex flex-col group hover:shadow-2xl transition-all border-b-4 border-b-transparent hover:border-b-gold">
              <div className="p-8 flex flex-col h-full">
                <div className="flex items-start justify-between mb-8">
                  <div className={`w-14 h-14 rounded-2xl ${getColor(tmpl.type)} flex items-center justify-center shadow-inner transition-transform group-hover:rotate-3`}>
                    {getIcon(tmpl.type)}
                  </div>
                </div>

                <h3 className="text-lg font-black text-[#0d1a14] mb-1 tracking-tight group-hover:text-burgundy transition-colors">{tmpl.name}</h3>
                <p className="text-[10px] font-bold text-gray-300 uppercase tracking-[0.2em] mb-4">{tmpl.type} Template</p>

                <div className="flex-1">
                  <p className="text-xs text-gray-400 line-clamp-4 leading-relaxed font-medium bg-gray-50 p-3 rounded-xl border border-gray-100">
                    {tmpl.subject && <span className="block font-bold mb-1 text-gray-500">Subject: {tmpl.subject}</span>}
                    {tmpl.content}
                  </p>
                </div>

                <button
                  onClick={() => handleEdit(tmpl)}
                  className="w-full mt-6 py-3 bg-gray-50 text-[#0d1a14] font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-gold-cream transition-colors border border-transparent hover:border-gold/10 flex items-center justify-center gap-2"
                >
                  Edit Content
                </button>
              </div>
            </div>
          ))}

          {templates.length === 0 && (
            <div className="col-span-full py-20 text-center text-gray-400 font-medium bg-gray-50 rounded-[3rem] border border-dashed border-gray-200">
              No templates found. Create one to get started.
            </div>
          )}
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-lg p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-black text-[#0d1a14]">{(newTemplate as any).id ? 'Edit' : 'New'} Care Template</h2>
              <button onClick={() => setIsModalOpen(false)} className="p-2 bg-gray-50 rounded-full hover:bg-gray-100"><X size={20} /></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Template Name</label>
                <input
                  className="w-full p-4 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-gold/50 outline-none font-bold text-[#0d1a14]"
                  placeholder="e.g. Visitor Welcome Email"
                  value={newTemplate.name}
                  onChange={e => setNewTemplate({ ...newTemplate, name: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Type</label>
                <div className="flex gap-2">
                  {['Email', 'SMS', 'Task', 'Script'].map(t => (
                    <button
                      key={t}
                      onClick={() => setNewTemplate({ ...newTemplate, type: t })}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${newTemplate.type === t ? 'bg-burgundy text-gold shadow-lg shadow-burgundy/20' : 'bg-gray-50 text-gray-400 hover:bg-gray-100'}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {newTemplate.type === 'Email' && (
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Subject Line</label>
                  <input
                    className="w-full p-4 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-gold/50 outline-none font-medium text-gray-600"
                    placeholder="Subject..."
                    value={newTemplate.subject}
                    onChange={e => setNewTemplate({ ...newTemplate, subject: e.target.value })}
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Content</label>
                <textarea
                  className="w-full p-4 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-gold/50 outline-none font-medium text-gray-600 min-h-[150px]"
                  placeholder="Write your template content here..."
                  value={newTemplate.content}
                  onChange={e => setNewTemplate({ ...newTemplate, content: e.target.value })}
                />
              </div>

              <button
                onClick={handleSave}
                disabled={saving || !newTemplate.name || !newTemplate.content}
                className="w-full py-4 bg-burgundy text-gold font-black text-sm uppercase tracking-widest rounded-xl hover:bg-burgundy-dark transition-all shadow-lg shadow-burgundy/20 disabled:opacity-50 disabled:cursor-not-allowed mt-4"
              >
                {saving ? 'Saving...' : ((newTemplate as any).id ? 'Update Template' : 'Create Template')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FollowUpTemplatesPage;
