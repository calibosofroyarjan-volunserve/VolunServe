# VolunServe — isolated staging readiness

**Status: code-only staging preparation; NOT a deployed website.**

## Why a normal preview link is unsafe today
The verified live source uses Firebase project `volunserve-3aa5b` inside `lib/firebase.ts`. Hosting a cloned full app on a Firebase preview channel or a Render static site does not isolate authentication, Firestore, Storage or Functions. Test users could modify live records. There is currently no separate Firebase staging project declared in `.firebaserc`, and the connected Render workspace has the production backend and identity-AI services only.

## Added on this preview-only branch
- `lib/stagingFirebaseConfig.ts` validates all six required public staging client values, refuses empty values, wrong Auth/Storage domains and any reference to the live Firebase project.
- `lib/firebase.ts` selects isolated staging configuration **only when** `EXPO_PUBLIC_VOLUNSERVE_STAGING_MODE=1`; default production configuration is not modified.
- `scripts/test-isolated-staging-config-20261107.cjs` verifies fail-closed behavior against production references, missing config and inconsistent project domains.
- The dedicated CI job `Build Isolated VolunServe Web Review (NO DEPLOY)` compiles the real Expo web source against a **dummy/nonexistent Firebase project** and publishes a downloadable web-build artifact. This artifact is for offline UI/source inspection only; it cannot perform working logins, live role-based actions or true end-to-end testing.
- No Firebase service credentials, Firestore rules, production hosting, Render services or PayMongo environments are changed.

## Newly identified production-backend paths and staged guards (November 7)

The source inspection found hard-coded production Render URLs in `app/(tabs)/donation.tsx`, `app/(tabs)/resident.tsx`, `app/(admin)/assistance-requests.tsx`, `app/(admin)/donation-list.tsx` and `lib/identityVerification.ts`. One Admin donation evidence upload uses a production Cloudinary preset.

- These known Render call sites now use `getSafeVolunServeBackendBaseUrl()`. When staging is enabled but `EXPO_PUBLIC_STAGING_BACKEND_URL` is missing, they point to the reserved nonexistent `.invalid` domain rather than the live service.
- When a separate staging backend URL is later provided, it must be a clean HTTPS origin with an explicit `staging`, `preview`, `sandbox` or `test` hostname. The production Render and hosting domains are rejected.
- The Admin donation evidence upload explicitly rejects staging execution until a dedicated nonproduction Cloudinary path is created.
- `scripts/test-staging-backend-isolation-20261107.cjs` checks normal production configuration is unchanged while staging refuses production hosts, malformed staging hosts, live identity overrides and the selected Cloudinary upload.
- `scripts/audit-staging-external-endpoints-20261107.cjs` inventories direct outbound URLs and `fetch` sites across the app. Its report is attached to the staging workflow and requires manual examination before public hosting.

**Important:** These controls address identified paths but do not guarantee that every possible network request is isolated. A real interactive staging site remains blocked until complete runtime network tracing and separate services are verified.

## Required before an actual hosted, working staging preview
1. Provision a **separate** Firebase project, e.g. `volunserve-staging-<unique>`, with its own Auth, Firestore, Storage and staging Functions.
2. Establish staging-only Firestore rules, test accounts for Resident, Volunteer, Admin and Super Admin, and seeded fake records. **Never copy real residents' ID photos, personal data, donor transactions or production secrets.**
3. Connect a separate nonproduction Render backend / identity-AI service where necessary, with separate environment variables and no production Firebase Admin credentials.
4. Keep PayMongo in Sandbox; prevent staging callbacks, writes and notifications from reaching production.
5. Configure a separate preview hosting domain and allowed Firebase OAuth redirect domains, using these public nonsecret project client fields:
   - `EXPO_PUBLIC_VOLUNSERVE_STAGING_MODE=1`
   - `EXPO_PUBLIC_STAGING_FIREBASE_API_KEY`
   - `EXPO_PUBLIC_STAGING_FIREBASE_AUTH_DOMAIN`
   - `EXPO_PUBLIC_STAGING_FIREBASE_PROJECT_ID`
   - `EXPO_PUBLIC_STAGING_FIREBASE_STORAGE_BUCKET`
   - `EXPO_PUBLIC_STAGING_FIREBASE_SENDER_ID`
   - `EXPO_PUBLIC_STAGING_FIREBASE_APP_ID`
6. Before hosting the actual staging web build, block all direct production backend endpoints and confirm the network requests target staging resources only. The Firebase client isolation added here **does not** establish backend isolation automatically.
7. Run full staging QA with test accounts: navigation, announcements, approvals, emergency tasks, time-in/out, certificate creation, identity verification, donations in sandbox, notification dropdown and mobile browser.
8. Re-verify the current production Hosting release immediately before any separately approved live release. Never merge a staging-only feature directly into the production release branch.

## Current available review path
GitHub Actions -> `Build Isolated VolunServe Web Review (NO DEPLOY)` -> workflow run -> **Artifacts** -> `volunserve-isolated-web-review-not-live`.

The downloadable `dist/` is an actual Expo web build, not the working staging website. It requires an HTTP static server for local viewing. Because its Firebase project is deliberately non-existent, signing in or submitting is **not** a functional test. No public production-connected preview link is made.

## Safety rules
- No automatic production deploy, merge or secret copying.
- Don't change `.firebaserc` default to staging.
- No staging against production Firebase.
- No promise of bug-free behavior based on a static export.
