# VolunServe Auth — Firebase Spark staging checklist

**Staging project:** `volunserve-auth-staging` (Firebase Spark).
**Production project:** `volunserve-3aa5b` (must not be touched during staging).
**Branch:** `fix/email-verification-validation-20261104`.

## One-time Firebase Console preparation

1. Staging project → Authentication → Sign-in method: enable Email/Password and Google (done).
2. Staging project → Firestore Database: create `(default)` database in production mode (done).
3. Staging project → Build / Hosting → **Get started** if it is not provisioned. Use the project's **staging** site ID, not the production project.
4. Staging project → Authentication → Settings → Authorized domains: ensure the actual staging Hosting hostname is authorized for Google popup/redirect. Do not add arbitrary third-party domains.
5. Keep authentication templates and approved sender settings for staging emails separate; don't share test-only verification links or actual passwords.

## Build safely (Windows PowerShell)

Run inside the **separate auth testing folder**; do not overwrite local changes in the primary VolunServe folder.

```powershell
cd C:\Users\Acer\VolunServe-Auth-Test-20261104
git status --short
git fetch origin fix/email-verification-validation-20261104
git switch --detach FETCH_HEAD
npx tsc --noEmit --pretty false
Remove-Item Env:\EXPO_PUBLIC_USE_FIREBASE_EMULATORS -ErrorAction SilentlyContinue
$env:EXPO_PUBLIC_FIREBASE_TARGET = "staging"
npx expo export --platform web
```

**Confirm target before any deployment:**
- The built website MUST initialize Firebase project `volunserve-auth-staging`.
- Code has a runtime guard: a build using the production config will refuse to run on a `volunserve-auth-staging*.web.app` site.
- The env flag is applied at export/build time, not to an already deployed bundle.
- The firebase project ID in `.firebaserc` is still production by default; ALWAYS use explicit `--project volunserve-auth-staging` for staging CLI actions.

## Staging-only deploy, once Hosting is provisioned

```powershell
npx firebase-tools hosting:sites:list --project volunserve-auth-staging

# The full production rules exceed 5,900 lines and the first staging
# deploy returned HTTP 409. Use a small, auth-only staging rules file here.
# This firebase.auth-staging.json config explicitly points to that file.
npx firebase-tools deploy --config firebase.auth-staging.json --only firestore:rules --project volunserve-auth-staging

# Only deploy static website assets (dist) to STAGING Hosting.
npx firebase-tools deploy --config firebase.auth-staging.json --only hosting --project volunserve-auth-staging
```

Do NOT run unscoped `firebase deploy`, which includes undeployable Cloud Functions on Spark.
Do NOT deploy these draft rules to production until sign-in, legacy resident and Admin regressions, and recovery/rollback have passed.

## Test in STAGING

- Registered email/password user → verify real email → log in → Basic Resident dashboard.
- The same email submitted for a second account → clear duplicate-account handling.
- Known disposable domains → red UI validation, denied Firestore Resident profile creation.
- Unverified account → blocked from protected role actions.
- Forgot Password request → staging reset email and working password change.
- Google sign-in → authorized staging domain and *same UID* if the user adds a separate VolunServe password.
- Never reuse real production passwords or production user data in staging.

Note: Spark and Firestore deny rules do not prevent all Firebase Authentication user creation through a direct SDK client. A complete temporary-email provider blocklist needs more robust server-backed enforcement; document this limitation at the defense.

## Why separate auth-only staging rules?

The first deployment of the full VolunServe rules to the new staging project compiled but failed with `HTTP 409 Release ... cloud.firestore already exists`. The larger original Firestore ruleset is ~220 KB (over 5,900 lines) and includes unrelated operational/admin modules; Firebase reports a similar 409 with excessively complex rulesets. For this isolated verification project we now maintain the **64-line** `firestore.auth-staging.rules` and the explicit `firebase.auth-staging.json` config. The staging rules allow only a user's own Basic Resident profile registration/access and safe self-profile edits; other collections are denied. This staging rule file is not feature-complete, and MUST NOT be released to production.

If the small ruleset still gets HTTP 409, do **not** retry repeatedly or delete any release. Check the staging project's Firestore Rules tab for the active ruleset, capture the CLI debug output, and consider Firebase Support or the Console's Rules publisher. Do not proceed with real user signups while the staging rules are not confirmed active.
