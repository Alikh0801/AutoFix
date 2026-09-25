// Email and password entry, in the same sanitize/validate shape as phone.ts,
// plate.ts and dob.ts.

export interface FieldResult {
  valid: boolean;
  value?: string;
  error?: string;
}

/** Trim and lower-case. Mail servers ignore case in the domain and every
 *  mainstream provider does for the local part too — storing it as typed is
 *  how you end up with two accounts that look identical to their owner. */
export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

// Deliberately permissive: one @, something either side, a dot in the domain.
// Anything stricter starts rejecting addresses that genuinely work, and the
// confirmation code is what actually proves the address exists.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateEmail(input: string): FieldResult {
  const value = normalizeEmail(input);
  if (!value) return { valid: false, error: 'E-poçt ünvanı tələb olunur.' };
  if (!EMAIL_RE.test(value)) return { valid: false, error: 'E-poçt ünvanı düzgün deyil.' };
  return { valid: true, value };
}

export const MIN_PASSWORD_LENGTH = 8;

/** Length, plus at least one digit and one character that is not a digit.
 *  Stated that way rather than as a letter range so Azerbaijani letters (ə, ğ,
 *  ı, ö, ş, ü, ç) count like any other — an alphabet range would quietly
 *  reject a perfectly good password. Supabase enforces its own minimum too;
 *  checking here is what lets the user see the problem before the round-trip. */
export function validatePassword(input: string): FieldResult {
  if (!input) return { valid: false, error: 'Şifrə tələb olunur.' };
  if (input.length < MIN_PASSWORD_LENGTH)
    return { valid: false, error: `Şifrə ən azı ${MIN_PASSWORD_LENGTH} simvol olmalıdır.` };
  if (!/\d/.test(input) || !/\D/.test(input))
    return { valid: false, error: 'Şifrədə ən azı bir hərf və bir rəqəm olmalıdır.' };
  return { valid: true, value: input };
}

export function validatePasswordMatch(password: string, repeat: string): FieldResult {
  if (!repeat) return { valid: false, error: 'Şifrəni təkrar yaz.' };
  if (password !== repeat) return { valid: false, error: 'Şifrələr uyğun gəlmir.' };
  return { valid: true, value: repeat };
}

/**
 * How many digits the emailed confirmation code has. Must match Supabase's
 * "Email OTP Length" setting (Authentication → Providers → Email) — the code
 * screen submits as soon as it has this many digits, so a mismatch either
 * fires early with a truncated code or never fires at all.
 */
export const OTP_LENGTH = 6;

/** Digits only, capped at the length of a confirmation code. */
export function sanitizeOtp(input: string): string {
  return input.replace(/\D/g, '').slice(0, OTP_LENGTH);
}
