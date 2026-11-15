import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Download,
  Loader2,
  Lock,
  ClipboardList,
  ChevronDown,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { useNav } from '../../App';
import { Role } from '../../types';
import { hasPermission } from '../../lib/permissions';
import { formatAccountContact } from '../../api/_utils/authPhone';
import { getAuthHeaders } from '../../lib/api';

interface AuditLogEntry {
  id: string;
  created_at: string;
  action: string;
  details: string | Record<string, unknown> | null;
  user: {
    id?: string;
    first_name?: string;
    last_name?: string;
    name?: string;
    email?: string;
    role?: string;
  } | null;
  severity: 'info' | 'warning' | 'critical';
  resource_type?: string | null;
  resource_id?: string | null;
  ip_address?: string | null;
  /** Person the change was about (filled in by the server for member-account entries). */
  target?: { name?: string | null; email?: string | null } | null;
}

/* ── Plain-English helpers ─────────────────────────────────────────────── */

/** Severity wording admins see; stored values stay info / warning / critical. */
const SEVERITY_LABEL: Record<string, string> = {
  info: 'Routine',
  warning: 'Review',
  critical: 'High impact',
};
const severityLabel = (s: string) => SEVERITY_LABEL[s] || s;

const titleCase = (raw: string) =>
  raw
    .replace(/[._]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

/** "kids_custody.checkin" → "Kids Custody Checkin"; already-readable actions stay as they are. */
const friendlyAction = (action: string) => (/[._]|^[A-Z0-9_]+$/.test(action) ? titleCase(action) : action);

const RESOURCE_LABEL: Record<string, string> = {
  user: 'Member account',
  users: 'Member account',
  event: 'Event',
  events: 'Event',
  channel: 'Chat channel',
  finance: 'Finance',
  transaction: 'Finance',
  manual: 'Note',
};
const friendlyResource = (r: string) => RESOURCE_LABEL[r.toLowerCase()] || titleCase(r);

/** Role codes like ADMIN_STAFF → "Admin Staff". */
const friendlyValue = (v: unknown): string => {
  if (v == null || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'string') return /^[A-Z][A-Z0-9_]+$/.test(v) ? titleCase(v) : v;
  if (Array.isArray(v)) return v.length ? `${v.length} item${v.length === 1 ? '' : 's'}` : 'None';
  if (typeof v === 'object') return 'Updated';
  return String(v);
};

const parseDetails = (details: AuditLogEntry['details']): Record<string, unknown> | string | null => {
  if (details == null || details === '') return null;
  if (typeof details === 'object') return details as Record<string, unknown>;
  const t = details.trim();
  if (t.startsWith('{')) {
    try {
      return JSON.parse(t);
    } catch {
      return details;
    }
  }
  return details;
};

const targetName = (log: AuditLogEntry) =>
  (log.target?.name || '').trim() || formatAccountContact(log.target?.email || '') || log.target?.email || '';

/** One readable sentence for the row. */
const summarize = (log: AuditLogEntry): string => {
  const d = parseDetails(log.details);
  const who = targetName(log);
  if (log.action === 'User Access Modified' && d && typeof d === 'object') {
    const person = who || 'a member';
    if (d.role) {
      const from = d.previous_role ? ` from ${friendlyValue(d.previous_role)}` : '';
      return `Changed ${person}’s role${from} to ${friendlyValue(d.role)}`;
    }
    const fields = Object.keys(d).filter((k) => k !== 'previous_role').map((k) => titleCase(k).toLowerCase());
    return fields.length ? `Updated ${person}’s ${fields.join(', ')}` : `Updated ${person}’s account`;
  }
  const base = detailsPreview(log.details);
  if (who && base === '—') return `About ${who}`;
  return who && !base.includes(who) ? `${base} · ${who}` : base;
};


const severityClass = (severity: string) => {
  if (severity === 'critical') return 'bg-red-50 text-red-700 border-red-100';
  if (severity === 'warning') return 'bg-amber-50 text-amber-800 border-amber-100';
  return 'bg-emerald-50 text-emerald-700 border-emerald-100';
};

const detailsPreview = (details: AuditLogEntry['details']): string => {
  try {
    const parsed =
      typeof details === 'string'
        ? details.trim().startsWith('{') || details.trim().startsWith('[')
          ? JSON.parse(details)
          : details
        : details;
    if (parsed == null || parsed === '') return '—';
    if (typeof parsed === 'string') return parsed;
    if (typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      if (obj.name) return String(obj.name);
      if (obj.title) return String(obj.title);
      if (obj.email) return String(obj.email);
      if (obj.action) return String(obj.action);
      const first = Object.values(obj).find((v) => v != null && String(v).trim());
      if (first != null) return String(first);
      return JSON.stringify(obj);
    }
    return String(parsed);
  } catch {
    return typeof details === 'string' ? details : JSON.stringify(details);
  }
};

const formatDetailsJson = (details: AuditLogEntry['details']): string => {
  try {
    if (details == null) return 'No additional details.';
    if (typeof details === 'string') {
      const trimmed = details.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        return JSON.stringify(JSON.parse(trimmed), null, 2);
      }
      return details;
    }
    return JSON.stringify(details, null, 2);
  } catch {
    return String(details);
  }
};

