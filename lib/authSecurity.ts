import { supabase } from './supabase';

export type PasskeyInfo = {
  id: string;
  friendly_name?: string | null;
  created_at?: string;
  last_used_at?: string | null;
};

export type MfaFactor = {
  id: string;
  friendly_name?: string | null;
  factor_type?: string;
  status: string;
};

function requireClient() {
  if (!supabase) throw new Error('Sign-in is not ready. Refresh the page and try again.');
  return supabase;
}

/** List passkeys for the signed-in user. */
export async function listPasskeys(): Promise<PasskeyInfo[]> {
  const client = requireClient();
  const { data, error } = await (client.auth as any).passkey.list();
  if (error) throw new Error(error.message || 'Could not load passkeys');
  return (data || []) as PasskeyInfo[];
}

/** Register a new device passkey (Face ID, fingerprint, or security key). */
export async function registerPasskey(friendlyName?: string): Promise<PasskeyInfo> {
  const client = requireClient();
  const { data, error } = await (client.auth as any).registerPasskey();
  if (error) throw new Error(error.message || 'Could not add passkey');
  if (friendlyName && data?.id) {
    const { data: updated, error: updateError } = await (client.auth as any).passkey.update({
      passkeyId: data.id,
      friendlyName,
    });
    if (!updateError && updated) return updated as PasskeyInfo;
  }
  return data as PasskeyInfo;
}

/** Remove a passkey from this account. */
export async function deletePasskey(passkeyId: string): Promise<void> {
  const client = requireClient();
  const { error } = await (client.auth as any).passkey.delete({ passkeyId });
  if (error) throw new Error(error.message || 'Could not remove passkey');
}

/** Sign in with a passkey (no email needed). */
let passkeySignInInFlight: Promise<any> | null = null;

function isStalePasskeyChallengeError(err: unknown): boolean {
  const raw = String(
    (err as any)?.message || (err as any)?.error_description || err || ''
  );
  return /challenge not found|already used|invalid challenge/i.test(raw);
}

async function signInWithPasskeyOnce() {
  const client = requireClient();
  const { data, error } = await (client.auth as any).signInWithPasskey();
  if (error) throw new Error(error.message || 'Passkey sign-in failed');
  return data?.session ?? null;
}

/**
 * Mobile Safari/Chrome often consume a WebAuthn challenge twice (autofill + tap,
 * or Face ID interrupt). Serialize attempts and retry once on stale challenge.
 */
export async function signInWithPasskey() {
  if (passkeySignInInFlight) return passkeySignInInFlight;

  passkeySignInInFlight = (async () => {
    try {
      return await signInWithPasskeyOnce();
    } catch (firstErr) {
      if (!isStalePasskeyChallengeError(firstErr)) throw firstErr;
      // Brief pause so the OS sheet fully dismisses before minting a new challenge.
      await new Promise((r) => setTimeout(r, 450));
      try {
        return await signInWithPasskeyOnce();
      } catch (retryErr) {
        if (isStalePasskeyChallengeError(retryErr)) {
          throw new Error(
            'Passkey could not finish on this phone (challenge expired). Tap Email / Phone for a login code — that works reliably on mobile — or wait a few seconds and tap Passkey only once.'
          );
        }
        throw retryErr;
      }
    }
  })();

  try {
    return await passkeySignInInFlight;
  } finally {
    passkeySignInInFlight = null;
  }
}

/** List verified TOTP (authenticator app) factors. */
export async function listMfaFactors(): Promise<MfaFactor[]> {
  const client = requireClient();
  const { data, error } = await client.auth.mfa.listFactors();
  if (error) throw new Error(error.message || 'Could not load 2-step status');
  const totp = (data?.totp || []) as MfaFactor[];
  return totp.filter((f) => f.status === 'verified');
}

export type MfaEnrollStart = {
  factorId: string;
  /** otpauth:// URI — render this as a QR (do not rely on Supabase SVG) */
  uri: string;
  secret: string;
  /** Secret grouped for easier typing into authenticator apps */
  secretFormatted: string;
};

function formatTotpSecret(secret: string): string {
  const clean = String(secret || '')
    .replace(/\s+/g, '')
    .toUpperCase();
  return clean.replace(/(.{4})/g, '$1 ').trim();
}

/**
 * Build a Google Authenticator–friendly otpauth URI.
 * Avoid spaces in issuer/label (iOS Authenticator often rejects those barcodes).
 */
function buildTotpUri(secret: string, email: string): string {
  const cleanSecret = String(secret || '').replace(/\s+/g, '').toUpperCase();
  const account = (email || 'member').replace(/\s+/g, '');
  const label = encodeURIComponent(`AWCVault:${account}`);
  const issuer = encodeURIComponent('AWCVault');
  return `otpauth://totp/${label}?secret=${cleanSecret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}

/** Start authenticator-app enrollment; show QR then call confirmMfaEnroll. */
export async function startMfaEnroll(friendlyName = 'PLCC Canaan'): Promise<MfaEnrollStart> {
  const client = requireClient();

  // Clear unfinished enrollments so a fresh QR/secret is issued
  try {
    const { data: listed } = await client.auth.mfa.listFactors();
    const pending = (listed as any)?.all || [];
    for (const f of pending) {
      if (f?.factor_type === 'totp' && f?.status === 'unverified' && f?.id) {
        await client.auth.mfa.unenroll({ factorId: f.id });
      }
    }
  } catch {
    // Non-fatal — continue with enroll
  }

  const { data: userData } = await client.auth.getUser();
  const email = userData?.user?.email || 'member';

  const { data, error } = await client.auth.mfa.enroll({
    factorType: 'totp',
    // No spaces — friendlier for authenticator apps that embed this in the URI
    friendlyName: String(friendlyName || 'PLCC Canaan').replace(/\s+/g, '-'),
  } as any);

  if (error) throw new Error(error.message || 'Could not start 2-step setup');
  if (!data?.id || !data?.totp?.secret) {
    throw new Error('Could not start 2-step setup. Try again in a moment.');
  }

  const secret = String(data.totp.secret).replace(/\s+/g, '').toUpperCase();

  return {
    factorId: data.id,
    // Always build a clean otpauth URI — Supabase SVG QRs often fail in Google Authenticator / Authy
    uri: buildTotpUri(secret, email),
    secret,
    secretFormatted: formatTotpSecret(secret),
  };
}

/** Confirm authenticator setup with the 6-digit code from the app. */
export async function confirmMfaEnroll(factorId: string, code: string): Promise<void> {
  const client = requireClient();
  const { data: challenge, error: challengeError } = await client.auth.mfa.challenge({ factorId });
  if (challengeError) throw new Error(challengeError.message || 'Could not verify code');
  const { error } = await client.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code: code.trim(),
  });
  if (error) throw new Error(error.message || 'That code did not work. Try again.');
}

/** Turn off 2-step for a factor. */
export async function removeMfaFactor(factorId: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.auth.mfa.unenroll({ factorId });
  if (error) throw new Error(error.message || 'Could not turn off 2-step');
}
