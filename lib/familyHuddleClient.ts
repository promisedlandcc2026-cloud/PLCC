import { fetchWithTimeout, getAuthHeaders } from './api';
import {
  FamilyHuddleError,
  type FamilyHuddleErrorCode,
  type FamilyHuddleInvite,
  type FamilyHuddleJoinToken,
  type FamilyHuddleStatus,
  type FamilyHuddleSummary,
} from './familyHuddleTypes';

const FAMILY_API = '/api/vault?resource=family&subResource=huddle';

function familyUrl(action: string): string {
  return `${FAMILY_API}&huddleType=${encodeURIComponent(action)}`;
}

function mapStatus(
  status: number,
  bodyCode?: string
): { code: FamilyHuddleErrorCode; message: string } {
  if (status === 401) {
    return { code: 'unauthorized', message: 'Please sign in again to continue.' };
  }
  if (status === 403) {
    if (bodyCode === 'not_adult') {
      return {
        code: 'not_adult',
        message: 'Family Huddle is for household adults only in this version.',
      };
    }
    if (bodyCode === 'unlinked') {
      return {
        code: 'unlinked',
        message: 'Link your member profile before starting a Family Huddle.',
      };
    }
    if (bodyCode === 'conflict') {
      return {
        code: 'conflict',
        message: 'Multiple households are linked. Contact the church office first.',
      };
    }
    if (bodyCode === 'empty') {
      return {
        code: 'empty',
        message: 'No household is on file for Family Huddle yet.',
      };
    }
    if (bodyCode === 'invite_locked') {
      return {
        code: 'invite_locked',
        message: 'This Family Huddle is locked to new guests.',
      };
    }
    if (bodyCode === 'invite_exhausted') {
      return {
        code: 'invite_exhausted',
        message: 'This invite link has reached its guest limit.',
      };
    }
    return {
      code: 'forbidden',
      message: 'Family Huddle is not available for your account.',
    };
  }
  if (status === 404) {
    return { code: 'not_found', message: 'That invite could not be found.' };
  }
  if (status === 410) {
    return {
      code: 'invite_expired',
      message: 'This invite link has expired.',
    };
  }
  if (status === 429) {
    return {
      code: 'rate_limited',
      message: 'Too many requests. Please wait a moment.',
    };
  }
  if (status === 503) {
    return {
      code: 'huddle_unavailable',
      message: 'Family Huddle is not configured yet.',
    };
  }
  return {
    code: 'network',
    message: 'Family Huddle is temporarily unavailable. Please try again.',
  };
}

async function readErrorMeta(
  res: Response
): Promise<{ code?: string; message?: string }> {
  try {
    const body = (await res.clone().json()) as {
      code?: string;
      message?: string;
      error?: string;
    };
    return {
      code: typeof body.code === 'string' ? body.code : undefined,
      message:
        typeof body.message === 'string'
          ? body.message
          : typeof body.error === 'string'
            ? body.error
            : undefined,
    };
  } catch {
    return {};
  }
}

async function throwIfNotOk(res: Response): Promise<void> {
  if (res.ok) return;
  const meta = await readErrorMeta(res);
  const mapped = mapStatus(res.status, meta.code);
  throw new FamilyHuddleError(mapped.code, meta.message || mapped.message, res.status);
}

async function authedFetch(action: string, init?: RequestInit): Promise<Response> {
  const headers = await getAuthHeaders(init?.headers as HeadersInit | undefined);
  try {
    return await fetchWithTimeout(
      familyUrl(action),
      { ...init, headers },
      20_000
    );
  } catch {
    throw new FamilyHuddleError(
      'network',
      'Family Huddle is temporarily unavailable. Please try again.'
    );
  }
}

function parseJoinToken(
  body: Partial<FamilyHuddleJoinToken>,
  fallbackName: string
): FamilyHuddleJoinToken {
  if (!body.token || !body.url || !body.roomName) {
    throw new FamilyHuddleError(
      'huddle_unavailable',
      'Family Huddle token was incomplete.',
      502
    );
  }
  return {
    token: body.token,
    url: body.url,
    roomName: body.roomName,
    expiresIn: typeof body.expiresIn === 'number' ? body.expiresIn : 0,
    canModerate: Boolean(body.canModerate),
    isGuest: Boolean(body.isGuest),
    displayName: typeof body.displayName === 'string' ? body.displayName : fallbackName,
    householdName: typeof body.householdName === 'string' ? body.householdName : null,
  };
}

export async function fetchFamilyHuddleSummary(): Promise<FamilyHuddleSummary> {
  const res = await authedFetch('summary', { method: 'GET' });
  await throwIfNotOk(res);
  const body = (await res.json()) as { summary?: FamilyHuddleSummary };
  const summary = body.summary;
  if (!summary?.self?.displayName) {
    throw new FamilyHuddleError('network', 'Could not load your family.', 502);
  }
  return normalizeFamilySummary(summary);
}

