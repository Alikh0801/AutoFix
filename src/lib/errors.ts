// Turning backend errors into something an Azerbaijani-speaking driver can act
// on. The business rules live in Postgres functions, which raise in English
// ("You already have an active request"), and several screens used to render
// `e.message` straight into the UI.

const RULES: { match: RegExp; message: string }[] = [
  // --- Auth ---
  {
    match: /invalid login credentials|invalid email or password/i,
    message: 'E-poçt və ya şifrə yanlışdır.',
  },
  {
    match: /email not confirmed/i,
    message: 'E-poçt ünvanın təsdiqlənməyib. Qeydiyyatı tamamla.',
  },
  {
    match: /user already registered|already been registered/i,
    message: 'Bu e-poçt ünvanı artıq qeydiyyatdadır. Daxil ol.',
  },
  {
    match: /token has expired|otp_expired|expired/i,
    message: 'Kodun vaxtı bitib. Yeni kod istə.',
  },
  { match: /invalid token|token is invalid|otp/i, message: 'Kod yanlışdır. Yenidən yoxla.' },
  {
    match: /for security purposes|only request this after|rate limit|too many requests/i,
    message: 'Çox tez-tez cəhd etdin. Bir az gözlə və yenidən yoxla.',
  },
  {
    match: /password should be|weak password/i,
    message: 'Şifrə kifayət qədər güclü deyil.',
  },
  { match: /unable to validate email|invalid email/i, message: 'E-poçt ünvanı düzgün deyil.' },
  {
    match: /error sending confirmation|smtp|failed to send/i,
    message: 'Təsdiq məktubu göndərilmədi. Bir azdan yenidən cəhd et.',
  },
  {
    match: /profiles_phone_key/i,
    message: 'Bu telefon nömrəsi artıq başqa hesabda qeydiyyatdadır.',
  },

  // --- Business rules ---
  {
    match: /already have an active request/i,
    message: 'Artıq aktiv sifarişin var. Əvvəlcə onu bitir və ya ləğv et.',
  },
  {
    match: /provider is blocked|unpaid commission/i,
    message: 'Ödənilməmiş komissiya borcun var. Təklif vermək üçün Qazanc bölməsindən borcu bağla.',
  },
  { match: /not a provider/i, message: 'Əvvəlcə Profil → Xidmət növlərim bölməsindən xidmət seç.' },
  { match: /request is not open|no longer open/i, message: 'Bu sorğu artıq aktiv deyil.' },
  { match: /request not found|offer not found/i, message: 'Sorğu tapılmadı — yəqin ləğv edilib.' },
  { match: /price below minimum of ([\d.]+)/i, message: 'Təklif minimum qiymətdən aşağı ola bilməz.' },
  { match: /not your request|not your job|not a participant/i, message: 'Bu sorğu sənə aid deyil.' },
  { match: /can no longer be cancelled/i, message: 'Bu iş artıq ləğv edilə bilməz.' },
  { match: /cannot move backwards|invalid status transition/i, message: 'Bu addım artıq keçilib.' },
  { match: /job is not active/i, message: 'İş artıq aktiv deyil.' },
  { match: /is not completed/i, message: 'Sifariş hələ tamamlanmayıb.' },
  { match: /invalid category/i, message: 'Bu xidmət növü artıq mövcud deyil.' },
  { match: /not signed in|jwt|session/i, message: 'Sessiyanın vaxtı bitib. Yenidən daxil ol.' },
  { match: /network|fetch failed|timeout/i, message: 'Şəbəkə xətası. İnternet bağlantını yoxla.' },
  { match: /duplicate key|unique constraint/i, message: 'Bu məlumat artıq mövcuddur.' },
  { match: /violates foreign key/i, message: 'Bu məlumat başqa qeydlərdə istifadə olunur, silinə bilmir.' },
];

/** Azerbaijani message for a backend error, with a safe generic fallback.
 *  Anything unrecognised is NOT echoed to the user: raw Postgres text is
 *  noise at best and leaks schema details at worst. */
export function errorMessage(e: unknown, fallback = 'Xəta baş verdi. Yenidən cəhd et.'): string {
  const raw = typeof e === 'string' ? e : (e as any)?.message;
  if (!raw) return fallback;
  for (const rule of RULES) {
    if (rule.match.test(raw)) return rule.message;
  }
  return fallback;
}
