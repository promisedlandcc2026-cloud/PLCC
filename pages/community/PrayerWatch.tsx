import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarHeart,
  Check,
  HandHeart,
  Loader2,
  MessageSquare,
  Phone,
  Trash2,
  Printer,
  RefreshCcw,
  Sparkles,
} from 'lucide-react';
import { useNav } from '../../App';
import VoiceHuddle from '../../components/Community/VoiceHuddle';
import {
  fetchAnsweredWatchPrayers,
  fetchPrayerWatchAccess,
  fetchWatchPrayers,
  joinWatchRoom,
  lastMeetingStart,
  markWatchPrayer,
  MEETING_DAYS,
  removeWatchPrayer,
  nextMeetingDay,
  type PrayerWatchAccess,
  type WatchPrayer,
} from '../../lib/prayerWatch';

type Range = 'meeting' | 'week' | 'custom';
type Tab = 'requests' | 'praise';

const REFRESH_MS = 20_000;
const PAGE_TITLE = 'Intercessors Prayer Watch';

const dayFmt = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const longFmt = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
const stampFmt = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function toInputDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function fromInputDate(v: string, endOfDay: boolean): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (endOfDay) d.setHours(23, 59, 59, 999);
  return d;
}

function useVisibleInterval(fn: () => void, ms: number, enabled: boolean) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') ref.current();
    }, ms);
    return () => window.clearInterval(id);
  }, [ms, enabled]);
}

const PrayerCard: React.FC<{
  p: WatchPrayer;
  index: number;
  isNew: boolean;
  canLead: boolean;
  busy: boolean;
  praise: boolean;
  onMark: (action: 'prayed' | 'answered', value: boolean) => void;
  onRemove: () => void;
}> = ({ p, index, isNew, canLead, busy, praise, onMark, onRemove }) => {
  const prayed = !!p.prayedAt;
  const [confirmRemove, setConfirmRemove] = useState(false);
  return (
    <li
      className={`print-card rounded-2xl border p-4 shadow-sm transition-colors ${
        prayed && !praise ? 'bg-emerald-50 border-emerald-300' : 'bg-white border-gray-100'
      } ${isNew ? 'ring-2 ring-gold animate-in slide-in-from-top-2 fade-in duration-500' : ''}`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-bold text-[#0d1a14]">
          {index + 1}. {p.name}
          {isNew && (
            <span className="ml-2 align-middle rounded-full bg-gold px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-burgundy print:hidden">
              New
            </span>
          )}
        </p>
        <p className="text-xs text-gray-500 shrink-0">{p.createdAt ? stampFmt.format(new Date(p.createdAt)) : ''}</p>
      </div>
      {p.category && p.category !== 'Other' && (
        <p className="text-[11px] font-black uppercase tracking-widest text-burgundy mt-0.5">{p.category}</p>
      )}
      <p className="mt-2 text-[15px] leading-relaxed text-gray-800 whitespace-pre-wrap">{p.content}</p>
      {p.privateToIntercessors ? (
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-burgundy/10 px-2.5 py-1 text-[11px] font-black uppercase tracking-widest text-burgundy">
          🤝 Private to the Intercessors · please keep it in this room
        </p>
      ) : (
        !p.onWall && !praise && <p className="mt-2 text-xs text-gray-500">Waiting for approval. Not on the Prayer Wall yet.</p>
      )}
      {praise && p.answeredAt && (
        <p className="mt-2 text-xs font-bold text-emerald-700">Answered {dayFmt.format(new Date(p.answeredAt))}. Praise God!</p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2 print:hidden">
        {!praise && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onMark('prayed', !prayed)}
            aria-pressed={prayed}
            className={`min-h-[40px] px-3.5 rounded-full text-sm font-bold inline-flex items-center gap-1.5 ${
              prayed ? 'bg-emerald-700 text-white' : 'bg-burgundy/10 text-burgundy'
            }`}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : prayed ? <Check size={15} /> : <HandHeart size={15} />}
            {prayed ? `Prayed${p.prayedBy ? ` · ${p.prayedBy}` : ''}` : 'Mark Prayed'}
          </button>
        )}
        {canLead && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onMark('answered', !praise)}
            className="min-h-[40px] px-3.5 rounded-full text-sm font-bold inline-flex items-center gap-1.5 border border-gray-200 bg-white text-[#0d1a14]"
          >
            <Sparkles size={15} /> {praise ? 'Undo answered' : 'Answered'}
          </button>
        )}
        {canLead && !confirmRemove && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirmRemove(true)}
            className="min-h-[40px] px-3.5 rounded-full text-sm font-bold inline-flex items-center gap-1.5 text-gray-500 hover:text-rose-700 ml-auto"
          >
            <Trash2 size={15} /> Remove
          </button>
        )}
      </div>
      {canLead && confirmRemove && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-rose-50 border border-rose-200 px-3 py-2.5 print:hidden" role="alert">
          <p className="flex-1 min-w-[180px] text-sm font-semibold text-rose-800">
            Remove this prayer request for good? It also comes off the Prayer Wall.
          </p>
          <button
            type="button"
            onClick={() => setConfirmRemove(false)}
            className="min-h-[40px] px-3.5 rounded-full text-sm font-bold bg-white border border-gray-200 text-[#0d1a14]"
          >
            Keep it
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setConfirmRemove(false);
              onRemove();
            }}
            className="min-h-[40px] px-3.5 rounded-full text-sm font-bold bg-rose-700 text-white"
          >
            Yes, remove
          </button>
        </div>
      )}
    </li>
  );
};

