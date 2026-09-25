// Azerbaijani mobile number handling.
//
// Displayed as +994 (XX) - XXX - XX - XX — a 2-digit operator code + 7 digits
// (9 total), e.g. +994 (55) - 123 - 45 - 67. We store the E.164 form
// "+994553221111".

export const AZ_DIAL_CODE = '+994';

// Mobile operator codes in Azerbaijan (Azercell 50/51/10, Bakcell 55/99,
// Nar 70/77, Naxtel 60).
export const AZ_OPERATOR_CODES = ['10', '50', '51', '55', '60', '70', '77', '99'];

const LOCAL_DIGITS = 9; // digits after +994

/**
 * Keep only digits and cap at the 9 local digits, normalising the two ways a
 * number routinely arrives from outside the keypad:
 *
 *   "+994 55 123 45 67" / "994551234567"  ->  "551234567"   (country code)
 *   "055 123 45 67"                       ->  "551234567"   (trunk prefix)
 *
 * Blindly slicing the first 9 digits instead turned a pasted "+994551234567"
 * into "994551234" — which passes validation, because "99" is a real operator
 * code, and signs the user in as a different number entirely.
 *
 * The country code is only stripped when there are MORE digits than a local
 * number holds: "994551234" on its own is a valid Bakcell number, not a
 * prefix. A leading zero is always safe to drop — no operator code starts
 * with one — so it also works while the number is still being typed.
 */
export function sanitizeAzLocal(input: string): string {
  let d = input.replace(/\D/g, '');
  if (d.length > LOCAL_DIGITS && d.startsWith('994')) d = d.slice(3);
  d = d.replace(/^0+/, '');
  return d.slice(0, LOCAL_DIGITS);
}

/** Group local digits for display: "551234567" -> "(55) - 123 - 45 - 67"
 *  (shown next to the "+994" prefix, together reading
 *  "+994 (55) - 123 - 45 - 67"). Partial input formats as it is typed. */
export function formatAzLocal(localDigits: string): string {
  const d = sanitizeAzLocal(localDigits);
  if (!d) return '';
  // The bracket only closes once the operator code is complete, so the
  // caret never jumps past a ")" the user has not "reached" yet.
  const head = d.length < 2 ? `(${d}` : `(${d.slice(0, 2)})`;
  const rest = [d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean);
  return rest.length ? `${head} - ${rest.join(' - ')}` : head;
}

/** Stored E.164 back to the form the app writes everywhere else:
 *  "+994553221121" -> "+994 (55) - 322 - 11 - 21". Anything that is not a
 *  nine-digit Azerbaijani number is returned untouched rather than mangled. */
export function formatAzE164(e164: string | null | undefined): string {
  if (!e164) return '';
  const digits = e164.replace(/\D/g, '');
  const local = digits.length > LOCAL_DIGITS && digits.startsWith('994') ? digits.slice(3) : digits;
  if (local.length !== LOCAL_DIGITS) return e164;
  return `${AZ_DIAL_CODE} ${formatAzLocal(local)}`;
}

export interface AzPhoneResult {
  valid: boolean;
  e164?: string; // "+994553221111"
  error?: string;
}

/** Validate the 9 local digits and return the E.164 number. Normalises its
 *  input the same way the field does, so a number handed straight to this
 *  function (pasted, or restored from storage) is read identically. */
export function validateAzPhone(localDigits: string): AzPhoneResult {
  const d = sanitizeAzLocal(localDigits);
  if (d.length === 0) return { valid: false, error: 'Telefon nömrəsi tələb olunur.' };
  if (d.length < LOCAL_DIGITS)
    return { valid: false, error: 'Nömrə yarımçıqdır (məs. +994 (55) - 123 - 45 - 67).' };
  if (d.length > LOCAL_DIGITS) return { valid: false, error: 'Nömrə çox uzundur.' };
  if (!AZ_OPERATOR_CODES.includes(d.slice(0, 2)))
    return { valid: false, error: 'Operator kodu düzgün deyil (məs. 50, 51, 55, 70, 77, 99).' };
  return { valid: true, e164: `${AZ_DIAL_CODE}${d}` };
}
