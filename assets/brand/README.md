# AutoFix — loqo

Hamısı `node scripts/build-logo.mjs` ilə yaradılır. Fayllara əl ilə toxunma —
skripti dəyiş və yenidən işə sal, yoxsa variantlar bir-birindən ayrılacaq.

Nişanın forması tətbiqin çəkdiyi ilə **eyni mənbədəndir**
(`src/components/Logo.tsx`), ona görə ixrac edilmiş fayl və işləyən tətbiq
fərqlənə bilmir.

## Hansı fayl nə üçün

| Fayl | İstifadə |
|---|---|
| `autofix-mark.svg` | Veb, sənəd, çap — **vektor, ilk seçim** |
| `autofix-mark-1024.png` | Store ikonu, böyük ölçülər |
| `autofix-mark-512.png` | Play Store ikonu, sosial şəbəkə avatarı |
| `autofix-mark-256.png` | Kiçik ikon, e-poçt imzası |
| `autofix-mark-cream.svg` / `-cream-1024.png` | Rəngli və ya şəkilli fon üçün açıq variant |
| `autofix-lockup-dark.svg` | Nişan + «AutoFix» — tünd fon |
| `autofix-lockup-light.svg` | Nişan + «AutoFix» — açıq fon |
| `brand-sheet.html` | Hamısını bir yerdə göstərir; şrift içindədir, brauzerdə aç |

PNG-lərin fonu **şəffafdır** və altıbucaqlı kəsik də şəffafdır — yəni nişan
istənilən fona qoyula bilər və kəsikdən fon görünür.

## Sözlü variant barədə

`autofix-lockup-*.svg` fayllarında mətn **canlı mətndir**, əyri (outline)
deyil. Yəni Space Grotesk Bold quraşdırılmayan maşında başqa şriftlə görünəcək.

Bu, bilərəkdəndir: şrift olmadan hərf formalarını dəqiq çevirmək mümkün deyil,
səhv hərf forması isə şrift tələb edən fayldan pisdir. Sözlü variant PNG kimi
lazım olanda `brand-sheet.html`-i brauzerdə aç — şrift faylın içinə yığılıb,
yəni internetsiz də düzgün görünür — və oradan ixrac et.

## Qaydalar

- Nişanın ətrafında ən azı öz hündürlüyünün dörddə biri qədər boşluq
- Əzmə, döndərmə, kölgə və ya kontur əlavə etmə
- Rəngli/şəkilli fonda `-cream` variantı
- 24px-dən kiçik ölçülərdə yalnız nişan, sözsüz

## Rənglər

| | |
|---|---|
| Amber | `#FFB627` |
| Fon | `#0E1116` |
| Krem | `#F5F3EE` |
