# Signup integration and blocker-resolution report - 2026-11-05

Workspace: C:\Users\Acer\VolunServe-Signup-Prod. Branch: signup-prod-local.
Main baseline: e7c2cc84afcc1b0a8885ce94a41a9a444dcfe751.
Selected premium source: origin/fix/email-verification-validation-20261104 at 3bf4e4c68b468cb2ffe49451a44b63b6da562adc.

Changes are local and uncommitted. No push, merge, deployment, production Firebase operation, account deletion, or user-data migration was performed. Firebase writes during validation were confined to a fresh, loopback-only demo emulator process. Existing authorization suites clear only synthetic emulator fixtures; no existing emulator service or production data was used.

## Release decision

The two implementation blockers found by the read-only audit are addressed in this checkout: server-enforced verified community profile creation, and native Google authorization-code exchange. Unfinished Auth-only registrations can resume on the same UID. Automated acceptance results are below.

Ready for an isolated nonproduction preview after test-project setup. NOT ready for a production-backed signup preview or production rules deployment until real browser/device and mailbox acceptance plus the coordinated client/rules cutover are approved. The premium flag remains disabled by default.

This report supersedes the previous statement that no implementation blocker remained before the native Google issue was discovered. Production Firebase configuration and deployment configuration remain unchanged. No live deployed rules were queried or changed.

## Default-off feature flag and preserved scope

Only EXPO_PUBLIC_EMAIL_FIRST_SIGNUP=true enables the premium screen. Missing, false, 1 and TRUE keep the original Signup layout. The new screen's render tree and styles match the pre-fix premium design exactly (SHA-256 of the render/style section: 22073609ca0f86c4328fcb3ef62d6f0f0c634c8e21b2b9cf7bfc080f56f64ee0).

Both original Signup layouts and styles match main. Their submission behavior and verification instructions now support the stricter create rule. Login UI, LGU Admin, Super Admin, Resident, Volunteer, Maps, Events, Donations, backend/functions, dependency manifests and all other app modules are unchanged.

The feature flag changes Signup only. Both flag-on and default-off builds still select production project volunserve-3aa5b through the unchanged lib/firebase.ts. It is not a test-project selector. Do not perform manual signup QA against this production configuration without separate authorization. Use an approved isolated test project/test build for real OAuth and mailbox acceptance.

## Verified profile creation design

Only four lines were added to firestore.rules: two comments and two conditions in the existing Basic Resident allow-create expression:

~~~text
request.auth.token.get('email_verified', false) == true
request.resource.data.email == request.auth.token.get('email', '').lower()
~~~

All UID, role, schema, geography, empty Volunteer qualification and Basic identity constraints remain in place. All existing-profile reads/updates and every staff, Resident and Volunteer authorization rule remain byte-equivalent to main after removing those four lines and normalizing line endings. No global email check was added to approved(), hasResidentAccess(), Admin or Super Admin helpers.

There is no client-controlled policy flag, backdated timestamp exception, missing-field exemption, or second permissive community-create rule. Google ownership must also be represented by a verified Firebase token. Pending LGU staff application rules remain separate and unchanged; they grant no operational access.

The guard concerns new community profile creation. It does not impose a new ongoing verification requirement on existing accounts or change their established permissions. Existing password login's verification behavior also remains unchanged.

## Old signup and secure resume

The old form now creates an Auth UID, requests verification, signs out and keeps the filled form in memory. It writes no personal profile while unverified. Instructions ask the user to open the verification link and return to submit again with the same email/password. No personal draft or password is persisted to local storage.

Resubmitting, including after a refresh with re-entered details, attempts account creation; if Firebase reports email-already-in-use, it authenticates using the SAME password instead. Wrong credentials stop the flow. Verified users without a profile finish on that UID. Existing profiles are never replaced. Existing unverified profile owners can request verification without rewriting their profile. A failed verification request leaves a resumable Auth UID.

Every profile creation path now uses a transaction that rejects existing documents and changed sessions. New profiles retain the production Basic Resident schema, without staging-only emailVerificationRequired or emailPolicyVersion fields. No Volunteer, Admin, Super Admin or identity privileges are granted.

Premium Resume Registration is sign-in-only. It reloads Firebase ownership state, refreshes verified tokens, and checks whether a profile exists before choosing verification, Google password setup, profile completion, or Login. This also recovers an Auth-only UID left by an outdated client whose profile write was rejected. A verified Google-only account goes through explicit password setup; verification checks no longer skip that step.

The existing root guard keeps missing password profiles on Signup only when the premium feature is enabled. Default-off users can finish through the original form's secure resubmission. No protected route is unlocked by an Auth-only UID.

## Google OAuth resolution

