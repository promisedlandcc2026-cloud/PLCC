/**
 * Ka Link "stage" rules for one live session (pure helpers, Phase 2 — Nov 2026).
 *
 * Stored in LiveKit room metadata under `stage`, next to the host/co-host roles,
 * so they last exactly as long as the live Ka Link:
 *   - micLock:   members cannot unmute themselves. They raise a hand and a
 *                moderator allows their mic (#8).
 *   - readerIds: Bible readers may unmute themselves even while mics are locked (#11).
 *   - blockedIds: people removed and blocked from rejoining this session (#16).
 */

export type HuddleStage = {
  micLock: boolean;
  readerIds: string[];
  blockedIds: string[];
};

export type HuddleStageAction =
  | 'mic-lock'
  | 'mic-unlock'
  | 'reader-add'
  | 'reader-remove'
  | 'block';

export const MAX_HUDDLE_READERS = 12;
export const MAX_HUDDLE_BLOCKED = 200;

/** PLCC (Nov 19 2026): every Ka Link starts with mics locked; mods and up unlock. */
export function emptyHuddleStage(): HuddleStage {
  return { micLock: true, readerIds: [], blockedIds: [] };
}

function idList(raw: unknown, max: number): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    const id = String(v ?? '').trim();
    if (id && id.length <= 128 && !out.includes(id)) out.push(id);
    if (out.length >= max) break;
  }
  return out;
}

function parseObject(raw: string | null | undefined): Record<string, unknown> {
  if (!raw || !String(raw).trim()) return {};
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** Read the stage rules from LiveKit room metadata JSON. */
export function parseHuddleStage(raw: string | null | undefined): HuddleStage {
  const stage = parseObject(raw).stage;
  if (!stage || typeof stage !== 'object' || Array.isArray(stage)) return emptyHuddleStage();
  const s = stage as Record<string, unknown>;
  return {
    // Locked unless a moderator unlocked it (micLock: false written explicitly).
    micLock: s.micLock !== false,
    readerIds: idList(s.readerIds, MAX_HUDDLE_READERS),
    blockedIds: idList(s.blockedIds, MAX_HUDDLE_BLOCKED),
  };
}

/** Write stage rules into room metadata, keeping every other key (host roles etc.). */
export function buildHuddleStageMetadata(existingRaw: string | null | undefined, stage: HuddleStage): string {
  const base = parseObject(existingRaw);
  base.stage = {
    micLock: stage.micLock === true,
    readerIds: idList(stage.readerIds, MAX_HUDDLE_READERS),
    blockedIds: idList(stage.blockedIds, MAX_HUDDLE_BLOCKED),
  };
  return JSON.stringify(base);
}

export function parseHuddleStageAction(raw: unknown): HuddleStageAction | null {
  const a = String(raw ?? '').trim().toLowerCase();
  return a === 'mic-lock' || a === 'mic-unlock' || a === 'reader-add' || a === 'reader-remove' || a === 'block'
    ? a
    : null;
}

export function applyHuddleStageAction(
  stage: HuddleStage,
  action: HuddleStageAction,
  targetId?: string | null
): { ok: true; stage: HuddleStage } | { ok: false; error: string } {
  const target = String(targetId || '').trim();
  if (action === 'mic-lock') return { ok: true, stage: { ...stage, micLock: true } };
  if (action === 'mic-unlock') return { ok: true, stage: { ...stage, micLock: false } };
  if (!target) return { ok: false, error: 'targetIdentity is required' };
  if (action === 'reader-add') {
    if (stage.readerIds.includes(target)) return { ok: true, stage };
    if (stage.readerIds.length >= MAX_HUDDLE_READERS) {
      return { ok: false, error: `This Ka Link already has ${MAX_HUDDLE_READERS} Bible readers.` };
    }
    return { ok: true, stage: { ...stage, readerIds: [...stage.readerIds, target] } };
  }
  if (action === 'reader-remove') {
    return { ok: true, stage: { ...stage, readerIds: stage.readerIds.filter((id) => id !== target) } };
  }
  // block
  const blockedIds = stage.blockedIds.includes(target)
    ? stage.blockedIds
    : [...stage.blockedIds, target].slice(-MAX_HUDDLE_BLOCKED);
  return {
    ok: true,
    stage: { ...stage, blockedIds, readerIds: stage.readerIds.filter((id) => id !== target) },
  };
}

/** May this person open their own mic right now? Moderators and Bible readers always may. */
export function huddleMicAllowed(opts: { stage: HuddleStage; userId: string; isModerator: boolean }): boolean {
  if (!opts.stage.micLock) return true;
  if (opts.isModerator) return true;
  return opts.stage.readerIds.includes(String(opts.userId || '').trim());
}

export function huddleUserBlocked(stage: HuddleStage, userId: string): boolean {
  return stage.blockedIds.includes(String(userId || '').trim());
}
