/**
 * Checked-in members roster — safe fields only; newest-first from API.
 */
import React from 'react';
import { UserRound } from 'lucide-react';
import type { AttendanceRosterRow } from '../../lib/attendanceRecordsTypes';
import {
  emptyRosterCopy,
  formatCheckedInAt,
  initialsFromDisplayName,
  sourceLabel,
  truncatedRosterMessage,
} from '../../lib/attendanceRecordsUi';

type Props = {
  rows: AttendanceRosterRow[];
  status: string;
  truncated: boolean;
  timezone?: string;
  refreshing?: boolean;
};

const Avatar: React.FC<{ name: string; avatarUrl: string | null }> = ({
  name,
  avatarUrl,
}) => {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt=""
        className="h-11 w-11 rounded-full object-cover bg-gray-100 shrink-0"
      />
    );
  }
  const initials = initialsFromDisplayName(name);
  if (initials && initials !== 'AW') {
    return (
      <span
        className="h-11 w-11 rounded-full bg-[#1d372c]/10 text-[#1d372c] inline-flex items-center justify-center text-xs font-black shrink-0"
        aria-hidden
      >
        {initials}
      </span>
    );
  }
  return (
    <span
      className="h-11 w-11 rounded-full bg-gray-100 text-gray-400 inline-flex items-center justify-center shrink-0"
      aria-hidden
    >
      <UserRound size={20} />
    </span>
  );
};

const AttendanceRoster: React.FC<Props> = ({
  rows,
  status,
  truncated,
  timezone = 'Africa/Kampala',
  refreshing = false,
}) => {
  return (
    <section aria-labelledby="checked-in-heading" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2
          id="checked-in-heading"
          className="text-sm font-black uppercase tracking-[0.16em] text-[#1d372c]"
        >
          Checked-In Members
        </h2>
        {refreshing && (
          <span className="text-xs font-semibold text-gray-400" aria-live="polite">
            Updating…
          </span>
        )}
      </div>

      {truncated && (
        <p className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
          {truncatedRosterMessage()}
        </p>
      )}

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-10 text-center text-sm font-semibold text-gray-500">
          {emptyRosterCopy(status)}
        </p>
      ) : (
        <ul className="space-y-2" aria-busy={refreshing || undefined}>
          {rows.map((row, index) => (
            <li
              key={`${row.displayName}-${row.checkedInAt}-${index}`}
              className="rounded-2xl border border-gray-100 bg-white px-3 py-3 sm:px-4 shadow-sm flex items-center gap-3"
            >
              <Avatar name={row.displayName} avatarUrl={row.avatarUrl} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-[#0d1a14] truncate">
                  {row.displayName}
                </p>
                <p className="text-xs font-medium text-gray-500 mt-0.5">
                  {formatCheckedInAt(row.checkedInAt, timezone)}
                  <span className="mx-1.5 text-gray-300" aria-hidden>
                    ·
                  </span>
                  <span className="font-semibold text-gray-600">
                    {sourceLabel(row.source)}
                  </span>
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default AttendanceRoster;