The native helper preserves the existing production Android/web client IDs and redirect scheme. It sets shouldAutoExchangeCode=false and performs one explicit AuthSession.exchangeCodeAsync call using the request's clientId, redirectUri and PKCE code verifier. Only the resulting ID token is passed to Firebase. Direct ID-token responses still work. Cancellation, provider errors, missing verifier, failed exchange and missing tokens never sign in to Firebase.

This resolves the audit finding: Expo's raw promptAsync result can contain only an authorization code, while its automatic exchange normally updates separate hook response state. The helper no longer assumes the raw result already contains an ID token.

Web continues to use the existing popup approach. New Google password attachment still refuses existing profiles/passwords, requires verified ownership, and checks the same UID after linking or the guarded Firebase SDK fallback. Existing Google-login and password-setting functions were not changed.

## Compatibility and rollout gate - do not deploy the rules alone

| Client/account | Result under candidate rules |
| --- | --- |
| Existing Resident, Volunteer, LGU Admin, Super Admin | Existing permissions unchanged, including unverified legacy-token rule tests |
| Updated old form, feature off | Auth first; verify; same-UID resubmission completes successfully |
| Premium form, feature on | Verify first; complete Basic Resident profile atomically |
| Auth-only orphan | Same credentials/Google identity resume the existing UID |
| Original main's deployed old signup code | Its unverified profile-first write is denied, as expected |

Strict server enforcement cannot simultaneously allow an obsolete client to create unverified community profiles. The original main client was explicitly tested against the candidate rules: its profile write fails, and the updated resume flow recovers that UID. This is a rollout gate, not an exemption to weaken the guard.

A future release must ship the verified-aware client first, account for cached web clients and supported native builds, complete acceptance QA, and approve a coordinated rules cutover. Do not deploy this rules diff alone. No rule deployment is authorized by this local task.

## Validation results

- TypeScript: passed with --noEmit --incremental false.
- Signup-specific ESLint: passed.
- Signup regressions: 38 passed.
- Native Google OAuth regressions: 11 passed, including the previously failing code-only response and PKCE/cancellation/error cases.
- Local regression script runs: 46 passed; only the two pre-existing baseline source-contract failures remain. This includes unchanged Admin/Super Admin compatibility and 10 passing donation backend tests.
- Auth/Firestore demo emulators: 8 of 8 suites passed. The expanded signup suite has 15 passing scenarios; LGU Admin authorization has 30, Community Events 17, and Maps 11 passing checks, alongside Volunteer, donation privacy, GPS and announcement tests.
- Direct SDK writes with unverified/missing claims, spoofed email and a backdated timestamp are denied. A verified mixed-case token email normalized to the stored address succeeds.
- Existing unverified Resident/Volunteer/Admin/Super Admin self-read/profile-update permissions and staff user-list access were tested. Ordinary community users still cannot list private users.
- Original Signup rendered markup/styles remain unchanged; premium Signup render/style hash matches the pre-fix snapshot.
- Expo web exports: both fresh web exports passed; emitted bundles verify true/on versus unset/off, and both retain production project volunserve-3aa5b.
- git diff --check: passed.

The TypeScript backup-exclusion test was not repeated because it creates and recursively removes a fixture. Its earlier passing result remains available. All current application sources were type-checked directly.

Two unchanged-main failures were classified without editing their tests or product UI:

1. scripts/test-admin-navigation-contract.cjs:71: its literal LF string fails against Windows CRLF rules. It also fails against main reconstructed with the checkout's line endings, and passes with main rules normalized in memory. Actual LGU authorization scenarios pass, including rejection of direct Admin creation and unauthorized promotion.
2. scripts/test-superadmin-premium-restoration.cjs:25: stale copy assertion expects Showing/Previous, while main's existing shared pager uses a numeric range and Prev. The pager and Super Admin UI are unchanged.

No new automated regression failure remains. The five intermediate failures caused by removal of the exact phrase verification link were resolved by clarifying the new Signup instructions; their tests were not weakened or edited.

Evidence: .expo/signup-blocker-final.json, .expo/signup-blocker-regressions.json, .expo/signup-blocker-baseline.json, .expo/signup-rules-results.json, .expo/signup-blocker-emulators.log and .expo/signup-blocker-export-*.log. These are local ignored artifacts, not commit material.

## Human-operated acceptance still required

Run these only with an approved isolated Firebase project, authorized test mailbox and test Google identities. Current production project settings must not be modified for this task.

