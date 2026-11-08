# VolunServe high-assurance email signup — release gates (2026-11-08)

## What is implemented on this DRAFT branch
- Existing production-derived `live-protected` source is the base. Never merge from outdated `main`.
- `lib/registrationEmailPolicy.ts` rejects known disposable domains, including `en2ch.com`; email signup creation and profile creation both validate policy.
- Web and native Guest buttons sign out and navigate to a public, read-only route. No Guest Firebase role is created.
- `firestore.rules` self-service Resident creation now requires verified token, exact token email match, nonempty name/address/profile data, valid Resident-only role, and no `@en2ch.com` addresses.
- `firestore.rules` `approved()` additionally requires verified and matching email for community profiles, while existing staff roles retain their separate authorization gates.
- `app/_layout.tsx` and `getUserProfile()` deny community access if email is unverified/mismatched or matches a known disposable domain.
- Optional **Identity Platform blocking handlers** use an identical server-side 51,321-domain snapshot, including subdomains, for new Auth UID creation and sign-in. Existing approved Admin/Super Admin accounts are exempted from the disposable-domain sign-in check to avoid an immediate production lockout.
- Existing password signup creates a temporary **Auth-only UID before email verification** (Firebase email-first workflow). That is *not* a Guest user and not a completed Resident Firestore profile. Only verified mail plus complete details can create the Resident profile.
- Dedicated no-deploy CI tests: domain-list parity, unit tests, signup/guest regressions, TypeScript, Expo export, Firestore emulator registration/announcement access.

## Important boundaries
1. A legitimate `@gmail.com` mailbox used temporarily is indistinguishable from any other legitimate Gmail mailbox by email string alone. Some disposable services can receive confirmation emails. **No claim of 100% blocking.**
2. The 51k-domain snapshot is finite and must be updated; use review/automated auditing before each release.
3. Firestore cannot dynamically evaluate 51k domains in rules; the optional server-side blocking triggers do that, but only **after Firebase Authentication with Identity Platform is enabled and triggers are deployed**. Source-only rules and UI checks are not a full before-create server block.
4. **Never reject unverified accounts in beforeUserSignedIn by emailVerified alone.** This callback runs during initial registration before the verification link is sent, so doing so would break the current onboarding flow.
5. Root/public routes and all unauthenticated Guest public pages must stay readable; existing Admin/Super Admin, account migration, donations, certificates and live dashboard must be regression tested.
6. The staged signup IP rate limiter requires separately reviewed Identity Platform blocking-function activation. **No CAPTCHA/reCAPTCHA is included or planned for VolunServe signup**, per the user's design choice; do not enable it silently. App Check is also not enabled by this PR.
7. The screenshot's `oidc-smoke` Hosting URL is a preview channel; do not mistake it for the live `volunserve.com` source.

## Safe activation sequence (no automatic deployment)
1. Confirm current production SHA, cloud project, legitimate test users and approval; do not publish if live fingerprint drifted.
2. Configure **a separate Firebase staging project**; enable Firebase Authentication with Identity Platform there; test both identity blocking handlers with fake throwaway and real Gmail/Yahoo/Google test mailboxes.
3. Verify that unverified accounts can still request verification while being denied all protected data; verified mail must finish personal and barangay details before a real profile is created.
4. Verify existing Admin/Super Admin, old Basic Resident, Volunteer, Google sign-in, password-reset, Guest, and other operational modules under newly compiled rules.
5. Review and confirm the new read/write Security Rules in the emulator and check native/web UX, including recovery when a user mistypes email. No data deletions.
6. Review possible additional costs of Identity Platform, Functions and anti-abuse tooling.
7. Only then stage explicit Hosting + rules + Functions releases through a protected manual production procedure; confirm post-release access, and retain rollback artifacts and a monitored migration procedure for legitimate users on blocked domains.

