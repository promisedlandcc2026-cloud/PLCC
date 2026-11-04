import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Search,
  CheckCircle2,
  Users,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Baby,
  Clock,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import {
  deleteTodayAttendanceRecord,
  fetchTodayAttendance,
} from '../../lib/attendanceRecordsClient';
import type { AttendanceTodayRow } from '../../lib/attendanceRecordsTypes';
import { fetchKidsCustodyOpenList } from '../../lib/kidsCustodyClient';
import AskAdminTitleLink from '../../components/common/AskAdminTitleLink';

const PAGE_SIZE = 25;

type Mode = 'general' | 'kids';

interface WhoCheckedInProps {
  mode?: Mode;
}

function sourceLabel(source: string): string {
  switch (String(source || '')) {
    case 'digital_card':
      return 'Digital Card';
    case 'household_bulk':
      return 'Household';
    case 'manual_staff':
      return 'Manual';
    case 'kids_kiosk':
    case 'kids_custody':
      return 'Kids Kiosk';
    default:
      return 'Session';
  }
}

const WhoCheckedInPage: React.FC<WhoCheckedInProps> = ({ mode = 'general' }) => {
  const kidsOnly = mode === 'kids';
  const [search, setSearch] = useState('');
  const [attendees, setAttendees] = useState<AttendanceTodayRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const fetchAttendance = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (kidsOnly) {
        // Kids Kiosk custody + session kids rows + legacy desk attendance (guest_name).
        // today API max limit is 100 — do not request more or the whole page errors.
        const [sessionResult, custodyRows, legacyRes] = await Promise.all([
          fetchTodayAttendance({ kidsOnly: true, limit: 100, offset: 0 }).catch(() => ({
            attendance: [] as AttendanceTodayRow[],
            totalCount: 0,
          })),
          fetchKidsCustodyOpenList(),
          apiFetch<{ ok?: boolean; attendance?: any[] }>(
            '/api/vault?resource=events&subResource=attendance&kids=true&limit=100&all=false',
            { method: 'GET' }
          ).catch(() => null),
        ]);
        const byKey = new Map<string, AttendanceTodayRow>();
        for (const row of sessionResult.attendance) {
          byKey.set(`session::${row.id}`, row);
        }
        for (const c of custodyRows) {
          byKey.set(`custody::${c.id}`, {
            id: c.id,
            checkedInAt: c.checkedInAt,
            source: 'kids_custody',
            memberName: c.childDisplayName,
            sessionId: c.sessionId,
            sessionTitle: c.sessionTitle,
            sessionType: 'kids',
          });
        }
        const legacyRows = Array.isArray(legacyRes?.attendance) ? legacyRes.attendance : [];
        for (const a of legacyRows) {
          if (a.check_out_time) continue;
          const name =
            String(a.guest_name || '').trim() ||
            `${a.member?.first_name || ''} ${a.member?.last_name || ''}`.trim() ||
            'Child';
          byKey.set(`legacy::${a.id}`, {
            id: String(a.id),
            checkedInAt: String(a.check_in_time || ''),
            source: 'kids_kiosk',
            memberName: name,
            sessionId: '',
            sessionTitle: 'Kids Kiosk',
            sessionType: 'kids',
          });
        }
        const merged = [...byKey.values()].sort(
          (a, b) => Date.parse(b.checkedInAt || '') - Date.parse(a.checkedInAt || '')
        );
        const start = page * PAGE_SIZE;
        setTotalCount(merged.length);
        setAttendees(merged.slice(start, start + PAGE_SIZE));
      } else {
        const data = await fetchTodayAttendance({
          kidsOnly: false,
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
        });
        setAttendees(data.attendance);
        setTotalCount(data.totalCount);
      }
    } catch (err: any) {
      console.error('Failed to fetch today’s session check-ins:', err);
      setAttendees([]);
      setTotalCount(0);
      setError(err?.message || 'Unable to load today’s check-ins.');
    } finally {
      setIsLoading(false);
    }
  }, [page, kidsOnly]);

  useEffect(() => {
    fetchAttendance();
  }, [fetchAttendance]);

  useEffect(() => {
    setPage(0);
  }, [kidsOnly]);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Remove this Session check-in?')) return;
    try {
      await deleteTodayAttendanceRecord(id);
      fetchAttendance();
    } catch (err: any) {
      console.error(err);
      alert(err?.message || 'Failed to remove record');
    }
  };

  const filtered = attendees.filter((a) => {
    if (!search.trim()) return true;
    const hay = `${a.memberName} ${a.sessionTitle}`.toLowerCase();
    return hay.includes(search.toLowerCase());
  });

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = page + 1;
  const from = totalCount === 0 ? 0 : page * PAGE_SIZE + 1;
  const to = Math.min((page + 1) * PAGE_SIZE, totalCount);

  const title = 'Who checked in';
  const subtitle = kidsOnly
    ? 'Children checked in today via Kids Kiosk (Family Pass) or kids Sessions.'
    : 'Today’s Session check-ins across all open and closed sessions.';

  return (
    <div className="max-w-3xl mx-auto space-y-6 pt-6 pb-24 px-4 md:px-0">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div
              className={`w-11 h-11 rounded-2xl flex items-center justify-center ${
                kidsOnly ? 'bg-gold-cream text-gold' : 'bg-burgundy/5 text-burgundy'
              }`}
            >
              {kidsOnly ? <Baby size={22} /> : <CheckCircle2 size={22} />}
            </div>
            <h1 className="text-3xl font-black text-[#0d1a14] tracking-tight">{title}</h1>
            <AskAdminTitleLink />
          </div>
          <p className="text-gray-500 text-sm">{subtitle}</p>
        </div>
        <Link
          to="/events/check-someone-in"
          className="inline-flex items-center justify-center px-5 py-3 rounded-xl bg-burgundy text-gold font-bold text-sm hover:opacity-90 active:scale-95"
        >
          Start check-in
        </Link>
      </div>

      <div
        className="inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1 gap-1"
        role="tablist"
        aria-label="Who checked in filter"
      >
        <Link
          to="/events/who-checked-in"
          role="tab"
          aria-selected={!kidsOnly}
          className={
            !kidsOnly
              ? 'px-4 py-2 rounded-lg text-sm font-bold bg-white text-burgundy shadow-sm'
              : 'px-4 py-2 rounded-lg text-sm font-bold text-gray-500 hover:text-burgundy'
          }
        >
          General
        </Link>
        <Link
          to="/events/kids-checked-in"
          role="tab"
          aria-selected={kidsOnly}
          className={
            kidsOnly
              ? 'px-4 py-2 rounded-lg text-sm font-bold bg-white text-burgundy shadow-sm'
              : 'px-4 py-2 rounded-lg text-sm font-bold text-gray-500 hover:text-burgundy'
          }
        >
          Kids
        </Link>
      </div>

      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-gray-50 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
            <input
              type="text"
              placeholder="Search this page by name or session..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-gray-50/80 rounded-xl outline-none border border-transparent focus:bg-white focus:border-burgundy/20 focus:ring-4 focus:ring-burgundy/5 text-sm font-semibold text-[#0d1a14]"
            />
          </div>
          <p className="text-xs font-bold text-gray-400 shrink-0 sm:pr-1">
            {totalCount} today
          </p>
        </div>

        <div className="divide-y divide-gray-50 min-h-[200px]">
          {error ? (
            <div className="py-16 text-center text-red-600 text-sm font-medium px-4">{error}</div>
          ) : isLoading && attendees.length === 0 ? (
            <div className="py-16 text-center text-gray-400 text-sm font-medium">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center px-6 space-y-3">
              <p className="text-gray-400 text-sm font-medium">
                {kidsOnly ? 'No kids check-ins yet today.' : 'No Session check-ins yet today.'}
              </p>
              <p className="text-xs text-gray-400">
                {kidsOnly ? (
                  <>
                    Use{' '}
                    <Link to="/events/kids-kiosk" className="text-burgundy font-bold underline">
                      Kids Kiosk
                    </Link>{' '}
                    to check children in, then return here.
                  </>
                ) : (
                  <>
                    Use{' '}
                    <Link to="/events/check-someone-in" className="text-burgundy font-bold underline">
                      Start check-in
                    </Link>{' '}
                    → Adult → Sessions to scan cards, then return here.
                  </>
                )}
              </p>
            </div>
          ) : (
            filtered.map((a) => {
              const name = a.memberName || 'PLCC Member';
              const time = a.checkedInAt
                ? new Date(a.checkedInAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : '—';

              return (
                <div
                  key={a.id}
                  className="px-4 sm:px-5 py-4 flex items-center justify-between gap-3 hover:bg-gray-50/50 group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-burgundy text-gold flex items-center justify-center font-bold text-sm shrink-0">
                      {name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-[#0d1a14] truncate">{name}</p>
                      <p className="text-xs text-gray-400 flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <Clock size={11} />
                        In {time}
                        <span>· {sourceLabel(a.source)}</span>
                        {a.sessionTitle ? (
                          <span className="truncate">· {a.sessionTitle}</span>
                        ) : null}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {a.sessionId ? (
                      <Link
                        to={`/attendance/sessions/${a.sessionId}/attendance`}
                        className="hidden sm:inline-flex px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-burgundy hover:bg-gold-cream/50 rounded-lg"
                      >
                        Session
                      </Link>
                    ) : null}
                    {a.source === 'kids_custody' ? null : (
                      <button
                        type="button"
                        onClick={() => handleDelete(a.id)}
                        className="p-2.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                        title="Remove"
                        aria-label="Remove check-in"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="p-4 sm:p-5 border-t border-gray-50 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs font-bold text-gray-400 flex items-center gap-2">
            <Users size={14} className="text-gold" />
            {totalCount === 0 ? 'No records' : `Showing ${from}–${to} of ${totalCount}`}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page === 0 || isLoading}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="p-2.5 rounded-xl bg-white border border-gray-100 text-gray-500 hover:text-burgundy disabled:opacity-40 transition-all shadow-sm min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Previous page"
            >
              <ChevronLeft size={20} />
            </button>
            <span className="px-3 text-[11px] font-black text-gray-400 uppercase tracking-widest">
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page + 1 >= totalPages || isLoading}
              onClick={() => setPage((p) => p + 1)}
              className="p-2.5 rounded-xl bg-white border border-gray-100 text-gray-500 hover:text-burgundy disabled:opacity-40 transition-all shadow-sm min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Next page"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WhoCheckedInPage;
