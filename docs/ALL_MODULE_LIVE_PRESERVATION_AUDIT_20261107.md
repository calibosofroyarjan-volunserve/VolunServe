# VolunServe — All-module live-source preservation audit (READ ONLY)
Date: 2026-11-07 (Asia/Manila)
Decision: **PRODUCTION DEPLOYMENT BLOCKED pending real isolated functional QA and branch reconciliation.**
Assessment method: GitHub commit comparisons, exact blob hashes of critical files, source/action snippets, existing nonproduction test scripts. **No signed-in runtime session, database operations or real payments tested.**

## Baseline and independent proof
- LAST independently public-verified Hosting marker: `e83f4a72c7cb733ff7bb888a6ac19bf3c0f076c4`, from run https://github.com/calibosofroyarjan-volunserve/VolunServe/actions/runs/42378344467 . Check current live marker again before future release: this is not a permanent guarantee.
- Candidate PR #277 source: `design/web-mobile-unified-roles-20261107`; comparison against live: **125 commits ahead, 0 behind**, **85 changed paths**, 33 added, 52 modified, 0 deleted.
- Protected `release/production-hosting` currently: **5 commits ahead, 0 behind** exact live source, 4 changed files, all GitHub test/preview workflows; no web application source edits in protected release.
- PR #276 and PR #277 are **diverged sibling branches**: #276 → #277 comparison 28 ahead / 30 behind, 21 different paths. Picking #277 as the 'latest' can omit distinct #276 UI work; not safe to merge without file-by-file reconciliation.
- `main` is **not** the live superset (prior compare: 4 commits ahead/12 behind the live revision), and has separate certificate auto-sync backend work. Never deploy raw main or silently discard main-only work.

## Exact identical source blob checks (LIVE versus PR #277)
The following 11 file paths were independently fetched from both refs and their Git blob hashes matched exactly. This verifies **source identity of these files only**:
- ✅ `firestore.rules`
- ✅ `storage.rules`
- ✅ `firebase.json`
- ✅ `functions/index.js`
- ✅ `backend/server.js`
- ✅ `app/(tabs)/certificate.tsx`
- ✅ `app/(tabs)/notifications.tsx`
- ✅ `app/(tabs)/profile.tsx`
- ✅ `app/(tabs)/my-cases.tsx`
- ✅ `app/(admin)/account-approvals.tsx`
- ✅ `app/(admin)/command-center.tsx`

## Role/module verification matrix
| Area | Candidate diff | Verified at code level | Blocking runtime checks |
|---|---|---|---|
| Authentication and account creation | Modified login/signup web/native wrappers, Firebase config, identity URL | Production wrappers still exist; staging flag conditionally disables auth | Needs real test: verified email, OTP/Google, disposable email, guest vs resident, password reset, logout/role redirects |
| Resident Home and updates | Home.web modified, notifications route unchanged, Admin publish form changed | Notification dropdown trigger/router strings preserved in source | Needs live-independent staged publish/receive and unread/count tests |
| Resident identity and admin review | Identity client and Admin identity screen modified; Functions and Rules unchanged | Staging backend guard is conditional; selected review source actions remain | Needs fake identity/OCR upload, approval status, permissions and UI errors test |
| Emergency reporting and volunteer tasks | Admin cases, maps, volunteer web/native and tab shell modified | Volunteer action transaction and openLiveMap calls retained in inspected source; core functions unchanged | Needs emergency report → admin assignment → volunteer accept/decline, GPS/map and time in/out tests |
| Donations and assistance | Resident donation and Admin assistance modules modified, Render backend server file unchanged | Production Render base URL was hard-coded in live and remains the production fallback in guarded helper | Needs sandbox donation checkout, money bar, admin release, beneficiary acknowledgment, failed request and audit tests |
| Community events, attendance and certificates | Events and roster UI modified; certificate route and Notifications route identical | Core certificate route exact blob match; backend in candidate same source | Needs join/roster/time in-out, Admin attendance verification, PDF certificate visibility and download tests |
| Super Admin | Super Admin shell, settings, directory and records screens modified | Settings save button remains bound to saveSettings in inspected source | Needs create/revoke Admin, role permission, saved settings, logs, pagination, logout tests |
| Backend/Firebase infrastructure | Firestore rules, Storage rules, firebase.json, functions/index.js, backend/server.js have identical blobs | Source unchanged does NOT prove deployed remote Render functions/state | No Rules/Functions/Render deployment; production data operations remain prohibited during audit |

