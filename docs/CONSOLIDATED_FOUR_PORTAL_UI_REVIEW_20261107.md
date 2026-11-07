# VolunServe consolidated four-portal UI review — tested, NOT deployed

**Date:** November 7, 2026 (Asia/Manila)
**Decision:** SOURCE & BUILD GATES PASSED. **PRODUCTION RELEASE STILL BLOCKED** until separate authenticated staging QA, fresh live fingerprint and explicit owner go/no-go.

## Verified review candidate

- Review branch: `review/live-preserve-integration-20261107`
- Exact last independently verified LIVE Hosting source: `e83f4a72c7cb733ff7bb888a6ac19bf3c0f076c4`.
- GitHub comparison: **19 commits ahead, zero behind** live source; **27 changed paths** (3 added, 24 modified, **zero deleted**).
- Changes cover 22 presentation-only screen/style files across Resident, Volunteer, Admin and Super Admin, plus the shared Admin header, shared design tokens, no-deploy validation workflows and one UI regression-test update. **One consolidated review branch**, NOT module-by-module production releases.
- Rather than copying PR #277 wholesale, its `StyleSheet.create` visual definitions were selectively used while retaining the **exact operational source prefix** (existing JSX, handlers, roles, routes, Firebase/Render calls, maps and submissions) from the verified live commit. This was validated for all 22 modified screen/style files by a fail-closed CI comparison. The Admin hero keeps its live emerald/mint identity with only a tiny compact line-height adjustment.
- Any visual style key that the LIVE JSX still references is required to stay present. Volunteer botanical decoration style names and the Super Admin Save button style were explicitly retained after audit found they were still used.
- Unchanged critical paths verified byte-for-byte include `app/login.tsx`, `app/login.web.tsx`, `app/signup.tsx`, `app/signup.web.tsx`, `lib/firebase.ts`, `lib/identityVerification.ts`, `firestore.rules`, `storage.rules`, `firebase.json`, `functions/index.js`, `backend/server.js`, `app/(tabs)/certificate.tsx`, `app/(tabs)/notifications.tsx`, `app/(tabs)/profile.tsx`, `app/(tabs)/my-cases.tsx`, and important Admin operational screens.
- No changes to production Firestore, Auth, Storage, Rules, Cloud Functions, Render, identity AI, PayMongo, or the live Hosting channel were made in preparing this review.

## GitHub Actions evidence — final full test passed

**Run:** https://github.com/calibosofroyarjan-volunserve/VolunServe/actions/runs/42384756679
**Job:** `protect-all-live-modules`; status **COMPLETED / SUCCESS**.

Tests passed:
1. Exact reviewed SHA checkout from the live-derived branch without broken nested gitlink checkout.
2. **Strict 27-file manifest**, zero deletions, exact operational JSX/API/handler source preservation across 22 UI files, required live style keys, and unchanged critical backend/auth/data/source files.
3. Existing Admin/Resident/Volunteer/Guest/regression contracts and selected valid certificates-account tests.
4. Full TypeScript `tsc --noEmit --incremental false` check.
5. Expo production-mode Web export on an ephemeral runner.
6. Local `dist/index.html` presence check.

The run has **no Google cloud credentials, no OIDC access, no Firebase CLI deploy, no Hosting write, no database writes, no Render deployment**.

## Relevant regression findings and fixes

- An earlier first-batch draft removed the original live Admin mint/leaf header; the existing Admin test correctly caught it. Restored live header, retaining only a 1px compact line-height adjustment.
- Legacy certificate menu test assumed the Volunteer Certificates sidebar did not exist; the last verified LIVE source *does* have that link. Kept live Certificates and tested its exact source instead of removing it.
- An older compact-workspace test expected 34px pagination and `pageFive(onDutyPersonnel)` even though the exact LIVE code does not contain that expression. The untouched obsolete suite was excluded from the final consolidated run; exact LIVE JSX and pagination handlers remain verified, and other current Admin pagination tests passed.
- A Resident/Volunteer UI test hardcoded old sidebar hex values. Updated its test expectations to verify the shared emerald token palette, retaining all route/permission assertions.
- TypeScript caught the original LIVE Super Admin `styles.button` referenced by Save System Settings; preserved its original style when transferring UI styles, and the final TypeScript check passed.
- Final green CI checks **source preservation, regression scripts and buildability** only; it is not a declaration that each live workflow has been tested end-to-end.

## Still explicitly NOT verified or authorized

1. **Current LIVE source fingerprint:** the successful public marker check was earlier this day. Re-read both live markers and obtain Firebase Hosting rollback version immediately before considering a production release.
2. **True isolated functional staging:** establish a separate Firebase Auth/Firestore/Storage/Functions project, dummy test data, role accounts, separate backend and PayMongo sandbox. The previous live-cloned Hosting preview shares production infrastructure and must NOT be used for write-based tests.
3. **All four role flows:** real signup/login/email verification, role permissions, emergency report+GPS, Admin assignment, Volunteer accept/decline, Time-In/Out, community event join, announcements-to-notifications, Request Assistance, donation progress and sandbox checkout, automatic PDF certificates, Super Admin settings and audit logs.
4. **Browser/mobile visual QA:** check all main active module screens at desktop, tablet and narrow phone widths. The current CI compiles Expo web but does not certify real screenshots of the consolidated CSS.
5. **Sibling PR proposals:** #276 and #277 diverge. This branch incorporates conservative presentation-only improvements and **does not silently claim to include all** alternate features/refactors of either PR. Unselected features remain drafts for separate review.
6. **One secure deployment path:** existing legacy Firebase secret and release-capable workflows are not yet cut over. Need reviewed rollback and credential/workflow migration after explicit approval.
7. **Final approval:** no merge/deploy to production until user has approved exact candidate SHA, change manifest, staging results and rollback plan.

### Current release decision

**HOLD / no production deployment.** Prepare once, test carefully, and when all gates pass, seek authorization for **one consolidated Hosting-only release**; avoid partial per-module deployments.

Reference branch: https://github.com/calibosofroyarjan-volunserve/VolunServe/tree/review/live-preserve-integration-20261107
