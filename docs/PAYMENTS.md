# AutoFix — Ödəniş axını

Bu sənəd ustanın komissiya borcunun necə yarandığını, necə tutulduğunu və
kartın necə idarə olunduğunu təsvir edir. SQL tərəfi:
[`supabase/migrations/`](../supabase/migrations), baza sxemi:
[`DATABASE.md`](DATABASE.md).

## İki pul axını

Sistemdə bir-birindən tamamilə fərqli iki axın var. Qarışdırmamaq vacibdir,
çünki hüquqi çəkiləri də fərqlidir.

**A. Usta → AutoFix (komissiya).** Bu, bizim öz xidmət haqqımızdır. Nağd
işlərdə pul müştəridən ustaya birbaşa keçir, usta isə bizə borclu qalır.

**B. Müştəri → Usta (xidmət haqqı).** Kart işlərində pul əvvəlcə bizə gəlir,
ustanın daxili balansına yazılır, sonra ona ödənilir.

Faza 1-də yalnız **A** qurulur. **B** üçün müştəri kart ödənişi və məxaric
lazımdır; Payriff daxili balansın lisenziya tələb etmədiyini bildirib, amma
bu, yazılı təsdiqlə birlikdə saxlanılmalıdır.

## Komissiya: hesablanma və tutulma ayrıdır

**Hesablanma — hər işdə.** İş tamamlananda komissiya `commission_ledger`-ə
ayrıca sətir kimi yazılır. Bu, mühasibatın dəqiq qalması üçündür: hansı işin
nə qədər komissiya verdiyi həmişə görünür.

**Tutulma — hər 3 işdən bir.** Sonuncu hesablaşmadan bəri **3 tamamlanmış iş**
(`status = 'completed'`) yığılanda hesablaşma işə düşür. Ləğv edilmiş və vaxtı
bitmiş sifarişlər sayılmır.

Vaxt limiti **yoxdur**. 2 iş görüb dayanan ustanın borcu növbəti işə qədər
gözləyir. Məbləğlər kiçik olduğu üçün (bir işə 1–4 AZN) bu, qəbul edilən
riskdir.

## Hesablaşma alqoritmi

Borc `X` olsun.

```
1. balansdan  = min(balans, X)
2. kartdan    = X − balansdan
3. kartdan > 0 isə → Payriff AutoPay ilə tut   ← XARİCİ ÇAĞIRIŞ, BİRİNCİ
4. uğurlu olsa → bir tranzaksiyada:
      balansı azalt, borcu sıfırla, ledger-ə yaz, sayğacı sıfırla
5. uğursuz olsa → bazada HEÇ NƏ dəyişmir, usta bloklanır
```

**Sıra təsadüfi deyil.** Kart əməliyyatını geri qaytarmaq mümkün olmadığı
üçün kart **əvvəl** tutulur, baza **sonra** yazılır. Əks halda "balans azaldı,
kart tutulmadı" kimi yarımçıq vəziyyət yaranır.

Əməliyyat **hamısı və ya heç nə**dir: kart rədd edilsə, balansdan da heç nə
silinmir.

Kartdan tutulan hissə varsa, ustaya **bildiriş gedir** — saxlanmış kartdan
avtomatik tutmanın olduğunu bilməlidir.

### Aradakı boşluq

Kart tutuldu, amma bizim baza yazısı uğursuz oldu — pul getdi, borc bağlanmadı.
Bunun üçün cəhd kartdan **əvvəl** `pending` sətir kimi yazılır; uzlaşdırmada
`pending` qalmış və Payriff-də uğurlu görünən sətirlər tapılır.

## Kart

**Məcburidir.** Usta rejiminə keçmək üçün kart bağlamaq şərtdir — kartsız usta
işə başlaya bilmir. Səbəbi sadədir: 3-cü işdə tutulacaq kart olmasa, sistem
ilişir.

**Saxlama.** `POST /api/v3/cards/save` çağırılır, usta `paymentUrl`-ə
yönləndirilir və kart məlumatlarını Payriff-in səhifəsində daxil edir. Real
tutulma olmur — 0.01 AZN yoxlama əməliyyatıdır və avtomatik geri qaytarılır.

`customerRef` olaraq **ustanın `profiles.id`-si** göndərilir. Payriff kartları
məhz bu istinad altında qruplaşdırır, yəni `List Saved Cards` çağıranda
kimin kartları olduğu birbaşa aydın olur.

**Razılıq.** Kart bağlama ekranında usta avtomatik tutmaya açıq razılıq
verməlidir. Bu, həm hüquqi tələbdir, həm də bank mübahisələrində (chargeback)
mövqeyi qoruyur.

**Silmə qaydaları:**

- Son kartı silmək olmaz — əvvəlcə yeni kart əlavə edilməlidir
- Əsas olmayan kartı sərbəst silmək olar
- Əsas kart silinirsə, qalanlardan biri avtomatik əsas olur

