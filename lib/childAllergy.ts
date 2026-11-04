/** Parse allergy / medical flags from free-text child notes for badges & kiosk. */
export function extractAllergyAlert(notes?: string | null): string | null {
  if (!notes || !String(notes).trim()) return null;
  const text = String(notes).trim();
  // Prefer explicit allergy lines
  const allergyLine = text
    .split(/[\n;|]+/)
    .map((l) => l.trim())
    .find((l) => /allerg/i.test(l));
  if (allergyLine) {
    return allergyLine.replace(/^allerg(y|ies)\s*[:\-]?\s*/i, '').trim() || allergyLine;
  }
  // Short notes often are the allergy itself
  if (text.length <= 80) return text;
  return text.slice(0, 80).trim() + '…';
}
