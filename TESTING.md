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

## Push notifications (one-time, before the next build)

Push is the only thing in the app that cannot ship over the air —
`expo-notifications` is a native module, so it needs a fresh APK, and Android
needs Firebase credentials behind it.

1. **Firebase**: create a project at [console.firebase.google.com](https://console.firebase.google.com),
   add an Android app with package name `az.autofix.app`, download
   **`google-services.json`** and put it at the repo root. It only holds public
   identifiers, so it is safe to commit.
2. **Service account key**: Firebase → Project settings → Service accounts →
   *Generate new private key*. This one is a secret and is gitignored.
3. **Upload it to EAS**:
   ```sh
   eas credentials
   # Android → preview → Google Service Account
   #   → Manage your Google Service Account Key for Push Notifications (FCM V1)
   #   → Set up a new key → Upload a new service account key
   ```
4. **Enable `pg_net`** in Supabase: Dashboard → Database → Extensions → search
   `pg_net` → enable. Migration `0027` refuses to run without it, because the
   notifications are sent straight from Postgres triggers.
5. Run migration `0027_push_notifications.sql`, then build a new APK.

Notifications are sent by the database, not the app: a new request wakes every
online, unblocked, in-range provider whose skills match; a new offer wakes the
customer; job status changes and cancellations wake the other party. Nothing
is sent to whoever caused the change.

Expo Go cannot receive remote notifications on Android (SDK 53+) — the preview
APK is the only way to test this.

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
- **Push:** lock the provider's phone, create a request from the other one, and
  the provider should get "Yeni sorğu". If nothing arrives, check Supabase
  → Logs → Postgres for a `send_push failed` warning; a silent absence usually
  means no token was registered (permission denied, or an Expo Go build).

## Known test-mode behaviour

Phone sign-in accepts any number and sends no SMS, and commission is settled
against a fake wallet balance. Both are deliberate placeholders — see the
comments in `src/context/AuthContext.tsx` and migration `0011`.
