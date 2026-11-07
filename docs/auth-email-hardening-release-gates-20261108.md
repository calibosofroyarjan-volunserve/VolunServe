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
6. Rate limiting, Abuse Protection and App Check/reCAPTCHA Enterprise need separate Firebase Console and client setup. They are **not** enabled by code in this PR.
7. The screenshot's `oidc-smoke` Hosting URL is a preview channel; do not mistake it for the live `volunserve.com` source.

## Safe activation sequence (no automatic deployment)
1. Confirm current production SHA, cloud project, legitimate test users and approval; do not publish if live fingerprint drifted.
2. Configure **a separate Firebase staging project**; enable Firebase Authentication with Identity Platform there; test both identity blocking handlers with fake throwaway and real Gmail/Yahoo/Google test mailboxes.
3. Verify that unverified accounts can still request verification while being denied all protected data; verified mail must finish personal and barangay details before a real profile is created.
4. Verify existing Admin/Super Admin, old Basic Resident, Volunteer, Google sign-in, password-reset, Guest, and other operational modules under newly compiled rules.
5. Review and confirm the new read/write Security Rules in the emulator and check native/web UX, including recovery when a user mistypes email. No data deletions.
6. Review possible additional costs of Identity Platform, Functions and anti-abuse tooling.
7. Only then stage explicit Hosting + rules + Functions releases through a protected manual production procedure; confirm post-release access, and retain rollback artifacts and a monitored migration procedure for legitimate users on blocked domains.
