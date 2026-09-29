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
    message: 'Komissiya kartından tutulmadı. Qazanc bölməsindən yenidən cəhd et.',
  },
  { match: /not a provider/i, message: 'Əvvəlcə Profil → Xidmət növlərim bölməsindən xidmət seç.' },
  { match: /request is not open|no longer open/i, message: 'Bu sorğu artıq aktiv deyil.' },
  { match: /request not found|offer not found/i, message: 'Sorğu tapılmadı — yəqin ləğv edilib.' },
  { match: /price below minimum of ([\d.]+)/i, message: 'Təklif minimum qiymətdən aşağı ola bilməz.' },
  { match: /not your request|not your job|not a participant/i, message: 'Bu sorğu sənə aid deyil.' },
  { match: /can no longer be cancelled/i, message: 'Bu iş artıq ləğv edilə bilməz.' },
  {
    match: /pickup code is wrong/i,
    message: 'Kod yanlışdır. Müştəridən bir daha soruş.',
  },
  {
    match: /too far from pickup: (\d+) m/i,
    message: 'Hələ məkana çatmamısan. "Çatdım" yalnız müştərinin yanında işləyir.',
  },
  {
    match: /location fix is stale|no location fix/i,
    message: 'Yerin təyin olunmadı. GPS-i yoxla və bir neçə saniyə gözlə.',
  },
  {
    match: /no pickup code/i,
    message: 'Bu sifariş üçün kod yaradılmayıb. Müştəri ilə əlaqə saxla.',
  },
  { match: /cannot move backwards|invalid status transition/i, message: 'Bu addım artıq keçilib.' },
  { match: /job is not active/i, message: 'İş artıq aktiv deyil.' },
  { match: /is not completed/i, message: 'Sifariş hələ tamamlanmayıb.' },
  { match: /invalid category/i, message: 'Bu xidmət növü artıq mövcud deyil.' },
  {
    match: /card payments are not available/i,
    message: 'Kartla ödəniş hazırlanır. Hələlik nağd seç.',
  },

  // --- Cards and commission ---
  {
    match: /no usable card/i,
    message: 'Əvvəlcə Profil → Ödəniş kartları bölməsindən kart əlavə et.',
  },
  {
    match: /cannot remove the only card/i,
    message: 'Yeganə kartını silə bilməzsən. Əvvəlcə yeni kart əlavə et.',
  },
  {
    match: /card has a settlement in progress/i,
    message: 'Bu kartla ödəniş davam edir. Bitənə qədər gözlə.',
  },
  { match: /card is not usable/i, message: 'Bu kart hələ təsdiqlənməyib.' },
  { match: /card not found|unknown card save/i, message: 'Kart tapılmadı.' },
  { match: /nothing to settle/i, message: 'Ödəniləcək komissiya borcun yoxdur.' },
  {
    match: /settlement is not due yet/i,
    message: 'Komissiya hər 3 tamamlanmış işdən sonra tutulur.',
  },
  { match: /unknown settlement/i, message: 'Ödəniş qeydi tapılmadı.' },
  {
    match: /awaiting a result|still awaiting/i,
    message: 'Əvvəlki ödənişin nəticəsi gözlənilir. Bir azdan yenidən yoxla.',
  },
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

// --- Payriff / bank wording -------------------------------------------------
//
// A failed charge arrives as free text from two directions: Payriff's own
// documented ResultMessages, and whatever the issuing bank wrote in
// responseDescription. Both are English, and the second one is not a list we
// control. The point of splitting this from errorMessage is that the advice
// differs: some of these the usta can fix (top up, use another card), and the
// rest are ours to fix — for those, saying "try again shortly" is honest and
// naming the real cause would only mislead.

const GATEWAY_RULES: { match: RegExp; message: string }[] = [
  // The usta can act on these.
  {
    match: /insufficient fund|not sufficient|no funds|insufficient balance/i,
    message: 'Kartda kifayət qədər vəsait yoxdur.',
  },
  // Ordered before the generic ones: "Link is expired!" and "Token expired"
  // are ours, not the card's, and are matched further down.
  { match: /expired card|card (has )?expired/i, message: 'Kartın müddəti bitib.' },
  {
    match: /lost card|stolen card|restricted card|card blocked|blocked card|pick.?up card/i,
    message: 'Bank bu kartı bloklayıb. Başqa kart əlavə et.',
  },
  {
    match: /limit|exceed/i,
    message: 'Kartın limiti aşılıb. Bankla danış və ya başqa kart əlavə et.',
  },
  {
    match: /do not hono|not permitted|transaction not allowed|refer to card issuer/i,
    message: 'Bank əməliyyata icazə vermədi. Bankla danış və ya başqa kart yoxla.',
  },
  {
    match: /invalid card|invalid pan|invalid account|no such card|card not found/i,
    message: 'Kart məlumatları qəbul edilmədi. Kartı yenidən əlavə et.',
  },
  {
    match: /3-?d.?secure|3ds|authentication failed|cardholder|not enrolled/i,
    message: 'Kart təsdiqlənmədi. Kartı yenidən əlavə et.',
  },

  // Payriff's own documented wording — these are our side, not the usta's.
  {
    match: /internal error|occurred problem with processing|system error/i,
    message: 'Ödəniş sistemində texniki xəta oldu. Bir azdan yenidən cəhd et.',
  },
  {
    match: /unauthorized|token (not present|is not active|expired)|invalid token|username or password/i,
    message: 'Ödəniş sistemi ilə əlaqə qurulmadı. Bir azdan yenidən cəhd et.',
  },
  {
    match: /invalid origin|invalid procedure|client code is invalid|validation error|invalid parameters/i,
    message: 'Ödəniş sorğusu qəbul edilmədi. Bir azdan yenidən cəhd et.',
  },
  { match: /link is expired/i, message: 'Ödəniş linkinin vaxtı bitib. Yenidən başla.' },
  {
    match: /no record found|no invoice found|application not found|user not found|not found/i,
    message: 'Ödəniş qeydi tapılmadı. Bir azdan yenidən cəhd et.',
  },
  { match: /timeout|timed out|network/i, message: 'Bankla əlaqə kəsildi. Yenidən cəhd et.' },
  { match: /declined|decline|rejected/i, message: 'Bank ödənişdən imtina etdi.' },
];

/** Azerbaijani wording for a gateway or bank failure reason.
 *  Unrecognised text is never shown: an usta reading "Do not honour" learns
 *  nothing, and the raw string can carry order ids and internal detail. */
export function gatewayMessage(
  raw: string | null | undefined,
  fallback = 'Kartdan tutulmadı. Kartını yoxla və yenidən cəhd et.'
): string {
  if (!raw) return fallback;
  for (const rule of GATEWAY_RULES) {
    if (rule.match.test(raw)) return rule.message;
  }
  return fallback;
}
