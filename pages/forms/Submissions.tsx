
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Filter,
  Download,
  User,
  ArrowRight,
  Loader,
  Inbox,
  Eye,
  Trash2
} from 'lucide-react';
import { useNav } from '../../App';
import { Role } from '../../types';
import { hasPermission } from '../../lib/permissions';
import { supabase } from '../../lib/supabase';

import { authedFetch } from '../../lib/authedFetch';
const FormSubmissionsPage: React.FC = () => {
  const { userRole } = useNav();
  const navigate = useNavigate();
  const isAdmin = hasPermission(userRole as any, undefined, '/forms/submissions');
  const [search, setSearch] = useState('');
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSubmission, setSelectedSubmission] = useState<any>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  useEffect(() => {
    fetchSubmissions();
  }, []);

  const fetchSubmissions = async () => {
    try {
      const response = await authedFetch('/api/vault?resource=tools&subResource=submissions');
      const data = await response.json();
      if (data.ok) {
        setSubmissions(data.submissions || []);
      } else {
        setError(data.error || 'Failed to load submissions');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load submissions');
    } finally {
      setLoading(false);
    }
  };

  const updateSubmissionStatus = async (id: string, status: string) => {
    try {
      const userId = localStorage.getItem('awc_user_id');

      if (!userId) {
        alert('Authentication error. Please log in again.');
        navigate('/login');
        return;
      }

      const response = await authedFetch('/api/vault?resource=tools&subResource=submissions', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-User-ID': userId
        },
        body: JSON.stringify({ id, status })
      });
      const data = await response.json();
      if (data.ok) {
        setSubmissions(submissions.map(s => s.id === id ? data.submission : s));
      } else {
        console.error('Failed to update status:', data.error);
        alert(`Request Failed: ${data.error || 'Unknown error'}\n\nPlease check if your account has the required permissions.`);
      }
    } catch (err) {
      console.error('Failed to update status', err);
      alert('Network error: Failed to update submission status');
    }
  };

  const deleteSubmission = async (id: string) => {
    if (!confirm('Are you sure you want to delete this submission?')) return;

    try {
      const userId = localStorage.getItem('awc_user_id');

      if (!userId) {
        alert('Authentication error. Please log in again.');
        navigate('/login');
        return;
      }

      const response = await authedFetch(`/api/vault?resource=tools&subResource=submissions&id=${id}`, {
        method: 'DELETE',
        headers: {
          'X-User-ID': userId
        }
      });
      const data = await response.json();
      if (data.ok) {
        setSubmissions(submissions.filter(s => s.id !== id));
        setShowDetailModal(false);
      } else {
        console.error('Failed to delete submission:', data.error);
        alert(`Request Failed: ${data.error || 'Unknown error'}\n\nPlease check if your account has the required permissions.`);
      }
    } catch (err) {
      console.error('Failed to delete submission', err);
      alert('Network error: Failed to delete submission');
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // --- HELPER: Resolve Respondent Info ---
  const getRespondentInfo = (sub: any) => {
    // 1. If authenticated member, use that
    if (sub.submitted_by_member) {
      return {
        name: `${sub.submitted_by_member.first_name} ${sub.submitted_by_member.last_name}`,
        email: sub.submitted_by_member.email,
        isMember: true
      };
    }

    // 2. Fallback: Parse submission_data using form definition
    const data = sub.submission_data || {};
    const formFields = sub.form?.fields || [];

    let name = 'Anonymous';
    let email = 'No email';

    // Try to find Name/Email fields by type or label
    const emailField = formFields.find((f: any) => f.type === 'email' || f.label.toLowerCase().includes('email'));
    const nameField = formFields.find((f: any) => f.label.toLowerCase().includes('name') || f.label.toLowerCase().includes('full name'));

    if (emailField && data[emailField.name]) email = data[emailField.name];
    if (nameField && data[nameField.name]) name = data[nameField.name];

    // Last resort: Check common keys if form definition failed or data missing
    if (name === 'Anonymous') {
      if (data.name) name = data.name;
      else if (data.full_name) name = data.full_name;
      else if (data.firstName && data.lastName) name = `${data.firstName} ${data.lastName}`;
    }
    if (email === 'No email') {
      if (data.email) email = data.email;
    }

    return { name, email, isMember: false };
  };

  const filtered = submissions.filter(s => {
    const searchLower = search.toLowerCase();
    const formTitle = s.form?.title?.toLowerCase() || '';
    const info = getRespondentInfo(s);
    const submitterName = info.name.toLowerCase();

    return formTitle.includes(searchLower) || submitterName.includes(searchLower);
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader className="w-8 h-8 text-burgundy animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
        <p className="text-red-600 font-semibold">{error}</p>
        <p className="text-sm text-red-500 mt-2">Make sure you've run the database migration for forms.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-extrabold text-[#0d1a14] mb-2 tracking-tight">Form Submissions</h1>
          <p className="text-gray-400 font-medium">Review and process data collected from your live forms.</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-white border border-gray-100 text-gray-500 font-bold text-sm hover:bg-gray-50 transition-all shadow-sm">
            <Download size={18} className="text-gold" />
            Bulk Export
          </button>
        </div>
      </div>

      {submissions.length === 0 ? (
        <div className="bg-white rounded-[2.5rem] border border-gray-50 shadow-sm p-12 text-center">
          <Inbox className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-black text-[#0d1a14] mb-2">No Submissions Yet</h3>
          <p className="text-gray-500 mb-6">
            Share your form links to start collecting responses.
          </p>
          <p className="text-sm text-gray-400">
            Form links look like: <code className="bg-gray-100 px-2 py-1 rounded">/forms/view/[form-id]</code>
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-[2.5rem] border border-gray-50 shadow-[0_8px_40px_rgba(0,0,0,0.02)] overflow-hidden">
          <div className="p-8 border-b border-gray-50 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="relative group flex-1 max-w-xl">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-gold transition-colors" size={20} />
              <input
                type="text"
                placeholder="Search by respondent or form name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-12 pr-6 py-4 bg-gray-50/50 rounded-2xl outline-none border border-transparent focus:bg-white focus:border-gold/20 transition-all text-sm font-semibold text-[#0d1a14]"
              />
            </div>
            <button className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-gold-cream/50 border border-gold/10 text-gold font-bold text-sm hover:bg-gold-cream transition-all">
              <Filter size={18} />
              Filters
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gold-cream/20">
                  <th className="px-8 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">Respondent</th>
                  <th className="px-8 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">Form Type</th>
                  <th className="px-8 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">Status</th>
                  <th className="px-8 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">Received</th>
                  <th className="px-8 py-5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(sub => {
                  const info = getRespondentInfo(sub);
                  return (
                    <tr key={sub.id} className="group hover:bg-gold-cream/10 transition-colors">
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-4">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-[13px] shadow-inner transition-colors ${info.isMember ? 'bg-burgundy/5 text-burgundy group-hover:bg-burgundy group-hover:text-gold' : 'bg-gray-100 text-gray-400'}`}>
                            <User size={18} />
                          </div>
                          <div>
                            <p className="text-[14px] font-bold text-[#0d1a14]">
                              {info.name}
                            </p>
                            <p className="text-[10px] text-gray-300 font-bold uppercase tracking-widest">
                              {info.email}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <p className="text-[14px] font-semibold text-gray-500">{sub.form?.title || 'Unknown Form'}</p>
                        <p className="text-[10px] text-gray-300 font-bold uppercase tracking-widest">{sub.form?.type || ''}</p>
                      </td>
                      <td className="px-8 py-6">
                        <select
                          value={sub.status}
                          onChange={(e) => updateSubmissionStatus(sub.id, e.target.value)}
                          disabled={!isAdmin}
                          className={`inline-flex items-center px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-all ${!isAdmin
                            ? 'opacity-50 cursor-not-allowed bg-gray-100 text-gray-400'
                            : 'cursor-pointer hover:shadow-lg hover:scale-105 active:scale-95'
                            } ${sub.status === 'Pending' ? 'bg-burgundy text-gold border-burgundy/20 shadow-sm hover:bg-burgundy-dark' :
                              sub.status === 'Reviewed' ? 'bg-gold-cream text-gold border-gold/30 hover:bg-gold/20' :
                                sub.status === 'Approved' ? 'bg-green-50 text-green-600 border-green-200 hover:bg-green-100' :
                                  'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                            }`}
                        >
                          <option value="Pending">Pending</option>
                          <option value="Reviewed">Reviewed</option>
                          <option value="Approved">Approved</option>
                          <option value="Rejected">Rejected</option>
                        </select>
                      </td>
                      <td className="px-8 py-6 text-[13px] font-semibold text-gray-400">
                        {formatDate(sub.created_at)}
                      </td>
                      <td className="px-8 py-6 text-right">
                        <button
                          onClick={() => {
                            setSelectedSubmission(sub);
                            setShowDetailModal(true);
                          }}
                          className="p-2.5 text-gray-200 hover:text-burgundy hover:bg-white rounded-xl transition-all"
                        >
                          <Eye size={20} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Submission Detail Modal */}
      {showDetailModal && selectedSubmission && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-8 shadow-2xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-2xl font-black text-[#0d1a14]">Submission Details</h2>
                <p className="text-sm text-gray-500 mt-1">
                  {selectedSubmission.form?.title} • {formatDate(selectedSubmission.created_at)}
                </p>
              </div>
              <button
                onClick={() => setShowDetailModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 mb-6">
              {Object.entries(selectedSubmission.submission_data || {}).map(([key, value]: [string, any]) => {
                const fieldDef = selectedSubmission.form?.fields?.find((f: any) => f.name === key);
                const label = fieldDef ? fieldDef.label : key.replace(/_/g, ' ');

                return (
                  <div key={key} className="bg-gray-50 rounded-xl p-4">
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                      {label}
                    </label>
                    <p className="text-sm font-semibold text-[#0d1a14]">
                      {typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value || 'N/A'}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => deleteSubmission(selectedSubmission.id)}
                disabled={!isAdmin}
                className={`flex-1 px-6 py-3 rounded-xl border border-red-200 text-red-600 font-bold transition-colors flex items-center justify-center gap-2 ${!isAdmin ? 'opacity-50 cursor-not-allowed' : 'hover:bg-red-50'}`}
              >
                <Trash2 size={18} />
                Delete
              </button>
              <button
                onClick={() => setShowDetailModal(false)}
                className="flex-1 px-6 py-3 rounded-xl bg-burgundy text-gold font-bold hover:bg-burgundy-dark transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FormSubmissionsPage;
