/**
 * Vault Attendance → Session → Attendance
 * Manual + digital_card scanner for OPEN sessions. Historical read for draft/closed.
 * No Kids / visitor mutation / session lifecycle / legacy attendance.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ClipboardList, Loader2, QrCode, RefreshCw, ScanLine, Search } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useNav } from '../../App';
import { Role } from '../../types';
import { canPerform } from '../../lib/permissions';
import AccessDenied from '../../components/Layout/AccessDenied';
import AttendanceMemberSearch from '../../components/attendance/AttendanceMemberSearch';
import AttendanceRoster from '../../components/attendance/AttendanceRoster';
import AttendanceSummary from '../../components/attendance/AttendanceSummary';
import AttendanceSessionScanner from '../../components/attendance/AttendanceSessionScanner';
import SelfCheckinQrPanel from '../../components/attendance/SelfCheckinQrPanel';
import SessionPointsBar from '../../components/attendance/SessionPointsBar';
import {
  checkInMemberManual,
  fetchAttendanceRecords,
} from '../../lib/attendanceRecordsClient';
import type {
  AttendanceCheckinResult,
  AttendancePeopleSearchHit,
  AttendanceRosterRow,
  AttendanceSessionContext,
} from '../../lib/attendanceRecordsTypes';
import { ATTENDANCE_SESSIONS_ROUTE } from '../../lib/attendanceSessionsTypes';
import {
  closedSessionMessage,
  draftSessionMessage,
  formatSessionRange,
  isClosedStatus,
  isDraftStatus,
  isOpenStatus,
  isValidSessionIdParam,
  statusLabel,
  successAlreadyCheckedInMessage,
  successNewCheckinMessage,
  typeLabel,
} from '../../lib/attendanceRecordsUi';

type CheckinMode = 'manual' | 'scan' | 'self';

const AttendanceSessionAttendancePage: React.FC = () => {
  const { userRole } = useNav();
  const { sessionId: sessionIdParam } = useParams<{ sessionId: string }>();
  const allowed = canPerform(userRole as Role, 'attendance.checkin');

  const sessionIdValid = isValidSessionIdParam(sessionIdParam);
  const sessionId = sessionIdValid ? String(sessionIdParam).trim() : '';

  const [session, setSession] = useState<AttendanceSessionContext | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRosterRow[]>([]);
  const [memberCount, setMemberCount] = useState(0);
  const [visitorCount, setVisitorCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [truncated, setTruncated] = useState(false);

  const [pageLoading, setPageLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [checkingInMemberId, setCheckingInMemberId] = useState<string | null>(null);
  const [clearToken, setClearToken] = useState(0);
  const [checkinMode, setCheckinMode] = useState<CheckinMode>('scan');

  const successRef = useRef<HTMLParagraphElement>(null);
  const initialLoadDone = useRef(false);

  const applyPayload = useCallback(
    (payload: Awaited<ReturnType<typeof fetchAttendanceRecords>>) => {
      setSession(payload.session);
      setAttendance(payload.attendance);
      setMemberCount(payload.memberCount);
      setVisitorCount(payload.visitorCount);
      setTotalCount(payload.totalCount);
      setTruncated(payload.truncated);
      setNotFound(false);
    },
    []
  );

  const load = useCallback(
    async (opts?: { soft?: boolean }) => {
      if (!sessionId) {
        setNotFound(true);
        setPageLoading(false);
        return;
      }
      const soft = Boolean(opts?.soft && initialLoadDone.current);
      if (soft) setRefreshing(true);
      else setPageLoading(true);
      setError(null);
      try {
        const payload = await fetchAttendanceRecords(sessionId);
        applyPayload(payload);
        initialLoadDone.current = true;
      } catch (err: any) {
        const msg = String(err?.message || 'Could not load attendance.');
        if (/not found/i.test(msg)) {
          setNotFound(true);
          setSession(null);
        } else {
          setError(msg);
        }
      } finally {
        setPageLoading(false);
        setRefreshing(false);
      }
    },
    [sessionId, applyPayload]
  );

  useEffect(() => {
    if (!allowed) return;
    if (!sessionIdValid) {
      setNotFound(true);
      setPageLoading(false);
      return;
    }
    void load();
  }, [allowed, sessionIdValid, load]);

  const handleCheckIn = async (hit: AttendancePeopleSearchHit) => {
    if (!sessionId || checkingInMemberId) return;
    setCheckingInMemberId(hit.memberId);
    setError(null);
    setStatusMsg(null);
    try {
      const result = await checkInMemberManual({
        sessionId,
        memberId: hit.memberId,
      });
      const name = result.displayName || 'PLCC Member';
      setStatusMsg(
        result.alreadyCheckedIn
          ? successAlreadyCheckedInMessage(name)
          : successNewCheckinMessage(name)
      );
      setClearToken((n) => n + 1);
      window.setTimeout(() => successRef.current?.focus(), 0);
      await load({ soft: true });
    } catch (err: any) {
      const msg = String(err?.message || 'Could not check in this member.');
      setError(msg);
      if (
        /not open/i.test(msg) ||
        /has been closed/i.test(msg) ||
        /session is closed/i.test(msg) ||
        /before checking in/i.test(msg) ||
        /session not found/i.test(msg)
      ) {
        await load({ soft: true });
      }
      if (/could not be checked in/i.test(msg)) {
        setClearToken((n) => n + 1);
      }
    } finally {
      setCheckingInMemberId(null);
    }
  };

  const handleDigitalCheckedIn = async (_result: AttendanceCheckinResult) => {
    setError(null);
    setStatusMsg(null);
    await load({ soft: true });
  };

  if (!allowed) {
    return <AccessDenied />;
  }

  if (pageLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 flex flex-col items-center justify-center gap-3 text-gray-500">
        <Loader2 className="animate-spin" size={28} aria-hidden />
        <p className="text-sm font-semibold">Loading attendance…</p>
      </div>
    );
  }

  if (notFound || !session) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <p role="alert" className="text-sm font-semibold text-red-700">
          Attendance session not found.
        </p>
        <Link
          to={ATTENDANCE_SESSIONS_ROUTE}
          className="min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 text-sm font-black text-[#0d1a14] hover:bg-gray-50"
        >
          <ArrowLeft size={16} aria-hidden />
          Back to Attendance Sessions
        </Link>
      </div>
    );
  }

  const open = isOpenStatus(session.status);
  const draft = isDraftStatus(session.status);
  const closed = isClosedStatus(session.status);
  const tz = session.timezone || 'Africa/Kampala';
  const badgeClass = open
    ? 'bg-emerald-100 text-emerald-900 border-emerald-200'
    : draft
      ? 'bg-amber-50 text-amber-900 border-amber-200'
      : 'bg-gray-100 text-gray-700 border-gray-200';

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 pb-28 space-y-6">
      <header className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 text-[#1d372c] mb-2">
              <ClipboardList size={18} aria-hidden />
              <span className="text-[11px] font-black uppercase tracking-[0.2em]">
                Attendance
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-[#0d1a14] tracking-tight">
              Attendance
            </h1>
            <p className="mt-1 text-lg sm:text-xl font-black text-[#1d372c] break-words">
              {session.title}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-gray-600">
              <span className="font-semibold">{typeLabel(session.type)}</span>
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wide ${badgeClass}`}
              >
                {statusLabel(session.status)}
              </span>
            </div>
            <p className="mt-2 text-sm font-medium text-gray-600">
              {formatSessionRange(session.startsAt, session.endsAt, tz)}
              <span className="block text-xs text-gray-400 mt-0.5">{tz}</span>
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void load({ soft: true })}
              disabled={refreshing}
              className="min-h-[48px] min-w-[48px] inline-flex items-center justify-center rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-60"
              aria-label="Refresh attendance"
            >
              <RefreshCw
                size={18}
                aria-hidden
                className={refreshing ? 'animate-spin' : undefined}
              />
            </button>
            <Link
              to={ATTENDANCE_SESSIONS_ROUTE}
              className="min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 text-sm font-black text-[#0d1a14] hover:bg-gray-50"
            >
              <ArrowLeft size={16} aria-hidden />
              Back to Attendance Sessions
            </Link>
          </div>
        </div>
      </header>

      {statusMsg && (
        <p
          ref={successRef}
          role="status"
          tabIndex={-1}
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-950 outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
        >
          {statusMsg}
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
          {error}
        </p>
      )}

      <AttendanceSummary
        memberCount={memberCount}
        visitorCount={visitorCount}
        totalCount={totalCount}
      />

      {!draft && (
        <SessionPointsBar sessionId={sessionId} onChanged={() => void load({ soft: true })} />
      )}

      {draft && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 space-y-3">
          <p className="text-sm font-semibold text-amber-950">{draftSessionMessage()}</p>
          <Link
            to={ATTENDANCE_SESSIONS_ROUTE}
            className="min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl border border-amber-300 bg-white px-4 text-sm font-black text-[#0d1a14]"
          >
            <ArrowLeft size={16} aria-hidden />
            Back to Attendance Sessions
          </Link>
        </div>
      )}

      {closed && (
        <p className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 text-sm font-semibold text-gray-700">
          {closedSessionMessage()}
        </p>
      )}

      {open && (
        <div className="space-y-4">
          <div
            className="flex rounded-xl border border-gray-200 bg-gray-50 p-1 gap-1"
            role="tablist"
            aria-label="Check-in mode"
          >
            <button
              type="button"
              role="tab"
              aria-selected={checkinMode === 'scan'}
              onClick={() => setCheckinMode('scan')}
              className={`flex-1 min-h-[48px] rounded-lg text-sm font-black inline-flex items-center justify-center gap-2 ${
                checkinMode === 'scan'
                  ? 'bg-white text-[#0d1a14] shadow-sm'
                  : 'text-gray-500 hover:text-[#0d1a14]'
              }`}
            >
              <ScanLine size={16} aria-hidden />
              Scan membership cards
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={checkinMode === 'manual'}
              onClick={() => setCheckinMode('manual')}
              className={`flex-1 min-h-[48px] rounded-lg text-sm font-black inline-flex items-center justify-center gap-2 ${
                checkinMode === 'manual'
                  ? 'bg-white text-[#0d1a14] shadow-sm'
                  : 'text-gray-500 hover:text-[#0d1a14]'
              }`}
            >
              <Search size={16} aria-hidden />
              Manual Search
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={checkinMode === 'self'}
              onClick={() => setCheckinMode('self')}
              className={`flex-1 min-h-[48px] rounded-lg text-sm font-black inline-flex items-center justify-center gap-2 ${
                checkinMode === 'self'
                  ? 'bg-white text-[#0d1a14] shadow-sm'
                  : 'text-gray-500 hover:text-[#0d1a14]'
              }`}
            >
              <QrCode size={16} aria-hidden />
              {session.type === 'kids' ? 'Parent check-in QR' : 'Self check-in QR'}
            </button>
          </div>

          {checkinMode === 'self' ? (
            <SelfCheckinQrPanel sessionId={sessionId} onCountChange={() => void load({ soft: true })} />
          ) : checkinMode === 'scan' ? (
            <AttendanceSessionScanner
              sessionId={sessionId}
              sessionTitle={session.title}
              sessionType={session.type}
              memberCount={memberCount}
              onCheckedIn={handleDigitalCheckedIn}
              onSessionInvalid={() => load({ soft: true })}
              onHouseholdCheckedIn={() => load({ soft: true })}
            />
          ) : (
            <AttendanceMemberSearch
              checkingInMemberId={checkingInMemberId}
              onCheckIn={(hit) => void handleCheckIn(hit)}
              clearToken={clearToken}
            />
          )}
        </div>
      )}

      <AttendanceRoster
        rows={attendance}
        status={session.status}
        truncated={truncated}
        timezone={tz}
        refreshing={refreshing}
      />

      {/* Route marker for tests — do not remove */}
      <span
        className="sr-only"
        data-route={`/attendance/sessions/${session.id}/attendance`}
        data-checkin-permission="attendance.checkin"
        data-digital-scanner="enabled"
      >
        attendance-session-attendance-page
      </span>
    </div>
  );
};

export default AttendanceSessionAttendancePage;
