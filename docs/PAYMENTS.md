# AutoFix — Ödəniş axını

Komissiya modeli və onun hazırkı vəziyyəti. Model provayderdən asılı deyil —
hansı ödəniş şirkəti ilə işlənsə də qaydalar eyni qalır. Dəyişən yalnız
**yığım addımıdır**, və o addım hazırda yoxdur.

> **Vəziyyət (2026-10-01).** Payriff inteqrasiyası çıxarıldı: Card Save
> funksiyasını bu mərhələdə aktivləşdirmədilər, kart saxlama olmadan isə
> avtomatik tutma mümkün deyil. Yeni provayder axtarılır. Komissiya
> **hesablanmağa davam edir**, amma **yığılmır**.

## İki pul axını

Sistemdə bir-birindən tamamilə fərqli iki axın var. Qarışdırmamaq vacibdir,
çünki hüquqi çəkiləri də fərqlidir.

**A. Usta → AutoFix (komissiya).** Bizim xidmət haqqımız. Nağd işlərdə pul
müştəridən ustaya birbaşa keçir, usta isə bizə borclu qalır.

**B. Müştəri → Usta (xidmət haqqı).** Kart işlərində pul əvvəlcə bizə gəlir,
ustanın daxili balansına yazılır, sonra ona ödənilir.

Faza 1-də yalnız **A** qurulur. **B** üçün müştəri kart ödənişi və məxaric
lazımdır.

**B qurulana qədər kart ödənişi bağlıdır.**
`platform_settings.card_payments_enabled` default `false`-dur;
`create_request` kart sorğusunu rədd edir və tətbiq seçimi «tezliklə» kimi
göstərir.

Səbəb sadəcə yarımçıqlıq deyil. `complete_request` kartlı işdə ustanın
balansına **tam qiyməti** yazır — real kart ödənişinin mənası budur. Amma
ödəniş heç yerdə yaradılmır, yəni müştəri «Kart» seçəndə **heç nə tutulmur**.
Nəticədə müştəri xidməti pulsuz alır, AutoFix isə ustaya gəlməmiş pulu borclu
qalır — usta həmin balansdan komissiyasını «ödəyir» və Faza 2-də onu çıxara
bilər. Bunun üçün heç bir hack lazım deyildi, seçim tətbiqin özündə idi.

## Komissiya: hesablanma və tutulma ayrıdır

Bu ayrılıq modelin özəyidir.

**Hesablanma** hər tamamlanmış işdə baş verir: `complete_request`
`commission_ledger`-ə sətir yazır və `provider_wallets.commission_balance`-ı
artırır. Kitablar hər iş üzrə dəqiq qalır.

**Tutulma** hər **3 tamamlanmış işdən** sonra baş verir
(`platform_settings.settlement_every`). Usta hər işdən sonra bildiriş almır,
uğursuz tutulma şansı üç dəfə az yaranır.

**Blok** yalnız ödəniş alınmayanda. Hesablaşmalar arasında borclu olmaq
normaldır; ödəyə bilməmək isə yox.

## Hesablaşma alqoritmi

1. `begin_settlement()` — nə qədər borc olduğunu hesablayır, balansdan nə
   qədər gedəcəyini və qalanını ayırır, `commission_settlements`-ə `pending`
   sətir yazır. **Heç nə hərəkət etmir.**
2. **Yığım addımı** — provayder vasitəsilə pul alınır. ⚠️ **Hazırda yoxdur.**
3. `complete_settlement()` — hamısı-və-ya-heç: ödəniş alınmayıbsa balans da
   silinmir və usta bloklanır. Yalnız `service_role` çağıra bilər, çünki
   `p_charged = true` real borcu bağışlayır.

### Niyə bu ardıcıllıqla

Ödəniş geri qaytarıla bilmir, tranzaksiya isə qaytarıla bilir. Əks ardıcıllıqla
«balansdan tutuldu, ödəniş alınmadı» vəziyyəti yaranır və onu heç nə düzəldə
bilmir.

## 3 iş qaydası və blok

`submit_offer` iki yerdə dayandırır:

- **`is_blocked`** — ödəniş cəhdi olub və alınmayıb
- **Kvota dolub, borc qalıb** — 3 iş tamamlanıb, borc ödənilməyib

İkincisi `platform_settings.commission_collection_enabled` bayrağının
arxasındadır və **hazırda sönülüdür**. Səbəb: ustanın ödəmək imkanı olmadan
onu bloklamaq hər ustanı 4-cü işdə birdəfəlik ilişdirmək deməkdir. Borc
yığılmağa davam edir, kitablar düzgün qalır — yalnız maneə həllini gözləyir.

**Yeni provayder qoşulanda bu bayraq `true` edilməlidir.** Yoxsa qayda
kağız üzərində qalır.

## Məxaric (Faza 2)

