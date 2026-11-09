# VolunServe: trusted disposable-email block before Firebase Auth creates a user
Date: 2026-11-09 | Target branch: live-protected | Status: STAGED, NOT ACTIVATED

## Root cause and threat model
- The live Firebase Authentication client can call createUserWithEmailAndPassword without visiting the VolunServe UI. Frontend filtering cannot stop direct SDK or REST calls.
- Current Firestore Rules deny direct Resident profile creation for en2ch.com/co (+ subdomains), enforce email_verified and a matching token address, but cannot evaluate the full 51,321+ domain list within Firestore expression/compiled-size limits.
- The trusted 51,321+ domain and fake-provider screening already exists in functions/registrationEmailScreening.js, backed by functions/disposable-email-domains.txt. It cannot stop Firebase Auth creation while Identity Platform blocking triggers are OFF.
- Gmail or another genuine provider mailbox temporarily accessed by someone else cannot be identified as disposable from the address alone. New domains and false positives require review.

## Phase A: code-only safe hardening (this PR)
- Add separate opt-in VOLUNSERVE_ENABLE_IDENTITY_BEFORE_CREATE=true. Exports *only* volunserveBlockDisposableBeforeCreate. Do not switch on the existing legacy VOLUNSERVE_ENABLE_IDENTITY_BLOCKING flag that also exports beforeSignIn; the latter can affect existing live sign-in.
- Keep both flags OFF by default. No Auth user creation/deletion, Firestore writes, UI changes, Hosting, Functions, Render or main branch publish.
- Use v2 CloudEvent event.id (with event.eventId compatibility fallback) to deduplicate a retry of the same creation event in the rate limiter.
- Run actual mocked Identity Platform callback tests: known temporary domains/subdomains, fake provider typos, legitimate Gmail/Yahoo/Outlook/school addresses, fail-closed limiter errors, optional historical-staff sign-in exemption.

## Phase B: staging prerequisites (operator review; not performed by code merge)
1. Enable **Firebase Authentication with Identity Platform** in a separate staging project. Blocking functions will NOT prevent UID creation on ordinary Firebase Authentication without that upgrade.
2. Verify the project is on **Blaze** and billing/alerts are configured; Cloud Functions deployment is not available on Spark. Do not silently change billing.
3. Set an unpredictable 32+ character value in Firebase Secret Manager for VOLUNSERVE_REGISTRATION_RATE_LIMIT_SECRET. Enable TTL for authSignupRateLimits.expiresAt before release. Do not commit the secret.
4. Configure the reviewed function environment flag VOLUNSERVE_ENABLE_IDENTITY_BEFORE_CREATE=true **only in staging** (e.g., appropriately scoped functions/.env.<staging-project-id>), keeping the broad VOLUNSERVE_ENABLE_IDENTITY_BLOCKING flag unset/false.
5. Deploy ONLY the selected identity export to staging; verify that the Identity Platform "Before create" trigger is registered and no "Before sign in" trigger was added. Test actual direct SDK/REST registration, including Gmail, Yahoo, Outlook, Google, disposable subdomains and a legitimate user recovering verification. Confirm no existing users are deleted and no historical login is affected.
6. Verify callback cold-start and 7-second deadline, Firestore transaction idempotency and actual IP metadata. Review school/shared-network rate limits and privacy of hashed metadata.
7. Only after staging passes and actual production Firebase Auth/Identity Platform and billing state are confirmed may an operator explicitly enable the same scoped trigger in production, using protected environment approvals and a rollback plan. Deploy only the reviewed Auth blocker, not all Functions, Hosting, Rules, Storage or Render.
8. Post-release: attempt a new blocked email via direct Firebase SDK and assert **no UID is created**; verify legitimate new email accounts, prior Admin/Volunteer/Resident sign-ins, password resets, Guest, and existing Render/Firestore workflows. Verify function logs do not expose emails or tokens.
9. Rollback: unregister the Before create blocking trigger and safely disable the new function if auth becomes unavailable. Do **not** delete the function without unregistering it first; a dangling trigger can block all sign-ins/signups.

## Rules of engagement
- This PR by itself does not change what is currently deployed at https://volunserve.com. Never call the staged handler "live."
- Email verification proves access to a mailbox, not long-term ownership or identity.
- Do not promise 100% blocking of all known or future disposable mailboxes. Refresh the vetted denylist under code review and preserve provider false-positive tests.
- Production rollout and billing upgrade require an explicit separate authorized operation after stage/testing.
