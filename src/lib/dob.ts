// Date-of-birth entry: GG.AA.İİİİ (DD.MM.YYYY), stored/validated as ISO
// (YYYY-MM-DD). Same sanitize/format/validate shape as phone.ts and plate.ts.

const RAW_LEN = 8; // DDMMYYYY
const MIN_AGE = 16;
const MAX_AGE = 100;

export function sanitizeDob(input: string): string {
  return input.replace(/\D/g, '').slice(0, RAW_LEN);
}

export function formatDob(raw: string): string {
  const r = sanitizeDob(raw);
  const parts = [r.slice(0, 2), r.slice(2, 4), r.slice(4, 8)];
  return parts.filter(Boolean).join('.');
}

/** "YYYY-MM-DD" -> "GG.AA.İİİİ", for displaying a value already on file. */
export function isoToDisplay(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return null;
  return `${d}.${m}.${y}`;
}

export interface DobResult {
  valid: boolean;
  iso?: string;
  error?: string;
}

export function validateDob(raw: string): DobResult {
  const r = sanitizeDob(raw);
  if (r.length === 0) return { valid: false, error: 'Doğum tarixi tələb olunur.' };
  if (r.length < RAW_LEN) return { valid: false, error: 'Tarix tam deyil (GG.AA.İİİİ).' };

  const day = Number(r.slice(0, 2));
  const month = Number(r.slice(2, 4));
  const year = Number(r.slice(4, 8));

  const date = new Date(year, month - 1, day);
  const isRealDate = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  if (!isRealDate) return { valid: false, error: 'Tarix düzgün deyil.' };

  const now = new Date();
  const hadBirthdayThisYear = now >= new Date(now.getFullYear(), month - 1, day);
  const age = now.getFullYear() - year - (hadBirthdayThisYear ? 0 : 1);
  if (age < MIN_AGE) return { valid: false, error: `Ən azı ${MIN_AGE} yaş olmalısan.` };
  if (age > MAX_AGE) return { valid: false, error: 'Tarix düzgün deyil.' };

  const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { valid: true, iso };
}
