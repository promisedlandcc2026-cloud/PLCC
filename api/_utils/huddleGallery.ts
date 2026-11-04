/**
 * Phase 3G — Live Huddle paginated gallery helpers (pure; UI + smokes).
 * Used only when screen share is NOT active. Presentation mode keeps the rail.
 */

export type HuddleGalleryBreakpoint = 'desktop' | 'medium' | 'mobile' | 'narrow';

/** Breakpoints aligned with Tailwind sm (640) / lg (1024). */
export function huddleGalleryBreakpointFromWidth(width: number): HuddleGalleryBreakpoint {
  const w = Number(width);
  if (!Number.isFinite(w) || w <= 0) return 'desktop';
  if (w >= 1024) return 'desktop';
  if (w >= 640) return 'medium';
  if (w >= 400) return 'mobile';
  return 'narrow';
}

export function huddleGalleryPageSize(breakpoint: HuddleGalleryBreakpoint): number {
  switch (breakpoint) {
    case 'desktop':
      return 9;
    case 'medium':
      return 6;
    case 'mobile':
      return 4;
    case 'narrow':
      return 2;
    default:
      return 9;
  }
}

export function huddleGalleryColumnCount(breakpoint: HuddleGalleryBreakpoint): number {
  switch (breakpoint) {
    case 'desktop':
      return 3;
    case 'medium':
      return 3;
    case 'mobile':
      return 2;
    case 'narrow':
      return 2;
    default:
      return 3;
  }
}

export function huddleGalleryPageCount(
  participantCount: number,
  pageSize: number
): number {
  const n = Math.max(0, Number(participantCount) || 0);
  const size = Math.max(1, Number(pageSize) || 1);
  if (n <= 0) return 1;
  return Math.max(1, Math.ceil(n / size));
}

/** 1-based page index, clamped into [1, pageCount]. */
export function clampHuddleGalleryPage(page: number, pageCount: number): number {
  const pages = Math.max(1, Number(pageCount) || 1);
  const p = Math.floor(Number(page) || 1);
  if (!Number.isFinite(p) || p < 1) return 1;
  if (p > pages) return pages;
  return p;
}

export function sliceHuddleGalleryPage<T>(
  items: T[],
  page: number,
  pageSize: number
): T[] {
  const list = Array.isArray(items) ? items : [];
  const size = Math.max(1, Number(pageSize) || 1);
  const pages = huddleGalleryPageCount(list.length, size);
  const safe = clampHuddleGalleryPage(page, pages);
  const start = (safe - 1) * size;
  return list.slice(start, start + size);
}

export function huddleGalleryGridClass(columnCount: number): string {
  const cols = Math.max(1, Math.min(3, Number(columnCount) || 1));
  if (cols <= 1) return 'grid-cols-1';
  if (cols === 2) return 'grid-cols-2';
  return 'grid-cols-3';
}

/** Total room membership — never use visible page length. */
export function huddleGalleryParticipantCount(
  roomParticipantCount: number,
  _visibleOnPage: number
): number {
  return Math.max(0, Number(roomParticipantCount) || 0);
}

/**
 * Active speaker must not reorder gallery pages.
 * Returns the same order reference for smokes/docs.
 */
export function huddleGalleryOrderIgnoresActiveSpeaker<T>(roster: T[]): T[] {
  return roster;
}

/** Screen share presentation bypasses paginated gallery. */
export function shouldUseHuddleGalleryPagination(opts: {
  screenShareActive: boolean;
}): boolean {
  return !Boolean(opts.screenShareActive);
}