## Important source findings
1. PR #277 changes **login/signup wrappers** and `lib/firebase.ts` to support opt-in staging builds. The original production components remain in the source, but an erroneous production `EXPO_PUBLIC_VOLUNSERVE_STAGING_MODE=1` build would show a read-only login notice instead of live login. **Must assert build environment is production mode before any candidate deploy.**
2. Selected Admin/Volunteer/Resident handlers were compared via exact source lines. Volunteer `runTransaction` and `openLiveMap`, Admin announcement Firestore publish call and button binding, Super Admin `saveSettings`, Resident volunteer `submitApplication`, and home notification dropdown source references are present. This is **not** proof that remote permissions, Firebase data, APIs, uploads or actual user clicks work.
3. The new shared `VolunServeButton`, `VolunServeField`, `ListPagination`, dialog styles and route shells touch high-traffic screens. Tests mostly validate source strings or sample-data UI; every critical real action still requires isolated manual E2E.
4. Existing `scripts/test-live-first-ui-only-20261107.cjs` has a narrow protected-file allowlist that explicitly forbids auth, donations and report modifications. **PR #277 is broader than that gate** (it modifies auth and other protected paths). Do NOT certify it using earlier PR #271 UI-only tests or work around the guard without fresh review.
5. Candidate #277 introduces staged Firebase/backend restrictions and a dummy Firebase review configuration. Its `/public/design-review` is fictional data; browser screenshot checks cannot certify real account, donation, attendance, certificate or emergency behavior.
6. There is **no confirmed separately provisioned fully functional Firebase staging environment** with staging Auth/Firestore/Functions/Storage and real four-role fake accounts. Firebase Hosting preview clone shares production backend resources; **do not test real writes on it**. Firebase docs: https://firebase.google.com/docs/hosting/test-preview-deploy.
7. OIDC + Hosting read-only + preview clone and public marker tests have passed their specific checks. They **do not enforce a single production release path**, because historic release workflows and shared GitHub repository secrets remain. Do not revoke early; coordinate a safe cutover later.
8. Live Render backend and identity-AI deployment versions were **not reverified in this audit**; connector could not select a Render workspace without the account owner selecting it. GitHub source equality does not prove a Render deployment's active version.

## Explicit preservation acceptance checklist
- [ ] Resident notification bell dropdown and announcements publication
- [ ] Single login/signup, verified email, role redirects and guest limitations
- [ ] Admin / Super Admin permissions and audit logs
- [ ] Resident reports, emergency GPS, in-app maps and volunteer assignment/accept/decline
- [ ] Donations, assistance, campaign progress/money bar, approvals and acknowledgments
- [ ] Community Events join/roster, attendance time-in/out, auto PDF certificates
- [ ] Live project config, Firestore/Storage rules, Cloud Functions, Render and Identity AI backend

**Minimum E2E protocol (must use nonproduction accounts/data):** for EACH role and core module test navigation, list/detail, happy path, invalid input, server rejection, permissions, reload/persistence, desktop/narrow mobile, and expected notifications. No UI feature is certified until its real state transition and backend effect are observed in isolated staging.

## Must finish before any release
1. Read current production marker from BOTH live domains; record current Hosting version and rollback release.
2. Compare all files that differ between PR #276 and #277; create fresh live-descendant candidate with individually approved features, not a blind merge.
3. Establish separate Firebase + backend test environment. Avoid production credentials and realistic PII; sandbox payments only.
4. Run TypeScript/Expo, static contract tests, full affected-module E2E and mobile/responsive regression; fix all confirmed failures.
5. Build a tested immutable web artifact; recheck diff manifest and exact approved source; require GitHub Environment human approval.
6. Complete safe authorization/credential cutover and provide rollback and post-release checks; **do not push to live without owner's explicit final approval**.

