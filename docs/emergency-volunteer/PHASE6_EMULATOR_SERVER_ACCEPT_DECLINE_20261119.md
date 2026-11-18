# VolunServe — Phase 6: Auth-Bound Automatic Volunteer Decision API Prototype

**Date:** November 19, 2026 (Asia/Manila)  
**Branch:** `qa/auto-volunteer-phase6-server-transaction-emulator-20261119`  
**Parent:** Draft Phase 5 PR #620; stacked through Phase 1–4 on protected backend commit `61baa713`.  
**Release gate:** **NO-GO for production. EMULATOR ONLY. NO DEPLOY.**

## What this phase does (local only)

`backend/autoVolunteerPhase6EmulatorDecisionServer.js` is a **real Firestore Emulator-only transaction implementation**, replacing Phase 3's simulated *write intents* for this QA harness. It includes an **unmounted Express route prototype**:

`POST /api/volunteer/emergency-auto/offers/:caseId/decision` with `{"decision":"accepted"}` or `{"decision":"declined"}`.

The route **does not exist in the running live backend**; nothing imports or registers it in `backend/server.js` or the Volunteer UI. It requires an injected `requireFirebaseUser` middleware (matching the protected live backend's revoked-token, verified-email and completed-registration checks). For a future release, this must be the **actual production middleware**, not a mock. The route itself re-reads `users/{authenticatedUid}`, `volunteerApplications/{authenticatedUid}`, case, pending offer, reservation and responder lock inside the Firestore transaction.

The request may **not** supply another Volunteer UID; only `request.firebaseUser.uid` is used, and arbitrary request-body fields are rejected. Response contains **status codes only**, no identity, case details, email or GPS.

### Transaction invariants

- Atomic read-set: `disasterCases/{caseId}`, `responseAssignments/{caseId}_{authenticatedUid}`, `users/{uid}`, `volunteerApplications/{uid}`, `autoVolunteerReservations/{uid}`, `responderLocks/{uid}`, and a bounded 201-document query of all assignments for that UID.
- Reject if the full candidate/active assignment scan cannot be verified; do not treat a truncated result as free capacity.
- Reuse the Phase 3 fail-closed policy to enforce approved case, approved/identity-verified Volunteer, matching skill, ownership, unexpired deadline, reservation, no existing case winner/manual assignment, no other active response and no responder lock.
- **Accept:** one transaction updates the existing offer to `accepted`, selects the case's `autoVolunteerAcceptedAssignmentId` / `activeVolunteerSupportAssignmentId` / `activeVolunteerSupportUid`, creates a per-user responder lock, and creates a deterministic resident notification and Admin audit ID.
- **Decline:** transaction updates existing offer to `declined`, deletes only the matching reservation and creates one deterministic audit. No new case winner or resident acceptance notification.
- Consistent retry returns `already_accepted` or `already_declined` without writes or duplicate notifications. No GPS start, mission completion, certificate, donation or other module is involved.

### Emulator safety gate — fail closed even if someone imports it

The module cannot execute any Firestore write unless all runtime conditions match:
- `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080` (LOCAL emulator, not remote);
- `GCLOUD_PROJECT=demo-volunserve-auto-phase4` and matching `GOOGLE_CLOUD_PROJECT` if provided;
- `VOLUNSERVE_AUTO_VOLUNTEER_PHASE6_EMULATOR_WRITE=enabled`;
- `VOLUNSERVE_AUTO_VOLUNTEER_DISPATCH` **must not** equal `enabled`;
- `FIREBASE_SERVICE_ACCOUNT_JSON` is absent.
- A fabricated `env` object is rejected; the actual `process.env` must be supplied.

The test uses only fictional `phase6_*` documents in a local Firestore emulator. No Cloud Functions, Render, Firebase Hosting, production Firestore, production credentials or real Volunteer accounts are accessed.

## CI test coverage

`backend/test-autoVolunteerPhase6DecisionEmulator.cjs` verifies real Firestore transactions for:
1. Simultaneous distinct Volunteers accepting the same case: **exactly one accepted winner**, one lock, one notice, one audit.
2. Duplicate same-Volunteer acceptance: only one actual write, repeated call idempotent with unchanged timestamp.
3. Decline: releases reservation and audits once, no responder lock, case winner or resident acceptance notification.
4. Expired offer, suspended identity, pre-existing manual assignment, mismatched reservation, and other active case deny acceptance.
5. An HTTP route with injected auth middleware uses the canonical authenticated UID and rejects forged request-body identity.
6. Demo-only write gate and proof that the real backend remains unwired.

Also run prior Phase 4 emulator race tests and Phase 5 patched manual/automatic compatibility and Security Rules tests, Phase 1–3 unit checks, and current backend signup/identity/certificate regressions.

## Still required before production

**P0:** There is still **no functioning live automatic Volunteer dispatch API or durable background worker**. Current case/eligibility/account schemas, ID types, Firestore indexes, Rules compiler size and permissions, notification delivery, geographic review, release ownership, and Admin/Volunteer Web+Android end-to-end behavior must be reviewed and tested in a non-production deployment.

**P0:** Firestore Admin SDK bypasses client Security Rules, so authorization on a future authenticated server route and transaction must be independently security-reviewed and penetration-tested. The injected middleware is only a test double in this Phase 6 harness; this phase **does not prove real Firebase token verification**.

**P0:** Wave creation, automatic fanout/expiration, worker resilience, reoffer and recovery after cancel remain separate work. This code handles a pre-existing automatic offer's accept/decline **only**.

**P0:** The offer/race model assumes a canonical per-case winner and per-Volunteer lock; **other writers** must respect the same invariant. Phase 5's manual Admin and Web/Mobile patches remain DRAFT, and the real deployed clients and live Firestore Rules have not been updated.

**Decision:** This branch can complete emulator QA, but **must not be merged into the live branch or deployed**. The next milestone is a reviewed production-compatible adapter design, Firebase Auth/Rules integration and durable scheduler, with explicit authorization before any live change.
