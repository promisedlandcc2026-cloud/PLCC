/**
 * Canaan has no calls, so an update can always load right away. Same names as Ka Link and
 * Tribes so the shared Update banner works unchanged.
 */
export function isCallActive(): boolean {
  return false;
}

export function updateWhenCallEnds(): void {
  window.location.reload();
}
