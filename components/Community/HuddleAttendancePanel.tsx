import React, { useCallback, useEffect, useState } from 'react';
import { ClipboardList, Copy, Loader2, Users, X } from 'lucide-react';
import { fetchWithTimeout, getAuthHeaders } from '../../lib/api';

export type HuddleAttendancePerson = {
  identity: string;
  userId: string | null;
  displayName: string;
  joinedAt: string | null;
  leftAt: string | null;
  present: boolean;
};

export type HuddleAttendanceSession = {
  id: string;
  channelId: string;
  startedAt: string;
  endedAt: string | null;
  attendeeCount: number;
  attendees: HuddleAttendancePerson[];
};

export type HuddleAttendancePayload = {
  ok: boolean;
  live: HuddleAttendancePerson[];
  currentSession: HuddleAttendanceSession | null;
  history: HuddleAttendanceSession[];
  canViewAttendance?: boolean;
  error?: string;
};

export const HUDDLE_ATTENDANCE_VIEW_ROLES = new Set([
  'SUPER_ADMIN',
  'PASTOR',
  'ADMIN',
  'MINISTRY_LEADER',
]);

export function canViewHuddleAttendanceUi(role: string | null | undefined): boolean {
  return HUDDLE_ATTENDANCE_VIEW_ROLES.has(String(role || '').toUpperCase());
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export async function fetchHuddleAttendance(
  channelId: string
): Promise<HuddleAttendancePayload> {
  const headers = await getAuthHeaders();
  const res = await fetchWithTimeout(
    `/api/vault?resource=community&subResource=voice-huddle-attendance&channelId=${encodeURIComponent(channelId)}`,
    { headers },
    12000
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    return {
      ok: false,
      live: [],
      currentSession: null,
      history: [],
      error: data?.error || 'Could not load attendance',
    };
  }
  return {
    ok: true,
    live: Array.isArray(data.live) ? data.live : [],
    currentSession: data.currentSession || null,
    history: Array.isArray(data.history) ? data.history : [],
    canViewAttendance: true,
  };
}

function nameList(people: HuddleAttendancePerson[]): string {
  return people
    .map((p) => p.displayName || 'Participant')
    .filter(Boolean)
    .join('\n');
}

type Props = {
  channelId: string;
  /** When true, poll while open (during live huddle). */
  pollMs?: number;
  /** Compact embed inside VoiceHuddle. */
  embedded?: boolean;
  onClose?: () => void;
  /** Prefer history-first when huddle is not live. */
  preferHistory?: boolean;
};

const HuddleAttendancePanel: React.FC<Props> = ({
  channelId,
  pollMs = 9000,
  embedded = false,
  onClose,
  preferHistory = false,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<HuddleAttendancePayload | null>(null);
  const [copyNote, setCopyNote] = useState<string | null>(null);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!channelId) return;
    try {
      const next = await fetchHuddleAttendance(channelId);
      if (!next.ok) {
        setError(next.error || 'Could not load attendance');
      } else {
        setError(null);
        setPayload(next);
      }
    } catch (err: any) {
      setError(err?.message || 'Could not load attendance');
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  useEffect(() => {
    if (!pollMs || pollMs < 2000) return;
    const t = window.setInterval(() => {
      load();
    }, pollMs);
    return () => window.clearInterval(t);
  }, [load, pollMs]);

  const live = payload?.live || [];
  const sessionPeople = payload?.currentSession?.attendees || [];
  const history = payload?.history || [];

  const copyNames = async (people: HuddleAttendancePerson[], label: string) => {
    const text = nameList(people);
    if (!text) {
      setCopyNote('No names to copy');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopyNote(`Copied ${label}`);
      window.setTimeout(() => setCopyNote(null), 2000);
    } catch {
      setCopyNote('Could not copy');
    }
  };

  const shellClass = embedded
    ? 'rounded-2xl border border-burgundy/15 bg-white shadow-sm overflow-hidden'
    : 'rounded-2xl border border-gray-100 bg-white shadow-lg overflow-hidden';

  return (
    <div className={shellClass} data-huddle-attendance-panel="true">
      <div className="flex items-center justify-between gap-2 px-3.5 py-3 bg-burgundy text-white">
        <div className="min-w-0 flex items-center gap-2">
          <ClipboardList size={16} className="text-gold shrink-0" aria-hidden />
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-gold">
              Huddle attendance
            </p>
            <p className="text-xs font-semibold text-white/80 truncate">
              Pastor / staff roster
            </p>
          </div>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-white/60 hover:text-white hover:bg-white/10 min-h-[40px] min-w-[40px]"
            aria-label="Close attendance"
          >
            <X size={16} />
          </button>
        ) : null}
      </div>

      <div className="p-3.5 space-y-4 max-h-[min(60vh,420px)] overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-burgundy/60">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm font-semibold">Loading attendance…</span>
          </div>
        ) : error ? (
          <p className="text-sm font-semibold text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
            {error}
          </p>
        ) : (
          <>
            {!preferHistory || live.length > 0 || sessionPeople.length > 0 ? (
              <>
                <section>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <h4 className="text-[11px] font-black uppercase tracking-widest text-burgundy/70 flex items-center gap-1.5">
                      <Users size={12} aria-hidden />
                      In huddle now
                      <span className="text-burgundy">({live.length})</span>
                    </h4>
                    {live.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => copyNames(live, 'live list')}
                        className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-burgundy hover:underline"
                      >
                        <Copy size={11} /> Copy
                      </button>
                    ) : null}
                  </div>
                  {live.length === 0 ? (
                    <p className="text-xs text-gray-500 font-medium">No one is in the huddle right now.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {live.map((p) => (
                        <li
                          key={`live-${p.identity}`}
                          className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2"
                        >
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                          <span className="text-sm font-bold text-[#0d1a14] truncate">
                            {p.displayName}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <h4 className="text-[11px] font-black uppercase tracking-widest text-burgundy/70">
                      Joined this session
                      <span className="text-burgundy ml-1">({sessionPeople.length})</span>
                    </h4>
                    {sessionPeople.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => copyNames(sessionPeople, 'session list')}
                        className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-burgundy hover:underline"
                      >
                        <Copy size={11} /> Copy
                      </button>
                    ) : null}
                  </div>
                  {sessionPeople.length === 0 ? (
                    <p className="text-xs text-gray-500 font-medium">
                      Attendance will appear as people join (saved for after the huddle).
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {sessionPeople.map((p) => (
                        <li
                          key={`sess-${p.identity}`}
                          className="flex items-center justify-between gap-2 rounded-xl bg-gray-50 border border-gray-100 px-3 py-2"
                        >
                          <span className="text-sm font-bold text-[#0d1a14] truncate">
                            {p.displayName}
                          </span>
                          <span
                            className={`text-[10px] font-black uppercase tracking-wider shrink-0 ${
                              p.present ? 'text-emerald-700' : 'text-gray-400'
                            }`}
                          >
                            {p.present ? 'Here' : 'Left'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </>
            ) : null}

            <section data-huddle-attendance-history="true">
              <h4 className="text-[11px] font-black uppercase tracking-widest text-burgundy/70 mb-2">
                Recent huddle attendance
              </h4>
              {history.length === 0 ? (
                <p className="text-xs text-gray-500 font-medium">
                  No finished huddles recorded yet for this channel.
                </p>
              ) : (
                <ul className="space-y-2">
                  {history.map((s) => {
                    const open = expandedHistoryId === s.id;
                    return (
                      <li
                        key={s.id}
                        className="rounded-xl border border-gray-100 bg-white overflow-hidden"
                      >
                        <button
                          type="button"
                          onClick={() => setExpandedHistoryId(open ? null : s.id)}
                          className="w-full text-left px-3 py-2.5 flex items-center justify-between gap-2 hover:bg-burgundy/[0.03]"
                        >
                          <span className="min-w-0">
                            <span className="block text-sm font-bold text-[#0d1a14] truncate">
                              {formatWhen(s.startedAt)}
                              {s.endedAt ? ` – ${formatWhen(s.endedAt)}` : ''}
                            </span>
                            <span className="text-[11px] font-semibold text-gray-500">
                              {s.attendeeCount} attended
                            </span>
                          </span>
                          <span className="text-[10px] font-black uppercase tracking-wider text-burgundy shrink-0">
                            {open ? 'Hide' : 'View'}
                          </span>
                        </button>
                        {open ? (
                          <div className="px-3 pb-3 border-t border-gray-50 pt-2 space-y-2">
                            <button
                              type="button"
                              onClick={() => copyNames(s.attendees, 'history list')}
                              className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-burgundy hover:underline"
                            >
                              <Copy size={11} /> Copy names
                            </button>
                            <ul className="space-y-1">
                              {s.attendees.map((p) => (
                                <li
                                  key={`${s.id}-${p.identity}`}
                                  className="text-sm font-semibold text-[#0d1a14] px-2 py-1 rounded-lg bg-gray-50"
                                >
                                  {p.displayName}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {copyNote ? (
              <p className="text-[11px] font-bold text-emerald-700" role="status">
                {copyNote}
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
};

export default HuddleAttendancePanel;
