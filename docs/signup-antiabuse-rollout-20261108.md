# VolunServe Signup Anti-Abuse — Staging Readiness and Safe Rollout

**Status:** CODE ONLY on draft PR #287, base `live-protected`; **NO production Firebase, Render, Identity Platform, billing, or live data changes**. Existing production users/staff and mobile APK are untouched.

## Implemented in the draft

1. **Email screening before Auth creation.** Client `getRegistrationEmailError()`, shared generated denylist (>50k known disposable domains), Gmail `+tag` aliases and 44 suspicious/mistyped provider domains. Server `classifyRegistrationEmail()` checks the same categories in Identity Platform **beforeUserCreated** once explicitly activated. Legitimate `@gmail.com` addresses remain permitted because there is no reliable way to determine whether a real Gmail inbox will be used temporarily. Do not ban all Gmail or dots.
2. **Mandatory email verification.** Email/password creates a pending Firebase Auth-only UID (required to send a verification message) but never a Resident Firestore profile until `emailVerified=true`, token email matches, and all Personal + SJDM Address/Profile fields pass. Direct SDK Firestore reads/writes, protected Storage, Functions and Render use verified-email and role checks. Google provider is optional and follows its own verification without creating another password.
3. **Resend-email UI cooldown.** `lib/verificationCooldown.ts` allows a new **Resend** action 60 seconds after the last *successful* verification email. Step 2 shows a visible countdown. This is an honest **UX throttle**, not server enforcement: an automated script can bypass it.
4. **Server per-IP creation throttle (staged, disabled in production).** Identity Platform `beforeUserCreated` runs `enforceSignupIpRateLimit()` from `functions/registrationIpRateLimiter.js`. The limiter uses a **shared Firestore transaction**, **HMAC-SHA256 of IP + 15-minute window** keyed by a Secret Manager value; **default 30 attempts / 15 minutes per public IP**. Duplicate auth event IDs are idempotent. No raw IP, email or password is stored in the counter; `expiresAt` supports Firestore TTL. Valid requests on a crowded school/LGU Wi-Fi share one IP; stage and monitor false positives before rollout.
5. **Bot scoring (staging plan only).** Identity Platform's built-in **reCAPTCHA Enterprise** for email/password signup, sign-in, and password reset. `functions/scripts/configureRecaptchaAudit.cjs` is **dry-run by default**, refuses the production `volunserve-3aa5b` project, and can set `AUDIT` only on an explicitly confirmed separate staging project. In AUDIT, risk signals are observed but **bots are not automatically blocked**; moving to ENFORCE is a separate, carefully approved console/configuration change after real user testing.

## Production safeguards

- Never enable `VOLUNSERVE_ENABLE_IDENTITY_BLOCKING=true` without an Identity Platform-enabled staging project, a bound `VOLUNSERVE_REGISTRATION_RATE_LIMIT_SECRET` (32+ random characters from Secret Manager), and a configured TTL policy on the `authSignupRateLimits.expiresAt` field.
- Firebase Authentication has provider-level signup quotas (including **100 new accounts/hour/IP**, subject to change). Those are *not* a substitute for deliberate bot scoring or the optional app-side limiter.
- Identity Platform and reCAPTCHA Enterprise can be **billable**. Confirm quotas, billing and actual usage before enabling.
- **Never set reCAPTCHA `ENFORCE` on production** until all web and native clients are compatible; old APKs or valid users may otherwise lose access.
- Do not switch on Firestore/Storage **App Check enforcement** without collecting traffic metrics and migrating *all* clients, including mobile. App Check is a separate control from Firebase email verification and may require an app-specific key and native configuration.
- The staging IP limiter writes one Firestore document per hashed IP/time bucket. A TTL policy is mandatory to avoid retention creep. Network access to Firestore must succeed within Firebase blocking function deadlines; an unexpected limiter error fails creation closed.
- Existing approved Admin/Super Admin and LGU staff accounts MUST be reviewed for email verification before applying stricter rules. No account migration, login lockout or production collection wipe is authorized by this change.

## Staging activation checklist — separate project, manual authorization

1. Create and test **a separate Firebase staging project**; back up/compare production rules and staff account behavior (no user writes).
2. Upgrade **staging** Authentication to Identity Platform and enable the reCAPTCHA Enterprise API and required service-agent IAM permissions.
3. Use the staging project ID for a **read-only dry run** from the repository root:

   `VOLUNSERVE_STAGING_PROJECT_ID=<staging-project-id> node functions/scripts/configureRecaptchaAudit.cjs`

   After checking the IAM/price/plan and providing Admin SDK staging credentials, optionally run with `VOLUNSERVE_CONFIRM_STAGING_AUDIT=YES`; it will set **AUDIT ONLY** and refuse the known production project.
4. Add `VOLUNSERVE_REGISTRATION_RATE_LIMIT_SECRET` to **staging** Firebase Secret Manager (at least 32 random bytes/characters, never committed), enable **Firestore TTL** on collection group `authSignupRateLimits` field `expiresAt`, then deliberately deploy the two Identity Platform blocking triggers with `VOLUNSERVE_ENABLE_IDENTITY_BLOCKING=true` for **staging only**.
5. Test the full email/signup path: real Gmail/Yahoo, invalid/temporary domains, Google OAuth, expired and repeated verification, a deliberately throttled test network, recovered sessions, Guest account isolation, Resident + Volunteer flows and Admin staff logins. Verify Cloud Monitoring reCAPTCHA metrics, Auth limits, and error messages.
6. Leave production UNCHANGED until an authorized release plan is signed off. Keep `beforeUserCreated`, `beforeUserSignedIn`, recaptcha and rules separate from frontend Hosting rollouts. Review rollback steps and observe errors while in AUDIT.

## Required CI checks

- `node --test functions/test-registration-email-screening.js`
- `node --test scripts/test-signup-abuse-controls.cjs`
- `node --test scripts/test-identity-blocking-opt-in.cjs`
- `node scripts/test-signup-prod.cjs`
- `node --test scripts/test-resident-field-validation.cjs`
- Firestore/Storage emulator checks, Community Events permission checks, TypeScript and Expo web export.

**References (official):** https://firebase.google.com/docs/auth/limits ; https://cloud.google.com/identity-platform/docs/recaptcha-enterprise ; https://firebase.google.com/docs/functions/auth-blocking-events ; https://firebase.google.com/docs/app-check/enable-enforcement
