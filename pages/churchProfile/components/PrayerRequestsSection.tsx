import React, { useState } from 'react';
import {
  HeartHandshake,
  Plus,
  AlertCircle,
  Sparkles,
  Share2,
  Check,
  Edit2,
  Trash2,
  Search,
  Filter,
  User,
  Shield,
  MessageCircle
} from 'lucide-react';
import { useChurch } from '../context/ChurchContext';
import { PrayerRequest, Member } from '../types';
import { AvatarDisplay } from './AvatarDisplay';
import { PostPrayerRequestModal } from './PostPrayerRequestModal';

interface PrayerRequestsSectionProps {
  member: Member;
  canEdit: boolean;
}

export const PrayerRequestsSection: React.FC<PrayerRequestsSectionProps> = ({
  member,
  canEdit,
}) => {
  const {
    prayerRequests,
    currentUser,
    togglePrayed,
    deletePrayerRequest,
    navigateToMemberProfile,
    openChatWith,
  } = useChurch();

  const [activeFilter, setActiveFilter] = useState<'all' | 'urgent' | 'praise' | 'member'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);
  const [editingRequest, setEditingRequest] = useState<PrayerRequest | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const memberName = member.preferredName || member.fullName;

  // Filter requests
  const filteredRequests = prayerRequests.filter((pr) => {
    // 1. Tab filter
    if (activeFilter === 'urgent' && !pr.isUrgent) return false;
    if (activeFilter === 'praise' && pr.category !== 'Praise Report') return false;
    if (activeFilter === 'member' && pr.authorId !== member.id) return false;

    // 2. Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = pr.title.toLowerCase().includes(q);
      const matchDesc = pr.description.toLowerCase().includes(q);
      const matchCat = pr.category.toLowerCase().includes(q);
      const matchAuthor = pr.authorName.toLowerCase().includes(q);
      return matchTitle || matchDesc || matchCat || matchAuthor;
    }

    return true;
  });

  const urgentCount = prayerRequests.filter((pr) => pr.isUrgent).length;
  const praiseCount = prayerRequests.filter((pr) => pr.category === 'Praise Report').length;
  const memberRequestCount = prayerRequests.filter((pr) => pr.authorId === member.id).length;

  const handleCopyRequest = (pr: PrayerRequest) => {
    const text = `PLCC Prayer Request: "${pr.title}" - ${pr.description} (Praying together at Promised Land Christian Center)`;
    navigator.clipboard?.writeText(text);
    setCopiedId(pr.id);
    setTimeout(() => {
      setCopiedId(null);
    }, 2000);
  };

  const handleDelete = (id: string, title: string) => {
    if (window.confirm(`Are you sure you want to remove the prayer request "${title}"?`)) {
      deletePrayerRequest(id);
    }
  };

  const getCategoryBadge = (category: PrayerRequest['category']) => {
    switch (category) {
      case 'Healing & Health':
        return 'bg-emerald-50 text-emerald-800 border-emerald-200';
      case 'Family & Marriage':
        return 'bg-rose-50 text-rose-800 border-rose-200';
      case 'Spiritual Growth':
        return 'bg-indigo-50 text-indigo-800 border-indigo-200';
      case 'Financial Provision':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'Youth & School':
        return 'bg-purple-50 text-purple-800 border-purple-200';
      case 'Praise Report':
        return 'bg-amber-100 text-amber-900 border-amber-300 font-semibold';
      default:
        return 'bg-stone-100 text-stone-700 border-stone-200';
    }
  };

  return (
    <div className="bg-white rounded-2xl p-6 border border-stone-200/90 shadow-xs space-y-5">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#EEF3EF] text-[#1d372c] flex items-center justify-center">
              <HeartHandshake className="w-4 h-4" />
            </div>
            <h2 className="text-base font-bold text-stone-900">
              Prayer Requests & Petitions
            </h2>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-stone-100 text-stone-600">
              {prayerRequests.length} Public
            </span>
          </div>
          <p className="text-xs text-stone-500 mt-1">
            Standing in agreement with our church family. Post your requests and pray for one another.
          </p>
        </div>

        {/* Post Request Button */}
        <button
          onClick={() => {
            setEditingRequest(null);
            setIsPostModalOpen(true);
          }}
          className="px-4 py-2 text-xs font-semibold text-white bg-[#1d372c] hover:bg-[#12231c] rounded-xl shadow-xs transition-all flex items-center gap-1.5 shrink-0 hover:scale-[1.02] active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" />
          <span>Post Request</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pt-1 border-t border-stone-100">
        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <button
            onClick={() => setActiveFilter('all')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              activeFilter === 'all'
                ? 'bg-[#1d372c] text-white shadow-2xs'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200/70'
            }`}
          >
            All Requests ({prayerRequests.length})
          </button>

          <button
            onClick={() => setActiveFilter('urgent')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1 ${
              activeFilter === 'urgent'
                ? 'bg-rose-600 text-white shadow-2xs'
                : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200/60'
            }`}
          >
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Urgent Needs ({urgentCount})</span>
          </button>

          <button
            onClick={() => setActiveFilter('praise')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1 ${
              activeFilter === 'praise'
                ? 'bg-amber-600 text-white shadow-2xs'
                : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200/60'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
            <span>Praise Reports ({praiseCount})</span>
          </button>

          <button
            onClick={() => setActiveFilter('member')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1 ${
              activeFilter === 'member'
                ? 'bg-stone-800 text-white shadow-2xs'
                : 'bg-stone-100 text-stone-700 hover:bg-stone-200/70'
            }`}
          >
            <User className="w-3.5 h-3.5 text-stone-500" />
            <span>From {memberName} ({memberRequestCount})</span>
          </button>
        </div>

        {/* Search Input */}
        <div className="relative md:w-56 shrink-0">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search prayer petitions..."
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-stone-200 bg-stone-50/50 focus:outline-none focus:ring-1 focus:ring-[#1d372c]"
          />
        </div>
      </div>

      {/* List of Prayer Requests */}
      <div className="space-y-3.5 pt-1">
        {filteredRequests.length > 0 ? (
          filteredRequests.map((pr) => {
            const isAuthor = pr.authorId === currentUser.id;
            const canManage = isAuthor || currentUser.role === 'SUPER_ADMIN';

            return (
              <div
                key={pr.id}
                className={`p-4 sm:p-5 rounded-xl border transition-all space-y-3 ${
                  pr.isUrgent
                    ? 'border-rose-200 bg-gradient-to-br from-rose-50/40 via-white to-stone-50/50 shadow-2xs'
                    : pr.category === 'Praise Report'
                    ? 'border-amber-200 bg-gradient-to-br from-amber-50/30 via-white to-stone-50/50 shadow-2xs'
                    : 'border-stone-200/90 bg-stone-50/40 hover:bg-stone-50/80 hover:border-stone-300'
                }`}
              >
                {/* Top Row: Author & Badges */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    {pr.isAnonymous ? (
                      <div className="w-7 h-7 rounded-full bg-stone-200 text-stone-600 flex items-center justify-center font-bold text-xs ring-2 ring-white">
                        <User className="w-3.5 h-3.5" />
                      </div>
                    ) : (
                      <AvatarDisplay
                        name={pr.authorName}
                        avatarUrl={pr.authorAvatar}
                        size="sm"
                        className="ring-2 ring-white"
                      />
                    )}

                    <div>
                      <div className="flex items-center gap-1.5">
                        {pr.isAnonymous ? (
                          <span className="text-xs font-semibold text-stone-700">
                            PLCC Church Member
                          </span>
                        ) : (
                          <button
                            onClick={() => navigateToMemberProfile(pr.authorId)}
                            className="text-xs font-bold text-stone-900 hover:text-[#1d372c] transition-colors"
                          >
                            {pr.authorName}
                          </button>
                        )}

                        <span className="text-[10px] text-stone-400">&middot; {pr.timestamp}</span>
                      </div>
                    </div>
                  </div>

                  {/* Status Badges */}
                  <div className="flex items-center gap-1.5">
                    {pr.isUrgent && (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        Urgent Need
                      </span>
                    )}

                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${getCategoryBadge(
                        pr.category
                      )}`}
                    >
                      {pr.category}
                    </span>

                    {/* Manage Menu */}
                    {canManage && (
                      <div className="flex items-center gap-1 ml-1 pl-1 border-l border-stone-200">
                        <button
                          onClick={() => {
                            setEditingRequest(pr);
                            setIsPostModalOpen(true);
                          }}
                          className="p-1 text-stone-400 hover:text-stone-700 rounded hover:bg-stone-100 transition-colors"
                          title="Edit Request"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => handleDelete(pr.id, pr.title)}
                          className="p-1 text-stone-400 hover:text-rose-600 rounded hover:bg-rose-50 transition-colors"
                          title="Delete Request"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Body Content */}
                <div className="space-y-1.5 pl-0.5">
                  <h3 className="text-sm font-bold text-stone-900 leading-snug">
                    {pr.title}
                  </h3>
                  <p className="text-xs text-stone-700 leading-relaxed whitespace-pre-line">
                    {pr.description}
                  </p>
                </div>

                {/* Bottom Action Footer */}
                <div className="pt-2 border-t border-stone-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                  {/* Pray Button */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => togglePrayed(pr.id)}
                      className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all text-xs shadow-2xs ${
                        pr.hasPrayed
                          ? 'bg-[#EEF3EF] text-[#1d372c] border border-[#1d372c]/30 ring-1 ring-[#1d372c]/20'
                          : 'bg-white text-stone-700 border border-stone-200 hover:bg-stone-50 hover:border-stone-300'
                      }`}
                    >
                      <span className="text-sm">🙏</span>
                      <span>
                        {pr.hasPrayed ? 'I Prayed!' : 'Pray'} ({pr.prayedCount})
                      </span>
                    </button>

                    {!pr.isAnonymous && pr.authorId !== currentUser.id && (
                      <button
                        onClick={() => openChatWith(pr.authorId)}
                        className="px-2.5 py-1.5 rounded-lg text-stone-600 hover:text-stone-900 hover:bg-stone-100 transition-colors flex items-center gap-1 text-[11px]"
                        title="Send encouragement direct message"
                      >
                        <MessageCircle className="w-3.5 h-3.5 text-stone-400" />
                        <span className="hidden sm:inline">Encourage</span>
                      </button>
                    )}
                  </div>

                  {/* Share Request */}
                  <div className="flex items-center gap-1 text-[11px] text-stone-500">
                    <button
                      onClick={() => handleCopyRequest(pr)}
                      className="px-2.5 py-1 text-stone-500 hover:text-stone-800 rounded-md hover:bg-stone-100 transition-colors flex items-center gap-1"
                    >
                      {copiedId === pr.id ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span className="text-emerald-700 font-medium">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Share2 className="w-3 h-3" />
                          <span>Share Request</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-10 bg-stone-50/70 rounded-2xl border border-dashed border-stone-200 space-y-3">
            <div className="w-10 h-10 rounded-full bg-stone-100 text-stone-400 mx-auto flex items-center justify-center">
              <HeartHandshake className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-stone-700">No prayer requests matching filter</p>
              <p className="text-[11px] text-stone-400 mt-0.5">
                {searchQuery
                  ? 'Try adjusting your search keywords.'
                  : 'Be the first to post a prayer petition or thanksgiving praise.'}
              </p>
            </div>
            <button
              onClick={() => {
                setActiveFilter('all');
                setSearchQuery('');
                setIsPostModalOpen(true);
              }}
              className="px-3.5 py-1.5 text-xs font-semibold text-[#1d372c] bg-[#EEF3EF] hover:bg-[#EEF3EF]/80 rounded-lg transition-colors inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Post a Prayer Request
            </button>
          </div>
        )}
      </div>

      {/* Post/Edit Prayer Request Modal */}
      <PostPrayerRequestModal
        isOpen={isPostModalOpen}
        onClose={() => {
          setIsPostModalOpen(false);
          setEditingRequest(null);
        }}
        editingRequest={editingRequest}
      />
    </div>
  );
};