Bu qayda "kart məcburidir" şərtinin təbii davamıdır: usta heç vaxt kartsız
qalmır.

## Blok və blokdan çıxma

Blok yalnız **kartdan tutulma uğursuz olanda** qoyulur. Borcun mövcudluğu tək
başına bloklamır — 1-ci və 2-ci işdən sonra borc var, amma usta işləyir.

Bloklanmış usta yeni sorğu görmür. Buradan çıxmaq üçün **avtomatik tutulmanı
gözləmək mümkün deyil**: tutulma 3-cü işdə işə düşür, iş isə görə bilmir.
Ona görə blok ekranında üç seçim olmalıdır:

| Düymə | Nə edir |
|---|---|
| **Yenidən cəhd et** | Eyni borcu eyni kartdan yenidən tutmağa çalışır |
| **Yeni kart əlavə et** | Kart saxlama axını, sonra avtomatik yenidən cəhd |
| **Kartı sil** | Köhnə/işləməyən kartı çıxarır (son kart deyilsə) |

Usta məbləğ yazmır və seçmir — sistem borcu bilir. Bu, "balansa mədaxil"
deyil, uğursuz əməliyyatın təkrarıdır.

Əlavə olaraq **fon təkrarı**: bloklanmış ustaların kartı gündə bir dəfə
avtomatik yoxlanır. Usta kartına pul atıb app-i açmasa belə, ertəsi gün özü
açılır.

## Məxaric (Faza 2)

- Yalnız 3 tamamlanmış işdən sonra — hər işdən sonra çıxarışın qarşısını alır
- Yalnız komissiya borcu sıfır olduqda
- Payriff `Payout` ilə ustanın kartına

Balans yalnız müştərinin kartla ödədiyi işlərdən dolduğu üçün bu hissə **B
axını ilə birlikdə** açılır.

## Payriff endpoint xəritəsi

| Nə üçün | Endpoint | Vəziyyət |
|---|---|---|
| Kart saxlama | `POST /api/v3/cards/save` | ✅ sənədləşib |
| Saxlama nəticəsi | Get Card Save Status | ⏳ səhifə gözlənilir |
| Kart siyahısı | List Saved Cards | ⏳ |
| Kart silmə | Delete Saved Card | ⏳ |
| Komissiya tutulması | `POST /api/v3/autoPay` | ⏳ |
| Təsdiqləmə | `GET /api/v3/orders/{orderId}` | ✅ |
| Geri qaytarma | `POST /api/v3/refund` | ✅ |
| Məxaric | `POST /api/v3/payout` | Faza 2 |

Bütün çağırışlar `Authorization: <secret key>` başlığı ilə gedir — `Bearer`
prefiksi yoxdur.

## Etibar modeli

**Callback-ə inanmırıq.** Payriff nə ödəniş, nə də kart saxlama callback-ini
imzalayır. Callback yalnız "bu əməliyyatı yoxla" siqnalıdır; statusu həmişə
Payriff-in öz API-sindən oxuyuruq (`GET /orders/{id}`, `Get Card Save
Status`). Saxta callback ən pis halda hələ də `pending` olan bir əməliyyatı
təkrar oxutdurur.

**Secret key serverdədir.** Bütün Payriff çağırışları Supabase Edge
Function-dan gedir. `EXPO_PUBLIC_*` dəyişənləri APK-dan oxunduğu üçün açar
heç vaxt tətbiqdə olmur.

**Pul yazan funksiyalar kilidlidir.** Balansı və borcu dəyişən SQL
funksiyalarının icazəsi `anon` və `authenticated` rollarından geri alınır,
yalnız `service_role`-a verilir.

**İdempotentlik.** Hər hesablaşma sətri kilidlənir və `pending` olmayan hər
şey səssizcə qaytarılır — callback iki dəfə gəlsə, pul bir dəfə hərəkət edir.

## Açıq suallar

- **Tariflər.** Komissiya faizi və **əməliyyat başına sabit haqq** hələ
  bilinmir. Sabit haqq varsa, 1.5 AZN-lik komissiya tutmaq iqtisadi cəhətdən
  mənasız ola bilər — o halda hesablaşma dövrünü 3 işdən çox etmək lazım gələr.
- **`app-key` və secret key.** Kart saxlama sənədində `{{app-key}}`, Authorization
  səhifəsində "merchant secret key" yazılıb. Eyni dəyər olduğu güman edilir,
  dashboard-da açar alınanda təsdiqlənməlidir.
- **Sandbox.** `sbpay.payriff.com` domeni sandbox-a işarə edir; test açarları
  alınmalıdır.
- **Fiskal sənəd.** Fərdi sahibkar kimi xidmət satışında e-qaimə/kassa
  öhdəliyi ola bilər. Bu, Payriff-dən kənar mövzudur — mühasiblə
  dəqiqləşdirilməlidir.
