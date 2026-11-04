/**
 * Phase 2.7B — Attendance session admin pure helpers (no I/O).
 * Session lifecycle only. No person check-in / custody / scanner side effects.
 */

export const ATTENDANCE_SESSION_MANAGER_ROLES = new Set([
  'SUPER_ADMIN',
  'ADMIN',
  'PASTOR',
  'ADMIN_STAFF',
  'SECRETARY',
  'ASST_SECRETARY',
  'FIRST_LADY',
]);

export const ATTENDANCE_SESSION_DENIED_ROLES = new Set([
  'MINISTRY_LEADER',
  'FINANCE',
  'WORSHIP_TEAM',
  'MEMBER',
  'PENDING',
  'YOUTH',
  'GUEST',
  'STAFF',
  'VOLUNTEER',
  'PARENT',
  'TEACHER',
  'MEDIA_TEAM',
  'SUNDAY_SCHOOL_TEACHER',
  'USER',
]);

export const ATTENDANCE_SESSION_TYPES = new Set([
  'worship',
  'event',
  'serve',
  'bible_study',
  'kids',
  'other',
]);

export const ATTENDANCE_SESSION_STATUSES = new Set(['draft', 'open', 'closed']);

export const DEFAULT_ATTENDANCE_TIMEZONE = 'Africa/Kampala';

export const ATTENDANCE_SESSION_TITLE_MAX = 200;

export const SESSION_SPOOF_FIELDS = [
  'status',
  'created_by',
  'createdBy',
  'opened_by',
  'openedBy',
  'closed_by',
  'closedBy',
  'opened_at',
  'openedAt',
  'closed_at',
  'closedAt',
  'visitor_count',
  'visitorCount',
  'created_at',
  'createdAt',
  'updated_at',
  'updatedAt',
  'id',
] as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AttendanceSessionErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'method_not_allowed'
  | 'invalid_action'
  | 'invalid_type'
  | 'invalid_status'
  | 'invalid_title'
  | 'invalid_timezone'
  | 'invalid_dates'
  | 'invalid_uuid'
  | 'spoof_rejected'
  | 'event_required'
  | 'event_not_found'
  | 'serve_opportunity_not_found'
  | 'session_not_found'
  | 'session_not_draft'
  | 'session_not_open'
  | 'session_already_closed'
  | 'delete_not_allowed'
  | 'attendance_session_unavailable'
  | 'attendance_session_error';

export function isAttendanceSessionManagerRole(role: unknown): boolean {
  if (role == null) return false;
  return ATTENDANCE_SESSION_MANAGER_ROLES.has(String(role).toUpperCase());
}

export function asUuid(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') return null;
  const t = value.trim();
  if (!UUID_RE.test(t)) return null;
  return t;
}

export function asTrimmedTitle(value: unknown): string | null {
  if (value == null || typeof value !== 'string') return null;
  const t = value.trim();
  if (!t) return null;
  if (t.length > ATTENDANCE_SESSION_TITLE_MAX) return null;
  if (/[<>]/.test(t)) return null;
  return t;
}

