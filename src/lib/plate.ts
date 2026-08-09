// Azerbaijani license plate handling.
//
// Format: NN-LL-NNN — a 2-digit region code, 2 Latin letters, 3 digits,
// e.g. 90-XX-000 / 10-AB-777. We keep a raw (dashless, uppercase) string of up
// to 7 characters and render it grouped.

const REGION_LEN = 2; // digits
const SERIES_LEN = 2; // letters
const NUMBER_LEN = 3; // digits
const RAW_LEN = REGION_LEN + SERIES_LEN + NUMBER_LEN; // 7

/**
 * Keep only characters valid for each position (digits, letters, digits) and
 * cap at 7 — this stops invalid or extra characters as the user types.
 */
export function sanitizeAzPlate(input: string): string {
  const chars = input.toUpperCase().replace(/[^0-9A-Z]/g, '').split('');
  let out = '';
  for (const ch of chars) {
    const pos = out.length;
    if (pos >= RAW_LEN) break;
    if (pos < REGION_LEN) {
      if (/[0-9]/.test(ch)) out += ch;
    } else if (pos < REGION_LEN + SERIES_LEN) {
      if (/[A-Z]/.test(ch)) out += ch;
    } else if (/[0-9]/.test(ch)) {
      out += ch;
    }
  }
  return out;
}

/** Group raw plate chars for display: "90XX000" -> "90-XX-000". */
export function formatAzPlate(raw: string): string {
  const r = sanitizeAzPlate(raw);
  const parts = [r.slice(0, 2), r.slice(2, 4), r.slice(4, 7)];
  return parts.filter(Boolean).join('-');
}

export interface AzPlateResult {
  valid: boolean;
  value?: string; // formatted "90-XX-000"
  error?: string;
}

/** Validate a fully-entered plate. Position types are already enforced by
 *  sanitizeAzPlate, so only the length can be wrong. */
export function validateAzPlate(raw: string): AzPlateResult {
  const r = sanitizeAzPlate(raw);
  if (r.length === 0) return { valid: false, error: 'Dövlət nömrəsi tələb olunur.' };
  if (r.length < RAW_LEN) return { valid: false, error: 'Nömrə tam deyil (məs. 90-XX-000).' };
  return { valid: true, value: formatAzPlate(r) };
}
