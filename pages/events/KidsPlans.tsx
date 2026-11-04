import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Image as ImageIcon, Loader2, Plus, Trash2, Upload, X } from 'lucide-react';
import { getAuthHeaders } from '../../lib/api';
import AskAdminTitleLink from '../../components/common/AskAdminTitleLink';

const CLASSROOM_CHIPS = ['Nesties', 'Toddlers', 'Preschool', 'Elementary', 'Youth'];

type Plan = {
  id: string;
  serviceDate: string;
  classroom: string;
  title?: string | null;
  notes?: string | null;
  fileName?: string | null;
  contentType?: string | null;
  signedUrl?: string | null;
  canDelete?: boolean;
};

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso.includes('T') ? iso : `${iso}T12:00:00`);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

const KidsPlansPage: React.FC = () => {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(String(thisYear));
  const [classroomFilter, setClassroomFilter] = useState('');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Plan | null>(null);

  const [serviceDate, setServiceDate] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [classroom, setClassroom] = useState('Nesties');
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const years = useMemo(() => {
    const out: string[] = [];
    for (let y = thisYear; y >= thisYear - 5; y--) out.push(String(y));
    return out;
  }, [thisYear]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const params = new URLSearchParams({ year });
      if (classroomFilter) params.set('classroom', classroomFilter);
      const res = await fetch(`/api/vault?resource=kids-plans&${params}`, { headers });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || 'Could not load Kids Plans.');
        setPlans([]);
        return;
      }
      setPlans(Array.isArray(data.plans) ? data.plans : []);
    } catch {
      setError('Could not load Kids Plans.');
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }, [year, classroomFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const upload = async () => {
    if (!file || !classroom.trim() || !serviceDate || busy) return;
    setBusy(true);
    setUploadError(null);
    try {
      const dataUrl = await fileToDataUrl(file);
      const headers = await getAuthHeaders({ 'Content-Type': 'application/json' });
      const res = await fetch('/api/vault?resource=kids-plans', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          serviceDate,
          classroom: classroom.trim(),
          title: title.trim() || undefined,
          fileName: file.name,
          dataUrl,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setUploadError(data?.error || 'Upload failed.');
        return;
      }
      setShowUpload(false);
      setFile(null);
      setTitle('');
      await load();
    } catch {
      setUploadError('Upload failed.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (plan: Plan) => {
    if (!plan.canDelete) return;
    if (!confirm(`Delete ${plan.classroom} plan for ${formatDate(plan.serviceDate)}?`)) return;
    setBusy(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/vault?resource=kids-plans&id=${encodeURIComponent(plan.id)}`, {
        method: 'DELETE',
        headers,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data?.error || 'Could not delete.');
        return;
      }
      if (preview?.id === plan.id) setPreview(null);
      await load();
    } catch {
      alert('Could not delete.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div className="space-y-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-gold">Events</p>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-black text-[#0d1a14]">Kids Plans</h1>
            <AskAdminTitleLink />
          </div>
          <p className="text-sm text-gray-500 leading-relaxed max-w-xl">
            Upload each Sunday’s classroom plan (photo or PDF) so Nesties and other classes can find
            it a year later. Files are stored separately from the main app data.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowUpload(true)}
          className="h-11 px-4 bg-burgundy text-gold rounded-xl font-bold text-sm inline-flex items-center justify-center gap-2 shrink-0"
        >
          <Plus size={16} />
          Upload plan
        </button>
      </header>

      <div className="flex flex-wrap gap-2 items-center">
        <label className="text-xs font-bold text-gray-600 uppercase tracking-wide">
          Year
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="ml-2 h-10 px-3 rounded-xl border border-gray-100 bg-white text-sm font-semibold text-[#0d1a14]"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setClassroomFilter('')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
              !classroomFilter ? 'bg-burgundy text-gold' : 'bg-white border border-gray-100 text-gray-600'
            }`}
          >
            All classes
          </button>
          {CLASSROOM_CHIPS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setClassroomFilter(c)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                classroomFilter === c
                  ? 'bg-burgundy text-gold'
                  : 'bg-white border border-gray-100 text-gray-600'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-gray-500">
          <Loader2 className="animate-spin" size={20} />
          Loading plans…
        </div>
      ) : null}

      {!loading && error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 space-y-2">
          <p className="text-sm text-rose-900 font-medium">{error}</p>
          <button type="button" onClick={() => void load()} className="text-sm font-bold text-burgundy underline">
            Retry
          </button>
        </div>
      ) : null}

      {!loading && !error && plans.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-gray-200 bg-white py-14 text-center space-y-2">
          <ImageIcon className="mx-auto text-gray-300" size={32} />
          <p className="text-sm font-medium text-gray-600">No plans for this filter yet.</p>
          <p className="text-xs text-gray-400">Upload this Sunday’s Nesties (or other class) plan image.</p>
        </div>
      ) : null}

      {!loading && !error && plans.length > 0 ? (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {plans.map((plan) => {
            const isImage = String(plan.contentType || '').startsWith('image/');
            return (
              <li
                key={plan.id}
                className="rounded-2xl border border-gray-100 bg-white overflow-hidden flex flex-col"
              >
                <button
                  type="button"
                  onClick={() => plan.signedUrl && setPreview(plan)}
                  className="text-left flex-1"
                >
                  <div className="aspect-[4/3] bg-gray-50 flex items-center justify-center overflow-hidden">
                    {isImage && plan.signedUrl ? (
                      <img
                        src={plan.signedUrl}
                        alt={plan.title || `${plan.classroom} plan`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="text-center p-4">
                        <ImageIcon className="mx-auto text-gray-300 mb-2" size={28} />
                        <p className="text-xs font-bold text-gray-500">
                          {plan.contentType === 'application/pdf' ? 'PDF' : 'File'}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="p-3 space-y-0.5">
                    <p className="text-sm font-black text-[#0d1a14]">
                      {plan.classroom} · {formatDate(plan.serviceDate)}
                    </p>
                    {plan.title ? (
                      <p className="text-xs text-gray-500 font-medium truncate">{plan.title}</p>
                    ) : null}
                  </div>
                </button>
                <div className="px-3 pb-3 flex items-center justify-between gap-2">
                  {plan.signedUrl ? (
                    <a
                      href={plan.signedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-bold text-burgundy underline"
                    >
                      Open / download
                    </a>
                  ) : (
                    <span className="text-xs text-gray-400">Link unavailable</span>
                  )}
                  {plan.canDelete ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void remove(plan)}
                      className="p-2 text-gray-400 hover:text-rose-600 rounded-lg disabled:opacity-50"
                      aria-label="Delete plan"
                    >
                      <Trash2 size={16} />
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {showUpload ? (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-[#0d1a14]">Upload Sunday plan</h2>
              <button type="button" onClick={() => setShowUpload(false)} className="p-2 text-gray-400">
                <X size={18} />
              </button>
            </div>
            <label className="block space-y-1">
              <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">Service date</span>
              <input
                type="date"
                value={serviceDate}
                onChange={(e) => setServiceDate(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-gray-100 bg-gray-50 text-sm font-semibold"
              />
            </label>
            <div className="space-y-1">
              <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">Classroom</span>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {CLASSROOM_CHIPS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setClassroom(c)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${
                      classroom === c ? 'bg-burgundy text-gold' : 'bg-gray-50 text-gray-600 border border-gray-100'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <input
                value={classroom}
                onChange={(e) => setClassroom(e.target.value)}
                placeholder="Classroom name"
                className="w-full h-11 px-3 rounded-xl border border-gray-100 bg-gray-50 text-sm font-semibold"
              />
            </div>
            <label className="block space-y-1">
              <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">Title (optional)</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Good Samaritan – I Can Be Kind"
                className="w-full h-11 px-3 rounded-xl border border-gray-100 bg-gray-50 text-sm font-semibold"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">Plan image or PDF</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="w-full text-sm"
              />
            </label>
            {uploadError ? <p className="text-xs text-rose-700 font-medium">{uploadError}</p> : null}
            <button
              type="button"
              disabled={!file || !classroom.trim() || busy}
              onClick={() => void upload()}
              className="w-full h-12 bg-burgundy text-gold rounded-xl font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {busy ? <Loader2 className="animate-spin" size={18} /> : <Upload size={18} />}
              Save to archive
            </button>
          </div>
        </div>
      ) : null}

      {preview?.signedUrl ? (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setPreview(null)}
        >
          <div
            className="relative max-w-3xl w-full max-h-[90dvh] bg-white rounded-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <p className="text-sm font-black text-[#0d1a14] truncate">
                {preview.classroom} · {formatDate(preview.serviceDate)}
              </p>
              <button type="button" onClick={() => setPreview(null)} className="p-2 text-gray-500">
                <X size={18} />
              </button>
            </div>
            <div className="overflow-auto max-h-[calc(90dvh-3.5rem)] bg-gray-50">
              {String(preview.contentType || '').startsWith('image/') ? (
                <img src={preview.signedUrl} alt="" className="w-full h-auto" />
              ) : (
                <iframe title="Plan PDF" src={preview.signedUrl} className="w-full h-[70vh]" />
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default KidsPlansPage;