## Full comparison path ledger (85 paths)
The table inventories **all paths GitHub reports different**, not a claim of E2E verification for them.
| Path | Diff status | Changed lines |
|---|---|---:|
| `.github/workflows/build-isolated-web-review-20261107.yml` | added | 75 |
| `.github/workflows/smoke-hosted-readonly-preview-20261107.yml` | added | 28 |
| `.github/workflows/test-browser-four-role-20261107.yml` | added | 37 |
| `.github/workflows/validate-four-role-design-review-20261107.yml` | added | 69 |
| `.github/workflows/validate-isolated-live-derived-web-20261107.yml` | added | 78 |
| `.github/workflows/validate-isolated-staging-backend-20261107.yml` | added | 90 |
| `.github/workflows/validate-live-all-modules-20261107.yml` | added | 68 |
| `.github/workflows/validate-live-first-ui-20261107.yml` | added | 55 |
| `app/(admin)/_layout.tsx` | modified | 33 |
| `app/(admin)/admin-cases.tsx` | modified | 18 |
| `app/(admin)/assistance-requests.tsx` | modified | 24 |
| `app/(admin)/community-attendance.tsx` | modified | 3 |
| `app/(admin)/community-events.tsx` | modified | 18 |
| `app/(admin)/create-announcement.tsx` | modified | 87 |
| `app/(admin)/donation-list.tsx` | modified | 4 |
| `app/(admin)/identity-reviews.tsx` | modified | 14 |
| `app/(admin)/lgu-attendance.tsx` | modified | 3 |
| `app/(admin)/lgu-members.tsx` | modified | 3 |
| `app/(lgu)/index.tsx` | modified | 3 |
| `app/(superadmin)/_layout.tsx` | modified | 43 |
| `app/(superadmin)/admin-accounts.tsx` | modified | 17 |
| `app/(superadmin)/admin-logs.tsx` | modified | 11 |
| `app/(superadmin)/all-records.tsx` | modified | 21 |
| `app/(superadmin)/index.tsx` | modified | 33 |
| `app/(superadmin)/system-settings.tsx` | modified | 122 |
| `app/(tabs)/_layout.tsx` | modified | 77 |
| `app/(tabs)/community-events.tsx` | modified | 16 |
| `app/(tabs)/donation.tsx` | modified | 20 |
| `app/(tabs)/resident.tsx` | modified | 6 |
| `app/(tabs)/volunteer-application.tsx` | modified | 86 |
| `app/(tabs)/volunteer.tsx` | modified | 67 |
| `app/(tabs)/volunteer.web.tsx` | modified | 79 |
| `app/admin-request.tsx` | modified | 7 |
| `app/login.tsx` | modified | 7 |
| `app/login.web.tsx` | modified | 7 |
| `app/public/design-review.tsx` | added | 4 |
| `app/signup.tsx` | modified | 7 |
| `app/signup.web.tsx` | modified | 7 |
| `components/admin/AdminReviewHero.tsx` | modified | 82 |
| `components/admin/DashboardPendingIdentityReviews.tsx` | modified | 3 |
| `components/auth/ReadOnlyPreviewAuthNotice.tsx` | added | 91 |
| `components/donations/CampaignBeneficiaryWallet.tsx` | modified | 3 |
| `components/donations/DonationAdminDashboard.tsx` | modified | 3 |
| `components/donations/FundReleaseControls.tsx` | modified | 3 |
| `components/donations/ResidentReleaseAcknowledgment.tsx` | modified | 3 |
| `components/donations/ResidentWalletSetup.tsx` | modified | 3 |
| `components/guest/DesignReviewWorkspace.tsx` | added | 528 |
| `components/guest/GuestWorkspace.tsx` | modified | 15 |
| `components/home/Home.web.tsx` | modified | 31 |
| `components/tabs/MapTracking.web.tsx` | modified | 3 |
| `components/ui/AppDialogHost.tsx` | modified | 23 |
| `components/ui/ListPagination.tsx` | modified | 34 |
| `components/ui/VolunServeButton.tsx` | added | 97 |
| `components/ui/VolunServeField.tsx` | added | 83 |
| `components/volunteers/CommunityEventRoster.tsx` | modified | 3 |
| `constants/volunserveLiveUi.ts` | added | 39 |
| `docs/ISOLATED_RENDER_STAGING_API_SHELL_20261107.md` | added | 35 |
| `docs/ISOLATED_STAGING_READINESS_20261107.md` | added | 53 |
| `docs/LIVE_ALL_MODULES_UI_REVIEW_20261107.md` | added | 45 |
| `lib/firebase.ts` | modified | 25 |
| `lib/identityVerification.ts` | modified | 5 |
| `lib/stagingBackendSafety.ts` | added | 52 |
| `lib/stagingFirebaseConfig.ts` | added | 63 |
| `scripts/audit-staging-external-endpoints-20261107.cjs` | added | 57 |
| `scripts/audit-volunserve-module-controls-20261107.cjs` | added | 128 |
| `scripts/require-isolated-preview-build-20261107.cjs` | added | 34 |
| `scripts/smoke-readonly-auth-browser-20261107.cjs` | added | 46 |
| `scripts/smoke-staging-public-preview-20261107.cjs` | added | 26 |
| `scripts/test-admin-compact-workspace-ux.cjs` | modified | 11 |
| `scripts/test-admin-people-verification-premium-ui.cjs` | modified | 9 |
| `scripts/test-admin-response-workspace-ux.cjs` | modified | 6 |
| `scripts/test-four-role-design-review-20261107.cjs` | added | 26 |
| `scripts/test-isolated-staging-config-20261107.cjs` | added | 38 |
| `scripts/test-lgu-admin-global-ui-pagination.cjs` | modified | 7 |
| `scripts/test-live-controls-consistency-20261107.cjs` | added | 66 |
| `scripts/test-live-first-ui-only-20261107.cjs` | added | 90 |
| `scripts/test-portal-resident-volunteer-ui-flow.cjs` | modified | 26 |
| `scripts/test-profile-certificates-account-menu.cjs` | modified | 12 |
| `scripts/test-readonly-preview-auth-guard-20261107.cjs` | added | 26 |
| `scripts/test-resident-volunteer-sidebar.cjs` | modified | 5 |
| `scripts/test-staging-backend-isolation-20261107.cjs` | added | 52 |
| `scripts/test-volunteer-donations-sidebar-removal.cjs` | modified | 7 |
| `scripts/test-web-mobile-four-role-browser-20261107.cjs` | added | 68 |
| `staging-backend/server.cjs` | added | 101 |
| `staging-backend/test-isolation.cjs` | added | 57 |

