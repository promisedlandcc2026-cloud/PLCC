/**
 * Vault Serve Admin — pure helpers (no I/O).
 * Role set mirrors event.edit + FIRST_LADY (broad staff authority).
 */

export const SERVE_ADMIN_ROLES = new Set([
  'SUPER_ADMIN',
  'ADMIN',
  'PASTOR',
  'ADMIN_STAFF',
  'SECRETARY',
  'ASST_SECRETARY',
  'FIRST_LADY',
  'FINANCE',
  'MINISTRY_LEADER',
  'WORSHIP_TEAM',
]);

export const SERVE_SIGNUP_ACTIVE = new Set(['pending', 'confirmed']);
export const SERVE_SIGNUP_STATUSES = new Set([
  'pending',
  'confirmed',
  'cancelled',
  'declined',
]);
export const SERVE_OPP_STATUSES = new Set(['open', 'cancelled', 'completed']);

export function isServeAdminRole(role: unknown): boolean {
  if (role == null) return false;
  return SERVE_ADMIN_ROLES.has(String(role).toUpperCase());
}

export function remainingSlots(
  capacity: number | null | undefined,
  activeCount: number
): number | null {
  if (capacity == null || !Number.isFinite(capacity)) return null;
  return Math.max(0, Number(capacity) - activeCount);
}

/**
 * Aggregate active (pending|confirmed) signup counts keyed by opportunity_id.
 * member_id is intentionally ignored (self-signups use NULL).
 */
export function aggregateActiveSignupCounts(
  signups: Array<{ opportunity_id: string; status: string; member_id?: string | null }>
): Map<string, number> {
  const active = new Map<string, number>();
  for (const s of signups || []) {
    if (!SERVE_SIGNUP_ACTIVE.has(s.status)) continue;
    const oppId = s.opportunity_id;
    if (!oppId) continue;
    active.set(oppId, (active.get(oppId) || 0) + 1);
  }
  return active;
}

export type ServeCreateInput = {
  title?: unknown;
  description?: unknown;
  role_label?: unknown;
  location?: unknown;
  event_id?: unknown;
  team_id?: unknown;
  ministry_id?: unknown;
  starts_at?: unknown;
  ends_at?: unknown;
  capacity?: unknown;
  requires_approval?: unknown;
  status?: unknown;
};

export type ServeCreateOk = {
  ok: true;
  row: {
    title: string;
    description: string | null;
    role_label: string | null;
    location: string | null;
    event_id: string | null;
    team_id: string | null;
    ministry_id: string | null;
    starts_at: string | null;
    ends_at: string | null;
    capacity: number | null;
    requires_approval: boolean;
    status: 'open';
    created_by: string;
  };
};

export type ServeCreateErr = { ok: false; error: string; code: string };

function asOptionalUuid(v: unknown): string | null | { error: string } {
  if (v == null || v === '') return null;
  if (typeof v !== 'string') return { error: 'invalid_uuid' };
  const t = v.trim();
  if (!t) return null;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      t
    )
  ) {
    return { error: 'invalid_uuid' };
  }
  return t;
}

function asOptionalIso(v: unknown): string | null | { error: string } {
  if (v == null || v === '') return null;
  if (typeof v !== 'string') return { error: 'invalid_timestamp' };
  const t = v.trim();
  if (!t) return null;
  const d = Date.parse(t);
  if (!Number.isFinite(d)) return { error: 'invalid_timestamp' };
  return new Date(d).toISOString();
}

function asOptionalCapacity(v: unknown): number | null | { error: string } {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isInteger(n) || n <= 0) return { error: 'capacity_must_be_positive' };
  return n;
}

