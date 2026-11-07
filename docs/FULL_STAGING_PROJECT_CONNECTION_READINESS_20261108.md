# VolunServe Full Staging — project-specific connection readiness (NOT DEPLOYED)

Date: 2026-11-08, Asia/Manila.
Status: **STAGING PUBLIC CONFIG VERIFIED; APPLICATION WIRING / HOSTED E2E BLOCKED**. No production changes.

## Screenshot-verified project identity

- Firebase display name: `VolunServe Full Staging`
- Firebase project ID: `volunserve-full-staging`; DIFFERENT from production `volunserve-3aa5b` and the older auth-only project `volunserve-auth-staging`.
- Registered Web App: `VolunServe Full Staging Web`
- Web App sender ID: `429213950126`; Web app ID: `1:429213950126:web:955dbf575697826b674d3f`
- Auth Domain: `volunserve-full-staging.firebaseapp.com`; Storage Bucket configuration name: `volunserve-full-staging.firebasestorage.app`. The existence of a bucket value in Web SDK config **does not** mean that an actual Cloud Storage bucket has been provisioned.
- Web API key exists in the user's Firebase console; it is a publicly exposed client identifier, **not** an Admin service-account credential. It is intentionally not repeated in this repository document.
- Firebase Authentication: Email/Password and Google providers enabled, confirmed in the user's console.
- Firebase Auth authorized domains: `localhost`, `volunserve-full-staging.firebaseapp.com`, `volunserve-full-staging.web.app`. Do not add `volunserve.com`, `volunserve-3aa5b.web.app` or unrelated UI-preview hosts.
- Firestore `(default)` database exists but currently uses **deny-all** client rules `allow read, write: if false;` (safe initial posture; not sufficient for real workflows). No user data is shown in console.
- Firebase Cloud Storage page shows **Spark billing upgrade required**; no stage cloud bucket or paid upgrade confirmed. Use local Storage Emulator for fake uploads until a separately reviewed billing choice.
- Existing local no-cloud tests: Auth+Firestore run https://github.com/calibosofroyarjan-volunserve/VolunServe/actions/runs/42385832713 (7/7 suites); Storage emulator run https://github.com/calibosofroyarjan-volunserve/VolunServe/actions/runs/42389268122 (12 synthetic scenarios).
- Existing consolidated UI source-preservation, TypeScript and Expo compile result: https://github.com/calibosofroyarjan-volunserve/VolunServe/actions/runs/42384756679.

## Fail-closed standalone staging environment check

`node scripts/check-full-staging-config-20261108.cjs --self-test` runs offline, using a **fake** Web API key.
The standalone `--check` mode validates prospective build env values (does NOT initialize the app):
- `EXPO_PUBLIC_VOLUNSERVE_STAGING_MODE=1`
- `EXPO_PUBLIC_STAGING_FIREBASE_API_KEY` — public Web API key from this exact staging project's Web App, not any private service-account JSON
- `EXPO_PUBLIC_STAGING_FIREBASE_PROJECT_ID=volunserve-full-staging`
- `EXPO_PUBLIC_STAGING_FIREBASE_AUTH_DOMAIN=volunserve-full-staging.firebaseapp.com`
- `EXPO_PUBLIC_STAGING_FIREBASE_STORAGE_BUCKET=volunserve-full-staging.firebasestorage.app`
- `EXPO_PUBLIC_STAGING_FIREBASE_SENDER_ID=429213950126`
- `EXPO_PUBLIC_STAGING_FIREBASE_APP_ID=1:429213950126:web:955dbf575697826b674d3f`
- `EXPO_PUBLIC_STAGING_BACKEND_URL=https://volunserve-staging-disabled.invalid` (preferred while backend is nonfunctional), or verified inert shell `https://volunserve-staging-api-shell.onrender.com`.

The standalone check rejects wrong project IDs, prod URLs, service-account/PayMongo/Cloudinary secrets and non-staging mode. **This guard is not yet wired to an Expo staging build or deployed website; it alone does not make the app safe to run.**

## Remaining mandatory steps for isolated live-like testing

1. Prepare reviewed **staging-only** Firestore/Storage Rules on a separate branch; validate offline in emulators. Never copy production user data. Rules changes must target `volunserve-full-staging` only after explicit review and manual approval. Existing Firestore deny-all rules stay unchanged until then.
2. Set up a staging-only Firebase runtime initialization that uses this project's exact public Web App config, and fail-closes all API endpoints, identity recognition, Cloudinary uploads, PayMongo and external messaging integrations. Only dummy data and nonproduction accounts allowed.
3. Use a dedicated staging URL, then add **only its exact hostname** to this staging project's authorized domains if needed for OAuth. `localhost` and both staging Firebase Hosting domains are already authorized; do not authorize production.
4. Cloud Storage requires Blaze for this project; avoid upgrade until benefits, spend limits, billing alerts and test-scope need are reviewed. Local Storage emulator covers simulated files.
5. Test real staging UI flows for all roles (auth, events, announcements, case/assignment, donations, attendance, certificates, permissions), with no cross-project calls. Verify mobile/desktop.
6. Do not release to live until source/hosting version is refreshed, a rollback is tested, all four-role E2E checks pass, and owner gives explicit final approval.

**Non-actions:** No cloud configuration changes, Firestore or Storage Rules writes, user creation, cloud deployments, hosting publish, credential changes, production data writes or merge to main.
