/** Pure validation for the Pastor's Office. Authorization and persistence are server-side. */
export type RequestStatus = 'requested' | 'proposed' | 'awaiting_approval' | 'confirmed' | 'completed' | 'declined' | 'cancelled' | 'no_show';
export type OfficeActor = 'member' | 'assistant' | 'pastor';
export type WorkflowAction = 'propose' | 'request_approval' | 'approve' | 'decline' | 'cancel' | 'complete' | 'mark_no_show';
const transitions: Partial<Record<WorkflowAction, { from: RequestStatus[]; by: OfficeActor[]; to: RequestStatus }>> = {
  propose: { from: ['requested', 'proposed', 'declined'], by: ['assistant', 'pastor'], to: 'proposed' },
  request_approval: { from: ['proposed'], by: ['assistant', 'pastor'], to: 'awaiting_approval' },
  approve: { from: ['awaiting_approval'], by: ['pastor'], to: 'confirmed' },
  decline: { from: ['requested', 'proposed', 'awaiting_approval'], by: ['pastor'], to: 'declined' },
  cancel: { from: ['requested', 'proposed', 'awaiting_approval', 'confirmed'], by: ['member', 'assistant', 'pastor'], to: 'cancelled' },
  complete: { from: ['confirmed'], by: ['assistant', 'pastor'], to: 'completed' },
  mark_no_show: { from: ['confirmed'], by: ['assistant', 'pastor'], to: 'no_show' },
};
export function nextRequestStatus(status: RequestStatus, action: WorkflowAction, actor: OfficeActor): RequestStatus | null {
  const rule = transitions[action];
  return rule && rule.from.includes(status) && rule.by.includes(actor) ? rule.to : null;
}
export function isValidTimeZone(zone: unknown): zone is string {
  if (typeof zone !== 'string' || !zone || zone.length > 80) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: zone }).format(0); return true; } catch { return false; }
}
/** Require an offset or Z so a local time cannot silently become a UTC time. */
export function parseOfficeInstant(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!parts) return null;
  const [, y, m, d, hour, minute, second = '00', offset] = parts;
  const year = Number(y), month = Number(m), day = Number(d);
  const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (year < 100 || month < 1 || month > 12 || day < 1 || day > maxDay || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return null;
  if (offset !== 'Z' && (Number(offset.slice(1,3)) > 23 || Number(offset.slice(4,6)) > 59)) return null;
  const date = Date.parse(value);
  return Number.isFinite(date) ? date : null;
}
export function validateOfficeSlot(start: unknown, end: unknown, zone: unknown): boolean {
  const a = parseOfficeInstant(start); const b = parseOfficeInstant(end);
  return a !== null && b !== null && b > a && b - a <= 12 * 60 * 60 * 1000 && isValidTimeZone(zone);
}
/** [start,end) intervals allow an appointment to start when another ends. */
export function officeSlotsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}
/** Notification copy deliberately contains no counseling category, names or note text. */
export const OFFICE_NOTIFICATION = Object.freeze({ title: 'Pastor’s Office update', body: 'You have an appointment update. Open the app to view it.' });
