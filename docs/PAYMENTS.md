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
tutulma olmur — 0.01 AZN yoxlama əməliyyatıdır və Payriff onu **server
tərəfində özü geri qaytarır** (`REVERSED`). Bizdən ayrıca `refund` sorğusu
tələb olunmur; sənəd bunu açıq yazır. Ona görə kodda 0.01 AZN üçün heç bir
geri qaytarma məntiqi yoxdur və olmamalıdır.

**Alternativ yol (indi istifadə olunmur).** `Create Order` və
`Pre-Authorization` sorğularına `cardSave: true` göndərməklə kartı **real
ödənişin yan təsiri kimi** saxlamaq mümkündür — ayrıca yoxlama əməliyyatı
olmadan. Usta üçün bu yaramır, çünki usta ödəmir, pul alır. Amma müştəri
kartını saxlamaq lazım gələrsə (təkrar ödənişləri bir toxunuşla etmək üçün),
düzgün yol məhz budur — ayrıca Card Save axını yox.

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

### Üç nəticə, iki yox

`PaymentStatus` enum-unda «bitməyib» mənasına gələn dəyərlər var: `PENDING`,
`ACCEPTED`, `CREATED` və `PREAUTH_APPROVED`. Bunları uğursuz saymaq pulu
tutulmuş ola bilən ustanı bloklayır; uğurlu saymaq isə tutulmamış borcu
bağışlayır. Ona görə üçüncü hal var: **`unresolved`** — hesablaşma `pending`
qalır, usta bloklanmır, və `order_id` sətirdə saxlanılır.

`order_id`-nin saxlanması təkrar tutulmanın qarşısını alır. İdempotentlik
açarı təsdiqlənməyib, ona görə açıq sifarişi olan hesablaşma üçün funksiya
ikinci dəfə autoPay çağırmır — ustaya «gözlə» deyir.

**Yalnız `APPROVED` «pul bizimdir» deməkdir.** `PREAUTH_APPROVED` pulu yalnız
bloklayır; tutmaq üçün ayrıca `COMPLETE` əməliyyatı lazımdır, olmasa
`PREAUTH_EXPIRED` olub azad olunur. Onu uğur saymaq borcu real olmayan pula
qarşı bağlamaq olardı.

Diqqət: enum `PREAUTH_APPROVED`-dir (alt xətt). Defisli `PREAUTH-APPROVED`
gateway dəyərləri cədvəlinə aiddir və bu sahədə heç vaxt görünmür.

`unresolved` hal **avtomatik həll olunur**: açıq `order_id` olan hesablaşma
üçün `settle-commission` ikinci dəfə autoPay çağırmır, `GET /orders/{orderId}`
ilə nəticəni soruşur. Yalnız qəti cavab (`PAID`/`APPROVED` və ya
`FAILED`/`DECLINED`) hesablaşmanı bağlayır; hələ emaldadırsa və ya tanınmayan
dəyər gəlirsə, sətir açıq qalır və usta bloklanmır.

Üçüncü bir yoxlama da var: ödəniş "paid" görünsə belə, məbləğ gözlənilən
məbləğlə üst-üstə düşmürsə (məsələn qismən tutulma), hesablaşma bağlanmır və
log-a `AMOUNT MISMATCH` yazılır. Səhv məbləğə görə borcu bağlamaq, borcu
bağlamamaqdan pisdir.

**Diqqət — üçüncü lüğət.** Enum Reference `PaymentStatus`-u
`APPROVED`/`DECLINED` kimi sadalayır, Order Information isə `PAID`/`PENDING`/
`FAILED` qaytarır — bu dəyərlər həmin enum-da ümumiyyətlə yoxdur. Payriff-in
öz sənədləri bir-biri ilə ziddiyyət təşkil edir, ona görə `classifyPaymentStatus`
hər iki dəsti qəbul edir və tanımadığı dəyəri **uğursuz yox, `unresolved`**
sayır.

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

## İqtisadiyyat

Payriff-in tarifləri (2026-09 tarixində şifahi olaraq bildirilib, müqavilədə
təsdiqlənməlidir):

| Kart | Faiz |
|---|---|
| Kapital Bank | 3.5% |
| Digər yerli banklar | 3.8% |
| Xarici banklar | 4.5% |

**Sabit haqq qeyd olunmayıb.** Bu, hesablaşma dövrü barədə əvvəlki narahatlığı
aradan qaldırır: faiz miqyasdan asılı deyil, yəni 3 işi bir əməliyyatda tutmaq
komissiyaya heç nə qazandırmır. 3 iş qaydası **yalnız istifadəçi rahatlığı**
üçün qalır (usta hər işdən sonra tutulma bildirişi almır, uğursuz tutulma şansı
üç dəfə az yaranır) — xərc arqumenti yoxdur. Yenə də **minimum əməliyyat haqqı**
(məsələn «ən azı 0.20 AZN») soruşulmalıdır; belə bir döşəmə varsa, 3 iş qaydası
onu üç dəfə seyrəldir və yenidən iqtisadi məna qazanır.