const DetailsList: React.FC<{ log: AuditLogEntry }> = ({ log }) => {
  const d = parseDetails(log.details);
  if (d == null) return <p className="text-sm text-gray-600">No additional details.</p>;
  if (typeof d === 'string') return <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{d}</p>;
  const entries = Object.entries(d).filter(([, v]) => v !== undefined);
  if (!entries.length) return <p className="text-sm text-gray-600">No additional details.</p>;
  return (
    <dl className="grid grid-cols-[minmax(110px,auto)_1fr] gap-x-4 gap-y-1.5 text-sm">
      {entries.map(([k, v]) => (
        <React.Fragment key={k}>
          <dt className="text-gray-500 font-semibold">{k === 'previous_role' ? 'Previous role' : titleCase(k)}</dt>
          <dd className="text-gray-800 break-words">{friendlyValue(v)}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
};

const AuditLogPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'info' | 'warning' | 'critical'>('all');
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { userRole } = useNav();

  const canView = hasPermission(userRole as Role, undefined, '/admin/audit');

  const fetchLogs = async () => {
    try {
      setLoading(true);
      setError(null);
      const headers = await getAuthHeaders();
      const res = await fetch('/api/vault?resource=community&subResource=audit&limit=200', {
        headers,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLogs([]);
        setError(data?.error || `Could not load audit log (${res.status})`);
        return;
      }
      const rows = Array.isArray(data) ? data : Array.isArray(data?.logs) ? data.logs : [];
      setLogs(rows);
    } catch (err) {
      console.error('Failed to fetch audit logs', err);
      setError('Network error while loading the audit log.');
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canView) fetchLogs();
    else setLoading(false);
  }, [canView, userRole]);

  const filteredLogs = useMemo(() => {
    const q = search.toLowerCase().trim();
    return logs.filter((log) => {
      if (severityFilter !== 'all' && log.severity !== severityFilter) return false;
      if (!q) return true;
      const userName = log.user
        ? `${log.user.name || ''} ${log.user.first_name || ''} ${log.user.last_name || ''} ${log.user.email || ''}`
        : '';
      const haystack = [
        log.action,
        log.id,
        targetName(log),
        summarize(log),
        severityLabel(log.severity),
        log.resource_type,
        log.resource_id,
        userName,
        detailsPreview(log.details),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [logs, search, severityFilter]);

  const formatWhen = (isoString: string) => {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const exportCsv = () => {
    const rows = filteredLogs.length ? filteredLogs : logs;
    if (!rows.length) {
      alert('No audit entries to export.');
      return;
    }
    const header = ['Timestamp', 'User', 'Email', 'Action', 'Severity', 'Resource', 'Resource ID', 'Details'];
    const csv = [
      header.join(','),
      ...rows.map((l) => {
        const userName = l.user
          ? `${l.user.first_name || ''} ${l.user.last_name || ''}`.trim() || l.user.name || ''
          : '';
        const cells = [
          l.created_at,
          userName,
          l.user?.email || '',
          l.action,
          l.severity,
          l.resource_type || '',
          l.resource_id || '',
          typeof l.details === 'string' ? l.details : JSON.stringify(l.details || {}),
        ].map((c) => `"${String(c).replace(/"/g, '""')}"`);
        return cells.join(',');
      }),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `awc-audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] text-center space-y-4 animate-in fade-in">
        <div className="w-14 h-14 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center">
          <Lock size={28} />
        </div>
        <div>
          <h2 className="text-xl font-black text-[#0d1a14]">Access restricted</h2>
          <p className="text-sm text-gray-500 max-w-md mx-auto mt-1">
            The audit log is available to administrators only.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-500 space-y-6 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <ClipboardList size={16} className="text-burgundy" />
            <p className="text-[11px] font-bold text-burgundy/50 uppercase tracking-[0.2em]">Admin</p>
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-[#0d1a14] tracking-tight">Audit Log</h1>
          <p className="text-sm text-gray-600 font-medium mt-1">
            Track important account, finance, events, chat, and admin changes across PLCC Canaan.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchLogs}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-600 text-xs font-bold uppercase tracking-widest hover:border-burgundy/20 hover:text-burgundy transition-colors"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gold/25 bg-gold-cream text-[#8A6A2E] text-xs font-bold uppercase tracking-widest hover:bg-gold hover:text-white transition-colors"
          >
            <Download size={15} />
            Export CSV
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-800 flex items-start gap-2">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 sm:px-5 py-4 border-b border-gray-100 flex flex-col lg:flex-row gap-3 lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              placeholder="Search by person, change, or details…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-11 pl-10 pr-3 rounded-xl bg-gray-50 border border-gray-100 focus:bg-white focus:border-burgundy/30 outline-none text-sm font-medium text-[#0d1a14]"
            />
          </div>
          <div className="relative">
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value as typeof severityFilter)}
              className="h-11 appearance-none pl-3 pr-9 rounded-xl bg-gray-50 border border-gray-100 focus:bg-white focus:border-burgundy/30 outline-none text-sm font-semibold text-[#0d1a14]"
            >
              <option value="all">All importance levels</option>
              <option value="info">Routine</option>
              <option value="warning">Review</option>
              <option value="critical">High impact</option>
            </select>
            <ChevronDown
              size={14}
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
          </div>
          <p className="text-xs font-semibold text-gray-500 lg:whitespace-nowrap">
            {filteredLogs.length} {filteredLogs.length === 1 ? 'entry' : 'entries'}
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-500 gap-3">
            <Loader2 size={22} className="animate-spin text-burgundy" />
            <span className="text-sm font-medium">Loading audit history…</span>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center mx-auto mb-4">
              <ClipboardList size={28} className="text-gray-300" />
            </div>
            <h3 className="text-base font-black text-[#0d1a14]">No audit entries yet</h3>
            <p className="text-sm text-gray-500 font-medium mt-1 max-w-md mx-auto">
              {search || severityFilter !== 'all'
                ? 'Nothing matches this filter. Clear the search or importance level and try again.'
                : 'Actions like role changes, event edits, channel deletes, and finance approvals will appear here.'}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {filteredLogs.slice(0, 150).map((log) => {
              const open = expandedId === log.id;
              const initials =
                log.user?.name?.charAt(0) ||
                log.user?.first_name?.charAt(0) ||
                log.user?.email?.charAt(0) ||
                '?';
              const displayName = log.user
                ? log.user.name ||
                  `${log.user.first_name || ''} ${log.user.last_name || ''}`.trim() ||
                  formatAccountContact(log.user.email || '') ||
                  'User'
                : 'System';
              return (
                <li key={log.id} className="px-4 sm:px-5 py-4 hover:bg-gray-50/80 transition-colors">
                  <button
                    type="button"
                    onClick={() => setExpandedId(open ? null : log.id)}
                    className="w-full text-left"
                  >
                    <div className="flex flex-col md:flex-row md:items-start gap-3 md:gap-5">
                      <div className="md:min-w-[150px] shrink-0">
                        <p className="text-sm font-bold text-[#0d1a14]">{formatWhen(log.created_at)}</p>
                      </div>

                      <div className="flex items-center gap-3 md:min-w-[180px] shrink-0">
                        <div className="w-8 h-8 rounded-lg bg-burgundy/5 text-burgundy border border-burgundy/10 flex items-center justify-center text-[11px] font-black shrink-0">
                          {String(initials).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-[#0d1a14] truncate">{displayName}</p>
                          <p className="text-[11px] text-gray-500 truncate">
                            {log.user ? 'Made the change · ' : ''}
                            {log.user?.email
                              ? formatAccountContact(log.user.email) || log.user.email
                              : log.user?.role || 'Unauthenticated'}
                          </p>
                        </div>
                      </div>

                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-bold text-gray-800">{friendlyAction(log.action)}</p>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${severityClass(
                              log.severity
                            )}`}
                          >
                            {severityLabel(log.severity)}
                          </span>
                          {log.resource_type && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-gray-50 text-gray-600 border border-gray-100">
                              {friendlyResource(log.resource_type)}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 font-medium">{summarize(log)}</p>
                      </div>

                      <ChevronDown
                        size={16}
                        className={`text-gray-300 shrink-0 mt-1 transition-transform ${open ? 'rotate-180' : ''}`}
                      />
                    </div>
                  </button>

                  {open && (
                    <div className="mt-3 ml-0 md:ml-[150px] rounded-xl border border-gray-100 bg-gray-50/80 px-3.5 py-3">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                        Details
                      </p>
                      <DetailsList log={log} />
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-500 font-medium">
                        {targetName(log) ? <span>Person: {targetName(log)}</span> : null}
                        {log.ip_address ? <span>From IP: {log.ip_address}</span> : null}
                        <span>Reference: {log.id.slice(0, 8)}</span>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
            {filteredLogs.length > 150 && (
              <li className="px-5 py-4 text-center text-xs font-bold text-gray-400 uppercase tracking-widest bg-gray-50/60">
                Showing 150 of {filteredLogs.length}. Refine search to narrow results.
              </li>
            )}
          </ul>
        )}
      </div>

      <p className="text-xs text-gray-500 font-medium px-1">
        Audit entries are written when staff change roles, events, channels, family links, finance approvals, security logs, and other administrative actions. Day-to-day chat messages are not logged here.
      </p>
    </div>
  );
};

export default AuditLogPage;
