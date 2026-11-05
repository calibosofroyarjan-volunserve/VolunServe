# VolunServe authentication rollout plan - 2026-11-05

Status: PLAN ONLY. Production rollout and production preview are NOT CLEARED.

Workspace: C:\Users\Acer\VolunServe-Signup-Prod. Branch: signup-prod-local. Unchanged-main reference: e7c2cc84afcc1b0a8885ce94a41a9a444dcfe751.

This turn adds only this document. Application code, candidate Rules, premium emerald design, Firebase configuration and the default-off feature flag remain unchanged. No Firebase resources or production data were read or changed, and nothing was pushed, merged or deployed. External mailbox/browser tests below are proposed tests, not completed results. Earlier local evidence is explicitly identified.

## Release decision and smallest safe next action

Recommend backward compatibility for existing accounts, with an explicit, announced UPDATE REQUIRED policy for NEW email/password Signup and unfinished registration on obsolete web/Android clients. Do not promise transparent compatibility with every old binary.

Smallest safe next action: the release owner records acceptance or rejection of that limited update requirement and names the owners of the deployed web release and signed Android artifact inventory. This decision and inventory can be prepared without any Firebase change. If uninterrupted new Signup on all unchanged clients is mandatory, keep rollout BLOCKED and commission a separately reviewed trusted eligibility/cohort design; do not add a permissive exception.

The current baseline client creates an unverified Auth UID, commits an approved Resident profile, then requests verification. The strict candidate guard rejects that profile write before the email request. An unchanged client's retry cannot resume the UID. The updated original-layout client can recover the same UID with the same credentials, send verification, then create the profile after proof. Already-verified Google Signup is a different path and may satisfy the guard.

A permissive window is unsafe: synthetic emulator tests demonstrated protected server reads by a newly created unverified approved profile. Restoring the create-only guard did not revoke the already-created profile's access. Client-side login checks cannot secure direct SDK/API access. See [transition proof and compatibility matrix](signup-rollout-transition-20261105.md).

## Signup and provisioning inventory

These are all public entry paths found in the root application source. This is not an inventory of every historical deployed bundle or APK; those artifacts are still required.

| Entry or flow | Current source | Transition requirement |
| --- | --- | --- |
| Direct web /signup, old bookmark or shared link | app/signup.web.tsx | Serve verified-aware original layout initially; premium remains off. Old loaded bundles do not update automatically. |
| Direct Android /signup | app/signup.tsx | Same protocol, delivered through an installed compatible Android build. |
| Web and Android Login > Create Account | app/login.web.tsx and app/login.tsx | Both route to /signup; preserve existing Login UI and completed-account behavior. |
| Guest side drawer > Create Account | components/SideDrawer.tsx | Routes to /signup; retain guest/module behavior. |
| Guest workspace footer > Create an account | components/guest/GuestWorkspace.tsx | Routes to /signup; retain public workspace behavior. |
| Web Google Login with missing profile | app/login.web.tsx | Redirects to /signup with Google session; test same-UID completion without an unintended new account. |
| Root missing-profile session recovery | app/_layout.tsx | Google and premium-enabled password recovery can route to Signup. Flag-off password recovery requires the user to open Signup and resubmit the same credentials; do not advertise a Resume button there. |
| Original-layout email/password Signup | app/signup.tsx, app/signup.web.tsx, lib/firebaseAuth.ts, lib/signupRegistration.ts | Current implementation is Auth-first even with premium off: verify, then resubmit and create once. Unchanged-main clients are profile-first and incompatible at strict cutover. |
| Original-layout Google Signup | Same platform forms | Verified Google identity may complete; preserve baseline behavior and role limits. |
| Premium email-first / Resume Registration | components/auth/EmailFirstSignup.tsx, lib/emailFirstSignupAuth.ts, lib/signupRegistration.ts | Build-time opt-in only. Resume authenticates the original UID; profile creation still requires server verification. |
| Premium Google Signup | lib/useSignupGoogle.web.ts and lib/useSignupGoogle.ts | Web popup / native code exchange; exercise new and existing providers separately. |

No independent /register route was found. Search covered public account-creation calls and links, not only route filenames.

Separate staff paths must remain separate:

