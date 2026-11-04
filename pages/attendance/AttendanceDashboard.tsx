/**
 * Phase 2.7D.10 — Vault Attendance Dashboard (leadership aggregates).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, BarChart3, Loader2, RefreshCw } from 'lucide-react';
import { useNav } from '../../App';
import { Role } from '../../types';
import { canPerform } from '../../lib/permissions';
import AccessDenied from '../../components/Layout/AccessDenied';
import AskAdminTitleLink from '../../components/common/AskAdminTitleLink';
import { apiFetch, ApiError } from '../../lib/api';
import { ATTENDANCE_SESSIONS_ROUTE } from '../../lib/attendanceSessionsTypes';

type DashboardPayload = {
  days?: number;
  totals?: {
    sessions?: number;
    checkins?: number;
    openSessions?: number;
    custodyCycles?: number;
    eventReconciliations?: number;
  };
  byType?: Array<{ type: string; sessions: number; checkins: number }>;
  recentSessions?: Array<{
    sessionId: string;
    title: string;
    type: string;
    status: string;
    startsAt: string;
    memberCount: number;
    openCustodyCount: number;
  }>;
  custody?: { openNow?: number; completed?: number };
};

const AttendanceDashboardPage: React.FC = () => {
  const { userRole } = useNav();
  const allowed = canPerform(userRole as Role, 'attendance.checkin');
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DashboardPayload | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const body = await apiFetch<DashboardPayload & { ok: boolean; details?: string }>(
        `/api/vault?resource=attendance&subResource=dashboard&days=${days}`,
        { method: 'GET' }
      );
      setData(body);
    } catch (err: any) {
      const details =
        err instanceof ApiError && err.body && typeof err.body === 'object'
          ? String((err.body as { details?: string }).details || '')
          : '';
      setError(
        [err?.message || 'Could not load dashboard.', details].filter(Boolean).join(' — ')
      );
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  if (!allowed) return <AccessDenied />;

  const totals = data?.totals || {};

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            to={ATTENDANCE_SESSIONS_ROUTE}
            className="inline-flex items-center gap-1.5 text-sm font-bold text-[#1d372c] mb-2"
          >
            <ArrowLeft size={16} /> Sessions
          </Link>
          <h1 className="text-2xl font-black text-[#0d1a14] flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2">
              <BarChart3 size={24} /> Attendance Dashboard
            </span>
            <AskAdminTitleLink />
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Session totals and trends — no card credentials or personal QR data.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-bold min-h-[44px]"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-[#0d1a14] text-gold text-sm font-bold min-h-[44px]"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-900">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="flex items-center justify-center gap-2 py-16 text-gray-500">
          <Loader2 className="animate-spin" size={22} /> Loading…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {[
              { label: 'Sessions', value: totals.sessions ?? 0 },
              { label: 'Check-ins', value: totals.checkins ?? 0 },
              { label: 'Open now', value: totals.openSessions ?? 0 },
              { label: 'Custody cycles', value: totals.custodyCycles ?? 0 },
              { label: 'Event reconciles', value: totals.eventReconciliations ?? 0 },
            ].map((c) => (
              <div
                key={c.label}
                className="rounded-2xl border border-gray-200 bg-white px-4 py-4 shadow-sm"
              >
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">
                  {c.label}
                </p>
                <p className="text-3xl font-black text-[#0d1a14] tabular-nums mt-1">{c.value}</p>
              </div>
            ))}
          </div>

          {(data?.custody?.openNow != null || data?.custody?.completed != null) && (
            <div className="rounded-2xl border border-gray-200 bg-white px-5 py-4">
              <h2 className="text-sm font-black uppercase tracking-widest text-[#0d1a14] mb-2">
                Kids custody
              </h2>
              <p className="text-sm text-gray-600">
                Open now: <strong>{data?.custody?.openNow ?? 0}</strong>
                {' · '}
                Completed: <strong>{data?.custody?.completed ?? 0}</strong>
              </p>
            </div>
          )}

          <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100">
              <h2 className="text-sm font-black uppercase tracking-widest text-[#0d1a14]">
                By session type
              </h2>
            </div>
            <div className="divide-y divide-gray-50">
              {(data?.byType || []).length === 0 ? (
                <p className="px-5 py-6 text-sm text-gray-500">No sessions in this range.</p>
              ) : (
                (data?.byType || []).map((row) => (
                  <div
                    key={row.type}
                    className="px-5 py-3 flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="font-bold text-[#0d1a14] capitalize">{row.type}</span>
                    <span className="text-gray-500">
                      {row.sessions} sessions · {row.checkins} check-ins
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100">
              <h2 className="text-sm font-black uppercase tracking-widest text-[#0d1a14]">
                Recent sessions
              </h2>
            </div>
            <div className="divide-y divide-gray-50">
              {(data?.recentSessions || []).length === 0 ? (
                <p className="px-5 py-6 text-sm text-gray-500">No recent sessions.</p>
              ) : (
                (data?.recentSessions || []).map((s) => (
                  <Link
                    key={s.sessionId}
                    to={`/attendance/sessions/${s.sessionId}/attendance`}
                    className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-gray-50"
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-[#0d1a14] truncate">{s.title}</p>
                      <p className="text-xs text-gray-500 capitalize">
                        {s.type} · {s.status}
                      </p>
                    </div>
                    <div className="text-right text-xs font-bold text-gray-600 shrink-0">
                      <p>{s.memberCount} in</p>
                      {s.openCustodyCount > 0 && (
                        <p className="text-amber-700">{s.openCustodyCount} custody open</p>
                      )}
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default AttendanceDashboardPage;
