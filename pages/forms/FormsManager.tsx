
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNav } from '../../App';
import { canPerform } from '../../lib/permissions';
import {
  FileEdit,
  Plus,
  Search,
  MoreHorizontal,
  ChevronRight,
  Users,
  Sparkles,
  LifeBuoy,
  Layout,
  ExternalLink,
  Eye,
  CheckCircle2,
  Clock,
  AlertCircle,
  Trash2,
} from 'lucide-react';

import { authedFetch } from '../../lib/authedFetch';
const FormsManagerPage: React.FC = () => {
  const navigate = useNavigate();
  const { userRole } = useNav();
  const [search, setSearch] = useState('');
  // Filters
  const [filterType, setFilterType] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Debug Role Access
  useEffect(() => {
    console.log('[FormsManager] Current userRole:', userRole);
    console.log('[FormsManager] Can perform people.edit?', canPerform(userRole, 'people.edit'));
    console.log('[FormsManager] Is Admin/SuperAdmin?', userRole === 'ADMIN' || userRole === 'SUPER_ADMIN');
  }, [userRole]);

  const [forms, setForms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [selectedForm, setSelectedForm] = useState<any>(null);
  const [newForm, setNewForm] = useState({
    title: '',
    description: '',
    type: 'Registration' as 'Registration' | 'Spiritual' | 'Service' | 'Giving' | 'Feedback' | 'Other',
    status: 'Draft' as 'Draft' | 'Active' | 'Archived'
  });

  useEffect(() => {
    const fetchForms = async () => {
      try {
        setLoading(true);
        const response = await authedFetch('/api/vault?resource=tools&subResource=forms');
        const data = await response.json();

        if (data.ok) {
          setForms(data.forms);
        } else {
          setError(data.error || 'Failed to load forms');
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load forms');
      } finally {
        setLoading(false);
      }
    };

    fetchForms();
  }, []);

  const createForm = async () => {
    if (!newForm.title.trim()) {
      alert('Please enter a form title');
      return;
    }

    try {
      setCreating(true);
      const response = await authedFetch('/api/vault?resource=tools&subResource=forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newForm.title,
          description: newForm.description,
          type: newForm.type,
          status: newForm.status,
          fields: [], // Start with empty fields, can be edited later
          settings: {
            allowMultiple: false,
            requireAuth: false
          }
        })
      });

      const data = await response.json();
      if (data.ok) {
        setForms([data.form, ...forms]);
        setShowCreateModal(false);
        setNewForm({ title: '', description: '', type: 'Registration', status: 'Draft' });
        openFormBuilder(data.form.id);
      } else {
        alert(data.error || 'Failed to create form');
      }
    } catch (err: any) {
      alert(err.message || 'Failed to create form');
    } finally {
      setCreating(false);
    }
  };

  const createDefaultForm = async () => {
    try {
      setCreating(true);
      const response = await authedFetch('/api/vault?resource=tools&subResource=forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Untitled Form',
          description: '',
          type: 'Other',
          status: 'Draft',
          fields: [], // Start with empty fields
          settings: { allowMultiple: false, requireAuth: false }
        })
      });

      const data = await response.json();
      if (data.ok) {
        // Navigate to builder
        openFormBuilder(data.form.id);
      } else {
        alert(data.error || 'Failed to create form');
      }
    } catch (err: any) {
      alert(err.message || 'Failed to create form');
    } finally {
      setCreating(false);
    }
  };

  const updateForm = async () => {
    if (!selectedForm || !selectedForm.title?.trim()) {
      alert('Please enter a form title');
      return;
    }

    try {
      setUpdating(true);
      const response = await authedFetch('/api/vault?resource=tools&subResource=forms', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedForm.id,
          title: selectedForm.title,
          description: selectedForm.description,
          status: selectedForm.status,
          type: selectedForm.type
        })
      });

      const data = await response.json();
      if (data.ok) {
        setForms(forms.map(f => f.id === selectedForm.id ? data.form : f));
        setShowEditModal(false);
        setSelectedForm(null);
      } else {
        alert(data.error || 'Failed to update form');
      }
    } catch (err: any) {
      alert(err.message || 'Failed to update form');
    } finally {
      setUpdating(false);
    }
  };

  const openFormBuilder = (formId: string) => {
    navigate(`/elements/forms/builder/${formId}`);
  };

  const deleteForm = async (formId: string, formTitle: string) => {
    if (!confirm(`Are you sure you want to delete "${formTitle}"? This action cannot be undone.`)) return;

    try {
      const response = await authedFetch(`/api/vault?resource=tools&subResource=forms&id=${formId}`, {
        method: 'DELETE'
      });
      const data = await response.json();
      if (data.ok) {
        setForms(forms.filter(f => f.id !== formId));
      } else {
        alert(data.error || 'Failed to delete form');
      }
    } catch (err: any) {
      alert(err.message || 'Failed to delete form');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const filteredForms = useMemo(() => {
    if (canPerform(userRole, 'people.edit')) return forms;
    return forms.filter(f => f.status === 'Active');
  }, [forms, userRole]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-extrabold text-[#0d1a14] mb-2 tracking-tight">Forms</h1>
          <p className="text-gray-500 font-medium text-base max-w-xl">
            Find consent forms, custom signup forms, and responses in one place.
          </p>
        </div>
        {canPerform(userRole, 'people.edit') && (
          <button
            onClick={createDefaultForm}
            disabled={creating}
            className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-burgundy text-gold font-bold text-sm shadow-xl shadow-burgundy/20 hover:bg-burgundy-dark transition-all active:scale-95 border-b-2 border-gold/30 disabled:opacity-50"
          >
            <Plus size={18} />
            {creating ? 'Creating...' : 'Create New Form'}
          </button>
        )}
      </div>

      {/* Easy find — hub links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <button
          type="button"
          onClick={() => navigate('/admin/consent-management?tab=forms')}
          className="text-left bg-white border border-gray-100 rounded-2xl p-5 shadow-sm hover:border-burgundy/30 hover:shadow-md transition-all"
        >
          <p className="text-[10px] font-black uppercase tracking-widest text-burgundy mb-1">E-Sign</p>
          <p className="text-base font-black text-[#0d1a14]">Consent Forms</p>
          <p className="text-xs text-gray-500 mt-1 font-medium">View and sign church consent forms</p>
        </button>
        <button
          type="button"
          onClick={() => navigate('/admin/consent-management?tab=forms&form=Food%20Allergy%20Consent')}
          className="text-left bg-white border border-gray-100 rounded-2xl p-5 shadow-sm hover:border-gold/40 hover:shadow-md transition-all"
        >
          <p className="text-[10px] font-black uppercase tracking-widest text-gold mb-1">Health</p>
          <p className="text-base font-black text-[#0d1a14]">Food Allergy Consent</p>
          <p className="text-xs text-gray-500 mt-1 font-medium">Open the food allergy form directly</p>
        </button>
        <button
          type="button"
          onClick={() => navigate('/admin/consent-management?tab=forms&form=Premises%20Injury%20%26%20Parent%20Supervision%20Consent')}
          className="text-left bg-white border border-gray-100 rounded-2xl p-5 shadow-sm hover:border-burgundy/30 hover:shadow-md transition-all"
        >
          <p className="text-[10px] font-black uppercase tracking-widest text-burgundy mb-1">Safety</p>
          <p className="text-base font-black text-[#0d1a14]">Injury / Supervision</p>
          <p className="text-xs text-gray-500 mt-1 font-medium">Parents watch their own children on campus</p>
        </button>
        <button
          type="button"
          onClick={() => navigate('/forms/submissions')}
          className="text-left bg-white border border-gray-100 rounded-2xl p-5 shadow-sm hover:border-burgundy/30 hover:shadow-md transition-all"
        >
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Inbox</p>
          <p className="text-base font-black text-[#0d1a14]">Submissions</p>
          <p className="text-xs text-gray-500 mt-1 font-medium">See answers people sent in</p>
        </button>
        {false && String(userRole || '').toUpperCase() === 'SUPER_ADMIN' && (
          <button
            type="button"
            onClick={() => navigate('/fellowship-cookout')}
            className="text-left bg-white border border-gray-100 rounded-2xl p-5 shadow-sm hover:border-gold/40 hover:shadow-md transition-all sm:col-span-2 lg:col-span-1"
          >
            <p className="text-[10px] font-black uppercase tracking-widest text-burgundy mb-1">Event</p>
            <p className="text-base font-black text-[#0d1a14]">Cookout details</p>
            <p className="text-xs text-gray-500 mt-1 font-medium">Event info · online RSVPs closed</p>
          </button>
        )}
      </div>

      <div>
        <h2 className="text-lg font-black text-[#0d1a14] mb-1 tracking-tight">Custom forms</h2>
        <p className="text-sm text-gray-500 font-medium mb-6">Registration and other forms you build in Vault.</p>
      </div>

      {loading && (
        <div className="text-center py-12">
          <div className="inline-block w-8 h-8 border-4 border-gold border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-4 text-gray-400 font-medium">Loading forms...</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 flex items-start gap-4">
          <AlertCircle className="text-red-500 shrink-0" size={24} />
          <div>
            <p className="font-bold text-red-900">Error Loading Forms</p>
            <p className="text-sm text-red-700 mt-1">{error}</p>
            <p className="text-xs text-red-600 mt-2">Make sure you've run the database migration: <code className="bg-red-100 px-2 py-1 rounded">migration_volunteers_forms.sql</code></p>
          </div>
        </div>
      )}

      {!loading && !error && filteredForms.length === 0 && (
        <div className="text-center py-12 bg-gray-50 rounded-2xl">
          <FileEdit className="mx-auto text-gray-300 mb-4" size={48} />
          <p className="text-gray-400 font-medium">No forms available at this time.</p>
        </div>
      )}

      {!loading && !error && filteredForms.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {filteredForms.map(form => (
            <div key={form.id} className="bg-white rounded-[2.5rem] border border-gray-50 shadow-sm flex flex-col group hover:shadow-2xl transition-all border-b-4 border-b-transparent hover:border-b-gold">
              <div className="p-8 flex flex-col h-full">
                <div className="flex items-start justify-between mb-6">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-inner transition-transform group-hover:rotate-3 ${form.status === 'Active' ? 'bg-burgundy text-gold' : 'bg-gray-100 text-gray-400'
                    }`}>
                    <FileEdit size={22} />
                  </div>
                  {canPerform(userRole, 'people.edit') && (
                    <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${form.status === 'Active' ? 'bg-gold-cream text-gold border-gold/20' : 'bg-gray-50 text-gray-400 border-gray-100'
                      }`}>
                      {form.status}
                    </span>
                  )}
                </div>

                <h3 className="text-lg font-black text-[#0d1a14] mb-1 tracking-tight group-hover:text-burgundy transition-colors">{form.title}</h3>
                <p className="text-[10px] font-bold text-gray-300 uppercase tracking-[0.2em] mb-8">{form.type}</p>

                <div className="space-y-4 pt-6 border-t border-gray-50 flex-1">
                  <div className="flex items-center justify-between">
                    {canPerform(userRole, 'people.edit') && (
                      <div className="flex items-center gap-2 text-gray-400">
                        <Users size={14} className="text-gold" />
                        <span className="text-xs font-bold">{form.submissions || 0} Responses</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-300 uppercase">
                      <Clock size={10} />
                      {form.updated_at ? formatDate(form.updated_at) : 'Never'}
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 mt-4">
                  {canPerform(userRole, 'people.edit') ? (
                    <>
                      <button
                        onClick={() => openFormBuilder(form.id)}
                        className="flex-1 py-3 bg-gray-50 text-[#0d1a14] font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-gold-cream transition-colors border border-transparent hover:border-gold/10 flex items-center justify-center gap-2"
                      >
                        Edit
                      </button>
                      <a
                        href={`#/forms/public/${form.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-3 bg-burgundy/5 text-burgundy rounded-xl hover:bg-burgundy hover:text-gold transition-all flex items-center justify-center"
                      >
                        <ExternalLink size={14} />
                      </a>
                    </>
                  ) : (
                    <a
                      href={`#/forms/public/${form.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 py-3 bg-burgundy text-gold font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-burgundy-dark transition-colors border border-transparent hover:border-gold/30 flex items-center justify-center gap-2 shadow-lg shadow-burgundy/20"
                    >
                      Fill Out Form <ExternalLink size={12} />
                    </a>
                  )}

                  {(userRole === 'SUPER_ADMIN' || userRole === 'ADMIN') && (
                    <button
                      onClick={() => deleteForm(form.id, form.title)}
                      className="px-4 py-3 bg-red-50 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all"
                      title="Delete form"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
          {canPerform(userRole, 'people.edit') && (
            <button
              onClick={createDefaultForm}
              className="group bg-gold-cream/20 p-8 rounded-[2.5rem] border-2 border-dashed border-gold/20 flex flex-col items-center justify-center text-center hover:bg-gold-cream/40 transition-all space-y-4 min-h-[280px]"
            >
              <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center text-gold shadow-sm group-hover:scale-110 transition-transform">
                <Plus size={28} />
              </div>
              <p className="font-bold text-[#0d1a14] text-sm uppercase tracking-widest">New Template</p>
            </button>
          )}
        </div>
      )}

      {canPerform(userRole, 'people.edit') && (
        <div className="bg-gold-cream/30 p-8 rounded-[2.5rem] border border-gold/10 flex items-center gap-6 shadow-sm group">
          <div className="w-16 h-16 rounded-[1.5rem] bg-white text-gold flex items-center justify-center shrink-0 shadow-lg border border-gold/10 group-hover:scale-110 transition-transform">
            <Sparkles size={32} />
          </div>
          <div className="flex-1">
            <p className="text-lg font-black text-[#0d1a14]">AI Form Audit</p>
            <p className="text-xs text-gray-400 font-medium leading-relaxed mt-1">Your forms will be analyzed for drop-off rates and completion optimization once you have submissions.</p>
          </div>
        </div>
      )}

      {/* Create Form Modal */}
      {
        showCreateModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl max-w-lg w-full p-8 shadow-2xl">
              <h2 className="text-2xl font-black text-[#0d1a14] mb-6">Create New Form</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Form Title *</label>
                  <input
                    type="text"
                    value={newForm.title}
                    onChange={(e) => setNewForm({ ...newForm, title: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-gold focus:outline-none"
                    placeholder="e.g., New Member Welcome"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Description</label>
                  <textarea
                    value={newForm.description}
                    onChange={(e) => setNewForm({ ...newForm, description: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-gold focus:outline-none"
                    rows={3}
                    placeholder="Brief description of this form..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Form Type</label>
                  <select
                    value={newForm.type}
                    onChange={(e) => setNewForm({ ...newForm, type: e.target.value as any })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-gold focus:outline-none"
                  >
                    <option value="Registration">Registration</option>
                    <option value="Spiritual">Spiritual</option>
                    <option value="Service">Service</option>
                    <option value="Giving">Giving</option>
                    <option value="Feedback">Feedback</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Status</label>
                  <select
                    value={newForm.status}
                    onChange={(e) => setNewForm({ ...newForm, status: e.target.value as any })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-gold focus:outline-none"
                  >
                    <option value="Draft">Draft</option>
                    <option value="Active">Active</option>
                    <option value="Archived">Archived</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3 mt-8">
                <button
                  onClick={() => setShowCreateModal(false)}
                  disabled={creating}
                  className="flex-1 px-6 py-3 rounded-xl border border-gray-200 text-gray-700 font-bold hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={createForm}
                  disabled={creating}
                  className="flex-1 px-6 py-3 rounded-xl bg-burgundy text-gold font-bold hover:bg-burgundy-dark transition-colors disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create Form'}
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* Edit Form Modal */}
      {
        showEditModal && selectedForm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl max-w-lg w-full p-8 shadow-2xl">
              <h2 className="text-2xl font-black text-[#0d1a14] mb-6">Edit Form</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Form Title *</label>
                  <input
                    type="text"
                    value={selectedForm.title}
                    onChange={(e) => setSelectedForm({ ...selectedForm, title: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-gold focus:outline-none"
                    placeholder="e.g., New Member Welcome"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Description</label>
                  <textarea
                    value={selectedForm.description || ''}
                    onChange={(e) => setSelectedForm({ ...selectedForm, description: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-gold focus:outline-none"
                    rows={3}
                    placeholder="Brief description of this form..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Form Type</label>
                  <select
                    value={selectedForm.type}
                    onChange={(e) => setSelectedForm({ ...selectedForm, type: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-gold focus:outline-none"
                  >
                    <option value="Registration">Registration</option>
                    <option value="Spiritual">Spiritual</option>
                    <option value="Service">Service</option>
                    <option value="Giving">Giving</option>
                    <option value="Feedback">Feedback</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Status</label>
                  <select
                    value={selectedForm.status}
                    onChange={(e) => setSelectedForm({ ...selectedForm, status: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-gold focus:outline-none"
                  >
                    <option value="Draft">Draft</option>
                    <option value="Active">Active</option>
                    <option value="Archived">Archived</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3 mt-8">
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    setSelectedForm(null);
                  }}
                  disabled={updating}
                  className="flex-1 px-6 py-3 rounded-xl border border-gray-200 text-gray-700 font-bold hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={updateForm}
                  disabled={updating}
                  className="flex-1 px-6 py-3 rounded-xl bg-burgundy text-gold font-bold hover:bg-burgundy-dark transition-colors disabled:opacity-50"
                >
                  {updating ? 'Updating...' : 'Update Form'}
                </button>
              </div>
            </div>
          </div>
        )
      }
    </div>
  );
};

export default FormsManagerPage;