export function validateServeCreate(
  body: ServeCreateInput,
  createdBy: string
): ServeCreateOk | ServeCreateErr {
  if (body.status != null && body.status !== '' && body.status !== 'open') {
    return { ok: false, error: 'Client cannot set status on create', code: 'status_not_allowed' };
  }
  const title =
    typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) {
    return { ok: false, error: 'Title is required', code: 'title_required' };
  }

  const capacity = asOptionalCapacity(body.capacity);
  if (capacity && typeof capacity === 'object' && 'error' in capacity) {
    return { ok: false, error: 'Capacity must be a positive integer', code: capacity.error };
  }

  const starts_at = asOptionalIso(body.starts_at);
  if (starts_at && typeof starts_at === 'object' && 'error' in starts_at) {
    return { ok: false, error: 'Invalid starts_at', code: starts_at.error };
  }
  const ends_at = asOptionalIso(body.ends_at);
  if (ends_at && typeof ends_at === 'object' && 'error' in ends_at) {
    return { ok: false, error: 'Invalid ends_at', code: ends_at.error };
  }
  if (
    typeof starts_at === 'string' &&
    typeof ends_at === 'string' &&
    ends_at < starts_at
  ) {
    return { ok: false, error: 'ends_at must be >= starts_at', code: 'invalid_time_range' };
  }

  const event_id = asOptionalUuid(body.event_id);
  if (event_id && typeof event_id === 'object') {
    return { ok: false, error: 'Invalid event_id', code: event_id.error };
  }
  const team_id = asOptionalUuid(body.team_id);
  if (team_id && typeof team_id === 'object') {
    return { ok: false, error: 'Invalid team_id', code: team_id.error };
  }
  const ministry_id = asOptionalUuid(body.ministry_id);
  if (ministry_id && typeof ministry_id === 'object') {
    return { ok: false, error: 'Invalid ministry_id', code: ministry_id.error };
  }

  return {
    ok: true,
    row: {
      title,
      description:
        typeof body.description === 'string' && body.description.trim()
          ? body.description.trim()
          : null,
      role_label:
        typeof body.role_label === 'string' && body.role_label.trim()
          ? body.role_label.trim()
          : null,
      location:
        typeof body.location === 'string' && body.location.trim()
          ? body.location.trim()
          : null,
      event_id: event_id as string | null,
      team_id: team_id as string | null,
      ministry_id: ministry_id as string | null,
      starts_at: starts_at as string | null,
      ends_at: ends_at as string | null,
      capacity: capacity as number | null,
      requires_approval: body.requires_approval === true,
      status: 'open',
      created_by: createdBy,
    },
  };
}

export type ServeUpdateInput = ServeCreateInput & { id?: unknown };

export function validateServeUpdate(
  body: ServeUpdateInput,
  activeSignupCount: number
):
  | { ok: true; id: string; patch: Record<string, unknown> }
  | ServeCreateErr {
  const id = asOptionalUuid(body.id);
  if (!id || typeof id === 'object') {
    return { ok: false, error: 'Valid id is required', code: 'id_required' };
  }
  if (body.status != null && body.status !== '') {
    return {
      ok: false,
      error: 'Use action cancel/complete for status changes',
      code: 'status_via_action',
    };
  }

  const patch: Record<string, unknown> = {};
  if (body.title !== undefined) {
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) return { ok: false, error: 'Title is required', code: 'title_required' };
    patch.title = title;
  }
  if (body.description !== undefined) {
    patch.description =
      typeof body.description === 'string' && body.description.trim()
        ? body.description.trim()
        : null;
  }
  if (body.role_label !== undefined) {
    patch.role_label =
      typeof body.role_label === 'string' && body.role_label.trim()
        ? body.role_label.trim()
        : null;
  }
  if (body.location !== undefined) {
    patch.location =
      typeof body.location === 'string' && body.location.trim()
        ? body.location.trim()
        : null;
  }
  if (body.capacity !== undefined) {
    const capacity = asOptionalCapacity(body.capacity);
    if (capacity && typeof capacity === 'object' && 'error' in capacity) {
      return { ok: false, error: 'Capacity must be a positive integer', code: capacity.error };
    }
    if (typeof capacity === 'number' && capacity < activeSignupCount) {
      return {
        ok: false,
        error: `Capacity cannot be below active signups (${activeSignupCount})`,
        code: 'capacity_below_active',
      };
    }
    patch.capacity = capacity;
  }
  if (body.requires_approval !== undefined) {
    patch.requires_approval = body.requires_approval === true;
  }
  if (body.starts_at !== undefined) {
    const starts_at = asOptionalIso(body.starts_at);
    if (starts_at && typeof starts_at === 'object') {
      return { ok: false, error: 'Invalid starts_at', code: starts_at.error };
    }
    patch.starts_at = starts_at;
  }
  if (body.ends_at !== undefined) {
    const ends_at = asOptionalIso(body.ends_at);
    if (ends_at && typeof ends_at === 'object') {
      return { ok: false, error: 'Invalid ends_at', code: ends_at.error };
    }
    patch.ends_at = ends_at;
  }
  const start = (patch.starts_at as string | null | undefined) ?? undefined;
  const end = (patch.ends_at as string | null | undefined) ?? undefined;
  // Only validate when both present in patch; caller may also pass existing for cross-field — skip if incomplete
  if (typeof patch.starts_at === 'string' && typeof patch.ends_at === 'string' && patch.ends_at < patch.starts_at) {
    return { ok: false, error: 'ends_at must be >= starts_at', code: 'invalid_time_range' };
  }
  void start;
  void end;

  for (const key of ['event_id', 'team_id', 'ministry_id'] as const) {
    if (body[key] !== undefined) {
      const v = asOptionalUuid(body[key]);
      if (v && typeof v === 'object') {
        return { ok: false, error: `Invalid ${key}`, code: v.error };
      }
      patch[key] = v;
    }
  }

  if (Object.keys(patch).length === 0) {
    return { ok: false, error: 'No updatable fields provided', code: 'empty_patch' };
  }

  patch.updated_at = new Date().toISOString();
  return { ok: true, id, patch };
}

