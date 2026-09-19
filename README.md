# AutoFix

**Yolda qalma.** Yolda avtomobili xarab olan sürücünü ən yaxın seyyar usta ilə
birləşdirən mobil xidmət — akkumulyator, təkər, yanacaq, açar qalması və
oxşar kiçik nasazlıqlar üçün Uber/Bolt tərzli tələb-təklif modeli.

Tətbiq **canlı Supabase backend-i** üzərində işləyir: telefon nömrəsi ilə
qeydiyyat, PostGIS əsaslı yaxınlıq axtarışı, real vaxt təklif mübadiləsi və
iki tərəfli reytinq artıq qurulub. Hələ **saxta (placeholder)** qalan iki
şey var:

- **Nömrə təsdiqi** — SMS göndərilmir; parol nömrənin özündən törədilir
  (`src/context/AuthContext.tsx`). OTP provayderi qoşulana qədər belə qalır.
- **Ödəniş** — kart ödənişi real şəkildə tutulmur, komissiya saxta pul
  kisəsi balansından bağlanır (migrasiya `0011`).

## Texnologiya

- [Expo](https://expo.dev) SDK 54 + React Native + TypeScript
- React Navigation (native-stack + bottom-tabs)
- [Supabase](https://supabase.com) — Postgres + PostGIS, RLS, Realtime, Auth
- Leaflet + OpenStreetMap (WebView içində) — açar tələb etməyən canlı xəritə
- `react-native-svg` — AutoFix loqosu üçün
- Space Grotesk / Inter / JetBrains Mono (Google Fonts)

## Quraşdırma

```bash
npm install
npm run web      # brauzerdə önizləmə
npm run ios      # yalnız macOS-da
npm run android
```

## Layihə strukturu

```
src/
  theme/        rəng palitrası və tipoqrafiya
  components/   yenidən istifadə olunan UI hissələri (Button, Card, LiveMap, ...)
  data/mock.ts  paylaşılan domen tipləri (kateqoriya siyahısı bazadan gəlir)
  lib/          supabase klienti, api qatı, telefon/plaka/tarix validasiyası
  context/      Auth, Location, Categories + AppContext (rejim və aktiv/passiv)
  navigation/   RootNavigator + müştəri/usta stack və tab naviqasiyaları
  screens/
    onboarding/ giriş slaydları
    auth/       telefon ilə giriş və qeydiyyat
    customer/   xəritə, sifariş yaratma, axtarış, izləmə, reytinq, tarixçə, profil
    provider/   panel (yaxınlıqdakı sorğular), təklif vermə, aktiv iş, qazanc, profil
supabase/
  migrations/   sxem, RLS siyasətləri və biznes qaydası funksiyaları
```

Baza sxemi və qaydalar: [`docs/DATABASE.md`](docs/DATABASE.md).
Real cihazda test: [`TESTING.md`](TESTING.md).

## Əsas axın

Rol əvvəlcədən seçilmir — hər hesab həm müştəri, həm ustadır və tətbiq
daxilində rejimlər arasında keçid edir (Profil → rejim kartı).

**Müştəri:** telefon nömrəsi ilə qeydiyyat → xəritədə problem seç → ünvanı
təsdiqlə → "axtarılır" ekranı → gələn təkliflərdən birini qəbul et → canlı
status (qəbul edildi → yoldadır → çatdı → təmirdə → tamamlandı) → reytinq ver.

**Usta:** Profil → Xidmət növlərim-dən bacarıqları seç → aktiv rejimə keç →
yaxınlıqdakı sorğular lenti → qiymət təklif et → müştəri seçsə iş başlayır →
müştəriyə doğru get → təmirə başla → tamamla → qazancı gör.

Sorğu **8 km** radiusda və son **15 dəqiqə** ərzində yaradılmış olduqda
ustalara görünür; cavabsız qalan sorğu avtomatik olaraq `expired` statusuna
keçir.

## Növbəti addımlar

- **Nömrə təsdiqi:** SMS provayderi + `signInWithOtp` / `verifyOtp`
  (`testModePassword` ilə birlikdə silinir)
- **Ödəniş:** yerli kart provayderi inteqrasiyası; komissiya real tutulsun
- **Push bildiriş:** hazırda usta sorğunu yalnız tətbiq açıq olanda görür —
  15 dəqiqəlik pəncərə ilə birlikdə bu ən böyük məhdudiyyətdir
- **Marşrut:** xəritədə sadəcə nişanlar var, yol xətti yoxdur
  (Directions API və ya OSRM)

## Brend

Loqo və rəng konsepti `assets/brand/` qovluğunda (`autofix-mark.svg`,
`autofix-logo-concept.html`). Əsas rənglər: fon `#0E1116`, əsas vurğu (amber)
`#FFB627`, mətn `#F5F3EE`.
