# AutoFix

**Yolda qalma.** Yolda avtomobili xarab olan sürücünü ən yaxın seyyar usta ilə
birləşdirən mobil xidmət — akkumulyator, təkər, yanacaq, açar qalması və
oxşar kiçik nasazlıqlar üçün Uber/Bolt tərzli tələb-təklif modeli.

Bu repo hazırda **UI/UX prototipidir**: bütün ekranlar və naviqasiya axını
mock (saxta) data üzərində qurulub, real backend, autentifikasiya və ya
xəritə SDK-sı hələ qoşulmayıb.

## Texnologiya

- [Expo](https://expo.dev) + React Native + TypeScript
- React Navigation (native-stack + bottom-tabs)
- `react-native-svg` — AutoFix loqosu və xəritə mock-ları üçün
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
  components/   yenidən istifadə olunan UI hissələri (Button, Card, MapMock, ...)
  data/mock.ts  xidmət kateqoriyaları, mock ustalar, sifarişlər
  context/      AppContext — rol seçimi və aktiv sifariş axınının simulyasiyası
  navigation/   RootNavigator + müştəri/usta stack və tab naviqasiyaları
  screens/
    onboarding/ giriş slaydları
    auth/       rol seçimi, telefon/OTP (mock)
    customer/   xəritə, sifariş yaratma, axtarış, izləmə, reytinq, tarixçə, profil
    provider/   panel (yaxınlıqdakı sorğular), sorğu qəbulu, aktiv iş, qazanc, profil
```

## Əsas axın

**Müştəri:** rol seç → telefon/OTP → xəritə üzərində problem seç → ünvanı
təsdiqlə → "axtarılır" ekranı → usta tapılır → canlı status (qəbul edildi →
yoldadır → çatdı → təmirdə → tamamlandı) → reytinq ver.

**Usta:** rol seç → telefon/OTP → aktiv/passiv rejim → yaxınlıqdakı sorğular
lenti → sorğunu qəbul et (sayğaclı) → müştəriyə doğru get → təmirə başla →
tamamla → qazancı gör.

## Növbəti addımlar (backend inteqrasiyası üçün)

Prototip fazasından sonra real məhsula keçid üçün tövsiyə olunan yığın:

- **Backend:** Node.js + TypeScript + PostgreSQL (Prisma) + Socket.io (real-time
  sifariş/lokasiya yayımı üçün)
- **Auth:** telefon nömrəsi ilə OTP (SMS provayderi ilə)
- **Xəritə:** Google Maps SDK (`react-native-maps` + Directions/Places API)
- **Ödəniş:** yerli kart provayderi inteqrasiyası

Bu addımlar hələ tətbiq olunmayıb — hazırkı kod bazası yalnız interfeys və
naviqasiya axınını nümayiş etdirir.

## Brend

Loqo və rəng konsepti `assets/brand/` qovluğunda (`autofix-mark.svg`,
`autofix-logo-concept.html`). Əsas rənglər: fon `#0E1116`, əsas vurğu (amber)
`#FFB627`, mətn `#F5F3EE`.
