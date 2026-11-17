# Automatic Volunteer Matching — protected-live integration gate

**Status: DRAFT / OFF BY DEFAULT. Do not merge or deploy until reviewed.**

## What has been validated

- Separate Firebase staging project (`volunserve-volunteer-staging`) and Free Render service
- Authenticated staging Admin, synthetic case eligibility, same-barangay Wave 1
- Synthetic Firestore `responseAssignments` record with `offered` status
- Staging Volunteer accepted that assignment; Firebase displayed `accepted`
- Staging QA source test suite: 21 passing on the `feat/emergency-auto-dispatch-server-staging-20261115` branch as of November 17, 2026
- New staged, read-only Admin diagnostic can check assignment / session / lock / notification consistency

**Not proven by that acceptance test:** production web/Android permission-rule execution, push delivery, actual field GPS tracking, response-time guarantees, decline-and-next-wave operation on real devices, or volunteer availability during Free Render sleep.

## Why this patch is separate

The two protected live branches (`live-protected`, `backend-live-protected`) differ significantly from draft PR #571, which is based on a staging feature branch. Copying entire feature files across branches risks overwriting already working UI and backend functions. This PR is intentionally scoped to:
- Web + Android `responseAssignments` transitions atomically create, update, and release `responderLocks`
- Rules require accepted **automatic** task offers to commit the matching responder lock
- Rules disallow a Volunteer from unilaterally deleting the lock before that assignment is completed; authorized Admin cancellation remains possible
- Preserve existing manual offer, resident-notification and Volunteer field-report logic
- Standalone static regression test and PR-only validation workflow

## Release blockers before the automatic engine can be enabled

1. **Firestore Emulator tests** with Auth/Rules against locked, unlocked and legacy assignments. Static tests are not a substitute.
2. **Web + Android real-device regression tests** for manual assignment, Accept, Decline, Start Response, On Site and Complete. Validate Firestore `getAfter` and document-access budgets.
3. **Review live branch drift:** reconcile `live-protected` and `backend-live-protected` before merging the larger matching engine. Do not replace any existing production file wholesale.
4. **Engine-to-UI integration:** rebase/reimplement reviewed parts of staging PR #571 against the actual protected live baseline, preserve all live Emergency Reports behavior, and leave feature flags OFF until authenticated integration passes.
5. **Server reliability:** Firebase Functions require paid infrastructure; Free Render sleeps and offers no reliable deadline or continuous monitoring. Keep staging's Admin-on-demand mode isolated from real emergencies. A fully automatic time-sensitive production workflow needs an appropriate always-available architecture, demonstrated monitoring, and explicit emergency-hotline fallback.
6. **Notification and lock verification:** staging previously accepted a test assignment before the new resident-notification transaction existed. Confirm its status through the Admin read-only diagnostic; do not claim all notification checks passed without evidence.
7. **Release safeguards:** protected-branch reviews, backups and rollback plan, gated staging rollout, only then a separately authorized production deploy.

## Activation policy

No protected-live branch changes are made by this review branch until a reviewed PR is merged. It contains **no production activation** or calls to official emergency services. No background job or paid plan is enabled.