export function isValidIanaTimezone(value: unknown): value is string {
  if (value == null || typeof value !== 'string') return false;
  const t = value.trim();
  if (!t || t.length > 64) return false;
  // Reject display labels (legacy Settings string)
  if (/eastern standard time/i.test(t)) return false;
  if (/\bUTC\b/i.test(t) && t !== 'UTC') return false;
  try {
    Intl.DateTimeFormat('en-US', { timeZone: t }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function httpStatusForSessionCode(code: AttendanceSessionErrorCode): number {
  switch (code) {
    case 'unauthorized':
      return 401;
    case 'forbidden':
      return 403;
    case 'method_not_allowed':
    case 'delete_not_allowed':
      return 405;
    case 'session_not_found':
    case 'event_not_found':
    case 'serve_opportunity_not_found':
      return 404;
    case 'session_already_closed':
    case 'session_not_draft':
    case 'session_not_open':
      return 409;
    case 'attendance_session_unavailable':
      return 503;
    case 'attendance_session_error':
      return 500;
    default:
      return 400;
  }
}

export type SessionRow = {
  id: string;
  type: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  status: string;
  timezone: string;
  visitor_count: number;
  event_id: string | null;
  serve_opportunity_id: string | null;
  opened_at: string | null;
  closed_at: string | null;
  created_by?: string;
  opened_by?: string | null;
  closed_by?: string | null;
};

export type SessionDto = {
  id: string;
  type: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  status: string;
  timezone: string;
  visitorCount: number;
  eventId: string | null;
  serveOpportunityId: string | null;
  openedAt: string | null;
  closedAt: string | null;
};

export function toSessionDto(row: SessionRow): SessionDto {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    startsAt: row.starts_at,
    endsAt: row.ends_at ?? null,
    status: row.status,
    timezone: row.timezone,
    visitorCount: Number(row.visitor_count) || 0,
    eventId: row.event_id ?? null,
    serveOpportunityId: row.serve_opportunity_id ?? null,
    openedAt: row.opened_at ?? null,
    closedAt: row.closed_at ?? null,
  };
}

/** Ensure client DTO never leaks actor UUIDs. */
export function sanitizeSessionDto(dto: SessionDto): SessionDto {
  const out: SessionDto = { ...dto };
  // Strip any accidental actor fields if callers widen the type
  for (const k of [
    'createdBy',
    'openedBy',
    'closedBy',
    'created_by',
    'opened_by',
    'closed_by',
  ] as const) {
    delete (out as any)[k];
  }
  return out;
}

export function detectSpoofFields(body: Record<string, unknown> | null | undefined): string[] {
  if (!body || typeof body !== 'object') return [];
  const found: string[] = [];
  for (const key of SESSION_SPOOF_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, key) && body[key] !== undefined) {
      found.push(key);
    }
  }
  return found;
}

export function parseIsoTimestamp(value: unknown, field: string): { ok: true; value: string } | {
  ok: false;
  code: AttendanceSessionErrorCode;
  error: string;
} {
  if (value == null || value === '') {
    return { ok: false, code: 'invalid_dates', error: `${field} is required.` };
  }
  if (typeof value !== 'string') {
    return { ok: false, code: 'invalid_dates', error: `${field} must be an ISO timestamp string.` };
  }
  const t = value.trim();
  const ms = Date.parse(t);
  if (!Number.isFinite(ms)) {
    return { ok: false, code: 'invalid_dates', error: `${field} is not a valid timestamp.` };
  }
  return { ok: true, value: new Date(ms).toISOString() };
}

export function parseOptionalIsoTimestamp(
  value: unknown,
  field: string
): { ok: true; value: string | null } | { ok: false; code: AttendanceSessionErrorCode; error: string } {
  if (value == null || value === '') return { ok: true, value: null };
  return parseIsoTimestamp(value, field);
}

export type CreateSessionInput = {
  ok: true;
  type: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  timezone: string;
  eventId: string | null;
  serveOpportunityId: string | null;
};

export type ParseFail = { ok: false; code: AttendanceSessionErrorCode; error: string };

