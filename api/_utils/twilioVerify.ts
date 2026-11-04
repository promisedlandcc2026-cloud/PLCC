/**
 * Text sign-in codes for the Vault and PLCC Connect, sent and checked by Twilio
 * Verify (Twilio's own pre-approved senders — the church's (855) text-to-give
 * number is not used). Same Verify service as PLCC Tithe.
 *
 * Env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID.
 */

export function phoneCodesEnabled(): boolean {
  return Boolean(
    String(process.env.TWILIO_ACCOUNT_SID || '').trim() &&
      String(process.env.TWILIO_AUTH_TOKEN || '').trim() &&
      String(process.env.TWILIO_VERIFY_SERVICE_SID || '').trim()
  );
}

/**
 * Ordinary US numbers only, as E.164 (+15085551234). Rejects toll-free,
 * premium (900/976), N11 and malformed numbers — keeps cost and SMS-pumping
 * risk down.
 */
export function normalizeUsPhone(raw: unknown): string | null {
  let digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (digits.length !== 10) return null;
  const area = digits.slice(0, 3);
  const exchange = digits.slice(3, 6);
  if (!/^[2-9]\d\d$/.test(area) || !/^[2-9]\d\d$/.test(exchange)) return null;
  if (/^(800|833|844|855|866|877|888|900|976)$/.test(area)) return null;
  if (area[1] === '1' && area[2] === '1') return null;
  return `+1${digits}`;
}

type FetchLike = typeof fetch;
let fetchImpl: FetchLike = (input, init) => fetch(input, init);
/** Tests swap in a fake Twilio. */
export function setVerifyFetchForTests(impl: FetchLike | null): void {
  fetchImpl = impl ?? ((input, init) => fetch(input, init));
}

async function verifyRequest(path: string, form: Record<string, string>): Promise<{ status?: string }> {
  const sid = String(process.env.TWILIO_ACCOUNT_SID || '').trim();
  const token = String(process.env.TWILIO_AUTH_TOKEN || '').trim();
  const service = String(process.env.TWILIO_VERIFY_SERVICE_SID || '').trim();
  const res = await fetchImpl(
    `https://verify.twilio.com/v2/Services/${encodeURIComponent(service)}/${path}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(form).toString(),
    }
  );
  const data = (await res.json().catch(() => ({}))) as { status?: string; code?: number };
  if (!res.ok) {
    // 404 on a check = no pending code (expired, used, or too many wrong tries)
    if (path === 'VerificationCheck' && res.status === 404) return { status: 'expired' };
    throw new Error(`Twilio Verify ${path} ${res.status}${data.code ? ` (${data.code})` : ''}`);
  }
  return data;
}

export async function sendVerifyCode(phoneE164: string): Promise<void> {
  if (!phoneCodesEnabled()) throw new Error('Text sign-in is not configured');
  await verifyRequest('Verifications', { To: phoneE164, Channel: 'sms' });
}

/** True only when Twilio approves this code for this number (each code works once). */
export async function checkVerifyCode(phoneE164: string, code: unknown): Promise<boolean> {
  if (!phoneCodesEnabled()) return false;
  const clean = String(code ?? '').replace(/\D/g, '');
  if (clean.length !== 6) return false;
  try {
    const result = await verifyRequest('VerificationCheck', { To: phoneE164, Code: clean });
    return result.status === 'approved';
  } catch (err: any) {
    console.warn('[phone-code] verify check failed', err?.message || err);
    return false;
  }
}
