# VolunServe Signup Protection — No CAPTCHA / reCAPTCHA

**Status:** code only, Draft PR #287 based on `live-protected`. No production deploy, billing changes, Authentication upgrades, database mutations, or user migration performed.

**Explicit design decision (November 8, 2026):** do **not** add or activate CAPTCHA/reCAPTCHA to the VolunServe signup experience. The previously drafted reCAPTCHA setup script and its associated tests were deleted. This security plan does not require users to solve a CAPTCHA.

## In the protected draft

1. **Disposable and fake email screening:** client-side warnings for malformed addresses, >50k known disposable domains and their subdomains, Gmail `+tag` aliases, and 44 known fake/mistyped consumer-provider domains. If the optional blocking trigger is later enabled, `beforeUserCreated` enforces shared email screening before Firebase creates an Auth UID. A genuine `@gmail.com` inbox used temporarily cannot reliably be detected from its address.
2. **Mandatory email verification:** Firebase creates a *pending Auth-only UID* for email/password registration so it can send verification; no Basic Resident profile or protected module access until the email is verified and Personal Details + SJDM Address/Profile fields pass. Google is optional and still requires completing Resident details; Guest Preview is always account-free.
3. **Resend email control:** a visible 60-second cooldown applies after the last successful verification email request. This prevents accidental repeated clicks but is **not** server-side security.
4. **Distributed server signup rate limit:** the optional Identity Platform `beforeUserCreated` handler runs a Firestore transaction keyed by HMAC-hashed IP + 15-minute time bucket. **Default: 30 new account attempts per 15 minutes per network IP**, idempotent per event ID. Only counters, timestamps and hashed fingerprints are stored; no raw IP or email. This is designed to reduce automated account floods, but shared school/LGU networks and VPNs are caveats. `authSignupRateLimits.expiresAt` requires a Firestore TTL policy.
5. **Provider-level safeguards:** existing Firebase Auth quotas, email verification, Firestore/Storage Rules, Render API authorization, and authenticated Firebase Functions remain part of the protection. App Check or stronger identity verification are separate potential decisions, **not** bundled or silently enabled here.

## Before any server-side activation

- Set up and validate a **separate Firebase staging project**, with Firebase Authentication with Identity Platform enabled (required for `beforeUserCreated`/`beforeUserSignedIn`). Identity Platform may incur charges; check billing and service compatibility first.
- Provide a 32+ character secret in **staging-only Secret Manager**, named `VOLUNSERVE_REGISTRATION_RATE_LIMIT_SECRET`; never put the secret in GitHub.
- Enable Firestore TTL on collection group `authSignupRateLimits` and field `expiresAt` in staging, and verify the proper Firestore security access for the blocking function service account.
- The blocking exports are **OFF by default** and are only present when `VOLUNSERVE_ENABLE_IDENTITY_BLOCKING=true` is explicitly enabled for an authorized staging deployment. Do **not** enable for live accidentally.
- Run E2E staging checks for genuine Gmail/Yahoo, known disposable domains, typos, plus-tag aliases, Google-only sign-in, account recovery, email-verification status, repeat resend, invalid form fields, Guest isolation, API access, shared-IP rate limit, existing Admin/Super Admin, Resident and Volunteer workflows.
- Check for false positives, regional/mobile network NAT sharing and Firebase Auth quotas. Audit existing Admin emails so verified-email enforcement does not lock out historical staff users.
- **Never deploy from outdated `main`.** Confirm live-protected source SHA and release dependencies, then require reviewer approval and rollback capability. Firebase Hosting, Rules, Functions, Storage and Render are separate rollouts. No live data deletion.

## No-deploy validation

- `node --test functions/test-registration-email-screening.js`
- `node --test scripts/test-signup-abuse-controls.cjs`
- `node --test scripts/test-identity-blocking-opt-in.cjs`
- `node scripts/test-signup-prod.cjs`
- `node --test scripts/test-resident-field-validation.cjs`
- Firestore and Storage security rule emulators, Community Events permission tests, TypeScript and Expo production web export.

Firebase docs: https://firebase.google.com/docs/auth/limits and https://firebase.google.com/docs/functions/auth-blocking-events .


## Separate Firebase staging web client (no live credentials)
The `lib/firebase.ts` app config now supports `EXPO_PUBLIC_VOLUNSERVE_FIREBASE_TARGET=staging` only with **all six separate staging Firebase web config fields**. It refuses missing fields, production project ID, production API key, production authDomain, mismatched authDomain/bucket, and misspelled target names. This is an opt-in web/mobile build flag, not a production mutation.

Obtain the dedicated **web-app config** from a newly created staging Firebase project. Do not put service-account JSON, private key, Admin SDK tokens, passwords, or actual Resident information in environment variables or GitHub files.

For staging web preview builds, set these values in a trusted, staging-only build environment:

```sh
EXPO_PUBLIC_VOLUNSERVE_FIREBASE_TARGET=staging
EXPO_PUBLIC_VOLUNSERVE_STAGING_FIREBASE_API_KEY=<staging-web-api-key>
EXPO_PUBLIC_VOLUNSERVE_STAGING_FIREBASE_AUTH_DOMAIN=<staging-project-id>.firebaseapp.com
EXPO_PUBLIC_VOLUNSERVE_STAGING_FIREBASE_PROJECT_ID=<staging-project-id>
EXPO_PUBLIC_VOLUNSERVE_STAGING_FIREBASE_STORAGE_BUCKET=<staging-project-id>.firebasestorage.app
EXPO_PUBLIC_VOLUNSERVE_STAGING_FIREBASE_MESSAGING_SENDER_ID=<staging-sender-id>
EXPO_PUBLIC_VOLUNSERVE_STAGING_FIREBASE_APP_ID=<staging-web-app-id>
```

Choose an actual staging project ID and copy **its exact storageBucket** from the Firebase Console; some projects use `<id>.appspot.com` instead. None of the seven values are hardcoded into the repo. A local `npx expo export --platform web` compiled with these variables targets only staging Firebase; without `TARGET=staging`, normal existing production builds are unchanged. This **does not** create a Firebase project, deploy a website, configure sign-in providers, create staging accounts, or enable blocking functions.

- Before staging publish, enable Email/Password and Google providers **on staging only** and authorize the dedicated staging preview domain for OAuth.
- Firebase CLI `.firebaserc` defaults to production and must **never** be used for staging deployment without an explicit verified `--project <staging-project-id>`; the staging app config alone does not change Firebase CLI's project.
- `node --test scripts/test-staging-firebase-isolation.cjs` validates fail-closed behavior, staging routing and unchanged production defaults.
- No real personal data should be copied into staging. Create fictional accounts for signup and test Admin migrations separately.
