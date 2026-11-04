/**
 * Attendance count summary — Members / Visitors / Total.
 * Visitors are display-only (no mutation controls).
 */
import React from 'react';

type Props = {
  memberCount: number;
  visitorCount: number;
  totalCount: number;
};

const AttendanceSummary: React.FC<Props> = ({
  memberCount,
  visitorCount,
  totalCount,
}) => {
  const items = [
    { label: 'Members', value: memberCount },
    { label: 'Visitors', value: visitorCount },
    { label: 'Total', value: totalCount },
  ];

  return (
    <div
      className="grid grid-cols-3 gap-2 sm:gap-3"
      aria-label="Attendance counts"
    >
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-2xl border border-gray-100 bg-white px-3 py-4 text-center shadow-sm"
        >
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-gray-400">
            {item.label}
          </p>
          <p className="mt-1 text-2xl sm:text-3xl font-black text-[#0d1a14] tabular-nums">
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
};

export default AttendanceSummary;
