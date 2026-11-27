/**
 * The badge shown next to someone's name in a Ka Link call (Nov 27, 2026).
 * Their title wins (Apostle, Bishop, Pastor); otherwise a Super Admin shows "Super Admin"
 * and the PASTOR role shows "Pastor". Everyone else gets no badge here — moderators
 * still show "Mod" from plcc.role. Display only: permissions never depend on it.
 */
export type KaLinkBadge = 'Apostle' | 'Bishop' | 'Pastor' | 'Super Admin';

export function kaLinkBadge(role: string | null | undefined, title: string | null | undefined): KaLinkBadge | null {
  const t = String(title || '').trim().toLowerCase();
  if (/\bapostle\b/.test(t)) return 'Apostle';
  if (/\bbishop\b/.test(t)) return 'Bishop';
  if (/\bpastor\b|^(ps|pr)\.?(\s|$)/.test(t)) return 'Pastor';
  const r = String(role || '').toUpperCase();
  if (r === 'SUPER_ADMIN') return 'Super Admin';
  if (r === 'PASTOR') return 'Pastor';
  return null;
}
