# Deploy vəziyyəti və qalan addımlar

**Son yenilənmə: 2026-09-30.** Bu fayl əl ilə saxlanılır — addım tamamlananda
cədvəli yenilə, yoxsa növbəti dəfə oxuyan (insan və ya agent) səhv vəziyyətə
inanacaq.

## Hazırkı vəziyyət

| Mərhələ | Vəziyyət |
|---|---|
| Migrationlar `0031`–`0037` | ✅ əl ilə run olunub |
| Migration `0038` (Payriff-i çıxarır) | ✅ run olunub (2026-10-01) |
| Kod `main`-də | ✅ |
| Edge Function deploy | — qalmadı, hamısı silindi |
| `PAYRIFF_SECRET_KEY` secret | ⏳ **silinməlidir** |
| Android build | ⏳ kart ekranı olmadan yenidən yığılmalıdır |
| Ödəniş provayderi | 🚫 seçilməyib |

## 🚫 Ödəniş provayderi yoxdur

**2026-10-01.** Payriff Card Save funksiyasını bu mərhələdə aktivləşdirmədi
(«hal-hazırki mərhələdə sizin üçün aktivləşdirmək mümkün olmayacaq»), kart
saxlama olmadan isə autoPay işləmir. İnteqrasiya tamamilə çıxarıldı — Edge
Function-lar, kart ekranı, kart cədvəli və Payriff müştərisi silindi.

**Komissiya modeli yerindədir** və hesablanmağa davam edir; yalnız yığım
addımı yoxdur. `docs/PAYMENTS.md` → «Növbəti provayder seçilərkən» bölməsində
müqavilədən əvvəl soruşulmalı suallar var; birinci sual Payriff-in
dayandırdığı məhz həmin məsələdir.

### Qalan addımlar

1. `0038_drop_payriff_integration.sql` migrationını run et
2. Supabase-dən `PAYRIFF_SECRET_KEY` secret-ini sil
3. Yeni Android build (kart ekranı artıq yoxdur)
4. Provayder seçiləndə: yığım addımını yaz və
   `platform_settings.commission_collection_enabled` bayrağını `true` et

### ⚠️ Bayraq barədə

`commission_collection_enabled` **sönülüdür**. 0037 3 iş tamamlananda borc
qalıbsa təklif verməyi bloklayır — amma ödəmək yolu olmadan bu, hər ustanı
4-cü işdə birdəfəlik ilişdirərdi. Yeni provayder qoşulanda bayraq `true`
edilməlidir, yoxsa qayda kağız üzərində qalır.

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

### 1. Secret

Payriff açarı artıq lazım deyil:

```bash
supabase secrets unset PAYRIFF_SECRET_KEY --project-ref <REF>
```

### 2. Edge Function-lar

Qalmadı — hamısı Payriff-ə aid idi və silindi. Yeni provayder seçiləndə
yenidən yazılacaq.

### 3. Tətbiq

```bash
npm install
npx expo start -c    # iOS / Expo Go
npm run build:android
```

Mövcud Android APK kart ekranını hələ də daşıyır — o ekran artıq heç nə ilə
bağlı deyil, ona görə yeni build yığılmalıdır.

## Test ardıcıllığı

Ödəniş hissəsi test ediləsi vəziyyətdə deyil. Payriff-ə toxunmayan yoxlamalar:

1. Müştəri → sifariş → ödəniş üsulu: **«Kart» sönük, «tezliklə»**
2. Usta 1-2 iş tamamlayır → Qazanc-da boz banner «Daha N işdən sonra
   ödənilməlidir»
3. Usta 3-cü işi tamamlayır → qırmızı banner «Komissiya borcu: X AZN —
   ödəniş üsulu hazırlanır»
4. Usta 4-cü işə təklif verə bilir — `commission_collection_enabled` sönülü
   olduğu üçün bloklanmır. Bu, **qəsdən belədir**

## Növbəti addım

Ödəniş provayderi seçmək. `docs/PAYMENTS.md` → «Növbəti provayder
seçilərkən» bölməsindəki doqquz sual müqavilədən əvvəl verilməlidir.