- app/admin-login.tsx leads to app/admin-request.tsx for LGU applications. The secondary Auth applicant flow creates a pending_review record without approved access and requests email verification. Do not turn it into public approved Admin creation.
- lib/adminAccounts.ts and backend/server.js contain staff provisioning paths. Retain trusted provisioning, approval and role boundaries. A denied direct Admin creation shortcut must not be activated as a signup workaround.
- Super Admin has no new public self-registration path in this change. Existing Resident, Volunteer, LGU Admin and Super Admin routing and permissions stay at the current production baseline.

Native Google Login needs separate certification: unchanged app/login.tsx reads id_token from the immediate prompt result, while the installed Expo provider can return an authorization code and exchange through hook response state. The new native Signup helper explicitly exchanges code with PKCE; that fix does not certify the unchanged Login handler. Treat this as a static concern and release gate, not a device-proven failure. Do not change Login UI to conceal it.

## Security contract and unavoidable incompatibility

The candidate Firestore change is scoped to public Basic Resident profile creation: require Firebase-issued email_verified=true and the normalized profile email to match the token email, while retaining all schema, role, identity and status restrictions. Existing account read/update/delete and staff permission branches are unchanged. Verification does not grant Volunteer approval, identity verification, LGU Admin or Super Admin privileges.

- An Auth-only unverified UID gets no protected access. No new approved public profile may be committed before proof, including requests sent directly through an old SDK or REST client.
- Never trust a client legacy flag, claimed app version, backdated timestamp, optional policy field or unsigned header as an exemption.
- Do not alter existing profiles or mass-revoke incumbent permissions. Existing-account access follows the baseline policy; verify that policy with role fixtures, including previously unverified incumbents.
- Recovery requires authentication as the same UID, refreshes verification state/token and creates the missing profile once. Existing profiles are not replaced; wrong credentials cannot resume. No automatic account deletion, password reset or second account is part of migration.
- Asynchronous post-create quarantine cannot be the only guard: it runs after the approved record exists. A trusted bridge would require approved incumbent inventory and synchronous fail-closed checks across every protected Firestore, Storage and backend/Function path. It is not implemented or authorized by this plan.

Strict enforcement necessarily breaks NEW unverified profile-first Signup on unchanged old clients. It does not require globally disabling those clients or existing accounts. If that scoped incompatibility is not accepted explicitly, STOP.

## Announced update policy

Before any future cutover, fill in and approve the effective date/time in Asia/Manila and UTC, supported web release hash, Android versionName/versionCode and official distribution link, and support contact. Announce through the public website/release notes and existing approved communication channels; do not claim an in-app old-client notice exists when it does not. No notice has been sent by this task.

Proposed customer/support wording:

> From <approved date/time>, creating a new account or finishing registration requires the updated VolunServe website or Android app <approved version>. Existing accounts can continue to sign in. If registration already started, use the same email and password in Signup on the updated client, verify your email and finish your profile. Do not create another account. If you use Google, continue with the same Google account. Contact <support> if you cannot finish.

On the original-layout flag-off client, resubmit the Signup form with the same credentials after verification. Premium Resume Registration is a later opt-in UI and must not be advertised as available in flag-off builds. Validate recovery for older weaker passwords before approving this wording for every unfinished account.

Web HTML no-cache headers improve future navigation but cannot replace already-running JavaScript, every cached tab or offline client. Direct users to reopen the approved site and refresh when online; retain a support path if the old page only shows a generic error.

Android app.json has updates.enabled=false, package/scheme com.froyarjan123.volunserve and source version 1.0.0. A web publish cannot update installed binaries. No effective existing minimum-version mechanism was found. Distribute a signed compatible update through the established channel; do not silently disable all old-device logins or claim a new minimum-version check can retrofit existing binaries. Actual signed APK hashes, versionCodes, signing identity and installed distribution are unknown. eas.json currently describes an internal preview APK, which is not proof of the production artifact.

Client distribution alone neither closes the old server gap nor proves universal adoption. Keep that residual gap explicit until a separately authorized security cutover. Do not make an unverified legacy-create allowance while waiting.

## Human acceptance setup and evidence

Status of every real mailbox, Google browser and installed-device case below: NOT RUN in this task.

Use synthetic people and controlled Gmail, Yahoo and Outlook mailboxes in an approved isolated Firebase test project. Mirror the needed Auth providers, action URL/authorized domains, Firestore, Storage and backend configuration there. Record project ID and build hashes before entering any credentials. Existing local web exports, including localhost, still target production project volunserve-3aa5b; turning the premium flag on/off does not select a test project. Do not create test accounts through those production-configured artifacts.