export function resolveOpportunityStatusAction(
  current: string,
  action: string
):
  | { ok: true; next: 'cancelled' | 'completed'; idempotent?: boolean }
  | ServeCreateErr {
  const a = String(action || '').toLowerCase();
  if (a === 'cancel') {
    if (current === 'cancelled') return { ok: true, next: 'cancelled', idempotent: true };
    if (current !== 'open') {
      return { ok: false, error: 'Only open opportunities can be cancelled', code: 'invalid_transition' };
    }
    return { ok: true, next: 'cancelled' };
  }
  if (a === 'complete') {
    if (current === 'completed') return { ok: true, next: 'completed', idempotent: true };
    if (current !== 'open') {
      return { ok: false, error: 'Only open opportunities can be completed', code: 'invalid_transition' };
    }
    return { ok: true, next: 'completed' };
  }
  return { ok: false, error: 'Unknown action', code: 'unknown_action' };
}

export function resolveSignupAdminAction(
  current: string,
  action: string
):
  | { ok: true; next: 'confirmed' | 'declined'; idempotent?: boolean }
  | ServeCreateErr {
  const a = String(action || '').toLowerCase();
  if (a === 'approve') {
    if (current === 'confirmed') return { ok: true, next: 'confirmed', idempotent: true };
    if (current !== 'pending') {
      return { ok: false, error: 'Only pending signups can be approved', code: 'not_pending' };
    }
    return { ok: true, next: 'confirmed' };
  }
  if (a === 'decline') {
    if (current === 'declined') return { ok: true, next: 'declined', idempotent: true };
    if (current !== 'pending') {
      return { ok: false, error: 'Only pending signups can be declined', code: 'not_pending' };
    }
    return { ok: true, next: 'declined' };
  }
  return { ok: false, error: 'Unknown action', code: 'unknown_action' };
}

export function filterOpportunityList(
  rows: Array<{ status: string; starts_at?: string | null }>,
  filter: string | undefined,
  nowIso = new Date().toISOString()
) {
  const f = String(filter || 'all').toLowerCase();
  if (f === 'all') return rows;
  if (f === 'open') return rows.filter((r) => r.status === 'open');
  if (f === 'completed') return rows.filter((r) => r.status === 'completed');
  if (f === 'cancelled') return rows.filter((r) => r.status === 'cancelled');
  if (f === 'upcoming') {
    return rows.filter(
      (r) => r.status === 'open' && (!r.starts_at || r.starts_at >= nowIso)
    );
  }
  return rows;
}

/** Approve does not consume an extra slot — pending already counted. */
export function approvalConsumesExtraSlot(): boolean {
  return false;
}

/** Decline releases an active slot (pending was active). */
export function declineReleasesActiveSlot(): boolean {
  return true;
}

/**
 * Staff "Add volunteer": may this person be put on this opportunity's roster?
 * Same rules members face — open opportunity, staff-verified eligibility, a free spot —
 * except that staff-added sign-ups are confirmed straight away.
 */
export function decideStaffAddVolunteer(input: {
  opportunityStatus: string | null | undefined;
  capacity: number | null | undefined;
  activeCount: number;
  eligibilityStatus: string | null | undefined;
  existingStatus: string | null | undefined;
}):
  | { ok: true; mode: 'insert' | 'revive' }
  | { ok: false; status: number; code: string; error: string } {
  if (String(input.opportunityStatus || 'open') !== 'open') {
    return { ok: false, status: 400, code: 'not_open', error: 'This opportunity is not open.' };
  }
  if (input.existingStatus === 'pending' || input.existingStatus === 'confirmed') {
    return { ok: false, status: 409, code: 'already_signed_up', error: 'They are already on this roster.' };
  }
  if (input.eligibilityStatus !== 'eligible') {
    return {
      ok: false,
      status: 400,
      code: 'not_eligible',
      error:
        input.eligibilityStatus === 'ineligible' || input.eligibilityStatus === 'suspended'
          ? 'This person is not eligible to serve.'
          : 'Mark this person Eligible first (People → Members → Serve eligibility).',
    };
  }
  const cap = Number(input.capacity);
  if (Number.isFinite(cap) && cap > 0 && input.activeCount >= cap) {
    return { ok: false, status: 409, code: 'full', error: 'All spots are filled.' };
  }
  return { ok: true, mode: input.existingStatus ? 'revive' : 'insert' };
}
