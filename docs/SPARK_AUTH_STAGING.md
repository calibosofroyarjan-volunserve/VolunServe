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

## Verify actual mailbox ownership (Nov 5)

The Signup UI **does not guess whether an email inbox exists**: a correct
domain and syntactically valid address only allow a *pending* Firebase Auth
account. An account cannot create its Basic Resident profile or enter a
protected Resident Dashboard without completing the email link challenge.

Step 2 now displays:
- A provider-neutral verification requested message (not a claim of delivery)
- A clear explanation that clicking the link proves access to the inbox
- A red, actionable pending message if Check Verification is clicked too early
- Resend Verification Email and Use a different email / Start over
- No raw Firebase SDK error messages or false "email does not exist" claims

Shared `lib/authUserMessages.ts` defines the text. The existing error
handling still detects a Firebase-reported signup email collision, blocks
known temporary providers, and validates Gmail/Yahoo/Outlook typos. Login
instructions are also provider-neutral on Android and web.

Regression tests run with `node scripts/testSignupValidation.cjs`. Do not
deploy to production before staging browser tests confirm that the verification
link actually arrives, refreshes the `emailVerified` status, and prevents
an unverified Resident from completing their profile.

## Provider-neutral Signup validation (Nov 5)

The signup screens now accept valid **Gmail, Yahoo, Outlook, Hotmail, iCloud,
Proton, school/work and other private domains**. Validation is **not a Gmail
allowlist**. The shared policy in `lib/registrationEmailPolicy.ts` checks:

- Required email, exactly one `@`, local-part length/syntax, complete legal
  DNS labels (no double dots, leading/trailing hyphens) and TLD length.
- **44 exact common provider-domain typos** across Gmail, Yahoo, Outlook,
  Hotmail, iCloud and Proton with red, provider-specific "Did you mean"
  feedback. Examples: `yahoo.co` -> `yahoo.com`, `outlook.co` ->
  `outlook.com`, `hotmail.con` -> `hotmail.com`.
- Known disposable domains, including subdomains, using the maintained list.
  There is no claim of universal temporary-email detection.
- Allows legitimate `.co` private domains, `yahoo.co.uk`, `yahoo.com.ph`,
  `@deped.gov.ph`, and other correctly formatted addresses. **Syntax does
  not confirm email delivery or ownership:** Firebase email verification
  remains mandatory before a Basic Resident profile can be created.

The same 44 typo domains are denied by `firestore.auth-staging.rules` and
the *production draft* `firestore.rules`. The production rules are **not
deployed** and the `volunserve.com` website remains unchanged.

Tests:
```powershell
node scripts/testSignupValidation.cjs
npx firebase-tools emulators:exec --only firestore --project demo-volunserve "node scripts/testEmailFirstStagingRules.cjs"
npx tsc --noEmit --pretty false
```
The unit tests check provider typos, valid major/independent/regional domains,
disposable domains, duplicate-account error mapping, and exact policy-to-rules
parity. The emulator suite contains 16 Firestore security assertions.

## Early email verification rollout (Nov 4)

The isolated **staging** build now enables the four-step `EmailFirstSignup`
component in `app/signup.web.tsx` and `app/signup.tsx` when
`EXPO_PUBLIC_FIREBASE_TARGET=staging`. Production retains the old signup UI
until E2E checks pass.

1. **Step 1 Email & Password:** validate the address and a VolunServe password,
   accept the Terms/Privacy Notice, then create an **Auth-only** Firebase UID
   and immediately call `sendEmailVerification`. Do **not** create a Firestore
   profile yet.
2. **Step 2 Verify Email:** user opens the Firebase link in Inbox or Spam and
   returns to press Check Verification. `reload(user)` and
   `getIdToken(user,true)` are required to refresh the `email_verified` claim.
   Resend button is available; respect Firebase rate limiting.
3. **Step 3 Personal Details:** only accessible with verified email; name,
   18+ date of birth, and PH mobile number.
4. **Step 4 Address & Profile:** SJDM barangay, occupation, required fields,
   and confirmation. Call `signUpUser({authProvider: "verified_email", ...})`
   to save `users/{uid}` under **the same** verified Firebase Auth UID.
   Never create a second Auth account at this step.

If the browser closes after Step 1, Firebase Auth persists its session.
If on another device, use **Resume Registration** with the same VolunServe
email/password. Auth-only users must never reach a protected Dashboard.

The staging `firestore.auth-staging.rules` now requires
`request.auth.token.email_verified == true` before profile creation.
This applies to the staging test environment only; do **not** deploy these
auth-only rules to the real VolunServe production project.

### Required local checks before deploying again

```powershell
node scripts/testSignupValidation.cjs
npx tsc --noEmit --pretty false
npx firebase-tools emulators:exec --only firestore --project demo-volunserve "node scripts/testEmailFirstStagingRules.cjs"
```

Test a fresh staging Gmail with incorrect password / already-registered email,
unverified check status, resend, refresh-and-resume, verify link, profile
completion, attempted Dashboard access before completion, and safe post-verify
login. Test Google sign-in independently; it may be linked to the same UID.

**Do not interpret a delivered verification email as a guaranteed permanent
mailbox.** Spark cannot guarantee coverage of all disposable providers.

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

- Start with email and password → verify real email BEFORE entering personal information → finish Basic Resident profile → enter dashboard.
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
