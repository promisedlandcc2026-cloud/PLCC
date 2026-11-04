/**
 * Member search + Check In for OPEN sessions.
 * Uses People API; keeps memberId internal only.
 */
import React, { useEffect, useId, useRef, useState } from 'react';
import { Loader2, UserRound } from 'lucide-react';
import { searchPeopleForAttendance } from '../../lib/attendanceRecordsClient';
import type { AttendancePeopleSearchHit } from '../../lib/attendanceRecordsTypes';
import {
  ATTENDANCE_SEARCH_DEBOUNCE_MS,
  ATTENDANCE_SEARCH_MIN_CHARS,
} from '../../lib/attendanceRecordsTypes';
import {
  initialsFromDisplayName,
  mapPeopleSearchError,
  searchHintMessage,
  searchMinMet,
} from '../../lib/attendanceRecordsUi';

type Props = {
  disabled?: boolean;
  checkingInMemberId: string | null;
  onCheckIn: (hit: AttendancePeopleSearchHit) => void;
  /** Increment to clear search input + results after success. */
  clearToken?: number;
};

const SearchAvatar: React.FC<{ name: string; avatarUrl: string | null }> = ({
  name,
  avatarUrl,
}) => {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt=""
        className="h-10 w-10 rounded-full object-cover bg-gray-100 shrink-0"
      />
    );
  }
  const initials = initialsFromDisplayName(name);
  return (
    <span
      className="h-10 w-10 rounded-full bg-[#1d372c]/10 text-[#1d372c] inline-flex items-center justify-center text-xs font-black shrink-0"
      aria-hidden
    >
      {initials && initials !== 'AW' ? initials : <UserRound size={18} />}
    </span>
  );
};

const AttendanceMemberSearch: React.FC<Props> = ({
  disabled = false,
  checkingInMemberId,
  onCheckIn,
  clearToken = 0,
}) => {
  const inputId = useId();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AttendancePeopleSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const requestSeq = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (clearToken > 0) {
      setQuery('');
      setResults([]);
      setSearchError(null);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [clearToken]);

  useEffect(() => {
    if (disabled) return;

    const trimmed = query.trim();
    if (!searchMinMet(trimmed)) {
      setResults([]);
      setSearching(false);
      setSearchError(null);
      return;
    }

    const seq = ++requestSeq.current;
    setSearching(true);
    setSearchError(null);

    const timer = window.setTimeout(async () => {
      try {
        const hits = await searchPeopleForAttendance(trimmed);
        if (seq !== requestSeq.current) return;
        setResults(hits);
      } catch {
        if (seq !== requestSeq.current) return;
        setResults([]);
        setSearchError(mapPeopleSearchError());
      } finally {
        if (seq === requestSeq.current) setSearching(false);
      }
    }, ATTENDANCE_SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [query, disabled]);

  return (
    <section aria-labelledby="member-search-heading" className="space-y-3">
      <h2
        id="member-search-heading"
        className="text-sm font-black uppercase tracking-[0.16em] text-[#1d372c]"
      >
        Member Search
      </h2>

      <div>
        <label htmlFor={inputId} className="sr-only">
          Search by member name
        </label>
        <input
          ref={inputRef}
          id={inputId}
          type="search"
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by member name"
          className="w-full min-h-[48px] rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-[#0d1a14] placeholder:text-gray-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1d372c]/40"
        />
        {!searchMinMet(query) && (
          <p className="mt-2 text-xs font-medium text-gray-500">{searchHintMessage()}</p>
        )}
        {searchMinMet(query) && searching && (
          <p className="mt-2 text-xs font-semibold text-gray-500 inline-flex items-center gap-1.5">
            <Loader2 size={14} className="animate-spin" aria-hidden />
            Searching…
          </p>
        )}
      </div>

      {searchError && (
        <p role="alert" className="text-sm font-semibold text-red-700">
          {searchError}
        </p>
      )}

      {searchMinMet(query) && !searching && !searchError && results.length === 0 && (
        <p className="text-sm font-semibold text-gray-500">No members found.</p>
      )}

      {results.length > 0 && (
        <ul className="space-y-2" aria-label="Member search results">
          {results.map((hit) => {
            const busy = checkingInMemberId === hit.memberId;
            return (
              <li
                key={hit.memberId}
                className="rounded-2xl border border-gray-100 bg-white px-3 py-3 shadow-sm flex items-center gap-3"
              >
                <SearchAvatar name={hit.displayName} avatarUrl={hit.avatarUrl} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-[#0d1a14] truncate">
                    {hit.displayName}
                  </p>
                  {hit.status && (
                    <p className="text-xs font-semibold text-gray-400 mt-0.5">
                      {hit.status}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  disabled={disabled || !!checkingInMemberId}
                  onClick={() => onCheckIn(hit)}
                  className="min-h-[48px] min-w-[96px] shrink-0 inline-flex items-center justify-center rounded-xl bg-[#0d1a14] px-4 text-sm font-black text-white hover:bg-[#12231c] disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d372c]/50"
                >
                  {busy ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 size={16} className="animate-spin" aria-hidden />
                      Checking in…
                    </span>
                  ) : (
                    'Check In'
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Contract markers — do not remove */}
      <span className="sr-only" data-search-min={ATTENDANCE_SEARCH_MIN_CHARS}>
        search-min-{ATTENDANCE_SEARCH_MIN_CHARS}
      </span>
      <span className="sr-only" data-search-debounce={ATTENDANCE_SEARCH_DEBOUNCE_MS}>
        search-debounce-{ATTENDANCE_SEARCH_DEBOUNCE_MS}
      </span>
    </section>
  );
};

export default AttendanceMemberSearch;
