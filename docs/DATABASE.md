# Jolt — Verilənlər bazası dizaynı (Faza 1)

Bu sənəd Supabase (PostgreSQL + PostGIS) sxemini izah edir.
SQL: [`supabase/migrations/`](../supabase/migrations), [`supabase/seed.sql`](../supabase/seed.sql).

## Biznes modeli (sxemə köçürülüb)

- **"X AZN-dən başlayan" minimum qiymət** — `service_categories.min_price`.
- **Ustalar təklif verir (bidding)** — minimumdan aşağı olmayan öz qiymətləri.
  Yolda qalan sürücü **bütün yaxın ustaların qiyməti + məsafəsi + reytinqini**
  görüb sərbəst seçir.
- **Ustalar bir-birinin təklifini görmür** (RLS). **"Rədd" yoxdur** — biri qəbul
  ediləndə qalanlar **avtomatik bağlanır** (`closed`), o ustalar "sorğu artıq
  aktiv deyil" görür.
- **Pilləli sabit komissiya** (faiz yox): ilk 5 AZN üçün 1 AZN, sonra hər +5
  AZN-ə +0.5 AZN, limitsiz.
- **İki ödəniş üsulu — hər ikisi:**
  - **Nağd:** müştəri pulu birbaşa ustaya verir → usta komissiyanı platformaya
    **borclu** qalır → ödəyənə qədər **bloklu**.
  - **Kart:** ödəniş app-dan keçir → komissiya avtomatik tutulur → usta xalis
    məbləği app-daxili **pul kisəsinə** alır → blok yoxdur.

## Pilləli komissiya (düstur)

| Qiymət | Komissiya | | Qiymət | Komissiya |
|--------|-----------|-|--------|-----------|
| ≤ 5 | 1.0 | | 16–20 | 2.5 |
| 6–10 | 1.5 | | 21–25 | 3.0 |
| 11–15 | 2.0 | | hər +5 | +0.5 |

Parametrlər `platform_settings`-də (`price_step`, `base_commission`,
`commission_step`) — kodu dəyişmədən redaktə oluna bilər. `commission_for(price)`.

## Nağd nümunəsi (sənin dediyin)

7 AZN-lik iş, **nağd**: müştəri 7-ni ustaya verir → komissiya = 1.5 →
`commission_balance = 1.5`, usta **bloklanır** → usta 1.5-i ödəyir →
`commission_balance = 0`, blok qalxır. (Xalis qazanc 5.5 nağd ustadadır.)

**Kart** olsaydı: 7 kartla keçər → 1.5 avtomatik tutular → `wallet_balance +=
5.5`, blok olmaz.

## Cədvəllər

| Cədvəl | Nə | Görünürlük |
|--------|-----|-----------|
| `platform_settings` | Komissiya parametrləri | oxu |
| `profiles` | İstifadəçi (auth.users 1:1) | ad/avatar public |
| `vehicles` | Müştərinin avtomobilləri | yalnız sahib |
| `service_categories` | Xidmət növləri + min_price | public |
| `provider_profiles` | Usta: online, lokasiya, reytinq, jobs_done | **public** |
| `provider_wallets` | **commission_balance, wallet_balance, is_blocked** | **yalnız özü** |
| `provider_skills` | Ustanın bacardığı növlər | public |
| `requests` | Sorğu + həyat dövrü + **payment_method** + agreed_price | tərəflər |
| `offers` | Hər ustanın **gizli** təklifi | usta özü + müştəri |
| `ratings` | İki tərəfli qiymətləndirmə | tərəflər |
| `commission_ledger` | Platformanın pul izi | yalnız usta özü |

> Maliyyə məlumatı (`provider_wallets`) ayrıca gizli cədvəldədir — başqa
> istifadəçilər ustanın balansını/borcunu görə bilməz.

## Funksiyalar (RPC)

| Funksiya | Kim | Nə edir |
|----------|-----|---------|
| `submit_offer(request_id, price)` | Usta | Təklif verir (bloksuz, açıq sorğu, ≥ minimum, **öz sorğusu deyil**) |
| `accept_offer(offer_id)` | Müştəri | Birini seçir; digərlərini bağlayır |
| `complete_request(request_id)` | Tərəflər | İşi bitirir; **nağd→borc+blok**, **kart→pul kisəsi** |
| `pay_commission(amount)` | Usta | Nağd komissiya borcunu ödəyir; blok qalxır |
| `submit_rating(request_id, stars, comment)` | Tərəflər | Yalnız tamamlanmış işdə **qarşı tərəfi** qiymətləndirir |
| `commission_for(price)` | daxili | Qiymətə görə komissiya |
| `nearby_open_requests(lat,lng,radius)` | Usta | Yaxın açıq sorğular (**öz sorğuları görünmür**) |

## Fırıldağın qarşısı (self-dealing)

Bir istifadəçi eyni sorğuda həm müştəri, həm usta ola bilməz — beləcə özünə
saxta reytinq yaza bilməz:

- `submit_offer` öz sorğuna təklif verməyə icazə vermir.
- `nearby_open_requests` öz sorğularını usta lentində göstərmir.
- `accept_offer` öz təklifini qəbul etməyə imkan vermir (əlavə qoruma).
- Reytinq yalnız `submit_rating` ilə verilir: iş **tamamlanmış** olmalı, verən
  **iştirakçı** olmalı, qiymət **qarşı tərəfə** yazılır (`rater ≠ ratee` bazada
  məcburidir). Birbaşa `ratings`-ə yazmaq bağlıdır.

## Sorğu axını

```
Müştəri sorğu açır (nağd/kart seçir) → insert requests ('searching')
Yaxın (bloksuz) ustalar görür         → RLS
Hər usta təklif verir                 → submit_offer()  (bir-birini görmür)
Müştəri təkliflərə baxır, seçir       → accept_offer() → qalanlar 'closed'
Canlı izləmə                          → current_location + Supabase Realtime
İş bitir                              → complete_request() → nağd:borc+blok / kart:pul kisəsi
Nağd: usta komissiya ödəyir           → pay_commission() → blok qalxır
```

## Açıq / gələcək

- **Kart ödənişi** real işləməsi üçün ödəniş provayderi + qeydiyyatlı şirkət
  lazımdır (Faza 3). Sxem hazırdır; MVP-də nağd axını tam qururuq, kart
  sonra qoşulur. `wallet_balance`-dan çıxarış (payout) funksiyası da Faza 3.
- `cancel_request()` və reytinq yenilənməsi funksiyaları.

## Növbəti addımlar

- Supabase layihəsi yaratmaq → 2 migrasiya + seed tətbiq etmək.
- App-da Supabase client qurub `src/data/mock.ts`-i real data ilə əvəz etmək.