Usta 3 tamamlanmış işdən sonra balansını çıxara bilər, **yalnız komissiya
borcu sıfır olanda**. Həm hər işdən sonra məxaric sorğusunun qarşısını alır,
həm də borcu olan ustanın pul çıxarmasına yol vermir.

## Etibar modeli

**Callback-ə inanmırıq.** Ödəniş provayderləri callback-lərini həmişə
imzalamır. Callback yalnız «bu əməliyyatı yoxla» siqnalı sayılmalıdır; status
həmişə provayderin öz API-sindən oxunmalıdır. Saxta callback ən pis halda
hələ də `pending` olan bir əməliyyatı təkrar oxutdurur.

**Açar serverdə qalır.** Bütün provayder çağırışları Supabase Edge
Function-dan getməlidir. `EXPO_PUBLIC_*` dəyişənləri APK-dan oxunur, yəni açar
heç vaxt tətbiqdə olmamalıdır.

**Pul yazan funksiyalar kilidlidir.** Balansı və borcu dəyişən SQL
funksiyalarının icazəsi `anon` və `authenticated` rollarından geri alınır,
yalnız `service_role`-a verilir.

**İdempotentlik.** Hər hesablaşma sətri kilidlənir və `pending` olmayan hər
şey səssizcə qaytarılır — callback iki dəfə gəlsə, pul bir dəfə hərəkət edir.

## İqtisadiyyat

Komissiyamız faiz deyil, **pilləli sabit məbləğdir** (`commission_for`):
≤5 → 1.0, 6–10 → 1.5, 11–15 → 2.0 … Effektiv dərəcə heç vaxt **10%-dən aşağı
düşmür**, yəni tipik acquiring faizlərindən (3–5%) həmişə yuxarıdır. Model
istənilən provayderlə müsbət qalır.

### Nağd iş kartlı işdən sərfəlidir

Bu, gözlənilməzdir və yadda saxlanmalıdır. Kartlı işdə provayder **müştərinin
ödənişindən** faizini götürür, biz isə ustanın balansına **tam qiyməti**
yazırıq — yəni acquiring haqqını tamamilə özümüz udmuş oluruq. Nağd işdə isə
faiz yalnız komissiyanın özündən alınır.

**Qərar: haqqı biz udurıq.** Acquiring xərci ustanın komissiyasına əlavə
edilmir və müştəriyə ötürülmür. Bu, bilərəkdən seçilmiş marja itkisidir —
ustaya verilən söz sadə qalsın deyə («razılaşdığın qiyməti tam alırsan») və
kart ödənişi cəzalandırılmasın deyə.

Nəticəsi: **kartlı işlərin payı artdıqca ümumi marja aşağı düşür.** B axını
açılanda qiymət siyasəti bunu nəzərə almalıdır.

## Növbəti provayder seçilərkən

Payriff məhz bu səbəbdən yararsız oldu, ona görə müqavilədən əvvəl
soruşulmalıdır:

1. **Kart saxlama (card-on-file) və avtomatik tutma yeni merchant üçün
   açılırmı?** Payriff «hal-hazırki mərhələdə mümkün deyil» dedi — bu, bütün
   modeli dayandırdı. İlk sual budur.
2. Açılmırsa, **hansı şərtlə açılır** — dövriyyə, müddət, hüquqi şəxs statusu?
3. **Ödəniş linki ilə yığım** mümkündürmü? Avtomatik tutma olmasa da, usta
   hostlanan səhifədə özü ödəyə bilər — model işləyər, sadəcə əl ilə.
4. Saxlanmış kartdan tutulmada **3D Secure** tələb oluna bilərmi? Usta tutulma
   anında telefonda olmaya bilər.
5. **İdempotentlik açarı** var? Cavab itəndə təkrar sorğu ikinci dəfə
   tutmamalıdır.
6. Əməliyyatı sonradan **id ilə yoxlamaq** mümkündürmü? Cavab itəndə yeganə
   bərpa yolu budur.
7. **Minimum məbləğ və əməliyyat başına sabit haqq.** Bizdə tutulacaq
   məbləğlər 2–5 AZN arası olacaq.
8. **Sandbox** mühiti və test açarları.
9. Vəsaitin hesaba oturma müddəti və **payout** (məxaric) tələbləri.

1 və 3 həlledicidir: ikisindən biri «yox» olarsa, həmin provayderlə bu model
qurulmur.

## Açıq suallar

- **Fiskal sənəd.** Fərdi sahibkar kimi xidmət satışında e-qaimə/kassa
  öhdəliyi ola bilər. Ödəniş provayderindən kənar mövzudur — mühasiblə
  dəqiqləşdirilməlidir.
- **Daxili balans və lisenziya.** Müştəri pulunu saxlamaq (B axını) Azərbaycan
  qanunvericiliyində lisenziya tələb edə bilər. Şifahi təminat kifayət deyil —
  yazılı təsdiq alınmalıdır.
