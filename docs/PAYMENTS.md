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
| Saxlama nəticəsi | `GET /api/v3/cards/save/{cardSaveId}` | ✅ |
| Kart siyahısı | `GET /api/v3/cards/save?customerRef=` | ✅ |
| Kart silmə | `DELETE /api/v3/cards/{cardUuid}` | ✅ |
| Komissiya tutulması | `POST /api/v3/autoPay` | ✅ |
| Təsdiqləmə | `GET /api/v3/orders/{orderId}` | ✅ |
| Geri qaytarma | `POST /api/v3/refund` | ✅ |
| Məxaric | `POST /api/v3/payout` | Faza 2 |

Bütün çağırışlar `Authorization: <secret key>` başlığı ilə gedir — `Bearer`
prefiksi yoxdur.

### İki fərqli "uğur" lüğəti

Bu, inteqrasiyanın ən təhlükəli yeridir və Payriff sənədi bunu açıq yazır:
**ResultCode API əməliyyatının texniki nəticəsidir, ödənişin nəticəsi deyil.**
Yəni `code: "00000"` yalnız "sorğu düzgün emal olundu" deməkdir — həmin
cavabın içində rədd edilmiş bir ödəniş ola bilər.

| Lüğət | Harada | Dəyərlər |
|---|---|---|
| ResultCode | zərfin `code` sahəsi | `00000` SUCCESS, `01000` WARNING, `15000` ERROR, `15400` INVALID_PARAMETERS, `14010` UNAUTHORIZED, `14013` TOKEN_NOT_PRESENT, `14014` INVALID_TOKEN, `14015` INVALID_ORIGIN, `666` CHECKING |
| Gateway dəyəri | `payload` içində | `00`, `APPROVED`, `PREAUTH-APPROVED` |

Kodda bu iki lüğət ayrı funksiyalardır: `isSuccess()` yalnız zərfə baxır,
`isGatewayApproved()` isə bankın cavabına. Pulun hərəkət edib-etmədiyi qərarı
**heç vaxt** zərfin `code`-undan verilmir.

`01000` (WARNING) uğur sayılır, çünki əməliyyat baş tutub — amma log-a
yazılır, yoxsa baxılmayan xəbərdarlıq yalnız nəyəsə baha başa gələndə üzə çıxar.

### Bank mətninin tərcüməsi

Uğursuz tutulmanın səbəbi iki mənbədən gəlir: Payriff-in öz sənədləşmiş
mesajları və bankın `responseDescription` mətni. İkincisi bizim idarə
etmədiyimiz, ingiliscə və çox vaxt anlaşılmaz mətndir ("Do not honour").
`errors.ts` içindəki `gatewayMessage()` onu Azərbaycan dilinə çevirir və
tanımadığı mətni **heç vaxt** olduğu kimi göstərmir.

Ayrılığın səbəbi məsləhətin fərqli olmasıdır: bir hissəsini usta özü həll edə
bilər (kartda pul yoxdur, kartın müddəti bitib), qalanı isə bizim tərəfimizin
problemidir — orada "bir azdan yenidən cəhd et" demək düzgündür, əsl səbəbi
yazmaq isə ustanı yanlış yönləndirər.

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
- **`REVERSE_FAILED`.** Kart təsdiqlənib, amma 0.01 AZN geri qaytarılmayıb. Bu
  kart AutoPay üçün yararlıdırmı? Hazırda **yararsız** sayırıq — yalnız
  `REVERSED` işlək kart hesab olunur. Bu, ehtiyatlı seçimdir: səhv olsa, usta
  artıq kart əlavə etmək məcburiyyətində qalır; əksi isə komissiyanın
  tutulmadığı anda üzə çıxar. Payriff-dən dəqiqləşdirilməlidir.
- **`merchant` parametri.** AutoPay sorğusunda tələb olunub-olunmadığı aydın
  deyil; kodda `PAYRIFF_MERCHANT_ID` varsa göndərilir, yoxsa yox.
- **Fiskal sənəd.** Fərdi sahibkar kimi xidmət satışında e-qaimə/kassa
  öhdəliyi ola bilər. Bu, Payriff-dən kənar mövzudur — mühasiblə
  dəqiqləşdirilməlidir.
