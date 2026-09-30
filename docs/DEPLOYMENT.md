# Deploy vəziyyəti və qalan addımlar

**Son yenilənmə: 2026-09-30.** Bu fayl əl ilə saxlanılır — addım tamamlananda
cədvəli yenilə, yoxsa növbəti dəfə oxuyan (insan və ya agent) səhv vəziyyətə
inanacaq.

## Hazırkı vəziyyət

| Mərhələ | Vəziyyət |
|---|---|
| Migrationlar `0031`–`0035` | ✅ Supabase Dashboard SQL editorundan **əl ilə** run olunub |
| Kod `main`-də | ✅ |
| Edge Function deploy | ✅ 7/7 `ACTIVE` (2026-09-29) |
| `PAYRIFF_SECRET_KEY` secret | ✅ qoyulub (2026-09-30) |
| Android build (kart axını ilə) | ✅ `54581b4c` (2026-09-29) |
| Canlı test | ⏳ sandbox açarı ilə başlayır |

## ⚠️ Migrationlar barədə

Layihə **heç vaxt `supabase link` edilməyib** — repo-da `supabase/config.toml`
yoxdur. Migrationlar Dashboard-un SQL editorundan əl ilə tətbiq olunub, yəni
Supabase-in `supabase_migrations.schema_migrations` cədvəli onlardan
xəbərsizdir.

**`supabase db push` İŞLƏTMƏ.** O, `0001`-dən başlayıb hamısını yenidən
tətbiq etməyə çalışacaq. Aşağıdakı əmrlərin hamısında `--project-ref` var; o,
link tələb etmir.

Yeni migration yazılanda: faylı repo-ya əlavə et, sonra **mətnini istifadəçiyə
ver** ki, Dashboard-dan run etsin. Özün tətbiq etməyə çalışma.

## Qalan addımlar

**1–3-cü addımlar tamamlanıb** (2026-09-29/30), aşağıda arayış üçün saxlanılır.
Layihə ref-i: `wvyeoaygnatawcdzqcpx`.

Yeganə qalan iş — aşağıdakı **test ardıcıllığı**.

### 1. Secret ✅

```bash
supabase login
supabase secrets set PAYRIFF_SECRET_KEY=<merchant secret key> --project-ref <REF>
```

- `PAYRIFF_BASE_URL` **qoyma.** Kodda düzgün default var
  (`https://api.payriff.com/api/v3`). Payriff sandbox üçün ayrıca URL verməyib;
  ehtimal ki mühiti açarın özü müəyyən edir.
- `PAYRIFF_MERCHANT_ID` **qoyma.** Payriff tələb etdiyini deyənə qədər lazım
  deyil; qoyulmasa sorğuya heç göndərilmir.
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` avtomatik
  gəlir.

### 2. Edge Function-lar ✅

```bash
supabase functions deploy start-card-save       --project-ref <REF>
supabase functions deploy check-card-save       --project-ref <REF>
supabase functions deploy delete-card           --project-ref <REF>
supabase functions deploy sync-cards            --project-ref <REF>
supabase functions deploy settle-commission     --project-ref <REF>
supabase functions deploy payriff-card-callback    --project-ref <REF> --no-verify-jwt
supabase functions deploy payriff-payment-callback --project-ref <REF> --no-verify-jwt
```

Son iki əmrdəki `--no-verify-jwt` **mütləqdir**: Payriff callback göndərəndə
JWT-si olmur, o bayraq olmasa callback 401 alıb çatmaz. Təhlükəsizlik itkisi
yoxdur — callback-ə onsuz da inanmırıq, statusu həmişə Payriff API-sindən
yenidən oxuyuruq (bax `docs/PAYMENTS.md` → Etibar modeli).

### 3. Tətbiq ✅

```bash
npm install          # expo-web-browser yeni native paketdir
npx expo start -c    # iOS / Expo Go
npm run build:android
```

Mövcud Android APK-nı yeniləmək **bəs etmir** — o, `expo-web-browser` əlavə
olunmazdan əvvəl yığılıb və native modulu yoxdur. EAS Update də həll etmir,
çünki yalnız JS göndərir.

## Test ardıcıllığı

Sandbox test kartı `docs/PAYMENTS.md`-dədir.

1. Usta hesabı → Profil → **Ödəniş kartları** → Kart əlavə et → Payriff
   səhifəsi açılmalıdır
2. Kart məlumatlarını gir → brauzer bağlanır, ekran özü Payriff-i sorğulayır
3. **«Kart əlavə olundu»** — yalnız `REVERSED` uğur sayılır
4. 0.01 AZN tutulub dərhal qaytarılmalıdır (Payriff özü qaytarır)
5. Yeganə kartı silməyə çalış → «Yeganə kartını silə bilməzsən»
6. Kartsız usta ilə təklif ver → kart tələb edən xəta
7. 1-2 iş tamamla → Qazanc-da boz banner «Daha N işdən sonra tutulacaq»
8. 3-cü işi tamamla → banner qırmızı «Ödə»yə keçir
9. «Ödə» → balansdan, çatmayan hissə kartdan tutulur

**Addım 3 `VERIFIED`-də ilişib qalsa:** bu `REVERSE_FAILED` deməkdir. Hazırda
belə kartı yararsız sayırıq — qərarı dəyişmə, Payriff-in cavabını gözlə.

**Addım 9 xəta versə:** Dashboard → Edge Functions → `settle-commission` →
Logs. `autoPay failed`/`autoPay unresolved` sətrində `paymentStatus` və bankın
cavabı görünür.

## Payriff-ə göndərilmiş, cavab gözlənilən suallar

Cavab gələndə `docs/PAYMENTS.md` → «Açıq suallar» bölməsi yenilənməlidir.

1. autoPay-də 3D Secure tələb oluna bilərmi? *(ən vacibi — «hə» olarsa blok
   qaydası dəyişməlidir, çünki usta öz günahı olmadan bloklanar)*
2. autoPay-də idempotency key dəstəyi varmı?
3. `REVERSE_FAILED` kartı yararlıdırmı?
4. Saxlanmış kartın müddəti bitəndə nə olur?
5. autoPay-də `merchant` parametri məcburidirmi? *(Create Order-də belə bir
   parametr yoxdur — gözlənilən cavab «lazım deyil»)*
6. Sandbox üçün ayrıca base URL varmı? *(Create Order-in `paymentUrl`-i
   `sbpay.payriff.com`-a işarə edir, yəni API hostu eyni qalır)*
7. `PaymentStatus` enum-u ilə Order Information-un `PAID/PENDING/FAILED`
   dəyərləri niyə uyğun gəlmir?
8. Əməliyyat başına minimum haqq və minimum məbləğ?
9. Vəsaitin hesaba oturma müddəti, payout tələbləri?

Cavab gəlməyincə **bu sahələrdə kod dəyişmə** — hazırkı davranış bilərəkdən
ehtiyatlıdır və səbəbləri `docs/PAYMENTS.md`-də yazılıb.
