# Signup rollout transition decision - 2026-11-05

Status: BLOCKED. Product implementation stopped without weakening the verified-create guard.

Workspace: C:\Users\Acer\VolunServe-Signup-Prod. Branch: signup-prod-local.
Known legacy client/rules baseline: e7c2cc84afcc1b0a8885ce94a41a9a444dcfe751.

The current verified-aware clients work, including the original-layout form with the premium flag disabled. Full compatibility with unchanged profile-first clients cannot be guaranteed together with the requested verification boundary and preservation of all existing account permissions. This is the release decision, not a production rollout approval.

No application, Rules, role helper, backend, deployment configuration, environment file, or existing integration file was changed during this assessment. The premium feature flag is unchanged and disabled by default. The 21 pre-existing integration files were hash-compared with the previous validated workspace and all matched. No production data, live Rules, Firebase settings, accounts, pushes, merges or deployments were touched.

## Confirmed protocol conflict

The unchanged main client does the following:

1. Creates an unverified Firebase Auth UID.
2. Commits users/{uid} with role resident, status approved and residentAccess true.
3. Only after the commit succeeds, requests the verification email and signs out.

Under the candidate verified-create Rules, step 2 fails. Step 3 is never reached. An unchanged cached client retries account creation, receives an already-registered error and cannot resume that UID. Upgrading to the current verified-aware client recovers the same UID using the original password, requests verification and completes the profile after proof. This mitigation does not make the unchanged binary compatible.

The unchanged legacy Google path is different: its Google identity is already verified and can satisfy the guard. The incompatibility concerns unverified profile-first email/password registration, not every old-client action. Existing account login and established roles retain their current behavior.

## Why a permissive compatibility window or Rules rollback is unsafe

A fresh demo-emulator test switched only its in-memory policy to the old baseline Rules, executed the actual old signup implementation and then signed in directly through the SDK with its still-unverified credentials. The new account received an approved Resident profile and successfully read a server-only, approved-account fixture from volunteerStats. Client login checks did not prevent direct SDK access.

Restoring the create-only verified guard afterward did NOT revoke that account's access. Its profile already existed, and preserving existing account permissions means the approved-profile access paths remain unchanged. A temporary legacy-create allowance therefore cannot be treated as a safe transition or a reversible rollback.

Client-supplied legacy flags, claimed app versions, optional policy markers, backdated profile timestamps, or unsigned headers are not an authority for exemptions. The strict guard rejected both the unverified backdated payload and the extra legacy flag in the diagnostic.

