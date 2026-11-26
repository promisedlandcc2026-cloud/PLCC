/**
 * Shepherd Assist sign-on pass (PLCC ONE → Shepherd Assist).
 * Shepherd Assist runs on its own Supabase project, so it cannot redeem a PLCC magic link.
 * Instead PLCC ONE signs a short-lived, single-use pass with SHEPHERD_SSO_SECRET, which only
 * Shepherd Assist can verify (it keeps the same value as SHEPHERD_PLCC_SSO_SECRET). It carries the
 * member's PLCC user id, their auth email (may be empty for phone-only accounts) and display name.
 * No session or token from PLCC ONE is shared.
 */
import { createHmac, randomUUID } from 'node:crypto';

export const SHEPHERD_PASS_SECONDS = 120;

export type ShepherdPass = {
  v: 1; iss: 'plcc-one'; aud: 'shepherd-assist'; church: 'plcc';
  sub: string; email: string; name: string; iat: number; exp: number; jti: string;
};

const b64 = (value: string | Buffer) => Buffer.from(value).toString('base64url');

export function signShepherdPass(
  secret: string,
  member: { id: string; email?: string | null; name?: string | null },
  now = Math.floor(Date.now() / 1000),
): string {
  const payload: ShepherdPass = {
    v: 1, iss: 'plcc-one', aud: 'shepherd-assist', church: 'plcc',
    sub: member.id,
    email: String(member.email || '').trim().toLowerCase().slice(0, 254),
    name: String(member.name || '').replace(/[\u0000-\u001f\s]+/g, ' ').trim().slice(0, 80),
    iat: now, exp: now + SHEPHERD_PASS_SECONDS, jti: randomUUID(),
  };
  const body = b64(JSON.stringify(payload));
  return `${body}.${b64(createHmac('sha256', secret).update(body).digest())}`;
}