A future isolated environment/configuration change requires its own reviewed execution; this plan creates no resources. Emulator-only proof cannot certify real email delivery, OAuth consent, browser redirects or installed Android handoff.

Record case ID, build/flag, test project, browser/OS/device, synthetic UID, redacted provider/email, time, delivery latency/folder, expected/actual outcome and reviewer. Never save passwords, ID/access tokens, raw action URLs or out-of-band codes in the repository. Agree a delivery observation window with the owner; it is a test criterion, not a promised provider SLA.

### Gmail, Yahoo and Outlook verification matrix

| Mailbox | Required coverage | Status |
| --- | --- | --- |
| Real controlled Gmail | E01-E10 in Chrome, flag off and on; Edge repeat of creation/resume/link handling; Android handoff | NOT RUN |
| Real controlled Yahoo | Same cases, including Spam/delivery observations | NOT RUN |
| Real controlled Outlook | Same cases, including Junk/delivery observations | NOT RUN |

| ID | Procedure and acceptance |
| --- | --- |
| E01 | Flag off: submit a fresh email/password on the original form. Auth UID may exist, approved public profile must not. Confirm direct protected server read is denied. Open the real email link, return and resubmit the same credentials; exactly one profile on the original UID, baseline Resident access only. |
| E02 | Flag on: new premium Signup verifies before personal/profile completion; emerald UI remains intact. No approved profile/protected access before proof. Complete once after token refresh. |
| E03 | Close/reopen tab, reload, sign out and resume, and open email link on a different device. Authenticate the same account on return; never carry another user's PII or rely on a persisted sensitive form draft. |
| E04 | Exercise controlled resend and observe Inbox/Spam/Junk and latency. Cooldown/retry messaging must be usable; no send loop or delivery guarantee. Wrong password must not resume or trigger account replacement. |
| E05 | Test an actually expired link, malformed code, wrong action mode and reused link. Show a safe result and allow the correct recovery/resend. Assert actual server outcomes; do not assume all older links are invalidated by resend or that every replay has the same result. No access bypass. |
| E06 | Mistyped/inaccessible mailbox: show supported recovery/help without overriding verification, deleting the UID or silently creating a duplicate. |
| E07 | Duplicate email with wrong/right password, completed profile and existing unverified profile. Correct credentials recover only the intended UID; completed profiles/roles remain unchanged. Verification alone does not promote a role. |
| E08 | Drop network before/after Auth creation, email request and profile transaction; retry, double click and use two tabs. No duplicate profile, overwrite, approved unverified account or misleading successful completion. |
| E09 | Start premium registration, verify, switch to the safe flag-off build, then finish with the same credentials and UID. Re-run protected-read denial before verification and role checks after. |
| E10 | Create a synthetic unfinished legacy Auth UID with a valid older password that fails today's Signup creation-complexity UI. Test flag-off resubmission and premium Resume separately. Current original forms still validate creation complexity; do not certify flag-off recovery/rollback for this cohort unless it works or a reviewed same-credential recovery change is provided. Do not auto-reset credentials. |

