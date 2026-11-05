/**
 * Sender address for every Vault email (Resend).
 * Set VAULT_EMAIL_FROM in Vercel to an address on a domain verified at
 * https://resend.com/domains (e.g. updates@plcc.church).
 * The display name ("Promised Land Christian Center", "PLCC Canaan") is kept per email.
 */
const FALLBACK = 'updates@plcc.church';

export function vaultEmailAddress(env: Record<string, string | undefined> = process.env): string {
  const raw = String(env.VAULT_EMAIL_FROM || env.EMAIL_FROM || '').trim();
  const bracket = /<([^<>\s]+@[^<>\s]+)>/.exec(raw);
  const addr = (bracket ? bracket[1] : raw).trim();
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(addr) ? addr : FALLBACK;
}

export function vaultFrom(name = 'Promised Land Christian Center', env?: Record<string, string | undefined>): string {
  return `${name} <${vaultEmailAddress(env)}>`;
}
