/**
 * Phone numbers for PLCC (Uganda, +256), while still accepting US numbers
 * for members abroad.
 *
 *   0772 557842       → +256772557842   (local Ugandan format)
 *   772 557842        → +256772557842
 *   256 772 557842    → +256772557842
 *   +256 772 557842   → +256772557842
 *   (508) 555-1234    → +15085551234    (US, 10 digits not starting with 0)
 *   +44 7911 123456   → +447911123456   (any number typed with +)
 */

export const HOME_COUNTRY_CODE = '256';

/** Placeholder for phone inputs. */
export const PHONE_PLACEHOLDER = '0772 123456';

export function toE164Intl(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  let d = s.replace(/\D/g, '');
  if (!d) return null;
  const ok = (x: string) => (x.length >= 8 && x.length <= 15 ? `+${x}` : null);

  if (s.startsWith('+')) return ok(d);
  if (d.startsWith('00')) return ok(d.slice(2));
  if (d.startsWith(HOME_COUNTRY_CODE) && d.length === 12) return `+${d}`;
  if (d.length === 10 && d.startsWith('0')) return `+${HOME_COUNTRY_CODE}${d.slice(1)}`;
  if (d.length === 9 && /^[2-7]/.test(d)) return `+${HOME_COUNTRY_CODE}${d}`;
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  return d.length >= 11 ? ok(d) : null;
}

/** True for a full Ugandan number (+256 and 9 more digits). */
export function isUgandanE164(e164: string | null | undefined): boolean {
  return /^\+256\d{9}$/.test(String(e164 || ''));
}

/** "+256 772 557 842", "+1 (508) 555-1234", or the input as typed. */
export function formatPhoneForDisplay(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  const e164 = toE164Intl(s);
  const d = (e164 || '').replace(/\D/g, '');
  if (e164 && isUgandanE164(e164)) {
    return `+256 ${d.slice(3, 6)} ${d.slice(6, 9)} ${d.slice(9)}`;
  }
  if (e164 && d.length === 11 && d.startsWith('1')) {
    return `+1 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  }
  return e164 || s;
}