Firebase documents verification email delivery calls and action handling separately; neither proves real mailbox delivery. See [manage users / send verification email](https://firebase.google.com/docs/auth/web/manage-users#send_a_user_a_verification_email) and [custom email action handling](https://firebase.google.com/docs/auth/custom-email-handler).

### Google OAuth browser and Android matrix

Run G01-G08 on Chrome and Edge, normal and private sessions, in the isolated project; repeat relevant cases in mobile Chrome. Run G09-G10 on an installed signed Android candidate and supported device versions. All are NOT RUN.

| ID | Procedure and acceptance |
| --- | --- |
| G01 | Fresh Google identity: both Signup UI modes, same verified UID through completion, public role/schema only. Preserve original-layout behavior; premium's explicit first-password setup applies only to its eligible new Google UID with no profile. |
| G02 | Existing Google-only and linked Google+password users: use the existing UID/profile/roles. No forced new-account password setup, duplicate profile or account replacement. |
| G03 | Missing-profile Google login routes into completion. Verify web redirect and native baseline separately; a missing profile never grants protected access. |
| G04 | Cancel/close popup, popup blocked, network interruption, stale response and retry. No false success, abandoned session access or duplicate account. |
| G05 | Exercise the provider-collision scenarios the actual isolated configuration supports. Require proof of the intended existing provider before safe linking/recovery; never silently replace the account. Do not require every Gmail/password combination to raise account-exists-with-different-credential. |
| G06 | Switch Google identities, use multiple tabs, refresh and reopen. Confirm intended UID, persistence/logout behavior, no prior user's form/profile carried over. |
| G07 | Existing Resident, Volunteer, Admin and Super Admin Google/linked fixtures plus pending, suspended and rejected fixtures keep baseline routing/permissions. Provider success is not role approval. |
| G08 | Controlled unauthorized origin/redirect mismatch in the isolated test configuration must fail safely. Verify approved origin and callback success afterward; do not edit production authorized domains. |
| G09 | Actual Android browser/deep-link return: new Signup PKCE code exchange, cancel/retry and unchanged native Login handler. Capture no raw tokens. Login concern must be resolved or proven safe before certification. |
| G10 | Install candidate over the actual older signed build, without uninstall/data clear; retained sessions and Google return routing work. Repeat the forward recovery build with a higher versionCode. |

Provider collision behavior depends on provider/account configuration; see [Firebase Google sign-in and collision handling](https://firebase.google.com/docs/auth/web/google-signin).

### Legacy login, role and module regression matrix

Use synthetic baseline profiles. Compare expected authorization with unchanged-main behavior in the emulator; do not weaken it to make tests pass. Browser/device cases remain NOT RUN.

| ID | Existing-account acceptance |
| --- | --- |
| L01 | Approved Basic Resident email/password login, logout, refresh and protected navigation, both Signup flag modes. No profile migration. |
| L02 | Older valid weak password for a completed account, remembered session, forgotten-password flow in isolated Auth, and wrong password. Existing Login must not impose new Signup complexity on valid credentials. |
| L03 | Approved Volunteer with Resident access enabled/disabled, pending/suspended/rejected statuses and cross-role direct routes; preserve baseline permissions. |
| L04 | LGU Admin issued credentials, assigned municipality/scope and authorized functions. Deny other LGUs' data and public promotion to Admin. |
| L05 | Super Admin login, approved administrative operations and restricted data; non-Super Admin and forged client role cannot gain access. |
| L06 | Pending, suspended, rejected and nonapproved incumbents retain baseline restrictions. Signup cannot turn them into an approved new profile. |
| L07 | Legacy Auth-only UID: ordinary Login's missing-profile outcome is safe; updated Signup recovers same UID, and unverified direct protected access is denied. |
| L08 | Existing unverified profile: preserve baseline permission checks; password Login already requires verification. Test re-verification/recovery without rewriting profile/roles. Do not imply unverified Login was historically supported. |
| L09 | Existing Google-only and linked users, web and installed Android. Include unchanged Login handler certification from G09. |
| L10 | LGU application pending_review, trusted staff provisioning fixtures and Super Admin management remain separate; no public self-granted staff role. |
| L11 | Role switching, stale session, cross-account tabs, direct URL and direct SDK/REST access preserve baseline role/status constraints. |
| L12 | Guest Login/Create Account links and public browsing still work; no non-Signup UI redesign. |
| L13 | Donations with mock processor only, Maps with synthetic locations and Events with synthetic records retain baseline behavior/authorization. No production payment, incident, GPS or event mutation. |
| L14 | Email verification alone never grants identity verification, Volunteer approval, LGU Admin or Super Admin privileges. Test forged legacy/date/role fields directly. |
| L15 | Flag-on to safe-off web rollback and higher-version signed Android recovery: completed profiles unchanged; unfinished eligible registrations resume on same UID. Include weak-credential E10 gate. |

## Existing automated evidence and baseline failures

This plan-only turn does not rerun application builds/tests. The 23 pre-existing integration files and both saved export bundles are compared to the recorded hashes after writing this document; no claim is made that human tests have passed.

Latest recorded local evidence in .expo/signup-transition-final.json, .expo/signup-blocker-final.json, .expo/signup-rules-results.json and .expo/signup-blocker-baseline.json:

| Check | Recorded result |
| --- | --- |
| TypeScript, noEmit/incremental false | PASS |
| Signup lint | PASS |
| Signup regressions | 38 passed |
| Native Signup Google OAuth regressions | 11 passed; synthetic code/PKCE exchange, not actual browser consent |
| Auth/Firestore authorization regressions | 8 suites passed, including 15 Signup scenarios, legacy users, Admin/Super Admin, Volunteers, Donations, Maps, Events, GPS and announcements |
| Rollout/rollback emulator diagnostic | 7 scenarios passed by reproducing old-client incompatibility and unsafe permissive rollback; release remains blocked |
| Broad local scripts | 46 passed, 2 pre-existing failures |
| Web export | Flag off and flag on exported; hashes below, both select production Firebase project |

The two baseline failures were reproduced against unchanged main; neither was hidden by a UI/test change:

- scripts/test-admin-navigation-contract.cjs: CRLF-sensitive exact source assertion; main with the same checkout newlines fails and normalized-main assertion passes.
- scripts/test-superadmin-premium-restoration.cjs: stale Showing/Previous pagination wording assertion; existing shared pagination uses the range/Prev wording.

No new failure was recorded in that comparison. Real external email, OAuth and device behavior are still acceptance gaps. Hash matching is verification of unchanged tested inputs, not a substitute for those tests. See [integration report](signup-prod-integration-20261105.md) and [transition diagnostic](signup-rollout-transition-20261105.md).

## Production-readiness checklist

- [x] Premium emerald UI unchanged; lib/signupFeature.ts enables only literal EXPO_PUBLIC_EMAIL_FIRST_SIGNUP=true. Missing/unset/false stays off. No production flag changed.
- [x] Candidate verified-create guard retained without changing existing role branches; no client-supplied legacy exemption.
- [x] Prior automated evidence and main-baseline failure classification available.
- [ ] Release owner accepts the explicit new/unfinished Signup update requirement; if rejected, STOP.
- [ ] Inventory actual deployed web releases, cached-client risk, APKs/versionCodes, signing identity, distribution channel and support owner; current repository version is insufficient.
- [ ] Freeze full tested flag-off web artifact W_SAFE_OFF, compatible signed Android A_SAFE_OFF and verified-create Rules R_SAFE, including hashes/source patch manifest. Current individual JS hashes are not a full release archive.
- [ ] Record actual live Rules release ID/configuration through a separately approved read-only release audit. Local candidate and Git main do not prove the live state; no live Rules query occurred here.
- [ ] Approved isolated Firebase test configuration proven before credentials entered; Gmail/Yahoo/Outlook E01-E10, browser OAuth G01-G08 and installed-device G09-G10 have signed evidence.
- [ ] Legacy L01-L15 and direct API denial tests pass; E10 weak Auth-only recovery and unchanged native Google Login are resolved/certified.
- [ ] Approved, dated customer notice and support instructions published before any incompatible cutover; users are not silently disabled.
- [ ] Rehearse exact web rollback and Android forward recovery with higher versionCode, same signing identity, no uninstall/data clear and no profile changes.
- [ ] Owners separately approve each production action after all gates pass. Initial protocol cutover keeps premium off; premium opt-in is a later release decision.

## Artifact references and exact rollback

| Reference | Known local identity | Limit |
| --- | --- | --- |
| Unchanged main | e7c2cc84afcc1b0a8885ce94a41a9a444dcfe751 | Forensics only: its unverified profile-first Signup is not a secure post-cutover rollback target. |
| Existing flag-off web JS | entry-d882ce12602b607bb95da0c4b269f16b.js; SHA256 46c0e2aebca3eb054132ee24e95096a06ab06a4dd66f04f0d6e931bd96250741 | Under .expo/signup-blocker-web-off; not a full archived/releasable artifact and not isolated-project QA. |
| Existing flag-on web JS | entry-539aebd8fc0ebea568f253a0cefd3736.js; SHA256 889e7c8d7f120253aa9c535172bf8b20c319a2b6778be38ea6344da2703c9c3d | Under .expo/signup-blocker-web-on; premium activation not approved. |
| Local candidate Rules | SHA256 8256857d44a7be8150aa7c53c57892a0a8eaf50b7627ed6dbf09d1d281ed0325 | Not a live Firebase release ID. |
| Android source | version 1.0.0, package com.froyarjan123.volunserve, OTA disabled | Actual signed baseline/candidate APK hashes and versionCodes NOT PROVIDED. |

Define W_SAFE_OFF and A_SAFE_OFF as reviewed verified-aware original-layout builds, with project/configuration verified and E10 recovery gate passed. Define R_SAFE as a reviewed policy retaining verified public profile creation and all baseline existing-role permissions. Until these full artifacts and Android identities are archived, executable production rollback is BLOCKED; do not invent release IDs or a git-reset/deploy shortcut.

| Failure point | Exact recovery target and boundary |
| --- | --- |
| Current plan-only work | No production rollback required. To discard this turn locally, review/remove only docs/signup-production-rollout-plan-20261105.md; leave all prior integration files untouched. |
| Client preparation fails before server cutover | Halt future cutover. If a future client release needs recovery, use certified W_SAFE_OFF/A_SAFE_OFF. Leave actual server state unchanged; do not claim baseline permissive Rules are secure. |
| Premium UI regression after a later approved flag-on release | Rebuild/release the frozen verified-aware source with premium off, or restore certified W_SAFE_OFF. Android uses a higher-version signed A_SAFE_OFF recovery build. Keep R_SAFE. Check built flag and project, same UID recovery and role permissions. |
| Client regression after strict cutover | Restore only W_SAFE_OFF/A_SAFE_OFF, keeping R_SAFE. Never restore the unchanged profile-first bundle as a Signup rollback. |
| Rules regression after strict cutover | Only a separately reviewed corrective R_SAFE preserving verified creation and existing permissions may be released. If none is available, stop/escalate; no permissive exception or automatic downgrade. |
| Mail/OAuth provider outage | Hold rollout, keep unfinished UIDs intact, use approved retry/help messaging. No unverified access, provider disablement, automatic credential reset or profile replacement. |
| Accidental permissive window | Treat as a security incident. Restore the strict gate to prevent further admission, but do not claim that revokes profiles already admitted. Investigate under separate authorization; any trusted-cohort remediation/data change requires a separate approved plan. Never auto-delete accounts/data. |

Android recovery must be a forward update signed with the established identity and a versionCode higher than the installed faulty release. Do not depend on a downgrade, uninstall or data clear. Android's upgrade ordering is documented in [versioning your app](https://developer.android.com/studio/publish/versioning).

After any future rollback: record operator/time, full web/APK/Rules identities and flag/project; verify existing Resident/Volunteer/LGU Admin/Super Admin login and module authorization, direct unverified protected-read denial, one same-UID unfinished completion and Google login. Preserve production data and stop if any security/role check fails. No rollback or deployment command is executed or authorized by this document.

## Proposed future rollout order with stop gates

1. NOW: keep premium off, review update policy and inventory artifacts. No Firebase or production change.
2. Prepare approved isolated QA, freeze safe-off web/Android candidates and R_SAFE, complete E/G/L tests and Android forward-recovery rehearsal. Fix identified issues in separately reviewed work; preserve existing UI/modules.
3. Only after approval, announce the scoped update requirement and distribute verified-aware flag-off clients. This preparation does not prove universal adoption or close the old server gap.
4. STOP until customer policy, human tests, weak-credential recovery, native Login, actual live state and rollback artifacts are accepted. If the owner requires unchanged clients' new Signup to remain seamless, stay blocked; do not deploy incompatible Rules under that promise.
5. A future separately authorized security cutover may enforce verified public profile creation while premium stays off. Obsolete email/password clients will require update for new/unfinished Signup. Existing accounts retain baseline permissions. Do not silently substitute a weaker policy for compatibility.
6. Validate using an explicitly approved production release procedure; no real production account/data mutation is part of this task. Hold on any security, role or authentication regression.
7. Only later consider a separately reviewed premium flag-on build, after protocol, mail, OAuth and device acceptance. Retain the certified safe-off rollback artifacts and strict guard.

## Changes and remaining blockers

Only new file this turn: docs/signup-production-rollout-plan-20261105.md. The 23 existing integration files remain unchanged: five modified tracked files plus 18 untracked additions are listed in the transition report. With this document, the aggregate inventory is five modified tracked files and 19 untracked additions. Ignored .expo/, emulator logs, exports and node_modules are local evidence/generated artifacts and must not be committed.

Remaining blockers: unaccepted scoped update requirement; incomplete actual live/deployed artifact inventory; real mailbox/browser/device acceptance; weak-credential Auth-only flag-off recovery; unchanged native Google Login certification; and unfrozen full rollback artifacts. There is no guaranteed secure transparent cutover for every old profile-first client under the current protocol. Keep rollout and production preview blocked until those gates are resolved. No code, security, account or data workaround was introduced.
