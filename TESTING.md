# Testing AutoFix on real Android devices

Expo Go needs the Metro dev server running on a machine the phone can reach, so
it can't be used for testing away from the laptop. The `preview` build profile
produces a standalone APK instead: the JS bundle ships inside it, so the app
runs with the laptop switched off. Supabase is already remote, so two installed
phones talk to the same live database.

## One-time setup

```sh
npm install --global eas-cli
eas login
eas init                 # creates the EAS project, writes extra.eas.projectId
eas update:configure     # writes updates.url + runtimeVersion into app.json
```

### Supabase keys

`.env` is gitignored, and EAS Build does **not** upload local `.env` files — a
build without these set fails at startup with "Supabase env vars missing". Set
them once per environment (or add them on the Expo dashboard under the project's
environment variables):

```sh
eas env:set --name EXPO_PUBLIC_SUPABASE_URL      --value "<url>"      --environment preview --visibility plaintext
eas env:set --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "<anon key>" --environment preview --visibility plaintext
```

Plaintext is correct here: the anon key is public by design and already ships
inside every build. It is only safe because row-level security is enabled on
every table. The `service_role` key must never be set as an `EXPO_PUBLIC_`
variable — it bypasses RLS entirely.

## Build the APK

```sh
npm run build:android
```

EAS returns a download link when the build finishes. Open it on each Android
phone and install (Android warns about apps from outside the Play Store — that
warning is expected for internal distribution).

## Ship JS changes without rebuilding

Anything that is JS-only — screens, styles, business logic in `src/` — goes out
over the air in seconds:

```sh
npm run update:preview
```

Testers get it on next app restart. A **new build** is only needed when native
code changes: adding or upgrading a native module, or editing `app.json` fields
that affect the native project (permissions, plugins, icons, package name).

SQL migrations are independent of both — they apply to Supabase the moment they
are run, for every installed build at once.

## Two-phone test checklist

Register two separate phone numbers; a provider cannot bid on their own request.

- The provider must pick matching categories under **Profil → Xidmət növlərim**
  ("Digər" is exempt and reaches every provider).
- The provider must be toggled online on the dashboard.
- `provider_feed` only returns requests within **8 km** and created in the last
  **15 minutes**. Two phones in different cities will see nothing until the
  radius in `fetchProviderFeed` is raised for the test.
- A customer may only hold one active request at a time; finish or cancel the
  previous one first.

## Known test-mode behaviour

Phone sign-in accepts any number and sends no SMS, and commission is settled
against a fake wallet balance. Both are deliberate placeholders — see the
comments in `src/context/AuthContext.tsx` and migration `0011`.