Bizim komissiyamız faiz deyil, **pilləli sabit məbləğdir** (`commission_for`):
≤5 → 1.0, 6–10 → 1.5, 11–15 → 2.0 … Effektiv dərəcə heç vaxt 10%-dən aşağı
düşmür, yəni Payriff-in ən bahalı 4.5%-indən həmişə yuxarıdır. Model işləyir.

### Nağd iş kartlı işdən sərfəlidir

Bu, gözlənilməzdir və qərar tələb edir. Kartlı işdə Payriff **müştərinin
ödənişindən** faizini götürür, biz isə ustanın balansına **tam qiyməti**
yazırıq — yəni acquiring haqqını tamamilə özümüz udmuş oluruq. Nağd işdə isə
Payriff yalnız komissiyanın özündən faiz alır.

| Qiymət | Komissiya | Nağd: bizə qalan | Kartlı: bizə qalan (3.8%) |
|---|---|---|---|
| 5 | 1.00 | 0.96 | 0.81 |
| 10 | 1.50 | 1.44 | 1.12 |
| 20 | 2.50 | 2.40 | 1.74 |
| 50 | 5.50 | 5.29 | 3.60 |
| 100 | 10.50 | 10.10 | 6.70 |

50 AZN-lik işdə fərq 32%-dir. Üstəlik bu, təşviq etmək istədiyimiz ödəniş
növünü — kartı — cəzalandırır.

**Qərar: haqqı biz udurıq.** Acquiring xərci ustanın komissiyasına əlavə
edilmir və müştəriyə ötürülmür; usta balansına tam razılaşdırılmış qiymət
yazılır. Ödəniş axını olduğu kimi qalır. Bu, bilərəkdən seçilmiş marja
itkisidir — ustaya verilən söz sadə qalsın deyə ("razılaşdığın qiyməti tam
alırsan"), və kart ödənişi cəzalandırılmasın deyə.

Nəticəsi: kartlı işlərin payı artdıqca ümumi marja aşağı düşür. Qiymət
siyasətini qurarkən bu nəzərə alınmalıdır — cədvəldəki "kartlı" sütunu real
gəlirdir, "nağd" sütunu deyil.

Qeyd: müştərinin hansı bankın kartı ilə ödədiyini saxlamırıq, ona görə real
acquiring xərcini iş-iş hesablaya bilmirik. Bu qərar dəyişməyincə lazım deyil.

## Açıq suallar

- **Minimum əməliyyat haqqı və minimum məbləğ.** Faizlər məlumdur, amma
  əməliyyat başına döşəmə haqq varmı və autoPay-in minimum məbləği nədir —
  hər ikisi 3 iş qaydasına təsir edir.
- **`app-key` və secret key.** Kart saxlama sənədində `{{app-key}}`, Authorization
  səhifəsində "merchant secret key" yazılıb. Eyni dəyər olduğu güman edilir,
  dashboard-da açar alınanda təsdiqlənməlidir.
- **Sandbox.** `sbpay.payriff.com` domeni sandbox-a işarə edir; test açarları
  alınmalıdır.
- **`REVERSE_FAILED`.** Kart təsdiqlənib, amma 0.01 AZN geri qaytarılmayıb. Bu
  kart AutoPay üçün yararlıdırmı? Hazırda **yararsız** sayırıq — yalnız
  `REVERSED` işlək kart hesab olunur. Bu, ehtiyatlı seçimdir: səhv olsa, usta
  artıq kart əlavə etmək məcburiyyətində qalır; əksi isə komissiyanın
  tutulmadığı anda üzə çıxar. **Card Save → Overview səhifəsində izah
  yoxdur** — yalnız Payriff cavab verə bilər.
- **3D Secure.** Saxlanmış kartdan tutulma zamanı emitent 3DS tələb edə
  bilərmi? Sənədin heç bir səhifəsində bu barədə söz yoxdur. Bizim axında usta
  tutulma anında telefonda olmaya bilər, yəni 3DS çıxarsa əməliyyat uğursuz
  olar və usta öz günahı olmadan bloklanar. Baş verirsə, blok qaydası
  dəyişməlidir.
- **Kartın müddəti.** `List Saved Cards` nə bitmə tarixi, nə status qaytarır;
  Overview də bu barədə susur. Yəni kartın öldüyünü yalnız tutulma anında
  bilirik — `sync-cards` yalnız Payriff kartı siyahıdan çıxarsa kömək edir.
- **`merchant` parametri.** AutoPay sorğusunda tələb olunub-olunmadığı aydın
  deyil; kodda `PAYRIFF_MERCHANT_ID` varsa göndərilir, yoxsa yox.
- **Fiskal sənəd.** Fərdi sahibkar kimi xidmət satışında e-qaimə/kassa
  öhdəliyi ola bilər. Bu, Payriff-dən kənar mövzudur — mühasiblə
  dəqiqləşdirilməlidir.
