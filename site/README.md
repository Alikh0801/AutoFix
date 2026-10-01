# site/ — public landing page

Ödəniş provayderinə müraciət edərkən **App URL / Company website** sahəsi
üçün. O sahə kod repo-su üçün deyil: acquirer oradan **nə satıldığını**
görməlidir — MCC təyin etmək, risk qiymətləndirmək və chargeback zamanı
mövqeyi müdafiə etmək üçün. Bu səhifə məhz həmin sualları cavablandırır.

Tək fayldır (`index.html`), xarici asılılığı yoxdur (yalnız Google Fonts), ona
görə istənilən statik hostinqdə işləyir.

## ⚠️ Əlaqə bölməsi hələ yoxdur

Dəstək e-poçtu, telefon, ünvan, hüquqi ad və VÖEN hazır olmadığı üçün
**çıxarılıb** — yarımçıq və ya uydurma məlumat göstərməkdənsə heç nə
göstərmək yaxşıdır.

Amma bu, müvəqqəti olmalıdır. Acquirer üçün əlaqə və hüquqi rekvizitlər
adi bir detal deyil: şikayət və chargeback zamanı müştərinin kiminlə
danışacağını onlar bilmək istəyir. Müraciət qəbul olunduqdan sonra
soruşulacağını gözlə.

Hazır olanda bu bölməni geri qaytar:

```html
<section id="elaqe" class="contact">
  <h2>Əlaqə</h2>
  <p class="sub">Sual, şikayət və ya əməkdaşlıq üçün:</p>
  <p>
    E-poçt: <a href="mailto:...">...</a><br>
    Telefon: <a href="tel:+994...">+994 ...</a><br>
    Ünvan: ...
  </p>
</section>
```

və footer-ə hüquqi adı və VÖEN-i əlavə et. `.contact` CSS sinfi faylda
saxlanılıb, silinməyib.

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
