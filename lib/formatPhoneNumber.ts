/**
 * Normalise a phone number string returned by the OS contacts API.
 *
 * Rules (in priority order):
 *  1. Strip all non-digit characters except a leading `+`.
 *  2. If the result has 11 digits and starts with `1` (US/CA),
 *     format as  +1 (XXX) XXX-XXXX.
 *  3. If the result has exactly 10 digits, assume US and format
 *     as  +1 (XXX) XXX-XXXX.
 *  4. If the number has a `+` prefix, keep it and return `+{digits}`.
 *  5. Otherwise return the raw string unchanged.
 */
export function formatPhoneNumber(raw: string): string {
  if (!raw) return raw;

  const hasPlus = raw.trimStart().startsWith('+');
  const digits = raw.replace(/\D/g, '');

  // 11-digit starting with 1 → US format
  if (digits.length === 11 && digits.startsWith('1')) {
    const area = digits.slice(1, 4);
    const mid  = digits.slice(4, 7);
    const last = digits.slice(7, 11);
    return `+1 (${area}) ${mid}-${last}`;
  }

  // 10-digit → assume US
  if (digits.length === 10) {
    const area = digits.slice(0, 3);
    const mid  = digits.slice(3, 6);
    const last = digits.slice(6, 10);
    return `+1 (${area}) ${mid}-${last}`;
  }

  // International with explicit +
  if (hasPlus && digits.length > 0) {
    return `+${digits}`;
  }

  // Ambiguous — return raw
  return raw;
}