## Distinct sibling-branch difference ledger (21 paths)
- `.github/workflows/test-browser-four-role-20261107.yml`
- `.github/workflows/validate-four-role-design-review-20261107.yml`
- `app/(admin)/_layout.tsx`
- `app/(admin)/admin-cases.tsx`
- `app/(admin)/assistance-requests.tsx`
- `app/(admin)/community-events.tsx`
- `app/(admin)/identity-reviews.tsx`
- `app/(superadmin)/_layout.tsx`
- `app/(superadmin)/admin-accounts.tsx`
- `app/(superadmin)/admin-logs.tsx`
- `app/(superadmin)/all-records.tsx`
- `app/(superadmin)/index.tsx`
- `app/(tabs)/_layout.tsx`
- `app/(tabs)/community-events.tsx`
- `app/(tabs)/donation.tsx`
- `app/(tabs)/resident.tsx`
- `app/public/design-review.tsx`
- `components/guest/DesignReviewWorkspace.tsx`
- `components/guest/GuestWorkspace.tsx`
- `scripts/test-four-role-design-review-20261107.cjs`
- `scripts/test-web-mobile-four-role-browser-20261107.cjs`

### Explicit non-actions
No live deploy, no commit on production release branch, no merge/rebase/cherry-pick of UI, no Firestore/Storage/Auth/Functions changes, no Render deployment, no credential revocation, no user-data mutation. This document is stored only in an independent safety branch.