- Actual verification-email delivery to Gmail/Outlook or supported mailboxes, Inbox/Spam behavior, resend quotas/cooldowns, expired/already-used links, wrong address and inaccessible mailbox behavior. A send request is not proof of delivery or ownership.
- Open the real link in the same browser, another tab and another device; reload/close/reopen Signup; resume using the same UID; ensure no profile exists before proof and no duplicate profile appears after repeated completion.
- Default-off original form: first submit, real inbox verification, return/resubmit, refresh/re-enter details, wrong password, duplicate registered address, failed email request and successful recovery.
- Chrome/Edge Google consent, popup blocked/cancelled, returning from consent, new Google-only registration, existing Google-only and Google+password users, account collisions, staff accounts and suspended/rejected accounts.
- Android installed development build: actual redirect registration, package/signing credentials, PKCE exchange, app background/foreground, cancellation and resume after restart. Export/unit success does not validate Google console configuration or a device browser round trip. iOS is not certified by these tests and needs a registered iOS OAuth client before acceptance.
- Confirm correct Auth UID, verified email and exactly one Basic Resident document using approved nonproduction inspection; verify existing role dashboards still route correctly.

## Exact changed-file inventory against main

Modified tracked files (5):

- app/_layout.tsx - existing feature-gated incomplete-account routing.
- app/signup.tsx - original native form retained; verified-aware submission and instructions.
- app/signup.web.tsx - original web form retained; verified-aware submission and instructions.
- lib/firebaseAuth.ts - verified creation, same-UID legacy resume and atomic no-overwrite writes.
- firestore.rules - create-only verified-token and email-match guard.

Added files (16):

- components/auth/EmailFirstSignup.tsx - premium Signup and state/resume handling.
- lib/signupFeature.ts - default-off build switch.
- lib/signupRegistration.ts - credential-authenticated resume and read-only registration inspection.
- lib/emailFirstSignupAuth.ts - guarded Google password attachment.
- lib/useSignupGoogle.ts - native Google PKCE exchange.
- lib/useSignupGoogle.web.ts - web Google popup.
- lib/signupMessages.ts - Signup messages.
- lib/registrationEmailPolicy.ts - client email checks.
- lib/disposableEmailDomains.generated.ts - required domain snapshot.
- third_party/disposable-email-domains-LICENSE.txt - required snapshot license.
- firebase.signup-tests.json - loopback demo emulator configuration.
- scripts/test-signup-prod.cjs - Signup/legacy/account regressions.
- scripts/test-signup-google-oauth.cjs - native OAuth contract regressions.
- scripts/test-signup-prod-emulator.cjs - direct Rules, real SDK and legacy/resume integration tests.
- scripts/test-signup-prod-rules.cjs - demo emulator suite runner.
- docs/signup-prod-integration-20261105.md - this report.

No dependency, production Firebase config, deployment config, login UI, protected module, backend or function file changed. Keep .expo/, node_modules/, debug logs, build output, private credentials and environment secrets out of commits. The generated domain snapshot is required runtime source data and must accompany its MIT license.

## Reproduce

~~~powershell
node node_modules/typescript/bin/tsc --noEmit --incremental false
node scripts/test-signup-prod.cjs
node scripts/test-signup-google-oauth.cjs
node --test backend/tests/fundReleaseReconciliation.test.js
Remove-Item Env:DEBUG -ErrorAction SilentlyContinue
$env:FIREBASE_EMULATORS_PATH = Join-Path (Get-Location) '.expo/emulators'
node node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config firebase.signup-tests.json --only auth,firestore --project demo-volunserve "node scripts/test-signup-prod-rules.cjs"
$env:CI = '1'
$env:EXPO_NO_DOTENV = '1'
$env:EXPO_PUBLIC_EMAIL_FIRST_SIGNUP = 'true'
node node_modules/expo/bin/cli export --platform web --output-dir .expo/signup-blocker-web-on --max-workers 2 --clear
Remove-Item Env:EXPO_PUBLIC_EMAIL_FIRST_SIGNUP -ErrorAction SilentlyContinue
node node_modules/expo/bin/cli export --platform web --output-dir .expo/signup-blocker-web-off --max-workers 2 --clear
~~~

## Rollback

No production rollback is needed: nothing was deployed or changed in production.

Keep the premium flag unset/false. A build-time flag change requires a fresh build and cleared Metro cache. Do not roll back only the client after a future strict-rules deployment: an unverified profile-first client is incompatible with that guard. Client/rules rollback must be reviewed together.

To undo only this blocker-resolution pass locally, first preserve later work. The previous integration's affected files were copied to .expo/signup-before-blocker-fixes before editing; restore only explicitly reviewed files from that snapshot and remove the two newly added files lib/signupRegistration.ts and scripts/test-signup-google-oauth.cjs after reviewing the diff. This intentionally restores the previously audited blockers, so it is not a release-ready rollback target.

For complete local removal of the uncommitted Signup integration, preserve later edits, restore only the five modified tracked files from e7c2cc8, then remove only the sixteen listed additions after review. Do not use repository-wide reset/clean. Do not delete Firebase users, profiles, uploads or other data. Completed profiles use the production schema; unfinished Auth-only accounts must be given a compatible resume path.
