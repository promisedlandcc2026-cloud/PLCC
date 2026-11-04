import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Megaphone,
  Calendar,
  Search,
  Trash2,
  X,
  Save,
  AlertCircle,
  Image as ImageIcon,
  Type,
  ChevronDown,
  ExternalLink,
} from 'lucide-react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { fetchWithTimeout, getAuthHeaders, isAbortOrTimeoutError } from '../../lib/api';
import { Announcement, AnnouncementType } from '../../types';
import AskAdminTitleLink from '../../components/common/AskAdminTitleLink';

type AnnouncementRow = Announcement & {
  source?: 'calendar' | string;
  source_event_id?: string;
};

const Announcements: React.FC = () => {
  const navigate = useNavigate();
  const [announcements, setAnnouncements] = useState<AnnouncementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<AnnouncementType | 'ALL'>('ALL');

  const [searchParams] = useSearchParams();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    type: 'ANNOUNCEMENT' as AnnouncementType,
    image_url: '',
    event_date: '',
  });

  const fetchAnnouncements = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const headers = await getAuthHeaders();
      const qs =
        filterType !== 'ALL'
          ? `&type=${encodeURIComponent(filterType)}`
          : '';
      const res = await fetchWithTimeout(
        `/api/vault?resource=communication&subResource=announcements${qs}`,
        { headers },
        55_000
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || data?.details || 'Failed to load announcements');
      }
      setAnnouncements((data.announcements || []) as AnnouncementRow[]);
    } catch (err: any) {
      console.error(err);
      setAnnouncements([]);
      setLoadError(
        isAbortOrTimeoutError(err)
          ? 'Timed out waiting for the database. Tap Retry — the first load after idle can take up to a minute.'
          : err?.message || 'Failed to load announcements'
      );
    } finally {
      setLoading(false);
    }
  }, [filterType]);

  useEffect(() => {
    void fetchAnnouncements();
  }, [fetchAnnouncements]);

  useEffect(() => {
    if (searchParams.get('action') === 'create') {
      setIsFormOpen(true);
    }
  }, [searchParams]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);

    try {
      const headers = await getAuthHeaders();
      const payload = {
        title: formData.title,
        content: formData.content,
        type: formData.type,
        image_url: formData.image_url,
        event_date: formData.event_date,
      };

      const res = await fetch(
        '/api/vault?resource=communication&subResource=announcements',
        {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errorMsg = data.details
          ? `${data.error}: ${data.details}`
          : data.error || 'Failed to create announcement';
        throw new Error(errorMsg);
      }

      setFormData({
        title: '',
        content: '',
        type: 'ANNOUNCEMENT',
        image_url: '',
        event_date: '',
      });
      setIsFormOpen(false);
      await fetchAnnouncements();
    } catch (err: any) {
      setFormError(err.message || 'Failed to create announcement');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (item: AnnouncementRow) => {
    if (item.source === 'calendar' || String(item.id).startsWith('calendar:')) {
      if (
        window.confirm(
          'This card comes from Events & Check-in. Open the events calendar to manage it?'
        )
      ) {
        navigate('/events/overview');
      }
      return;
    }
    if (!window.confirm('Are you sure you want to delete this announcement?')) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `/api/vault?resource=communication&subResource=announcements`,
        {
          method: 'DELETE',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: item.id }),
        }
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to delete');

      setAnnouncements((prev) => prev.filter((a) => a.id !== item.id));
    } catch (err: any) {
      console.error(err);
      alert(err?.message || 'Failed to delete announcement');
    }
  };

  const filtered = announcements.filter(
    (a) =>
      a.title.toLowerCase().includes(search.toLowerCase()) ||
      a.content.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <h1 className="text-4xl font-extrabold text-[#0d1a14] tracking-tight">
              Announcements
            </h1>
            <AskAdminTitleLink />
          </div>
          <p className="text-gray-400 font-medium">
            Manage church-wide communications, updates, and event notifications.
          </p>
        </div>
        {!isFormOpen && (
          <button
            onClick={() => setIsFormOpen(true)}
            className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-[#0d1a14] text-[#C9A35A] font-bold text-sm shadow-lg shadow-[#0d1a14]/20 hover:scale-105 transition-all"
          >
            <Plus size={18} /> New Announcement
          </button>
        )}
      </div>

      {isFormOpen && (
        <div className="bg-white rounded-[2rem] border border-gold/20 shadow-xl overflow-hidden animate-in slide-in-from-top-4">
          <div className="bg-[#0d1a14]/5 p-6 border-b border-gold/10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#0d1a14] text-[#C9A35A] flex items-center justify-center shadow-md">
                <Type size={20} />
              </div>
              <div>
                <h3 className="font-bold text-[#0d1a14]">Compose New Announcement</h3>
                <p className="text-xs text-gray-500 uppercase tracking-widest">
                  Broadcast to the congregation
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsFormOpen(false)}
              className="p-2 hover:bg-white rounded-full transition-colors text-gray-400 hover:text-[#0d1a14]"
            >
              <X size={20} />
            </button>
          </div>

          <form onSubmit={handleCreate} className="p-8 space-y-6">
            {formError && (
              <div className="p-4 bg-red-50 text-red-600 rounded-xl flex items-center gap-3 text-sm font-medium animate-in slide-in-from-top-2">
                <AlertCircle size={18} />
                {formError}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block ml-1">
                  Title
                </label>
                <input
                  required
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g. Sunday Service Update"
                  className="w-full p-4 bg-gray-50 rounded-xl font-medium text-gray-900 border border-transparent focus:bg-white focus:border-[#C9A35A] focus:ring-4 focus:ring-[#C9A35A]/10 transition-all outline-none"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block ml-1">
                  Type
                </label>
                <div className="relative">
                  <select
                    value={formData.type}
                    onChange={(e) =>
                      setFormData({ ...formData, type: e.target.value as AnnouncementType })
                    }
                    className="w-full p-4 bg-gray-50 rounded-xl font-medium text-gray-900 border border-transparent focus:bg-white focus:border-[#C9A35A] focus:ring-4 focus:ring-[#C9A35A]/10 transition-all outline-none appearance-none"
                  >
                    <option value="ANNOUNCEMENT">General Announcement</option>
                    <option value="UPDATE">Important Update</option>
                    <option value="MESSAGE">Pastoral Message</option>
                    <option value="EVENT">Upcoming Event</option>
                    <option value="PRAYER_REQUEST">Prayer Request</option>
                  </select>
                  <ChevronDown
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                    size={16}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block ml-1">
                Content / Message
              </label>
              <textarea
                required
                rows={4}
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                placeholder="Type your message here..."
                className="w-full p-4 bg-gray-50 rounded-xl font-medium text-gray-900 border border-transparent focus:bg-white focus:border-[#C9A35A] focus:ring-4 focus:ring-[#C9A35A]/10 transition-all outline-none resize-none"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2 relative">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block ml-1 flex items-center gap-2">
                  <Calendar size={12} /> Event Date{' '}
                  <span className="opacity-50 font-normal normal-case">(Optional)</span>
                </label>
                <input
                  type="datetime-local"
                  value={formData.event_date}
                  onChange={(e) => setFormData({ ...formData, event_date: e.target.value })}
                  className="w-full p-4 bg-gray-50 rounded-xl font-medium text-gray-900 border border-transparent focus:bg-white focus:border-[#C9A35A] focus:ring-4 focus:ring-[#C9A35A]/10 transition-all outline-none"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block ml-1 flex items-center gap-2">
                  <ImageIcon size={12} /> Image URL{' '}
                  <span className="opacity-50 font-normal normal-case">(Optional)</span>
                </label>
                <input
                  type="url"
                  value={formData.image_url}
                  onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                  placeholder="https://..."
                  className="w-full p-4 bg-gray-50 rounded-xl font-medium text-gray-900 border border-transparent focus:bg-white focus:border-[#C9A35A] focus:ring-4 focus:ring-[#C9A35A]/10 transition-all outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                disabled={submitting}
                className="px-6 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-8 py-3 bg-[#0d1a14] text-[#C9A35A] rounded-xl font-bold shadow-lg shadow-[#0d1a14]/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <>Saving...</>
                ) : (
                  <>
                    <Save size={18} /> Publish Announcement
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white p-4 rounded-[2rem] border border-gray-50 shadow-sm flex flex-col md:flex-row items-center gap-4">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={20} />
          <input
            type="text"
            placeholder="Search announcements..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-12 pr-6 py-3 bg-gray-50 rounded-xl outline-none font-medium focus:bg-white focus:ring-2 focus:ring-[#C9A35A]/20 transition-all"
          />
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
          {(
            ['ALL', 'ANNOUNCEMENT', 'EVENT', 'UPDATE', 'MESSAGE', 'PRAYER_REQUEST'] as const
          ).map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                filterType === type
                  ? 'bg-[#0d1a14] text-white shadow-md'
                  : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
              }`}
            >
              {type === 'ALL' ? 'All' : type.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {loadError && (
        <div className="p-4 bg-red-50 text-red-700 rounded-2xl flex items-start gap-3 text-sm font-medium border border-red-100">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <div>
            <p>{loadError}</p>
            <button
              type="button"
              onClick={() => void fetchAnnouncements()}
              className="mt-2 text-xs font-black uppercase tracking-widest text-[#0d1a14] underline"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-sm font-bold text-gray-400 uppercase tracking-widest">
          Loading…
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((item) => {
            const isCalendar =
              item.source === 'calendar' || String(item.id).startsWith('calendar:');
            return (
              <div
                key={item.id}
                className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm hover:shadow-md transition-all group relative overflow-hidden"
                data-announcement-source={isCalendar ? 'calendar' : 'announcement'}
              >
                <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2 bg-white/80 backdrop-blur-sm rounded-bl-2xl z-10">
                  {isCalendar ? (
                    <button
                      onClick={() => navigate('/events/overview')}
                      className="p-2 text-[#0d1a14] hover:bg-gold-cream rounded-lg transition-colors"
                      title="Open Events calendar"
                    >
                      <ExternalLink size={16} />
                    </button>
                  ) : (
                    <button
                      onClick={() => void handleDelete(item)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>

                <div className="flex items-start gap-4 mb-4">
                  <div
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl shrink-0 ${
                      item.type === 'EVENT'
                        ? 'bg-purple-50 text-purple-600'
                        : item.type === 'PRAYER_REQUEST'
                          ? 'bg-emerald-50 text-emerald-600'
                          : item.type === 'UPDATE'
                            ? 'bg-blue-50 text-blue-600'
                            : 'bg-amber-50 text-amber-600'
                    }`}
                  >
                    {item.type === 'EVENT' ? <Calendar size={24} /> : <Megaphone size={24} />}
                  </div>
                  <div>
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">
                      {isCalendar ? 'Calendar Event' : item.type.replace('_', ' ')}
                    </span>
                    <h3 className="font-bold text-[#1A1A1A] line-clamp-2 leading-tight">
                      {item.title}
                    </h3>
                  </div>
                </div>

                <p className="text-gray-500 text-sm leading-relaxed line-clamp-3 mb-4 min-h-[4.5rem]">
                  {item.content}
                </p>

                <div className="flex items-center justify-between pt-4 border-t border-gray-50">
                  <span className="text-xs font-bold text-gray-400">
                    {new Date(item.created_at).toLocaleDateString()}
                  </span>
                  {item.event_date && (
                    <span className="px-3 py-1 bg-gray-50 rounded-full text-[10px] font-bold text-gray-600 flex items-center gap-1">
                      <Calendar size={12} />
                      {new Date(item.event_date).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && !loadError && filtered.length === 0 && (
        <div className="text-center py-20 bg-gray-50 rounded-[2rem] border border-dashed border-gray-200">
          <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 text-gray-300 shadow-sm">
            <Megaphone size={32} />
          </div>
          <p className="text-xs font-black text-gray-400 uppercase tracking-widest">
            No announcements found
          </p>
          <p className="text-[10px] text-gray-300 mt-1">
            Create one here, or schedule an event under Events &amp; Check-in.
          </p>
        </div>
      )}
    </div>
  );
};

export default Announcements;
