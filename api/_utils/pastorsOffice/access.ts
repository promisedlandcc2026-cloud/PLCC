/** Pastor's Office assignment policy. Callers must load assignments from trusted storage.
 * This is a foundation only: no routes or database grants are connected yet.
 */
export type OfficeRole = 'PASTOR' | 'PASTORS_ASSISTANT';
export type OfficeAction = 'calendar.view' | 'calendar.coordinate' | 'private_notes.read' | 'private_notes.write';
export type OfficeAssignment = {
  officeId: string;
  userId: string;
  role: OfficeRole;
  revokedAt: string | null;
};

/** Fail closed for missing identity, revoked assignments and a different office. */
export function canAccessPastorsOffice(
  userId: string | null | undefined,
  officeId: string | null | undefined,
  action: OfficeAction,
  assignments: readonly OfficeAssignment[],
  noteOwnerId?: string | null,
): boolean {
  if (!userId || !officeId) return false;
  return assignments.some((assignment) => {
    if (assignment.userId !== userId || assignment.officeId !== officeId || assignment.revokedAt !== null) return false;
    if (assignment.role === 'PASTOR') {
      if (action === 'calendar.view' || action === 'calendar.coordinate') return true;
      return (action === 'private_notes.read' || action === 'private_notes.write') && noteOwnerId === userId;
    }
    if (assignment.role === 'PASTORS_ASSISTANT') return action === 'calendar.view' || action === 'calendar.coordinate';
    return false;
  });
}