export function parseCreateSessionBody(body: unknown): CreateSessionInput | ParseFail {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, code: 'invalid_action', error: 'Request body is required.' };
  }
  const b = body as Record<string, unknown>;
  const spoof = detectSpoofFields(b);
  if (spoof.length) {
    return {
      ok: false,
      code: 'spoof_rejected',
      error: `Client may not set: ${spoof.join(', ')}.`,
    };
  }

  const typeRaw = typeof b.type === 'string' ? b.type.trim() : '';
  if (!ATTENDANCE_SESSION_TYPES.has(typeRaw)) {
    return { ok: false, code: 'invalid_type', error: 'Invalid session type.' };
  }

  const title = asTrimmedTitle(b.title);
  if (!title) {
    return {
      ok: false,
      code: 'invalid_title',
      error: `Title is required (1–${ATTENDANCE_SESSION_TITLE_MAX} chars, no HTML).`,
    };
  }

  const starts = parseIsoTimestamp(b.startsAt ?? b.starts_at, 'startsAt');
  if (!starts.ok) return starts;

  const ends = parseOptionalIsoTimestamp(b.endsAt ?? b.ends_at, 'endsAt');
  if (!ends.ok) return ends;

  if (ends.value && Date.parse(ends.value) < Date.parse(starts.value)) {
    return { ok: false, code: 'invalid_dates', error: 'endsAt must be >= startsAt.' };
  }

  const tzRaw = b.timezone ?? b.tz ?? DEFAULT_ATTENDANCE_TIMEZONE;
  const timezone =
    tzRaw == null || tzRaw === ''
      ? DEFAULT_ATTENDANCE_TIMEZONE
      : typeof tzRaw === 'string'
        ? tzRaw.trim()
        : '';
  if (!isValidIanaTimezone(timezone)) {
    return {
      ok: false,
      code: 'invalid_timezone',
      error: 'timezone must be a valid IANA name (default Africa/Kampala).',
    };
  }

  const eventId = asUuid(b.eventId ?? b.event_id);
  const serveOpportunityId = asUuid(b.serveOpportunityId ?? b.serve_opportunity_id);

  if ((b.eventId ?? b.event_id) != null && (b.eventId ?? b.event_id) !== '' && !eventId) {
    return { ok: false, code: 'invalid_uuid', error: 'eventId must be a UUID.' };
  }
  if (
    (b.serveOpportunityId ?? b.serve_opportunity_id) != null &&
    (b.serveOpportunityId ?? b.serve_opportunity_id) !== '' &&
    !serveOpportunityId
  ) {
    return { ok: false, code: 'invalid_uuid', error: 'serveOpportunityId must be a UUID.' };
  }

  if (typeRaw === 'event' && !eventId) {
    return { ok: false, code: 'event_required', error: 'type=event requires eventId.' };
  }

  return {
    ok: true,
    type: typeRaw,
    title,
    startsAt: starts.value,
    endsAt: ends.value,
    timezone,
    eventId,
    serveOpportunityId,
  };
}

export type UpdateDraftInput = {
  ok: true;
  action: 'update';
  sessionId: string;
  title?: string;
  type?: string;
  startsAt?: string;
  endsAt?: string | null;
  timezone?: string;
  eventId?: string | null;
  serveOpportunityId?: string | null;
  clearEndsAt?: boolean;
};

