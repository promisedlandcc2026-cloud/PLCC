import React, { useState } from 'react';
import { X, HeartHandshake, AlertCircle, Sparkles, Send, ShieldCheck, Heart } from 'lucide-react';
import { useChurch } from '../context/ChurchContext';
import { PrayerRequest } from '../types';

interface PostPrayerRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultCategory?: PrayerRequest['category'];
  editingRequest?: PrayerRequest | null;
}

const CATEGORIES: Array<{
  value: PrayerRequest['category'];
  label: string;
  badgeBg: string;
  badgeText: string;
}> = [
  { value: 'Healing & Health', label: 'Healing & Health', badgeBg: 'bg-emerald-50', badgeText: 'text-emerald-800' },
  { value: 'Family & Marriage', label: 'Family & Marriage', badgeBg: 'bg-rose-50', badgeText: 'text-rose-800' },
  { value: 'Spiritual Growth', label: 'Spiritual Growth', badgeBg: 'bg-indigo-50', badgeText: 'text-indigo-800' },
  { value: 'Financial Provision', label: 'Financial Provision', badgeBg: 'bg-amber-50', badgeText: 'text-amber-800' },
  { value: 'Youth & School', label: 'Youth & School', badgeBg: 'bg-purple-50', badgeText: 'text-purple-800' },
  { value: 'Praise Report', label: 'Praise Report / Thanksgiving', badgeBg: 'bg-amber-100', badgeText: 'text-amber-900' },
];

export const PostPrayerRequestModal: React.FC<PostPrayerRequestModalProps> = ({
  isOpen,
  onClose,
  defaultCategory = 'Healing & Health',
  editingRequest = null,
}) => {
  const { currentUser, addPrayerRequest, updatePrayerRequest } = useChurch();

  const [title, setTitle] = useState(editingRequest ? editingRequest.title : '');
  const [category, setCategory] = useState<PrayerRequest['category']>(
    editingRequest ? editingRequest.category : defaultCategory
  );
  const [description, setDescription] = useState(editingRequest ? editingRequest.description : '');
  const [isUrgent, setIsUrgent] = useState(editingRequest ? editingRequest.isUrgent : false);
  const [isAnonymous, setIsAnonymous] = useState(editingRequest ? editingRequest.isAnonymous : false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Please provide a title for your prayer petition.');
      return;
    }
    if (!description.trim()) {
      setError('Please share details for your prayer request.');
      return;
    }

    if (editingRequest) {
      updatePrayerRequest(editingRequest.id, {
        title: title.trim(),
        category,
        description: description.trim(),
        isUrgent,
        isAnonymous,
      });
    } else {
      addPrayerRequest({
        authorId: currentUser.id,
        authorName: isAnonymous ? 'PLCC Church Member' : (currentUser.preferredName || currentUser.fullName),
        authorAvatar: isAnonymous ? undefined : currentUser.avatarUrl,
        title: title.trim(),
        category,
        description: description.trim(),
        isUrgent,
        isAnonymous,
      });
    }

    // Reset and close
    setTitle('');
    setDescription('');
    setIsUrgent(false);
    setIsAnonymous(false);
    setError('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-lg w-full border border-stone-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between bg-gradient-to-r from-stone-50 via-white to-stone-50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#EEF3EF] text-[#1d372c] flex items-center justify-center shadow-2xs">
              <HeartHandshake className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-stone-900 text-sm">
                {editingRequest ? 'Edit Prayer Request' : 'Post Prayer Request or Praise'}
              </h3>
              <p className="text-[11px] text-stone-500">
                Shared with Promised Land Christian Center Prayer Intercessors
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-stone-700 rounded-lg hover:bg-stone-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block font-semibold text-stone-700 mb-1">
              Petition Title *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (error) setError('');
              }}
              placeholder="e.g. Complete Healing for Mom, Guidance in Career Transition..."
              className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-[#1d372c] bg-stone-50/50"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block font-semibold text-stone-700 mb-1.5">
              Category
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setCategory(cat.value)}
                  className={`p-2 rounded-xl text-left border text-[11px] font-medium transition-all ${
                    category === cat.value
                      ? 'border-[#1d372c] bg-[#EEF3EF] text-[#1d372c] font-semibold ring-1 ring-[#1d372c]/30 shadow-2xs'
                      : 'border-stone-200 bg-stone-50/50 text-stone-600 hover:bg-stone-100 hover:border-stone-300'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-semibold text-stone-700">
                Prayer Details & Scripture Standing *
              </label>
              <span className="text-[10px] text-stone-400">
                Be as specific or general as you feel led
              </span>
            </div>
            <textarea
              rows={4}
              required
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                if (error) setError('');
              }}
              placeholder="Share how the church family can stand in faith and agreement with you..."
              className="w-full p-3 text-xs rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-[#1d372c] bg-stone-50/50 leading-relaxed"
            />
          </div>

          {/* Urgent & Anonymous Toggles */}
          <div className="pt-2 border-t border-stone-100 space-y-3">
            <label className="flex items-center justify-between p-3 rounded-xl bg-rose-50/60 border border-rose-100 hover:bg-rose-50 cursor-pointer transition-colors">
              <div className="flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <div>
                  <p className="font-semibold text-rose-900 text-xs">Flag as Urgent Need</p>
                  <p className="text-[10px] text-rose-700">
                    Highlights this request with a priority badge for immediate intercession.
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={isUrgent}
                onChange={(e) => setIsUrgent(e.target.checked)}
                className="w-4 h-4 text-rose-600 rounded-sm border-rose-300 focus:ring-rose-500 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between p-3 rounded-xl bg-stone-50 border border-stone-200/80 hover:bg-stone-100/70 cursor-pointer transition-colors">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-4 h-4 text-stone-600 shrink-0" />
                <div>
                  <p className="font-semibold text-stone-800 text-xs">Post Anonymously</p>
                  <p className="text-[10px] text-stone-500">
                    Hides your name and profile photo, displaying as &ldquo;PLCC Church Member&rdquo;.
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={isAnonymous}
                onChange={(e) => setIsAnonymous(e.target.checked)}
                className="w-4 h-4 text-[#1d372c] rounded-sm border-stone-300 focus:ring-[#1d372c] cursor-pointer"
              />
            </label>
          </div>

          {/* Action buttons */}
          <div className="pt-3 border-t border-stone-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-stone-600 hover:text-stone-800 hover:bg-stone-100 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-semibold text-white bg-[#1d372c] hover:bg-[#12231c] rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{editingRequest ? 'Save Changes' : 'Post Request'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