/**
 * Intercessors Prayer Watch — the Intercessor Channel's Live Huddle on the left, every shared
 * prayer request (from the Vault and PLCC Connect) on the right. Stacked on phones.
 * Only the Intercessor Channel's members and the prayer team can open it.
 */
const PrayerWatchPage: React.FC = () => {
  const { userId, userRole } = useNav();
  const now = useMemo(() => new Date(), []);
  const lastMeeting = useMemo(() => lastMeetingStart(now), [now]);
  const nextMeeting = useMemo(() => nextMeetingDay(now), [now]);
  const meetingToday = MEETING_DAYS.includes(now.getDay());

  const [access, setAccess] = useState<PrayerWatchAccess | null>(null);
  const [tab, setTab] = useState<Tab>('requests');
  const [range, setRange] = useState<Range>('meeting');
  const [customFrom, setCustomFrom] = useState(toInputDate(lastMeeting));
  const [customTo, setCustomTo] = useState(toInputDate(now));
  const [items, setItems] = useState<WatchPrayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [onCall, setOnCall] = useState(false);
  const [joining, setJoining] = useState(false);
  const [callError, setCallError] = useState<string | null>(null);

  const startCall = async () => {
    setJoining(true);
    setCallError(null);
    try {
      await joinWatchRoom();
      setOnCall(true);
    } catch (err) {
      setCallError(err instanceof Error ? err.message : 'We couldn’t open the prayer call.');
    } finally {
      setJoining(false);
    }
  };
  const seenRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    void fetchPrayerWatchAccess(`${userId || ''}:${userRole || ''}`).then(setAccess);
  }, [userId, userRole]);

  const span = useMemo(() => {
    const end = new Date();
    if (range === 'week') return { from: new Date(end.getTime() - 7 * 86400000), to: end };
    if (range === 'custom') {
      const from = fromInputDate(customFrom, false) || lastMeeting;
      const to = fromInputDate(customTo, true) || end;
      return from <= to ? { from, to } : { from: to, to: from };
    }
    return { from: lastMeeting, to: end };
  }, [range, customFrom, customTo, lastMeeting]);

  const load = useCallback(
    async (quiet = false) => {
      if (!access?.allowed) return;
      if (!quiet) setLoading(true);
      setError(null);
      try {
        const to = range === 'custom' ? span.to : new Date();
        const list = tab === 'praise' ? await fetchAnsweredWatchPrayers() : await fetchWatchPrayers(span.from, to);
        setItems(list);
        if (tab === 'requests') {
          if (seenRef.current && quiet) {
            const fresh = list.filter((i) => !seenRef.current!.has(i.id)).map((i) => i.id);
            if (fresh.length) setNewIds((prev) => new Set([...prev, ...fresh]));
          }
          seenRef.current = new Set([...(seenRef.current || []), ...list.map((i) => i.id)]);
        }
      } catch (err) {
        if (!quiet) setError(err instanceof Error ? err.message : 'We couldn’t load the requests.');
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [access, tab, span, range]
  );

  useEffect(() => {
    void load();
  }, [load]);
  useVisibleInterval(() => void load(true), REFRESH_MS, !!access?.allowed);

  const onMark = async (p: WatchPrayer, action: 'prayed' | 'answered', value: boolean) => {
    setBusyId(p.id);
    setNotice(null);
    if (action === 'prayed') {
      setItems((prev) => prev.map((x) => (x.id === p.id ? { ...x, prayedAt: value ? new Date().toISOString() : null, prayedBy: value ? 'You' : null } : x)));
    } else {
      setItems((prev) => prev.filter((x) => x.id !== p.id));
    }
    try {
      await markWatchPrayer(action, p.id, value);
      if (action === 'answered') setNotice(value ? `Moved to Praise reports: ${p.name}'s request.` : 'Moved back to the prayer requests.');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'That change was not saved.');
    } finally {
      setBusyId(null);
      void load(true);
    }
  };

  const onRemove = async (p: WatchPrayer) => {
    setBusyId(p.id);
    setNotice(null);
    setItems((prev) => prev.filter((x) => x.id !== p.id));
    try {
      await removeWatchPrayer(p.id);
      setNotice(`Removed ${p.name}'s prayer request.`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'That request was not removed.');
    } finally {
      setBusyId(null);
      void load(true);
    }
  };

  const roomName = access?.roomName || 'Intercessor Channel';
  const rangeLabel = `${dayFmt.format(span.from)} – ${dayFmt.format(span.to)}`;
  const prayedCount = items.filter((i) => i.prayedAt).length;

  const chip = (id: Range, label: string) => (
    <button
      key={id}
      type="button"
      aria-pressed={range === id}
      onClick={() => setRange(id)}
      className={`min-h-[40px] px-3.5 rounded-full border text-sm font-bold ${
        range === id ? 'border-burgundy bg-burgundy/10 text-burgundy' : 'border-gray-200 bg-white text-[#0d1a14]'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 print:p-0">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #prayer-watch-print, #prayer-watch-print * { visibility: visible !important; }
          #prayer-watch-print { position: absolute; left: 0; top: 0; width: 100%; padding: 0 12mm; }
          #prayer-watch-print .print-card { break-inside: avoid; box-shadow: none !important; background: #fff !important; border-color: #999 !important; }
          @page { margin: 14mm 0; }
        }
      `}</style>

      <header className="print:hidden">
        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-burgundy">{roomName}</p>
        <h1 className="text-2xl sm:text-3xl font-black text-[#0d1a14] tracking-tight">{PAGE_TITLE}</h1>
        <p className="text-sm text-gray-600 mt-1">
          Every shared prayer request from the Vault and PLCC Connect. Next meeting: <b>{longFmt.format(nextMeeting)}</b>.
          Private requests for the Pastor never appear here.
        </p>
      </header>

      {meetingToday && access?.allowed && !onCall && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-gold/15 border border-gold/50 px-4 py-3 print:hidden">
          <CalendarHeart size={20} className="text-burgundy shrink-0" />
          <p className="flex-1 min-w-[180px] font-bold text-[#0d1a14]">Prayer meeting today</p>
          <button
            type="button"
            onClick={() => void startCall()}
            disabled={joining}
            className="min-h-[44px] px-4 rounded-full bg-burgundy text-white text-sm font-bold inline-flex items-center gap-2"
          >
            <Phone size={16} /> Join now
          </button>
        </div>
      )}

      {!access ? (
        <p className="mt-6 flex items-center gap-2 text-sm text-gray-500">
          <Loader2 size={16} className="animate-spin" /> Opening the Prayer Watch…
        </p>
      ) : !access.allowed ? (
        <div className="mt-6 rounded-2xl bg-white border border-gray-100 p-5">
          <p className="font-bold text-[#0d1a14]">The Prayer Watch is for the members of the {roomName}.</p>
          <p className="text-sm text-gray-600 mt-1">
            {access.setUp
              ? 'If you are an intercessor, ask the head of the Intercessors to add you to the room.'
              : 'Create a chat channel named “Intercessor Channel” in Community → Chat first.'}
          </p>
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] gap-5 items-start">
          {/* Left: Live Huddle */}
          <section
            aria-label="Live Huddle"
            className={`print:hidden ${onCall ? 'sticky top-2 z-20' : ''} lg:sticky lg:top-4`}
          >
            {onCall && access.roomId ? (
              <div className="h-[380px] lg:h-[calc(100dvh-180px)] lg:min-h-[520px]">
                <VoiceHuddle
                  embedded
                  audioOnly
                  prayerWatch
                  isOpen
                  channelId={access.roomId}
                  channelName={roomName}
                  onClose={() => setOnCall(false)}
                />
              </div>
            ) : (
              <div className="rounded-3xl bg-burgundy text-white p-5 sm:p-6 flex flex-col gap-4 lg:min-h-[320px] shadow-lg">
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-gold">Live Huddle</p>
                <div>
                  <h2 className="text-2xl font-black leading-tight">{roomName}</h2>
                  <p className="text-sm text-white/80 mt-1">
                    {meetingToday
                      ? 'Prayer meeting today. Join the call and pray through the requests together.'
                      : 'Join the call anytime. The prayer requests stay open while you pray.'}
                  </p>
                </div>
                {access.roomId ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void startCall()}
            disabled={joining}
                      className="min-h-[56px] rounded-2xl bg-gold text-burgundy font-black text-lg inline-flex items-center justify-center gap-2"
                    >
                      {joining ? <Loader2 size={20} className="animate-spin" /> : <Phone size={20} />} Join the Prayer Call
                    </button>
                    <Link
                      to={`/community/chat?channel=${access.roomId}`}
                      className="inline-flex items-center justify-center gap-2 min-h-[44px] rounded-2xl border border-white/25 text-sm font-bold text-white/90"
                    >
                      <MessageSquare size={16} /> Open the room chat
                    </Link>
                  </>
                ) : (
                  <p className="text-sm text-white/80">No Intercessor Channel found in Community → Chat.</p>
                )}
                {callError && <p className="text-sm font-semibold text-gold" role="alert">{callError}</p>}
              </div>
            )}
          </section>

          {/* Right: prayer requests / praise reports */}
          <section aria-label="Prayer requests" className="min-w-0">
            <div className="grid grid-cols-2 gap-1.5 rounded-full bg-white border border-gray-100 p-1.5 print:hidden" role="tablist">
              {(['requests', 'praise'] as Tab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={`min-h-[44px] rounded-full font-black text-sm ${tab === t ? 'bg-gold text-burgundy' : 'text-[#0d1a14]'}`}
                >
                  {t === 'requests' ? 'Prayer requests' : 'Praise reports'}
                </button>
              ))}
            </div>

            {tab === 'requests' && (
              <div className="mt-3 flex flex-col gap-3 print:hidden">
                <div className="flex flex-wrap gap-2" role="group" aria-label="Which requests">
                  {chip('meeting', `Since last meeting (${dayFmt.format(lastMeeting)})`)}
                  {chip('week', 'Last 7 days')}
                  {chip('custom', 'Pick dates')}
                </div>
                {range === 'custom' && (
                  <div className="flex flex-wrap gap-3">
                    <label className="flex flex-col text-[11px] font-black uppercase tracking-widest text-gray-500 gap-1">
                      From
                      <input
                        id="watch-from"
                        type="date"
                        value={customFrom}
                        max={customTo}
                        onChange={(e) => setCustomFrom(e.target.value)}
                        className="h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium normal-case tracking-normal text-[#0d1a14]"
                      />
                    </label>
                    <label className="flex flex-col text-[11px] font-black uppercase tracking-widest text-gray-500 gap-1">
                      To
                      <input
                        id="watch-to"
                        type="date"
                        value={customTo}
                        min={customFrom}
                        onChange={(e) => setCustomTo(e.target.value)}
                        className="h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium normal-case tracking-normal text-[#0d1a14]"
                      />
                    </label>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <p className="flex-1 text-sm font-bold text-[#0d1a14]">
                    {loading ? 'Loading…' : `${items.length} request${items.length === 1 ? '' : 's'} · ${prayedCount} prayed`}
                  </p>
                  <button
                    type="button"
                    onClick={() => void load()}
                    aria-label="Refresh the requests"
                    className="min-h-[44px] w-11 rounded-full border border-gray-200 bg-white inline-flex items-center justify-center text-gray-500"
                  >
                    <RefreshCcw size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    disabled={loading || items.length === 0}
                    className="min-h-[44px] px-4 rounded-full bg-burgundy text-white text-sm font-bold inline-flex items-center gap-2 disabled:opacity-50"
                  >
                    <Printer size={16} /> Print
                  </button>
                </div>
              </div>
            )}

            {notice && (
              <p className="mt-3 rounded-xl bg-white border border-gray-100 px-4 py-2.5 text-sm text-[#0d1a14] print:hidden" role="status">
                {notice}
              </p>
            )}

            <div id="prayer-watch-print" className="mt-4">
              <div className="hidden print:block mb-5">
                <p style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700 }}>{PAGE_TITLE}</p>
                <h1 style={{ fontSize: 22, fontWeight: 700, margin: '2px 0' }}>{tab === 'praise' ? 'Praise reports' : 'Prayer requests'}</h1>
                <p style={{ fontSize: 12 }}>
                  {tab === 'praise' ? '' : `${rangeLabel} · `}For the meeting on {longFmt.format(nextMeeting)} · {items.length} item{items.length === 1 ? '' : 's'}
                </p>
              </div>
              {loading ? (
                <p className="flex items-center gap-2 text-sm text-gray-500 print:hidden">
                  <Loader2 size={16} className="animate-spin" /> Loading…
                </p>
              ) : error ? (
                <div className="rounded-2xl bg-white border border-burgundy/20 p-4 print:hidden" role="alert">
                  <p className="text-sm font-semibold text-burgundy">{error}</p>
                  <button type="button" onClick={() => void load()} className="mt-2 text-sm font-bold text-burgundy underline">
                    Try again
                  </button>
                </div>
              ) : items.length === 0 ? (
                <p className="rounded-2xl bg-white border border-gray-100 p-5 text-sm text-gray-500 print:hidden">
                  {tab === 'praise'
                    ? 'No answered prayers yet. When the head of the Intercessors marks a request Answered, it shows here.'
                    : `No prayer requests for ${rangeLabel}. New ones appear here on their own.`}
                </p>
              ) : (
                <ol className="flex flex-col gap-3">
                  {items.map((p, i) => (
                    <PrayerCard
                      key={p.id}
                      p={p}
                      index={i}
                      isNew={newIds.has(p.id)}
                      canLead={access.canLead}
                      busy={busyId === p.id}
                      praise={tab === 'praise'}
                      onMark={(action, value) => void onMark(p, action, value)}
                      onRemove={() => void onRemove(p)}
                    />
                  ))}
                </ol>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default PrayerWatchPage;
