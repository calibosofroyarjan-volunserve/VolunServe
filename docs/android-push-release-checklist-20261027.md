# VolunServe Android Push Release Checklist

This implementation is coded but NOT live until the Firebase configuration, APK, and device tests pass.

## Native source
- `expo-notifications@~0.32.17` for Expo SDK 54; `app.json` plugin and Android-specific code via `.android.ts` to protect the web export.
- `lib/androidNativePush.android.ts` asks for permission only when the user selects **Enable alerts** in Notifications; obtains the **native Android FCM token** (not an Expo token) and sends it to the authenticated Firebase callable.
- `lib/useAndroidPushNavigation.android.ts` handles push taps after session/role validation; never opens arbitrary payload routes.
- `functions/index.js` validates role, stores token in admin-only Firestore registry, transfers token ownership on shared-device login, sends generic privacy-safe push for new notification inbox records, and removes invalid tokens.
- `lib/firebaseAuth.ts` best-effort unregisters on normal logout without blocking signout forever.
- iPhone PWA Web Push is a separate transport and is NOT activated by these Android files.

## Configure Android Firebase before creating the APK
1. Firebase console -> VolunServe project -> Project Settings -> Your Apps. Register/select **Android package** `com.froyarjan123.volunserve`. Download that **project's** `google-services.json`.
2. Supply the file to EAS using a file-type environment secret named `GOOGLE_SERVICES_JSON`, OR put the correct `google-services.json` locally at repository root for a local build. `app.config.js` detects it; without it the native FCM token flow cannot be verified.
3. Never commit a Firebase Admin service-account private key, FCM private credential JSON, or unrelated personal files. `google-services.json` is only Android client configuration.
4. Ensure the Firebase project actually has Cloud Messaging enabled and that the Firebase Functions service account can call FCM HTTP v1. Backend uses Firebase Admin SDK `getMessaging()`.
5. `npm ci` and `npx tsc --noEmit`, then `npx expo export --platform web` and the Android JS export.
6. Build a new signed Android APK from the verified integration commit with `eas build -p android --profile preview`, install on a real Android device. Expo Go cannot validate Android remote push for SDK 54.
7. Sign in to an authorized test account; open Notifications -> Enable alerts -> grant OS permission -> confirm registration succeeds. An actual Firestore `notifications/{id}` event for THAT user should deliver a generic lock-screen message.
8. Test foreground, background, killed app, disabled OS permissions, login/logout, switching to a second user on the same phone, duplicate/invalid token, poor network, and tapping a notification. Check private inbox and Firestore rules throughout.
9. Test the published web export independently; it must not load Android native push SDK. The in-app inbox remains available even if phone push fails.
10. Deployment requires explicit separate approval for Functions, web and Android distribution. Do not deploy rules/functions in a blind Hosting-only release.

## Known limits
- Native Android push still needs real Firebase/EAS configuration and device validation. No production push delivery is claimed yet.
- Application token opt-in is not a substitute for server authorization. Firebase Auth and ownership checks are applied server-side. Firebase native App Check attestation is **not yet configured**; do not claim it is.
- Notifications are best effort, may be delayed by OS battery management, network or FCM; Firestore inbox remains authoritative.
- iOS installed website PWA requires separate HTTPS Web Push subscription/VAPID, service worker and supported iOS versions.
