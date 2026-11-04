/**
 * PLCC Community Phase 3B — LiveKit raise-hand helpers (pure, no DB).
 * Hand state lives in LiveKit participant metadata + optional mod data messages.
 */

export const HAND_META_VERSION = 1 as const;
export const MOD_LOWER_HAND_TYPE = 'mod_lower_hand' as const;

export type HandRaiseMetadata = {
  v: typeof HAND_META_VERSION;
  handRaised: boolean;
  /** Epoch ms when hand was raised; null when lowered. */
  raisedAt: number | null;
};

export type HandRaiseParticipantSnapshot = {
  identity: string;
  name: string;
  metadata?: string | null;
  /** LiveKit roomAdmin / canModerate from token permissions when known. */
  isRoomModerator?: boolean;
};

export type RaisedHandQueueEntry = {
  identity: string;
  name: string;
  raisedAt: number;
  position: number; // 1-based
};

/** Parse LiveKit participant.metadata JSON into hand-raise fields. */
export function parseHandRaiseMetadata(raw: string | null | undefined): HandRaiseMetadata {
  if (!raw || !String(raw).trim()) {
    return { v: HAND_META_VERSION, handRaised: false, raisedAt: null };
  }
  try {
    const parsed = JSON.parse(String(raw));
    const handRaised = Boolean(parsed?.handRaised);
    const raisedAtRaw = parsed?.raisedAt;
    const raisedAt =
      handRaised && typeof raisedAtRaw === 'number' && Number.isFinite(raisedAtRaw)
        ? raisedAtRaw
        : handRaised && typeof raisedAtRaw === 'string' && Number.isFinite(Date.parse(raisedAtRaw))
          ? Date.parse(raisedAtRaw)
          : null;
    return {
      v: HAND_META_VERSION,
      handRaised: handRaised && raisedAt != null,
      raisedAt: handRaised && raisedAt != null ? raisedAt : null,
    };
  } catch {
    return { v: HAND_META_VERSION, handRaised: false, raisedAt: null };
  }
}

/** Merge hand-raise fields into existing participant metadata JSON (preserve other keys). */
export function mergeHandRaiseMetadata(
  existingRaw: string | null | undefined,
  next: { handRaised: boolean; raisedAt: number | null }
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
  base.v = HAND_META_VERSION;
  base.handRaised = Boolean(next.handRaised);
  base.raisedAt = next.handRaised ? next.raisedAt : null;
  return JSON.stringify(base);
}

export function buildRaiseHandMetadata(
  existingRaw: string | null | undefined,
  nowMs: number = Date.now()
): string {
  return mergeHandRaiseMetadata(existingRaw, { handRaised: true, raisedAt: nowMs });
}

export function buildLowerHandMetadata(existingRaw: string | null | undefined): string {
  return mergeHandRaiseMetadata(existingRaw, { handRaised: false, raisedAt: null });
}

/**
 * Build ordered raised-hand queue from current room participants.
 * Only identities still present with handRaised+raisedAt are included.
 * Sort: raisedAt ASC, then identity for stability.
 */
export function buildRaisedHandQueue(
  participants: HandRaiseParticipantSnapshot[]
): RaisedHandQueueEntry[] {
  const raised: { identity: string; name: string; raisedAt: number }[] = [];
  for (const p of participants || []) {
    const identity = String(p.identity || '').trim();
    if (!identity) continue;
    const meta = parseHandRaiseMetadata(p.metadata);
    if (!meta.handRaised || meta.raisedAt == null) continue;
    raised.push({
      identity,
      name: String(p.name || '').trim() || 'Member',
      raisedAt: meta.raisedAt,
    });
  }
  raised.sort((a, b) => {
    if (a.raisedAt !== b.raisedAt) return a.raisedAt - b.raisedAt;
    return a.identity.localeCompare(b.identity);
  });
  return raised.map((r, i) => ({
    identity: r.identity,
    name: r.name,
    raisedAt: r.raisedAt,
    position: i + 1,
  }));
}

/** Re-raise after lower: new raisedAt → end of queue (pure timing semantics). */
export function nextRaisedAtForReRaise(nowMs: number = Date.now()): number {
  return nowMs;
}

export function formatHandsRaisedStatus(count: number): string {
  const n = Math.max(0, Number(count) || 0);
  if (n === 1) return '✋ 1 hand raised';
  return `✋ ${n} hands raised`;
}

export type HandActionDecision =
  | { ok: true }
  | { ok: false; error: string };

/** Local participant may only raise/lower their own hand. */
export function decideLocalHandToggle(opts: {
  actorIdentity: string;
  targetIdentity: string;
}): HandActionDecision {
  const actor = String(opts.actorIdentity || '').trim();
  const target = String(opts.targetIdentity || '').trim();
  if (!actor || !target) return { ok: false, error: 'Missing participant identity' };
  if (actor !== target) {
    return { ok: false, error: 'You can only raise or lower your own hand' };
  }
  return { ok: true };
}

/**
 * Moderator may lower another participant's hand.
 * Authority must be server-derived room moderator (LiveKit roomAdmin / canModerate).
 */
export function decideModeratorLowerHand(opts: {
  actorIdentity: string;
  targetIdentity: string;
  actorIsRoomModerator: boolean;
}): HandActionDecision {
  const actor = String(opts.actorIdentity || '').trim();
  const target = String(opts.targetIdentity || '').trim();
  if (!actor || !target) return { ok: false, error: 'Missing participant identity' };
  if (actor === target) {
    // Prefer local lower path; still allowed.
    return { ok: true };
  }
  if (!opts.actorIsRoomModerator) {
    return { ok: false, error: 'Only moderators can lower another participant’s hand' };
  }
  return { ok: true };
}

export function shouldHonorModeratorLowerHandMessage(opts: {
  localIdentity: string;
  targetIdentity: string;
  senderIsRoomModerator: boolean;
}): boolean {
  if (!opts.senderIsRoomModerator) return false;
  return (
    String(opts.localIdentity || '').trim() === String(opts.targetIdentity || '').trim() &&
    Boolean(opts.targetIdentity)
  );
}

/** Raise hand must not imply mic unmute — pure documentation of invariant for smokes. */
export function raiseHandChangesMuteState(): boolean {
  return false;
}

export function buildModeratorLowerHandPayload(targetIdentity: string): {
  type: typeof MOD_LOWER_HAND_TYPE;
  target: string;
} {
  return { type: MOD_LOWER_HAND_TYPE, target: String(targetIdentity || '').trim() };
}