## Current safe release status — latest protected-live source
- **Branch:** `security/live-verified-email-guest-20261108`; created from `live-protected` at `a6f832da13f89ef70bf7a19204dadf4f5c9cdb4e`, incorporating newer premium design commits. Old draft PR #285 is superseded for review.
- **No automatic deployment:** production Firebase Hosting, Auth, Functions, Rules, Storage, Render, and user data were NOT changed. Do not enable merged/auth production releases until full staged end-to-end tests pass.
- **No temporary account is a Guest account.** Direct `/public` routes sign out Firebase Auth; legacy `role:guest` records, even with `status:approved`, cannot use protected Dashboard, Firestore, Storage or Render data and are retained for controlled migration.
- **All protected backend APIs** require both verified email and a completed approved role-backed profile; verified pending LGU staff have only narrowly scoped application/credential paths.
- Firebase callable certificates, map briefing and push-token operations require verified email. Public read-only pages and externally verified PayMongo webhooks remain separate.
- **Optional Identity Platform triggers are fail-closed by default.** `functions/index.js` exports `beforeUserCreated` and `beforeUserSignedIn` only if `VOLUNSERVE_ENABLE_IDENTITY_BLOCKING=true` is explicitly set in a staging/reviewed deployment environment; otherwise the source code does not activate the handlers. Activation requires Identity Platform upgrade and testing.
- **Strict staff rules are a rollout risk.** An existing Admin/Super Admin/LGU staff Auth user with `email_verified=false` will lose access after stricter Firestore, Storage and Render rules activate. Audit and migrate existing staff BEFORE applying these rules.
- **Gmail limitation:** `+tag` Gmail aliases are blocked at registration; ordinary genuine Gmail and dotted variants cannot be categorically classified as throwaway, and a known-domain snapshot cannot prevent all abuse.
- The design-only `ui-regression` workflow checks that the design PR was *only* changing styles. It is intentionally not applicable to multi-layer security changes and will still report a structural-diff failure. Do NOT disable that workflow; use the dedicated deep security CI checks plus explicit reviewer approval before any protected release.

## Complete registration validation coverage — 2026-11-08
- **Email:** validate syntax and provider typo hints; reject 51,321+ known disposable domains and Gmail `+tag` aliases before SDK creation; real Gmail inboxes used temporarily cannot be reliably identified. A successful Firebase Auth UID is still pending until email_verified + a complete Resident profile.
- **Password:** email/password option requires 8–128 characters with upper/lowercase, number, symbol; warns against predictable patterns and using an email name; confirm-password and terms checkbox required; Resume uses original credentials.
- **Personal:** required Unicode-friendly first/last names (2+ letters, ≤80 characters), optional middle name/initial; real date of birth with 18–100 age rule; PH mobile `09xxxxxxxxx` or `+639xxxxxxxxx`. UI shows an inline error beside the offending field.
- **Address/Profile:** province/city fixed to Bulacan/SJDM in the wizard, official 62-SJDM-barangay selector, occupation category from 10 approved options, matching mandatory specialization where applicable; `Other (Specify)` requires a meaningful 2–80 character description. Hidden/stale occupation values cannot be submitted. Explicit review/terms confirmation remains required.
- **Two-layer validation:** `lib/requireCompleteResidentRegistration.ts` supplies UI field errors and final `signUpUser()` validation; `firestore.rules` enforces PH phone pattern, named SJDM barangays, approved occupation/specialization combinations and data bounds during direct SDK Resident CREATE. Existing profiles and unrelated modules are unchanged by this create-only guard.
- **Tests:** `scripts/test-resident-field-validation.cjs` verifies valid and invalid inputs plus rules/constant allowlist parity; Firestore emulator `scripts/test-verified-community-registration-rules.cjs` tests direct unverified, incomplete, non-SJDM and mismatched occupation attempts; existing signup/Guest/API/Storage/Functions tests remain.
- **Release gates:** A green emulator or Expo build does not mean real Gmail/Gmail OAuth, SMTP delivery, and anti-abuse checks were exercised; those require isolated staging with Firebase Identity Platform configured before production activation. No production change was made.
