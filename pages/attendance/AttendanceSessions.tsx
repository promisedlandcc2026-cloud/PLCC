/**
 * Vault Attendance → Sessions
 * Managers: create / open / close. Desk roles (ministry leaders, teachers, kiosk):
 * list open sessions and open Check in members — no lifecycle mutations.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardList, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useNav } from '../../App';
import { Role } from '../../types';
import { canPerform } from '../../lib/permissions';
import AccessDenied from '../../components/Layout/AccessDenied';
import AskAdminTitleLink from '../../components/common/AskAdminTitleLink';
import AttendanceSessionCard from '../../components/attendance/AttendanceSessionCard';
import AttendanceSessionForm from '../../components/attendance/AttendanceSessionForm';
import {
  closeAttendanceSession,
  fetchAttendanceSessions,
  openAttendanceSession,
  resetTestAttendanceSessions,
} from '../../lib/attendanceSessionsClient';
import {
  ATTENDANCE_SESSIONS_ROUTE,
  type AttendanceSession,
  type AttendanceSessionStatus,
} from '../../lib/attendanceSessionsTypes';
import {
  emptyStateCopy,
  groupSessionsByStatus,
} from '../../lib/attendanceSessionsUi';

type FilterKey = 'open' | 'draft' | 'closed' | 'all';

const AttendanceSessionsPage: React.FC = () => {
  const { userRole } = useNav();
  const canManage = canPerform(userRole as Role, 'attendance.session.manage');
  const canDesk = canPerform(userRole as Role, 'attendance.checkin');
  const isSuperAdmin = userRole === Role.SUPER_ADMIN;
  const allowed = canManage || canDesk;

  const [filter, setFilter] = useState<FilterKey>('open');
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [slowLoad, setSlowLoad] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [editing, setEditing] = useState<AttendanceSession | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetTyped, setResetTyped] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const createBtnRef = React.useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchAttendanceSessions({ limit: 100 });
      setSessions(list);
    } catch (err: any) {
      setError(String(err?.message || 'Could not load sessions.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!allowed) return;
    void load();
  }, [allowed, load]);

  useEffect(() => {
    if (!loading) {
      setSlowLoad(false);
      return;
    }
    const t = window.setTimeout(() => setSlowLoad(true), 10_000);
    return () => window.clearTimeout(t);
  }, [loading]);

  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), 3500);
    return () => window.clearTimeout(t);
  }, [flash]);

  const grouped = useMemo(() => groupSessionsByStatus(sessions), [sessions]);

  const visible = useMemo(() => {
    if (filter === 'open') return grouped.open;
    if (filter === 'draft') return grouped.draft;
    if (filter === 'closed') return grouped.closed;
    return [...grouped.open, ...grouped.draft, ...grouped.closed];
  }, [filter, grouped]);

  if (!allowed) {
    return <AccessDenied />;
  }

  const openCreate = () => {
    setFormMode('create');
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (session: AttendanceSession) => {
    if (session.status !== 'draft') return;
    setFormMode('edit');
    setEditing(session);
    setFormOpen(true);
  };

  const confirmOpen = async (session: AttendanceSession) => {
    const ok = window.confirm(
      'Open this attendance session? Once opened, the session details can no longer be edited.'
    );
    if (!ok) return;
    setBusyId(session.id);
    setError(null);
    try {
      const result = await openAttendanceSession(session.id);
      setFlash(result.alreadyOpen ? 'Session is already open.' : 'Session opened.');
      await load();
      setFilter('open');
    } catch (err: any) {
      setError(String(err?.message || 'Could not open session.'));
    } finally {
      setBusyId(null);
    }
  };

  const confirmClose = async (session: AttendanceSession) => {
    const ok = window.confirm(
      'Close this attendance session? Closed sessions cannot be reopened.'
    );
    if (!ok) return;
    setBusyId(session.id);
    setError(null);
    try {
      const result = await closeAttendanceSession(session.id);
      setFlash(result.alreadyClosed ? 'Session is already closed.' : 'Session closed.');
      await load();
      setFilter('closed');
    } catch (err: any) {
      setError(String(err?.message || 'Could not close session.'));
    } finally {
      setBusyId(null);
    }
  };

  const runTestReset = async () => {
    if (resetTyped.trim() !== 'RESET') return;
    setResetBusy(true);
    setError(null);
    try {
      const result = await resetTestAttendanceSessions();
      setFlash(
        `Reset complete — closed ${result.closedOpen} open, deleted ${result.deletedSessions} sessions` +
          (result.deletedCustody || result.deletedRecords
            ? ` (${result.deletedCustody} custody, ${result.deletedRecords} roster rows)`
            : '') +
          '.'
      );
      setResetOpen(false);
      setResetTyped('');
      await load();
      setFilter('all');
    } catch (err: any) {
      setError(String(err?.message || 'Could not reset test sessions.'));
    } finally {
      setResetBusy(false);
    }
  };

  const tabs: { key: FilterKey; label: string; count: number }[] = [
    { key: 'open', label: 'Open', count: grouped.open.length },
    { key: 'draft', label: 'Draft', count: grouped.draft.length },
    { key: 'closed', label: 'Closed', count: grouped.closed.length },
    { key: 'all', label: 'All', count: sessions.length },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 pb-28 space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 text-[#1d372c] mb-2">
            <ClipboardList size={18} aria-hidden />
            <span className="text-[11px] font-black uppercase tracking-[0.2em]">Attendance</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#0d1a14] tracking-tight">
            Attendance Sessions
          </h1>
          <AskAdminTitleLink className="mt-1" />
          <p className="mt-1 text-sm text-gray-500 max-w-xl">
            {canManage
              ? 'Create and manage attendance sessions for services and events.'
              : 'Open a session below to check members in. Ask staff if no session is open yet.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0 justify-end">
          <button
            type="button"
            onClick={() => void load()}
            className="min-h-[48px] min-w-[48px] inline-flex items-center justify-center rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50"
            aria-label="Refresh sessions"
          >
            <RefreshCw size={18} aria-hidden />
          </button>
          {isSuperAdmin && (
            <button
              type="button"
              onClick={() => {
                setResetTyped('');
                setResetOpen(true);
              }}
              className="min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-black text-red-800 hover:bg-red-100"
            >
              <Trash2 size={16} aria-hidden />
              Reset test sessions
            </button>
          )}
          {canManage && (
            <button
              ref={createBtnRef}
              type="button"
              onClick={openCreate}
              className="min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#0d1a14] px-4 text-sm font-black text-white hover:bg-[#12231c]"
            >
              <Plus size={18} aria-hidden />
              Create Session
            </button>
          )}
        </div>
      </header>

      {resetOpen && isSuperAdmin && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-sessions-title"
          className="rounded-2xl border border-red-200 bg-red-50/80 px-4 py-4 sm:px-5 space-y-3"
        >
          <h2 id="reset-sessions-title" className="text-base font-black text-red-900">
            Reset test sessions
          </h2>
          <p className="text-sm text-red-900/90 font-medium leading-relaxed">
            This closes every open attendance session, then permanently deletes all draft and closed
            sessions (including Kids Kiosk test sessions) and their custody / roster rows. Type{' '}
            <span className="font-black">RESET</span> to confirm.
          </p>
          <input
            type="text"
            value={resetTyped}
            onChange={(e) => setResetTyped(e.target.value)}
            placeholder="Type RESET"
            autoComplete="off"
            className="w-full max-w-xs rounded-xl border border-red-200 bg-white px-4 py-3 text-sm font-bold text-[#0d1a14] outline-none focus:ring-2 focus:ring-red-300 min-h-[48px]"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={resetBusy || resetTyped.trim() !== 'RESET'}
              onClick={() => void runTestReset()}
              className="min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl bg-red-700 px-4 text-sm font-black text-white hover:bg-red-800 disabled:opacity-40"
            >
              {resetBusy ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
              {resetBusy ? 'Resetting…' : 'Permanently reset'}
            </button>
            <button
              type="button"
              disabled={resetBusy}
              onClick={() => {
                setResetOpen(false);
                setResetTyped('');
              }}
              className="min-h-[48px] rounded-xl border border-gray-200 bg-white px-4 text-sm font-bold text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div
        className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1"
        role="tablist"
        aria-label="Session status filters"
      >
        {tabs.map((tab) => {
          const active = filter === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(tab.key)}
              className={`min-h-[44px] shrink-0 rounded-full px-4 text-sm font-black border ${
                active
                  ? 'bg-[#0d1a14] text-white border-[#0d1a14]'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {tab.label}
              <span className="ml-1.5 opacity-70">{tab.count}</span>
            </button>
          );
        })}
      </div>

      {flash && (
        <p
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900"
        >
          {flash}
        </p>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-900 flex flex-col sm:flex-row sm:items-center gap-3"
        >
          <span className="flex-1">{error}</span>
          <button
            type="button"
            onClick={() => void load()}
            className="min-h-[44px] rounded-xl bg-white border border-red-200 px-4 text-sm font-black text-red-900"
          >
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-500" aria-live="polite">
          <div className="flex items-center gap-3">
            <Loader2 className="animate-spin" size={22} aria-hidden />
            <span className="text-sm font-semibold">Loading sessions…</span>
          </div>
          {slowLoad && (
            <p className="text-xs text-gray-400 max-w-sm text-center">
              Still waiting on the database — the first request after idle can take up to a minute.
            </p>
          )}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-14 text-center">
          <p className="text-sm font-semibold text-gray-500">
            {sessions.length === 0 ? emptyStateCopy('all') : emptyStateCopy(filter as AttendanceSessionStatus | 'all')}
          </p>
          {sessions.length === 0 && canManage && (
            <button
              type="button"
              onClick={openCreate}
              className="mt-4 min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#0d1a14] px-5 text-sm font-black text-white"
            >
              <Plus size={16} aria-hidden />
              Create Session
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3" aria-busy={!!busyId}>
          {visible.map((session) => (
            <AttendanceSessionCard
              key={session.id}
              session={session}
              onEdit={canManage && session.status === 'draft' ? openEdit : undefined}
              onOpen={
                canManage && session.status === 'draft' && busyId !== session.id
                  ? confirmOpen
                  : undefined
              }
              onClose={
                canManage && session.status === 'open' && busyId !== session.id
                  ? confirmClose
                  : undefined
              }
            />
          ))}
        </div>
      )}

      {canManage && (
        <AttendanceSessionForm
          open={formOpen}
          mode={formMode}
          session={editing}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
            window.setTimeout(() => createBtnRef.current?.focus(), 0);
          }}
          onSaved={async (_session, mode) => {
            setFormOpen(false);
            setEditing(null);
            setFlash(mode === 'create' ? 'Draft session created.' : 'Draft session updated.');
            await load();
            if (mode === 'create') setFilter('draft');
            window.setTimeout(() => createBtnRef.current?.focus(), 0);
          }}
        />
      )}

      {/* Route marker for tests — do not remove */}
      <span className="sr-only" data-route={ATTENDANCE_SESSIONS_ROUTE}>
        attendance-sessions-page
      </span>
    </div>
  );
};

export default AttendanceSessionsPage;