export function parsePatchBody(body: unknown):
  | { ok: true; action: 'open' | 'close'; sessionId: string }
  | { ok: true; action: 'test_reset' }
  | UpdateDraftInput
  | ParseFail {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, code: 'invalid_action', error: 'Request body is required.' };
  }
  const b = body as Record<string, unknown>;
  const action = typeof b.action === 'string' ? b.action.trim().toLowerCase() : '';

  // Super Admin bulk purge — no sessionId
  if (action === 'test_reset') {
    const spoof = detectSpoofFields(b);
    const spoofFiltered = spoof.filter((k) => k !== 'id');
    if (spoofFiltered.length) {
      return {
        ok: false,
        code: 'spoof_rejected',
        error: `Client may not set: ${spoofFiltered.join(', ')}.`,
      };
    }
    return { ok: true, action: 'test_reset' };
  }

  const sessionId = asUuid(b.sessionId ?? b.session_id ?? b.id);
  if (!sessionId) {
    return { ok: false, code: 'invalid_uuid', error: 'sessionId is required.' };
  }

  if (action === 'open' || action === 'close') {
    const spoof = detectSpoofFields(b);
    // open/close may include sessionId; allow action + sessionId only — spoof list includes id
    const spoofFiltered = spoof.filter((k) => k !== 'id');
    if (spoofFiltered.length) {
      return {
        ok: false,
        code: 'spoof_rejected',
        error: `Client may not set: ${spoofFiltered.join(', ')}.`,
      };
    }
    return { ok: true, action, sessionId };
  }

  if (action === 'update' || action === 'edit' || action === '') {
    // Draft metadata update — reject lifecycle spoof fields
    const spoof = detectSpoofFields(b);
    const spoofFiltered = spoof.filter((k) => k !== 'id');
    if (spoofFiltered.length) {
      return {
        ok: false,
        code: 'spoof_rejected',
        error: `Client may not set: ${spoofFiltered.join(', ')}.`,
      };
    }

    const out: UpdateDraftInput = { ok: true, action: 'update', sessionId };

    if (b.title !== undefined) {
      const title = asTrimmedTitle(b.title);
      if (!title) {
        return {
          ok: false,
          code: 'invalid_title',
          error: `Title is required (1–${ATTENDANCE_SESSION_TITLE_MAX} chars, no HTML).`,
        };
      }
      out.title = title;
    }

    if (b.type !== undefined) {
      const typeRaw = typeof b.type === 'string' ? b.type.trim() : '';
      if (!ATTENDANCE_SESSION_TYPES.has(typeRaw)) {
        return { ok: false, code: 'invalid_type', error: 'Invalid session type.' };
      }
      out.type = typeRaw;
    }

    if (b.startsAt !== undefined || b.starts_at !== undefined) {
      const starts = parseIsoTimestamp(b.startsAt ?? b.starts_at, 'startsAt');
      if (!starts.ok) return starts;
      out.startsAt = starts.value;
    }

    if (Object.prototype.hasOwnProperty.call(b, 'endsAt') || Object.prototype.hasOwnProperty.call(b, 'ends_at')) {
      const ends = parseOptionalIsoTimestamp(b.endsAt ?? b.ends_at, 'endsAt');
      if (!ends.ok) return ends;
      out.endsAt = ends.value;
      if (ends.value === null) out.clearEndsAt = true;
    }

    if (b.timezone !== undefined) {
      const timezone = typeof b.timezone === 'string' ? b.timezone.trim() : '';
      if (!isValidIanaTimezone(timezone)) {
        return {
          ok: false,
          code: 'invalid_timezone',
          error: 'timezone must be a valid IANA name (default Africa/Kampala).',
        };
      }
      out.timezone = timezone;
    }

    if (Object.prototype.hasOwnProperty.call(b, 'eventId') || Object.prototype.hasOwnProperty.call(b, 'event_id')) {
      const raw = b.eventId ?? b.event_id;
      if (raw == null || raw === '') {
        out.eventId = null;
      } else {
        const eventId = asUuid(raw);
        if (!eventId) return { ok: false, code: 'invalid_uuid', error: 'eventId must be a UUID.' };
        out.eventId = eventId;
      }
    }

    if (
      Object.prototype.hasOwnProperty.call(b, 'serveOpportunityId') ||
      Object.prototype.hasOwnProperty.call(b, 'serve_opportunity_id')
    ) {
      const raw = b.serveOpportunityId ?? b.serve_opportunity_id;
      if (raw == null || raw === '') {
        out.serveOpportunityId = null;
      } else {
        const serveOpportunityId = asUuid(raw);
        if (!serveOpportunityId) {
          return { ok: false, code: 'invalid_uuid', error: 'serveOpportunityId must be a UUID.' };
        }
        out.serveOpportunityId = serveOpportunityId;
      }
    }

    const hasMeta =
      out.title !== undefined ||
      out.type !== undefined ||
      out.startsAt !== undefined ||
      out.endsAt !== undefined ||
      out.clearEndsAt ||
      out.timezone !== undefined ||
      out.eventId !== undefined ||
      out.serveOpportunityId !== undefined;

    if (!hasMeta && action !== 'update' && action !== 'edit') {
      return { ok: false, code: 'invalid_action', error: 'Unknown or missing action.' };
    }
    if (!hasMeta) {
      return { ok: false, code: 'invalid_action', error: 'No draft fields to update.' };
    }

    return out;
  }

  return { ok: false, code: 'invalid_action', error: 'Unknown action.' };
}

export function validateDraftDatePair(
  startsAt: string,
  endsAt: string | null | undefined
): ParseFail | null {
  if (endsAt && Date.parse(endsAt) < Date.parse(startsAt)) {
    return { ok: false, code: 'invalid_dates', error: 'endsAt must be >= startsAt.' };
  }
  return null;
}