A post-create function that later marks a profile pending is not an atomic access boundary: the approved profile has already committed before the event is handled. Firebase also documents unordered and at-least-once event delivery. See [Firestore event limitations](https://firebase.google.com/docs/functions/firestore-events#limitations). Ownership proof must be enforced at request time through trusted state, such as the Firebase-issued email_verified claim; see [Request.auth token reference](https://firebase.google.com/docs/reference/rules/rules.firestore.Request#auth).

## Cached web and installed Android clients

- Existing no-cache HTML headers help future requests but do not replace JavaScript already running in an open tab or guarantee that all offline/cached clients have updated.
- The checked-in legacy Android configuration has updates.enabled=false. Hosting a new web bundle cannot update an installed Android binary. A compatible Android release must be distributed and installed.
- No checked-in minimum-version or forced-upgrade mechanism was found that can guarantee migration of every already-installed client. Adding one only to a new build does not retrofit old binaries.
- The build-time premium flag does not select which protocol a server request came from and does not update old clients. Keeping it off is compatible with the updated original-layout client; it cannot repair an old deployed bundle.
- Actual deployed bundle/APK inventory and universal adoption were not established. No zero-break cutover is certified.

## Compatibility and rollback matrix

| Client/policy combination | New unverified registration | Existing roles | Decision |
| --- | --- | --- | --- |
| Current premium client + strict guard | Verify, then create on same UID | Preserved | Automated tests pass; human acceptance still required |
| Current original-layout client, premium flag off + strict guard | Auth only, verify, resubmit on same UID | Preserved | Supported safe UI rollback target |
| Unchanged profile-first client + strict guard | Profile write fails before email request | Preserved | Incompatible new Signup; must upgrade/recover |
| Unchanged profile-first client + old permissive Rules | Profile creation succeeds before proof | Preserved, but new unverified accounts inherit approved access | UNSAFE; do not use as a compatibility window |
| Strict guard restored after a permissive window | Blocks further unverified creates | Previously admitted profiles keep approved access | Does not repair the unsafe window |
| Old frontend artifact restored while strict guard remains | New Signup breaks again | Preserved | Not a compatible rollback target |

## Conditional rollout order - blocked at the decision gate

1. Keep the production premium flag off and make no production changes now. Complete isolated-project browser, mailbox and installed-device acceptance. Both existing web build variants still select the production Firebase project, so they must not be used to create real test accounts without separate authorization and an approved isolated test setup.
2. Distribute the verified-aware original-layout web client and a compatible Android build, with the premium UI still disabled. Verify same-UID recovery and support instructions. Client distribution alone does not close the old Rules' verification gap and cannot prove every cached/installed client has updated.
3. STOP until one requirement is explicitly resolved:
   - Accept that obsolete clients' new email/password Signup will be rejected after cutover, while existing accounts retain access and unfinished UIDs recover through an updated client; or
   - Separately authorize and validate a trusted-cohort/quarantine architecture that preserves old clients without granting new unverified accounts protected access.
4. Only after that gate and human acceptance may a future separately authorized release coordinate the strict guard with supported verified-aware clients. Retain all role/status/identity constraints. Do not deploy a permissive exception while waiting for adoption.
5. Keep the premium flag off for the initial supported-client cutover. A later reviewed flag-on build may enable the emerald design after the signup protocol, real mail delivery, OAuth and production-configuration checks have passed.
6. Roll back the UI only to a verified-aware, flag-off build while retaining the security guard. Never roll back to the old permissive Rules or an unsupported profile-first frontend as a compatibility workaround. Keep unfinished Auth UIDs intact and provide the same-credential resume path.

This order explicitly retains the unavoidable obsolete-client Signup incompatibility unless the decision gate authorizes a different architecture. It is not a claim that sequencing deployments can guarantee universal client adoption.

## What a separate trusted bridge would require

A profile-first bridge is possible in principle only if accepting the old payload no longer implies protected eligibility. It would need a trusted way to preserve every incumbent account, synchronous fail-closed ownership/eligibility checks on every protected Firestore, Storage, backend and Function path, and registration recovery that works with the unchanged client protocol.

A server-owned baseline UID registry or equivalent trustworthy cohort would require an approved inventory/migration and completeness checks. It cannot be populated from client legacy flags or assumed from unaudited historical profile timestamps. Prospective timestamp cohorts would additionally need server-pinned, immutable timestamps across every create/update path and an audited plan for historical missing/future timestamps; that guarantee was not established here.

No such bridge was installed, no production inventory was read or migrated, and no new exemption was added. A partial Firestore-only bridge or an asynchronous status rewrite would not justify the requested security guarantee. These are prerequisites for a separately reviewed design, not a claimed completed implementation.

## Tests and evidence

Fresh tests used loopback Auth/Firestore emulators with synthetic accounts only. The policy-switch test is confined to the demo project inside a fresh emulator process; it never writes firestore.rules or any live Rules resource. Its protected reads explicitly use getDocFromServer to rule out local-cache results. No profiles or accounts are deleted by the diagnostic.

- TypeScript: rerun, passed (--noEmit --incremental false).
- Signup regressions: rerun, 38 passed.
- Native Google OAuth regressions: rerun, 11 passed, including PKCE code exchange, cancellation and exchange errors.
- Existing Auth/Firestore authorization suites: freshly rerun, 8/8 passed. Includes 15 signup scenarios, legacy account permissions, same-UID orphan recovery, Google+password identity, Admin/Super Admin authorization, Volunteer access, Donations, Maps, Events, GPS and announcements.
- New rollout/rollback diagnostic: 7/7 scenarios passed. This means the incompatibility and unsafe rollback were successfully reproduced; it is NOT release approval.
- Existing web exports: both flag-on and default-off artifacts verified against their recorded SHA-256 hashes. All prior application inputs match their recorded hashes; no application source changed, so no rebuild was needed for this diagnostic/report-only turn.
- The two previously classified regression failures remain historical baseline issues: CRLF-sensitive Admin navigation assertion and stale Super Admin pagination wording. Their test and product inputs are unchanged; they were not masked or changed.
- git diff --check: passed.

The new diagnostic proves: old-client failure before email request; unchanged-client retry failure; safe flag-off same-UID verification/completion; unchanged existing-role access; unsafe permissive rollback; continued access after guard restoration; and rejection of legacy-flag/backdated unverified creates under the strict policy.

Real mailbox delivery, expired links, browser Google consent/redirect settings, and installed-device return navigation still require a human-operated, approved nonproduction acceptance run. Synthetic emulator verification and OAuth tests do not certify those external systems.

Evidence files (ignored local artifacts): .expo/signup-transition-proof.json, .expo/signup-transition-proof-run.log, .expo/signup-rules-results.json and .expo/signup-transition-final.json.

## Exact file changes

New files in this turn only:

- scripts/test-signup-rollout-transition.cjs - executable local proof of compatibility, security and rollback behavior.
- docs/signup-rollout-transition-20261105.md - this blocked-release decision and conditional rollout plan.

No pre-existing tracked or untracked integration file changed. The aggregate uncommitted integration now consists of the prior 21 files, listed in docs/signup-prod-integration-20261105.md, plus these two additions: 5 modified tracked files and 18 untracked source/document additions (23 total). Application modules, local candidate Rules and the default-off feature flag are unchanged in this turn.

### Aggregate current inventory

Modified tracked files:

- app/_layout.tsx
- app/signup.tsx
- app/signup.web.tsx
- firestore.rules
- lib/firebaseAuth.ts

Untracked additions:

- components/auth/EmailFirstSignup.tsx
- docs/signup-prod-integration-20261105.md
- docs/signup-rollout-transition-20261105.md
- firebase.signup-tests.json
- lib/disposableEmailDomains.generated.ts
- lib/emailFirstSignupAuth.ts
- lib/registrationEmailPolicy.ts
- lib/signupFeature.ts
- lib/signupMessages.ts
- lib/signupRegistration.ts
- lib/useSignupGoogle.ts
- lib/useSignupGoogle.web.ts
- scripts/test-signup-google-oauth.cjs
- scripts/test-signup-prod-emulator.cjs
- scripts/test-signup-prod-rules.cjs
- scripts/test-signup-prod.cjs
- scripts/test-signup-rollout-transition.cjs
- third_party/disposable-email-domains-LICENSE.txt

Do not commit .expo/, emulator logs, build artifacts or node_modules/. The temporary permissive policy exists only as test input read from Git, not as a deployable replacement file.

## Reproduce the isolated proof

~~~powershell
Remove-Item Env:DEBUG -ErrorAction SilentlyContinue
$env:FIREBASE_EMULATORS_PATH = Join-Path (Get-Location) '.expo/emulators'
node node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config firebase.signup-tests.json --only auth,firestore --project demo-volunserve "node scripts/test-signup-rollout-transition.cjs"
~~~

Use a fresh emulator process, not an existing shared test service. No push, merge or deployment command is part of this plan.

## Stop condition and rollback

Both security and transparent compatibility with every unchanged profile-first client are not guaranteed by the current protocol and available trusted state. Product work stopped at this blocker, as requested. The strict guard and feature flag were not relaxed.

There is nothing to roll back in production from this task. To discard this diagnostic/report-only turn locally, review and remove only the two new files listed above; leave the existing integration and all user data untouched. Any future application rollback must retain a verified-aware signup/resume implementation and strict server enforcement.
