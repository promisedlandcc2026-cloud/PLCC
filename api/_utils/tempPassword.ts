import * as nodeCrypto from 'node:crypto';

/** Easy to read out or type on a phone: "Plcc" + 6 digits (no 0/1 to avoid O/l mix-ups). */
export function generateTemporaryPassword(): string {
  const digits = '23456789';
  let out = 'Plcc';
  for (let i = 0; i < 6; i++) out += digits[nodeCrypto.randomInt(digits.length)];
  return out;
}
