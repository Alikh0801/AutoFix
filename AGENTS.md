# Read these first

- `docs/DEPLOYMENT.md` — nə tətbiq olunub, nə qalıb, və nəyi etməməli. Ödəniş
  və ya migration işinə başlamazdan əvvəl oxu.
- `docs/PAYMENTS.md` — komissiya modeli və Payriff inteqrasiyası. Hər qərarın
  səbəbi orada yazılıb; dəyişməzdən əvvəl səbəbi oxu.
- `docs/DATABASE.md` — sxem.

**Migrationları özün tətbiq etmə.** Layihə `supabase link` edilməyib və
`supabase db push` hər şeyi sıfırdan tətbiq etməyə çalışar. Yeni migration
faylını repo-ya əlavə et, mətnini istifadəçiyə ver — o, Dashboard-dan run
edəcək.

# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Git branch naming

Do not prefix branch names with `claude/`. Name new branches directly after
the feature or fix they contain (e.g. `fix-license-copyright`,
`add-payment-flow`).

Open a **separate branch for each distinct task** — do not stack unrelated
changes onto one branch. Start each new task from an up-to-date `main`.
