/**
 * Attendance session list card — safe fields only; no actor UUIDs.
 * View Attendance opens the session roster / manual check-in detail page.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, ClipboardList, Lock, Pencil, Users } from 'lucide-react';
import type { AttendanceSession } from '../../lib/attendanceSessionsTypes';
import {
  formatSessionRange,
  linkIndicator,
  statusLabel,
  typeLabel,
} from '../../lib/attendanceSessionsUi';
import { attendancePathForSession } from '../../lib/attendanceRecordsUi';

type Props = {
  session: AttendanceSession;
  onEdit?: (session: AttendanceSession) => void;
  onOpen?: (session: AttendanceSession) => void;
  onClose?: (session: AttendanceSession) => void;
};

const AttendanceSessionCard: React.FC<Props> = ({ session, onEdit, onOpen, onClose }) => {
  const isDraft = session.status === 'draft';
  const isOpen = session.status === 'open';
  const isClosed = session.status === 'closed';
  const link = linkIndicator(session);

  const badgeClass = isOpen
    ? 'bg-emerald-100 text-emerald-900 border-emerald-200'
    : isDraft
      ? 'bg-amber-50 text-amber-900 border-amber-200'
      : 'bg-gray-100 text-gray-700 border-gray-200';

  return (
    <article
      className={`rounded-2xl border bg-white p-4 sm:p-5 shadow-sm ${
        isOpen ? 'border-emerald-300 ring-1 ring-emerald-100' : 'border-gray-100'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base sm:text-lg font-black text-[#0d1a14] break-words">
              {session.title}
            </h3>
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wide ${badgeClass}`}
            >
              {statusLabel(session.status)}
            </span>
          </div>
          <p className="text-sm font-semibold text-gray-600">{typeLabel(session.type)}</p>
        </div>
      </div>

      <div className="mt-3 space-y-1.5 text-sm text-gray-600">
        <p className="inline-flex items-start gap-2 font-medium">
          <CalendarClock size={16} className="mt-0.5 shrink-0 text-[#1d372c]" aria-hidden />
          <span>
            {formatSessionRange(session.startsAt, session.endsAt, session.timezone || undefined)}
            <span className="block text-xs text-gray-400 mt-0.5">
              {session.timezone || 'Africa/Kampala'}
            </span>
          </span>
        </p>
        <p className="inline-flex items-center gap-2 font-medium">
          <Users size={16} className="shrink-0 text-[#1d372c]" aria-hidden />
          Visitors: {session.visitorCount}
        </p>
        {link && (
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{link}</p>
        )}
      </div>

      <div className="mt-4 flex flex-col sm:flex-row gap-2">
        <Link
          to={attendancePathForSession(session.id)}
          className="min-h-[48px] flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 text-sm font-black text-[#0d1a14] hover:bg-gray-50"
        >
          <ClipboardList size={16} aria-hidden />
          {isOpen ? 'Check in members' : 'View Attendance'}
        </Link>
        {isDraft && onEdit && (
          <button
            type="button"
            onClick={() => onEdit(session)}
            className="min-h-[48px] flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 text-sm font-black text-[#0d1a14] hover:bg-gray-50"
          >
            <Pencil size={16} aria-hidden />
            Edit
          </button>
        )}
        {isDraft && onOpen && (
          <button
            type="button"
            onClick={() => onOpen(session)}
            className="min-h-[48px] flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#0d1a14] px-4 text-sm font-black text-white hover:bg-[#12231c]"
          >
            Open Session
          </button>
        )}
        {isOpen && onClose && (
          <button
            type="button"
            onClick={() => onClose(session)}
            className="min-h-[48px] flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 text-sm font-black text-emerald-950 hover:bg-emerald-100"
          >
            <Lock size={16} aria-hidden />
            Close Session
          </button>
        )}
        {isClosed && (
          <p className="text-xs font-semibold text-gray-400 self-center">Read-only · cannot reopen</p>
        )}
      </div>
    </article>
  );
};

export default AttendanceSessionCard;
