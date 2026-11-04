/**
 * Live Huddle session host / co-host helpers (pure).
 * Roles live in LiveKit room metadata for the active huddle only — not chat_room_members.
 */

export const HUDDLE_ROOM_ROLES_VERSION = 1 as const;

export type HuddleRoomRoles = {
  v: typeof HUDDLE_ROOM_ROLES_VERSION;
  hostId: string | null;
  coHostIds: string[];
};

export type HuddleModAction = 'claim' | 'add' | 'pass';

export function emptyHuddleRoomRoles(): HuddleRoomRoles {
  return { v: HUDDLE_ROOM_ROLES_VERSION, hostId: null, coHostIds: [] };
}

/** Parse LiveKit room.metadata JSON into session host/co-host roles. */
export function parseHuddleRoomRoles(raw: string | null | undefined): HuddleRoomRoles {
  const empty = emptyHuddleRoomRoles();
  if (!raw || !String(raw).trim()) return empty;
  try {
    const parsed = JSON.parse(String(raw));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return empty;
    const hostId = String(parsed.hostId || '').trim() || null;
    const rawIds = Array.isArray(parsed.coHostIds) ? parsed.coHostIds : [];
    const coHostIds: string[] = Array.from(
      new Set(
        rawIds
          .map((id: unknown) => String(id || '').trim())
          .filter((id): id is string => Boolean(id))
      )
    );
    return { v: HUDDLE_ROOM_ROLES_VERSION, hostId, coHostIds };
  } catch {
    return empty;
  }
}

/** Merge role fields into existing room metadata JSON (preserve other keys). */
export function buildHuddleRoomRolesMetadata(
  existingRaw: string | null | undefined,
  roles: { hostId: string | null; coHostIds: string[] }
): string {
  let base: Record<string, unknown> = {};
  if (existingRaw && String(existingRaw).trim()) {
    try {
      const parsed = JSON.parse(String(existingRaw));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        base = { ...parsed };
      }
    } catch {
      base = {};
    }
  }
  const hostId = String(roles.hostId || '').trim() || null;
  const coHostIds = [
    ...new Set(
      (roles.coHostIds || [])
        .map((id) => String(id || '').trim())
        .filter(Boolean)
        .filter((id) => id !== hostId)
    ),
  ];
  base.v = HUDDLE_ROOM_ROLES_VERSION;
  base.hostId = hostId;
  base.coHostIds = coHostIds;
  return JSON.stringify(base);
}

export function isHuddleSessionModerator(
  roles: HuddleRoomRoles,
  userId: string | null | undefined
): boolean {
  const id = String(userId || '').trim();
  if (!id) return false;
  if (roles.hostId && roles.hostId === id) return true;
  return roles.coHostIds.includes(id);
}

export function mergeSessionCanModerate(opts: {
  channelCanModerate: boolean;
  roles: HuddleRoomRoles;
  userId: string;
}): boolean {
  if (opts.channelCanModerate) return true;
  return isHuddleSessionModerator(opts.roles, opts.userId);
}

/**
 * Apply claim / add / pass to room roles (pure).
 * claim: set host if empty (first joiner / huddle starter — enforced at API).
 * add: append target as co-host.
 * pass: target becomes host; caller stays co-host.
 */
export function applyHuddleModAction(
  roles: HuddleRoomRoles,
  opts: {
    action: HuddleModAction;
    actorId: string;
    targetId?: string | null;
  }
):
  | { ok: true; roles: HuddleRoomRoles }
  | { ok: false; error: string } {
  const actorId = String(opts.actorId || '').trim();
  const targetId = String(opts.targetId || '').trim();
  if (!actorId) return { ok: false, error: 'actorId is required' };

  if (opts.action === 'claim') {
    if (roles.hostId) {
      return { ok: true, roles };
    }
    return {
      ok: true,
      roles: {
        v: HUDDLE_ROOM_ROLES_VERSION,
        hostId: actorId,
        coHostIds: roles.coHostIds.filter((id) => id !== actorId),
      },
    };
  }

  if (!targetId) return { ok: false, error: 'targetUserId is required' };
  if (targetId === actorId) return { ok: false, error: 'Cannot target yourself' };

  if (opts.action === 'add') {
    const coHostIds = [...new Set([...roles.coHostIds, targetId])].filter(
      (id) => id !== roles.hostId
    );
    return {
      ok: true,
      roles: {
        v: HUDDLE_ROOM_ROLES_VERSION,
        hostId: roles.hostId || actorId,
        coHostIds,
      },
    };
  }

  if (opts.action === 'pass') {
    const prevHost = roles.hostId;
    const coHostIds = new Set(roles.coHostIds);
    if (prevHost && prevHost !== targetId) coHostIds.add(prevHost);
    coHostIds.add(actorId);
    coHostIds.delete(targetId);
    return {
      ok: true,
      roles: {
        v: HUDDLE_ROOM_ROLES_VERSION,
        hostId: targetId,
        coHostIds: [...coHostIds],
      },
    };
  }

  return { ok: false, error: 'Invalid action' };
}

/** Featured identity: host, else first co-host, else first roster identity. */
export function pickFeaturedHuddleIdentity(opts: {
  roles: HuddleRoomRoles;
  rosterIdentities: string[];
}): string | null {
  const ids = (opts.rosterIdentities || []).map((id) => String(id || '').trim()).filter(Boolean);
  if (ids.length === 0) return null;
  const host = opts.roles.hostId;
  if (host && ids.includes(host)) return host;
  for (const c of opts.roles.coHostIds) {
    if (ids.includes(c)) return c;
  }
  return ids[0] || null;
}

export function splitFeaturedHuddleRoster<T extends { identity: string }>(
  roster: T[],
  featuredIdentity: string | null
): { featured: T | null; others: T[] } {
  if (!roster.length) return { featured: null, others: [] };
  const feat = String(featuredIdentity || '').trim();
  if (!feat) {
    return { featured: roster[0] || null, others: roster.slice(1) };
  }
  const featured = roster.find((p) => p.identity === feat) || null;
  if (!featured) {
    return { featured: roster[0] || null, others: roster.slice(1) };
  }
  return {
    featured,
    others: roster.filter((p) => p.identity !== featured.identity),
  };
}

/** Merge huddleMod into participant metadata without wiping hand-raise fields. */
export function mergeHuddleModParticipantMetadata(
  existingRaw: string | null | undefined,
  huddleMod: boolean
): string {
  let base: Record<string, unknown> = {};
  if (existingRaw && String(existingRaw).trim()) {
    try {
      const parsed = JSON.parse(String(existingRaw));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        base = { ...parsed };
      }
    } catch {
      base = {};
    }
  }
  base.huddleMod = Boolean(huddleMod);
  return JSON.stringify(base);
}

export function parseHuddleModFromParticipantMetadata(
  raw: string | null | undefined
): boolean {
  if (!raw || !String(raw).trim()) return false;
  try {
    const parsed = JSON.parse(String(raw));
    return Boolean(parsed?.huddleMod);
  } catch {
    return false;
  }
}

export function parseHuddleModAction(raw: unknown): HuddleModAction | null {
  const a = String(raw || '').trim().toLowerCase();
  if (a === 'claim' || a === 'add' || a === 'pass') return a;
  return null;
}
