# site/ — public landing page

Payriff-in Application formasındakı **App URL** sahəsi üçün. O sahə kod
repo-su üçün deyil: acquirer oradan **nə satıldığını** görməlidir — MCC təyin
etmək, risk qiymətləndirmək və chargeback zamanı mövqeyi müdafiə etmək üçün.
Bu səhifə məhz həmin sualları cavablandırır.

Tək fayldır (`index.html`), xarici asılılığı yoxdur (yalnız Google Fonts), ona
görə istənilən statik hostinqdə işləyir.

## ⚠️ Yayımlamazdan əvvəl doldur

Səhifədə qəsdən boş qoyulmuş yerlər var — uydurmaq olmaz, sən doldurmalısan:

| Yer | Nə yazılmalı |
|---|---|
| `ELAQE@DOMEN.AZ` | real dəstək e-poçtu |
| `+994 XX XXX XX XX` | real əlaqə nömrəsi |
| `ŞİRKƏTİN ÜNVANI` | qeydiyyat ünvanı |
| `ŞİRKƏTİN RƏSMİ ADI` · `VÖEN` | hüquqi ad və VÖEN |

Acquirer bu dördünə xüsusi baxır. Boş və ya uydurma məlumatla müraciət
adətən geri qaytarılır.

## Yayımlamaq

**Netlify Drop** (ən sürətli, repo-nun public olmasını tələb etmir):
<https://app.netlify.com/drop> — `site/` qovluğunu sürüşdür.

**Vercel:**
```bash
npx vercel deploy --prod site
```

**GitHub Pages:** Settings → Pages → Source: `main` branch, `/site` folder.
Qeyd: pulsuz planda yalnız **public** repo üçün işləyir.

## Məzmun dəyişəndə

Səhifədəki qiymətlər `supabase/seed.sql`-dəki `min_price` dəyərlərindən
götürülüb. Onlar dəyişəndə bura da baxılmalıdır — avtomatik bağlantı yoxdur.

Kartla ödəniş aktivləşəndə («Ödəniş» bölməsi) mətn yenilənməlidir: hazırda
səhifə açıq şəkildə «yalnız nağd» yazır, çünki
`platform_settings.card_payments_enabled` `false`-dur.
