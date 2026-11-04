import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Search, Users, ChevronRight, Home } from 'lucide-react';
import { fetchAuthorized } from '../../../lib/api';
import { AvatarDisplay } from './AvatarDisplay';

type LiveDirectoryMember = {
  id: string;
  displayName: string;
  preferredName: string | null;
  householdName: string | null;
  avatarUrl: string | null;
};

interface DirectoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DirectoryModal: React.FC<DirectoryModalProps> = ({
  isOpen,
  onClose,
}) => {
  const navigate = useNavigate();

  const [searchQuery, setSearchQuery] = useState('');
  const [liveMembers, setLiveMembers] = useState<LiveDirectoryMember[]>([]);
  const [liveTruncated, setLiveTruncated] = useState(false);
  const [liveState, setLiveState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [liveError, setLiveError] = useState('');

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const q = searchQuery.trim();
    if (q.length === 1) return;

    let cancelled = false;
    setLiveState('loading');
    setLiveError('');
    const timer = window.setTimeout(async () => {
      try {
        const url =
          q.length >= 2
            ? `/api/vault?resource=people&subResource=member-directory&query=${encodeURIComponent(q)}`
            : '/api/vault?resource=people&subResource=member-directory';
        const res = await fetchAuthorized(url);
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !data?.ok) {
          setLiveMembers([]);
          setLiveTruncated(false);
          setLiveState('error');
          setLiveError(data?.error || 'Could not search the church directory.');
          return;
        }
        setLiveMembers(Array.isArray(data.members) ? data.members : []);
        setLiveTruncated(Boolean(data.truncated));
        setLiveState('ready');
      } catch {
        if (cancelled) return;
        setLiveMembers([]);
        setLiveTruncated(false);
        setLiveState('error');
        setLiveError('Could not search the church directory.');
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isOpen, searchQuery]);

  if (!isOpen) return null;

  const searchingChurch = searchQuery.trim().length >= 2;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl max-w-3xl w-full h-[680px] max-h-[92vh] border border-stone-200 shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between bg-stone-50/80 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#EEF3EF] text-[#1d372c] flex items-center justify-center">
              <Users className="w-4 h-4 text-[#1d372c]" />
            </div>
            <div>
              <h3 className="font-bold text-base text-stone-900 leading-tight">
                Church Member Directory
              </h3>
              <p className="text-xs text-stone-500">
                Search by name or household &middot; Promised Land Christian Center
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

        {/* Search & Multi-Filter Bar */}
        <div className="p-4 sm:px-6 bg-white border-b border-stone-100 space-y-3 shrink-0">
          {/* Main search input */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-stone-400" />
            <input
              type="text"
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search the church directory by name or household..."
              className="w-full pl-10 pr-9 py-2.5 text-xs sm:text-sm rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-[#1d372c] bg-stone-50/50"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-3 text-stone-400 hover:text-stone-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

        </div>

        {/* Directory Results List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 bg-[#faf9f7]/60">
          <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-stone-500 px-1">
                <span>
                  Church directory
                  {liveState === 'ready' && (
                    <>
                      {' '}
                      · <strong className="text-stone-900">{liveMembers.length}</strong>{' '}
                      {liveMembers.length === 1 ? 'member' : 'members'}
                    </>
                  )}
                </span>
                <span className="text-[11px]">Names and households</span>
              </div>

              {liveState === 'loading' && (
                <p className="text-xs text-stone-500 px-1">
                  {searchingChurch ? 'Searching the church directory…' : 'Loading church members…'}
                </p>
              )}
              {liveState === 'error' && (
                <p className="text-xs text-[#1d372c] px-1">{liveError}</p>
              )}
              {liveState === 'ready' && liveMembers.length === 0 && (
                <p className="text-xs text-stone-500 px-1">
                  {searchingChurch
                    ? `No church members matched "${searchQuery.trim()}".`
                    : 'No church members are listed yet.'}
                </p>
              )}
              {liveMembers.map((member) => (
                <button
                  type="button"
                  key={member.id}
                  onClick={() => {
                    onClose();
                    navigate(`/church-profile?member=${encodeURIComponent(member.id)}`);
                  }}
                  className="w-full text-left p-3.5 sm:p-4 rounded-2xl border border-stone-200/80 bg-white flex items-center gap-3.5 hover:border-[#1d372c]/30 hover:bg-[#EEF3EF]/40 transition-colors"
                >
                  <AvatarDisplay name={member.displayName} avatarUrl={member.avatarUrl || undefined} size="md" />
                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-bold text-stone-900 truncate">{member.displayName}</h4>
                    {member.preferredName && (
                      <p className="text-xs text-stone-500">Goes by {member.preferredName}</p>
                    )}
                    <p className="text-[11px] text-stone-500 flex items-center gap-1 pt-0.5">
                      <Home className="w-3 h-3 text-stone-400" />
                      <span className="truncate">{member.householdName || 'Household not listed'}</span>
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-stone-400 shrink-0" />
                </button>
              ))}
              {liveTruncated && (
                <p className="text-[11px] text-stone-500 px-1">
                  Showing the first 50 members. Add a last name to narrow the list.
                </p>
              )}
            </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-stone-50 border-t border-stone-100 flex items-center justify-between text-xs text-stone-500 shrink-0">
          <span className="font-sans italic text-[#1d372c] text-[11px]">
            &ldquo;Changing Hearts. Transforming Lives.&rdquo;
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-stone-600 hover:text-stone-900 rounded-lg hover:bg-stone-200/60"
          >
            Close Directory
          </button>
        </div>
      </div>
    </div>
  );
};
