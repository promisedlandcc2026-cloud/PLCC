/**
 * Shared route decisions for the API security audit.
 * Handlers call these so a smoke test can assert 401/403 without a live database.
 */

export const STAFF_WRITE_ROLES = new Set([
  'SUPER_ADMIN',
  'ADMIN',
  'ADMIN_STAFF',
  'PASTOR',
  'FIRST_LADY',
  'SECRETARY',
  'ASST_SECRETARY',
  'STAFF',
  'MINISTRY_LEADER',
]);

export const SECURITY_LOG_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'PASTOR']);

const DENIED = new Set(['PENDING', 'GUEST', 'KIOSK', '']);

export type RouteDecision = 'ok' | 'unauthorized' | 'forbidden';

/** Unsigned callers are unauthorized. Members may GET forms only. Everything else needs staff. */
export function toolsRouteDecision(
  role: string | null | undefined,
  effectiveType: string,
  method: string
): RouteDecision {
  if (role == null) return 'unauthorized';
  const r = String(role).toUpperCase();
  if (DENIED.has(r)) return 'forbidden';
  const staff = STAFF_WRITE_ROLES.has(r);
  const memberRead = effectiveType === 'forms' && String(method).toUpperCase() === 'GET';
  if (!staff && !memberRead) return 'forbidden';
  if (effectiveType === 'security_logs' && !SECURITY_LOG_ROLES.has(r)) return 'forbidden';
  return 'ok';
}

/** Events dashboard counts are staff-only. */
export function eventsStatsDecision(role: string | null | undefined): RouteDecision {
  if (role == null) return 'unauthorized';
  return STAFF_WRITE_ROLES.has(String(role).toUpperCase()) ? 'ok' : 'forbidden';
}

/** A kiosk may look up one card. It may not list open children. */
export function kioskMayListOpenChildren(role: string | null | undefined, listRequested: boolean): boolean {
  if (!listRequested) return true;
  return String(role || '').toUpperCase() !== 'KIOSK';
}

export function pickColumns(body: any, allowed: readonly string[]): Record<string, any> {
  const out: Record<string, any> = {};
  if (!body || typeof body !== 'object' || Array.isArray(body)) return out;
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(body, key)) out[key] = body[key];
  }
  return out;
}

export const RUN_OF_SHOW_COLUMNS = [
  'event_id', 'title', 'description', 'sort_order', 'duration_minutes', 'owner', 'notes', 'start_time', 'item_type',
] as const;

export const EVENT_TEMPLATE_COLUMNS = ['name', 'description', 'type', 'template', 'category'] as const;

export const GALLERY_COLUMNS = ['title', 'type', 'url', 'thumbnail', 'description', 'category'] as const;

export const VOICE_COLUMNS = [
  'title', 'excerpt', 'content', 'author', 'author_image_url', 'category', 'image_url', 'status',
] as const;

export const SERMON_COLUMNS = ['title', 'scripture', 'book', 'version', 'speaker', 'date', 'outline', 'body'] as const;

export const INSPIRATION_COLUMNS = ['text', 'reference', 'publish_date'] as const;

export const FOLLOW_UP_COLUMNS = [
  'member_id', 'assigned_to_id', 'due_date', 'status', 'notes', 'type', 'priority', 'title',
] as const;

export const TAG_COLUMNS = ['name', 'color', 'description'] as const;

export const MINISTRY_COLUMNS = ['name', 'description'] as const;

export const TEAM_COLUMNS = ['name', 'description', 'color', 'icon_name'] as const;

export const HOUSEHOLD_COLUMNS = ['name', 'address', 'phone', 'bio', 'head_member_id'] as const;

export const CONNECT_CARD_COLUMNS = ['status', 'notes', 'assigned_to'] as const;

export const VISIT_COLUMNS = ['status', 'notes'] as const;

export const MEMBER_WRITE_COLUMNS = [
  'first_name', 'last_name', 'email', 'phone', 'status', 'household_name', 'household_id',
  'birthday', 'avatar_url', 'joined_date', 'ministries', 'children',
] as const;

export const GIVING_TX_COLUMNS = ['amount', 'transaction_date', 'notes', 'fund_id', 'source', 'member_id'] as const;

export const FOLLOWUP_TEMPLATE_COLUMNS = ['name', 'type', 'subject', 'content'] as const;

export const FOLLOWUP_WORKFLOW_COLUMNS = ['name', 'description'] as const;

export const PLEDGE_COLUMNS = [
  'amount', 'status', 'notes', 'start_date', 'end_date', 'frequency', 'fund_id', 'member_id',
] as const;

/**
 * ACCOUNTANT role: Fundraisers only. Everything else in the Vault API is refused, except what
 * signing in and the app shell need (own profile, own notifications, theme, sign-in).
 */
export function accountantRouteDecision(
  role: string | null | undefined,
  ctx: {
    resource: string;
    subResource?: string;
    method: string;
    selfQuery?: boolean;
    bodyId?: string;
    userId?: string;
    scope?: string;
  }
): RouteDecision {
  if (String(role || '').toUpperCase() !== 'ACCOUNTANT') return 'ok';
  const resource = String(ctx.resource || '').toLowerCase();
  const method = String(ctx.method || 'GET').toUpperCase();
  if (resource === 'fundraisers') return 'ok';
  if (resource === 'auth' || resource === 'auth-otp' || resource === 'auth-phone' || resource === 'auth-phone-code') return 'ok';
  if (resource === 'notifications') return 'ok';
  if (resource === 'users') {
    if (method === 'GET' && ctx.selfQuery && !ctx.subResource) return 'ok';
    // Own profile updates (onboarding, notice acknowledgement) — never someone else's
    if ((method === 'PATCH' || method === 'PUT') && !ctx.subResource && (!ctx.bodyId || ctx.bodyId === ctx.userId)) return 'ok';
    return 'forbidden';
  }
  if (resource === 'settings' && method === 'GET' && ctx.scope === 'system') return 'ok'; // seasonal theme
  return 'forbidden';
}

/** Church-wide settings (Church Profile, Preferences, Integrations) — church leaders only. */
export const CHURCH_SETTINGS_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'PASTOR', 'FIRST_LADY']);

/**
 * Saving settings. Notifications are each person's own; events check-in settings are
 * open to staff; everything church-wide needs a church leader. Reading is unchanged.
 */
export function settingsWriteDecision(role: string | null | undefined, scope: string): RouteDecision {
  if (role == null) return 'unauthorized';
  const r = String(role).toUpperCase();
  if (DENIED.has(r)) return 'forbidden';
  const s = String(scope || 'system');
  if (s === 'notifications') return 'ok';
  if (s === 'events') return STAFF_WRITE_ROLES.has(r) ? 'ok' : 'forbidden';
  return CHURCH_SETTINGS_ROLES.has(r) ? 'ok' : 'forbidden';
}

/** Church Profile fields the Church Profile page may save — never integrations or other settings columns. */
export const ORG_PROFILE_COLUMNS = [
  'name',
  'address',
  'address_line1',
  'city',
  'state',
  'zip',
  'phone',
  'website',
  'logo_url',
  'primary_contact_id',
] as const;

/** organization_settings row as returned to the Church Profile page: integration secrets removed. */
export function publicOrgRow(row: Record<string, any> | null | undefined): Record<string, any> {
  if (!row) return {};
  const { integrations: _integrations, ...rest } = row;
  return rest;
}
