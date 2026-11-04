/**
 * Attendance session create/edit form modal.
 * No status, visitor count, or actor fields.
 */
import React, { useEffect, useId, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import {
  CHURCH_TIMEZONE,
  type AttendanceSession,
  type AttendanceSessionType,
} from '../../lib/attendanceSessionsTypes';
import {
  ATTENDANCE_SESSION_TYPE_OPTIONS,
  isoToChurchLocalInput,
  validateSessionForm,
} from '../../lib/attendanceSessionsUi';
import {
  createAttendanceSession,
  fetchEventsForSessionForm,
  fetchServeOpportunitiesForSessionForm,
  updateAttendanceSession,
} from '../../lib/attendanceSessionsClient';

type Props = {
  open: boolean;
  mode: 'create' | 'edit';
  session?: AttendanceSession | null;
  onClose: () => void;
  onSaved: (session: AttendanceSession, mode: 'create' | 'edit') => void;
};

const AttendanceSessionForm: React.FC<Props> = ({
  open,
  mode,
  session,
  onClose,
  onSaved,
}) => {
  const titleId = useId();
  const firstFieldRef = useRef<HTMLSelectElement>(null);
  const [type, setType] = useState<AttendanceSessionType>('worship');
  const [title, setTitle] = useState('');
  const [startsLocal, setStartsLocal] = useState('');
  const [endsLocal, setEndsLocal] = useState('');
  const [eventId, setEventId] = useState('');
  const [serveOpportunityId, setServeOpportunityId] = useState('');
  const [events, setEvents] = useState<Array<{ id: string; name: string }>>([]);
  const [opportunities, setOpportunities] = useState<Array<{ id: string; title: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (mode === 'edit' && session) {
      setType((session.type as AttendanceSessionType) || 'worship');
      setTitle(session.title || '');
      setStartsLocal(isoToChurchLocalInput(session.startsAt));
      setEndsLocal(isoToChurchLocalInput(session.endsAt));
      setEventId(session.eventId || '');
      setServeOpportunityId(session.serveOpportunityId || '');
    } else {
      setType('worship');
      setTitle('');
      setStartsLocal('');
      setEndsLocal('');
      setEventId('');
      setServeOpportunityId('');
    }
    const t = window.setTimeout(() => firstFieldRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [open, mode, session]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const [ev, opp] = await Promise.all([
        fetchEventsForSessionForm(),
        fetchServeOpportunitiesForSessionForm(),
      ]);
      if (!cancelled) {
        setEvents(ev);
        setOpportunities(opp);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const validated = validateSessionForm({
      type,
      title,
      startsLocal,
      endsLocal,
      eventId,
    });
    if (!validated.ok) {
      setError(validated.error);
      return;
    }
    setSaving(true);
    try {
      if (mode === 'create') {
        const created = await createAttendanceSession({
          type,
          title: validated.title,
          startsAt: validated.startsAt,
          endsAt: validated.endsAt,
          timezone: CHURCH_TIMEZONE,
          eventId: type === 'event' ? eventId : eventId || null,
          serveOpportunityId: serveOpportunityId || null,
        });
        onSaved(created, 'create');
      } else if (session?.id) {
        const updated = await updateAttendanceSession({
          sessionId: session.id,
          type,
          title: validated.title,
          startsAt: validated.startsAt,
          endsAt: validated.endsAt,
          timezone: CHURCH_TIMEZONE,
          eventId: type === 'event' ? eventId : eventId || null,
          serveOpportunityId: serveOpportunityId || null,
        });
        onSaved(updated, 'edit');
      }
    } catch (err: any) {
      setError(String(err?.message || 'Could not save session.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/45 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close dialog backdrop"
        onClick={onClose}
      />
      <div className="relative w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl">
        <div className="sticky top-0 flex items-center justify-between gap-3 border-b border-gray-100 bg-white px-5 py-4">
          <h2 id={titleId} className="text-lg font-black text-[#0d1a14]">
            {mode === 'create' ? 'Create Session' : 'Edit Draft Session'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl text-gray-500 hover:bg-gray-50"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 px-5 py-5">
          <div>
            <label htmlFor="as-type" className="block text-xs font-black uppercase tracking-wider text-gray-500 mb-1.5">
              Type
            </label>
            <select
              id="as-type"
              ref={firstFieldRef}
              value={type}
              onChange={(e) => setType(e.target.value as AttendanceSessionType)}
              className="w-full min-h-[48px] rounded-xl border border-gray-200 px-3 text-sm font-semibold text-[#0d1a14]"
              required
            >
              {ATTENDANCE_SESSION_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="as-title" className="block text-xs font-black uppercase tracking-wider text-gray-500 mb-1.5">
              Title
            </label>
            <input
              id="as-title"
              type="text"
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full min-h-[48px] rounded-xl border border-gray-200 px-3 text-sm font-semibold text-[#0d1a14]"
              placeholder="Sunday Worship"
              required
            />
          </div>

          <div>
            <label htmlFor="as-starts" className="block text-xs font-black uppercase tracking-wider text-gray-500 mb-1.5">
              Starts ({CHURCH_TIMEZONE})
            </label>
            <input
              id="as-starts"
              type="datetime-local"
              value={startsLocal}
              onChange={(e) => setStartsLocal(e.target.value)}
              className="w-full min-h-[48px] rounded-xl border border-gray-200 px-3 text-sm font-semibold text-[#0d1a14]"
              required
            />
          </div>

          <div>
            <label htmlFor="as-ends" className="block text-xs font-black uppercase tracking-wider text-gray-500 mb-1.5">
              Ends (optional)
            </label>
            <input
              id="as-ends"
              type="datetime-local"
              value={endsLocal}
              onChange={(e) => setEndsLocal(e.target.value)}
              className="w-full min-h-[48px] rounded-xl border border-gray-200 px-3 text-sm font-semibold text-[#0d1a14]"
            />
          </div>

          <div>
            <label htmlFor="as-tz" className="block text-xs font-black uppercase tracking-wider text-gray-500 mb-1.5">
              Timezone
            </label>
            <input
              id="as-tz"
              type="text"
              value={CHURCH_TIMEZONE}
              readOnly
              className="w-full min-h-[48px] rounded-xl border border-gray-100 bg-gray-50 px-3 text-sm font-semibold text-gray-600"
            />
          </div>

          {(type === 'event' || events.length > 0) && (
            <div>
              <label htmlFor="as-event" className="block text-xs font-black uppercase tracking-wider text-gray-500 mb-1.5">
                Event {type === 'event' ? '(required)' : '(optional)'}
              </label>
              <select
                id="as-event"
                value={eventId}
                onChange={(e) => setEventId(e.target.value)}
                className="w-full min-h-[48px] rounded-xl border border-gray-200 px-3 text-sm font-semibold text-[#0d1a14]"
                required={type === 'event'}
              >
                <option value="">{type === 'event' ? 'Select an event…' : 'No linked event'}</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {opportunities.length > 0 && (
            <div>
              <label htmlFor="as-serve" className="block text-xs font-black uppercase tracking-wider text-gray-500 mb-1.5">
                Serve opportunity (optional)
              </label>
              <select
                id="as-serve"
                value={serveOpportunityId}
                onChange={(e) => setServeOpportunityId(e.target.value)}
                className="w-full min-h-[48px] rounded-xl border border-gray-200 px-3 text-sm font-semibold text-[#0d1a14]"
              >
                <option value="">No linked Serve opportunity</option>
                {opportunities.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          {error && (
            <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
              {error}
            </p>
          )}

          <div className="flex flex-col-reverse sm:flex-row gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[48px] flex-1 rounded-xl border border-gray-200 px-4 text-sm font-black text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="min-h-[48px] flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#0d1a14] px-4 text-sm font-black text-white hover:bg-[#12231c] disabled:opacity-60"
            >
              {saving && <Loader2 size={16} className="animate-spin" aria-hidden />}
              {mode === 'create' ? 'Create Draft' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AttendanceSessionForm;
