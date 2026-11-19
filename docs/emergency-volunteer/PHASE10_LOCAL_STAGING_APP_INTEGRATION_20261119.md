# VolunServe — Phase 10: Isolated Admin/Volunteer App Integration

**Date:** November 19, 2026 (Asia/Manila)  
**Stack:** Draft Phase 10 atop Phase 9 PR #624, Phases 1–8 underneath; ultimately based on live protected commit `61baa713`.  
**Result is a LOCAL APPLICATION INTEGRATION PROTOTYPE, NOT A CLOUD STAGING DEPLOYMENT.**

## Scope and safety boundary

Three additive application files:
- `backend/autoVolunteerPhase10LocalApp.js`: an **unmounted Express app factory**, with separate authenticated Admin/Volunteer routes using the real **local** Firebase Auth Emulator ID token verifier. All functions require the real `process.env` to match a demo-only Auth+Firestore Emulator and `db.projectId=demo-volunserve-auto-phase4`. It never binds a network port itself.
- `backend/phase10LocalAdmin.html`: clean local Admin login and read-only case status, start a fictional wave, manually run a due-scan and cancel pending offers.
- `backend/phase10LocalVolunteer.html`: local Volunteer login, view the signed-in Volunteer’s offer, Accept/Decline with no body UID spoofing.
- E2E tests, documentation and no-deploy CI complete the six-file PR.

**Critical:** Existing Render staging already has accepted fictional test tasks such as `STAGING_E2E_002`. Phase 10 deliberately **does not deploy to that service** or use its Firebase project. It does not create or reset any staging or live account, offer or lock. The test app only recognizes case IDs prefixed `phase10_` and runs on the isolated local `demo-` Firebase Emulators.

## UI/API workflow

The test app is invoked and hosted only by the test harness on a **127.0.0.1** loopback port. Pages are available as `/phase10-admin` and `/phase10-volunteer`; they use Firebase client SDK Email/Password sign-in connected to the **local Auth Emulator**, not any real Firebase Auth host. The frontend does not store passwords; output uses textContent rather than injecting server HTML.

Verified logged-in Admin:
- `GET /api/phase10/admin/cases/:caseId` — aggregate case/batch status, wave, counts; **no Volunteer IDs, name, GPS, emails or assignment IDs**.
- `POST /api/phase10/admin/cases/:caseId/start` — calls the Phase 7 *demo-only* transaction to create the fictional Wave 1 offer fanout, or idempotently reports waiting/supported/exhausted.
- `POST /api/phase10/admin/cases/:caseId/cancel` — calls Phase 9 atomic cancellation; cannot cancel an accepted or locked mission and preserves historical notices.
- `POST /api/phase10/admin/due-scan` — **MANUAL** Phase 9 due-scan invoking Phase 8 leases and Phase 7 reconciliation. **Not a 24/7 scheduler**.

Verified logged-in Volunteer:
- `GET /api/phase10/volunteer/cases/:caseId/offer` — only the signed-in Volunteer’s owned automatic offer, never other Volunteer profiles.
- `POST /api/phase10/volunteer/cases/:caseId/decision` — authenticates from Firebase token and executes Phase 6 transaction; the only allowed body is `{"decision":"accepted"}` or `{"decision":"declined"}`.

**Profiles and roles** are checked on every request from the local Firestore `users/{uid}` record. Only `approved` operational Admin may start/cancel/scan; Volunteers require approved role, approved application, identity, verified email and matching case skills. Invalid/unknown or non-`phase10_` case IDs fail closed. A production deployment can never be enabled merely by copying this demo app: it refuses all non-local Auth/Firestore settings.

## Evidence: what CI actually tests

`backend/test-autoVolunteerPhase10LocalAppE2E.cjs` starts an ephemeral **loopback HTTP server** using the demo app, signs fictional Admin/Volunteer/Resident accounts into the **real local Auth Emulator**, retrieves Firebase ID tokens via client SDK, and exercises live HTTP requests against a **real local Firestore Emulator**.

Tests verify: local HTML routes contain all controls and only demo Firebase config; Admin-only Wave 1 fanout to all eligible same-barangay Volunteers; idempotent Start; aggregate-only Admin preview; Volunteer can see only owned offers; first Accept is sole winner, repeated Accept idempotent, competing Accept blocked and accepted STOP after due-scan; decline followed by safe cancellation with preserved historical notifications; Wave 3 after expiry; unauthorized/under-review/unverified sign-ins denied; no forged UID, no real/staging case; disabled Volunteer denied; Accept-vs-cancel race produces at most one successful outcome; running production backend remains unwired.

CI **does not run a graphical browser** or actual Android app. Browser scripts/CSS are checked as served HTML and controls are inspected; detailed user-interaction/visual and accessibility testing remains for a future consented isolated staging deployment.

## Important remaining NO-GO blockers

1. No physical Render staging service or new Firebase cloud project is provisioned by this PR. The existing Free Render staging **must retain its accepted 002 test responder** and remains unchanged.
2. There is NO official approved neighboring-barangay adjacency, so **Wave 2 remains disabled**; the 62-name SJDM list inherited from prior staging is provisional, not independently verified.
3. No monitored always-on external Cloud Scheduler/Tasks; local manual due-scan must not be presented as emergency-grade automation.
4. Phase 7/9 bounded 200-document scans and maximum 40 candidates/wave require production-scale indexed pagination and service capacity review.
5. No production-backed auth/roles or real UI/Android integration; local Firebase Auth Emulator alone is not evidence of production identity/permission correctness.
6. No live activation, rollback, on-call alerts, end-to-end mobile permissions/GPS, cancellation-notification consumer review, real accepted-response integrity release review, or source/Rules compiler budget validation.
7. The existing live manual Admin and Volunteer/Web protection changes remain draft, not deployed; do not enable automatic dispatch before all competing writers and current client versions obey a single case winner invariant.

**Release decision: review only / production NO-GO.** The Phase 10 code, although integrated in local emulator HTTP tests, is **NOT deployed to Render staging or production**. The next step is independent cloud staging readiness review and a separately authorized isolated deployment plan that never resets accepted historical fixtures.