function normalizeFamilySummary(summary: FamilyHuddleSummary): FamilyHuddleSummary {
  const people = (rows: FamilyHuddleSummary['adults']) =>
    (Array.isArray(rows) ? rows : [])
      .map((person) => ({
        membershipId: String(person?.membershipId || '').trim(),
        displayName: String(person?.displayName || 'Family member'),
        relationship: person?.relationship ? String(person.relationship) : null,
        duplicate: Boolean(person?.duplicate),
      }))
      .filter((person) => person.membershipId && person.displayName);
  return {
    householdName: summary.householdName || null,
    self: { displayName: String(summary.self.displayName) },
    adults: people(summary.adults),
    dependents: people(summary.dependents),
  };
}

export async function addFamilyMember(input: {
  fullName: string;
  relationship: 'spouse' | 'other';
}): Promise<FamilyHuddleSummary> {
  const res = await authedFetch('add-member', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  await throwIfNotOk(res);
  const body = (await res.json()) as { summary?: FamilyHuddleSummary };
  if (!body.summary?.self?.displayName) {
    throw new FamilyHuddleError('network', 'Could not add that family member.', 502);
  }
  return normalizeFamilySummary(body.summary);
}

export async function removeFamilyMember(membershipId: string): Promise<FamilyHuddleSummary> {
  const res = await authedFetch('remove-member', {
    method: 'POST',
    body: JSON.stringify({ membershipId }),
  });
  await throwIfNotOk(res);
  const body = (await res.json()) as { summary?: FamilyHuddleSummary };
  if (!body.summary?.self?.displayName) {
    throw new FamilyHuddleError('network', 'Could not remove that family member.', 502);
  }
  return normalizeFamilySummary(body.summary);
}

export async function fetchFamilyHuddleStatus(): Promise<FamilyHuddleStatus> {
  const res = await authedFetch('status', { method: 'GET' });
  await throwIfNotOk(res);
  const body = (await res.json()) as Partial<FamilyHuddleStatus>;
  return {
    configured: Boolean(body.configured !== false),
    live: Boolean(body.live),
    participantCount: typeof body.participantCount === 'number' ? body.participantCount : 0,
    householdName: typeof body.householdName === 'string' ? body.householdName : null,
  };
}

export async function fetchFamilyHuddleToken(): Promise<FamilyHuddleJoinToken> {
  const res = await authedFetch('token', {
    method: 'POST',
    body: '{}',
  });
  await throwIfNotOk(res);
  return parseJoinToken((await res.json()) as Partial<FamilyHuddleJoinToken>, 'Family');
}

export async function endFamilyHuddle(): Promise<void> {
  const res = await authedFetch('end', { method: 'POST', body: '{}' });
  await throwIfNotOk(res);
}

export async function createFamilyHuddleInvite(): Promise<FamilyHuddleInvite> {
  const res = await authedFetch('invite-create', { method: 'POST', body: '{}' });
  await throwIfNotOk(res);
  const body = (await res.json()) as Partial<FamilyHuddleInvite>;
  if (!body.code || !body.path) {
    throw new FamilyHuddleError('huddle_unavailable', 'Invite was incomplete.', 502);
  }
  return {
    code: body.code,
    path: body.path,
    expiresAt: typeof body.expiresAt === 'string' ? body.expiresAt : null,
    maxUses: typeof body.maxUses === 'number' ? body.maxUses : 10,
    householdName: typeof body.householdName === 'string' ? body.householdName : null,
  };
}

export async function lockFamilyHuddleInvites(): Promise<void> {
  const res = await authedFetch('invite-lock', { method: 'POST', body: '{}' });
  await throwIfNotOk(res);
}

/** Public guest redeem — no church account / Bearer. */
export async function redeemFamilyHuddleInvite(
  code: string,
  displayName: string
): Promise<FamilyHuddleJoinToken> {
  let res: Response;
  try {
    res = await fetchWithTimeout(
      familyUrl('invite-redeem'),
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token: code, displayName }),
      },
      20_000
    );
  } catch {
    throw new FamilyHuddleError(
      'network',
      'Family Huddle is temporarily unavailable. Please try again.'
    );
  }
  await throwIfNotOk(res);
  return parseJoinToken((await res.json()) as Partial<FamilyHuddleJoinToken>, displayName);
}

export function familyInviteAbsoluteUrl(path: string): string {
  if (typeof window === 'undefined') return path;
  const origin = window.location.origin.replace(/\/+$/, '');
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith('/#')) return `${origin}${path}`;
  if (path.startsWith('#')) return `${origin}/${path}`;
  const clean = path.startsWith('/') ? path : `/${path}`;
  return `${origin}/#${clean}`;
}

export function inviteExpiryLabel(expiresAt: string | null): string {
  if (!expiresAt) return 'Expires in 2 hours';
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return 'Expired';
  const mins = Math.max(1, Math.round(ms / 60000));
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `Expires in ${h}h ${m}m` : `Expires in ${h}h`;
  }
  return `Expires in ${mins}m`;
}

export function whatsappInviteHref(url: string, expiresAt: string | null): string {
  const text = `Join our Family Huddle on PLCC Canaan (${inviteExpiryLabel(expiresAt)})\n${url}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
