import { fetchAuthorized } from './api';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACCESS_RE = /^\d{4,8}$/;

/** A typed backup code or an old pass that encoded the member id. */
export function looksLikeBackupOrLegacyId(raw: string): boolean {
  const code = String(raw || '').trim();
  return UUID_RE.test(code) || ACCESS_RE.test(code);
}

/** Staff desk/kiosk: turn a backup code or old member id into the AWC1 card. */
export async function resolveMembershipPass(raw: string): Promise<string | null> {
  const res = await fetchAuthorized('/api/vault?resource=people&subResource=member-pass', {
    method: 'POST',
    body: JSON.stringify({ code: String(raw || '').trim() }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok || !data.token) return null;
  return String(data.token);
}
