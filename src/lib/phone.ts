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

/** Keep only digits and cap at the 9 local digits. */
export function sanitizeAzLocal(input: string): string {
  return input.replace(/\D/g, '').slice(0, LOCAL_DIGITS);
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

export interface AzPhoneResult {
  valid: boolean;
  e164?: string; // "+994553221111"
  error?: string;
}

/** Validate the 9 local digits and return the E.164 number. */
export function validateAzPhone(localDigits: string): AzPhoneResult {
  const d = localDigits.replace(/\D/g, '');
  if (d.length === 0) return { valid: false, error: 'Telefon nömrəsi tələb olunur.' };
  if (d.length < LOCAL_DIGITS)
    return { valid: false, error: 'Nömrə yarımçıqdır (məs. +994 (55) - 123 - 45 - 67).' };
  if (d.length > LOCAL_DIGITS) return { valid: false, error: 'Nömrə çox uzundur.' };
  if (!AZ_OPERATOR_CODES.includes(d.slice(0, 2)))
    return { valid: false, error: 'Operator kodu düzgün deyil (məs. 50, 51, 55, 70, 77, 99).' };
  return { valid: true, e164: `${AZ_DIAL_CODE}${d}` };
}
