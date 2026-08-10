-- Jolt — seed data
-- Service categories with a "starting from" minimum price (AZN). Providers must
-- bid at or above this minimum. Ids match the app (src/data/mock.ts) so the UI
-- can switch from mock to live data without changing category keys.

insert into service_categories (id, title, subtitle, icon, min_price, sort_order) values
  ('battery', 'Akkumulyator', 'cərəyan / işə salma',         'battery-charging',  5, 1),
  ('tire',    'Təkər',        'Hava, dəyişmə, deşik',        'disc',              5, 2),
  ('fuel',    'Yanacaq',      'Benzin / dizel çatdırılması', 'droplet',          10, 3),
  ('lockout',     'Açar maşında qalıb', 'Qapı açılması',       'key',               5, 4),
  ('diagnostics', 'Diaqnostika',  'Nasazlığın yoxlanması',   'activity',         10, 5),
  ('other',       'Digər',        'Başqa problem təsvir et', 'tool',              0, 6)
on conflict (id) do update set
  title = excluded.title,
  subtitle = excluded.subtitle,
  icon = excluded.icon,
  min_price = excluded.min_price,
  sort_order = excluded.sort_order;
