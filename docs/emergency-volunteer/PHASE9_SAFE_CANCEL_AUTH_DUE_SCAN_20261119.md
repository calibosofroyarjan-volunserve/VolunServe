# VolunServe — Phase 9: Safe Cancellation, Auth-Verified Emulator API & Due-Batch Scan

**Date:** November 19, 2026 (Asia/Manila)  
**Parent:** Draft Phase 8 PR #623, stacked back through PR #616.  
**Status:** **DRAFT ONLY / NO PRODUCTION DEPLOY / NO LIVE FIREBASE ACCESS.**

## 1. Safe cancellation (local emulator only)

New `backend/autoVolunteerPhase9SafeCancelEmulator.js` implements an **UNMOUNTED**, server-side Admin cancellation prototype for a waiting `emergencyAutoDispatchBatches/{caseId}` batch. The Admin request is an authenticated `POST /api/admin/emergency-auto/preview/:caseId/cancel` with one controlled `reason` field. **No live server imports or registers this route.**

Inside ONE Firestore transaction, it reads:
- Canonical `users/{authenticatedAdminUid}` and requires an approved, non-suspended operational Admin; it does **not** trust `adminUid` supplied by body, query or route.
- Existing `disasterCases` + Phase 7-owned `emergencyAutoDispatchBatches` and optional Phase 8 scheduler lease.
- Bounded 201-document scans of assignments, reservations and responder locks. Any over-limit or inconsistent history **blocks**; missing reservations or foreign ownership can never be silently ignored.
- Checks that there is NO accepted/responding/on-site/completed responder, live winner pointer or lock. Cancellation **does not overwrite an accepted assignment**.
- Changes only pending `offered` tasks to `cancelled`, deletes only matching reservations, marks the batch `cancelled`, case `autoVolunteerDispatch.state=cancelled`, clears the current scheduler lease, and creates ONE deterministic Admin cancellation audit record.
- Does NOT delete historical offer notifications, existing audit records, identity data, GPS history, certificates, donations, Volunteer accounts, accepted tasks or any production data.
- Repeated cancellation returns `already_cancelled` with **zero writes**. Accept-vs-cancel races resolve through Firestore transaction conflict/retry; exactly one outcome wins.

A proper manual Admin offer may resume **after** the approved cancellation commits and the waiting state is no longer present. The existing Phase 8 Admin/Rules guard still blocks manual offers during `waiting`. Future production must independently implement authenticated emergency-operator permissions, audit monitoring, and release approval.

## 2. Local Firebase Auth and Firestore E2E

`backend/test-autoVolunteerPhase9AuthCancelEmulator.cjs` uses **BOTH Auth and Firestore Emulators**. It creates fictional local Auth users and signs them in with the Firebase client SDK, obtains actual emulator Firebase ID tokens, and verifies them with Firebase Admin Auth in an ephemeral HTTP server bound only to `127.0.0.1`. The injected middleware checks Firebase Auth token validity; the cancellation transaction separately checks persisted Admin role/status.

Tests cover approved Admin success, pending Admin/Resident/invalid token denial, body UID spoof rejection, cancel replay, concurrent cancel, accepted responder preservation, live Firestore Accept-vs-cancel race, foreign reservation denial, Admin profile suspension, lease invalidation and a demo due-batch scan.

**Not a live authentication proof:** Real Firebase identity provider, production IAM, deployed TLS/CORS, revocation under real deployment, existing real Web/Mobile login screens, and actual admin operator approvals are NOT exercised in Phase 9.

## 3. Scheduler integration contract (no autonomous scheduler)

`backend/autoVolunteerPhase9DueScanEmulator.js` is a **manually invoked** local demo reader. It:

1. Reads at most 201 persisted batch documents; if any batch count exceeds 200 or sources are incomplete, it refuses to proceed.
2. Selects `waiting` cases past their persisted deadline **or** with a confirmed accepted responder requiring early STOP reconciliation.
3. Runs up to ten case reconciliation calls per invocation, using Phase 8's Firestore lease/claim and Phase 7's transactional offers/expiry/stop; it records aggregate outcomes only (no Volunteer PII exposed).
4. Skips terminal `cancelled`, `supported` and `exhausted` batches and never changes existing accepted responders or historical notifications.

**This is NOT a 24/7 scheduler.** No Cloud Scheduler, Cloud Tasks, Render job, live HTTP webhook, distributed lease fencing, reliability SLA, or monitoring infrastructure has been provisioned. Phase 8's lease still needs a formal fencing contract in the actual wave transaction before production.

## 4. Strict isolation

The modules refuse any non-demo runtime, wrong Firebase project or fabricated settings:
- `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`
- `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099`
- `GCLOUD_PROJECT=demo-volunserve-auto-phase4` (and matching `GOOGLE_CLOUD_PROJECT`)
- `VOLUNSERVE_AUTO_VOLUNTEER_PHASE6_EMULATOR_WRITE=enabled`
- `VOLUNSERVE_AUTO_VOLUNTEER_DISPATCH=disabled`
- No `FIREBASE_SERVICE_ACCOUNT_JSON` and no real production service credentials in the workflow.

**DO NOT execute this code against `volunserve-3aa5b`.** The code is NOT imported in live `backend/server.js`; nothing alters Render production, Firebase Hosting, Firestore rules deployment or Volunteer accounts.

## 5. Remaining NO-GO release gates

- Integration into an approved isolated staging application with real Firebase Auth/Rules roles, exact production-compatible schemas and consented fictional testing.
- Independently verified SJDM barangays and neighboring Wave 2 adjacency. Currently **Wave 2 is skipped**, not guessed.
- Real persistent, monitored **external job trigger**, retry/backoff, lease fencing and incident-operator alerts. A lease/state record alone cannot wake a sleeping worker.
- Real Admin cancellation UI and notification of cancelled offers to affected Volunteers; evaluate historical audit and recovery requirements.
- Bounded 200-record and 40-per-wave scan limits need indexed/paginated, transactional correctness for real production user volume.
- Client Rules compiler/permissions review; actual Web and Android login/Volunteer task lifecycle E2E plus no-regression validation across certificates, donations, identity, login and other live features.
- Threat-model review and an explicit authorized production rollout/rollback plan. **Do not merge the stacked emulator branches into live wholesale.**

**Phase 9 evidence is emulator QA only. Production remains NO-GO even if CI passes.**
