# VolunServe — Phase 4: REAL Firestore Emulator Concurrency QA (NO DEPLOY)

**Review date:** November 19, 2026  
**Branch:** `qa/auto-volunteer-phase4-firestore-emulator-20261119`  
**Base:** Draft Phase 3 → Draft Phase 2 → Draft Phase 1, ultimately based on protected live backend commit `61baa713`.  
**Deployment decision:** **P0 NO-GO** until the existing Admin and Volunteer write paths are made compatible and re-tested.

## Scope: what is real and what is not

The new `backend/test-autoVolunteerFirestoreEmulator.cjs` uses **a real Firestore Emulator transaction engine**, not the previous fake serialized in-memory store. It implements an **EMULATOR-ONLY reproduction** of the proposed policy from Phase 3:

- transactional read-set: case, one offer, current user, approved Volunteer application, reservation, responder lock and a bounded query for other active assignments;
- transactional write-set: accept → update offer status, set case winner and lock in one transaction; decline → update offer and delete reservation;
- real optimistic concurrency: two Volunteers attempting to accept simultaneously must yield exactly one winner and one lock;
- repeated Accept for the same Volunteer must be idempotent;
- expired offers, suspended Volunteers, prior manual case pointer and another active assignment cannot proceed.

**This is not a production implementation.** The test runner is the only file that imports Firebase Admin SDK. The production `backend/server.js` is not modified and does not import test code. There are no production Cloud Functions, API routes, cron tasks or actual write adapters added.

### Reproduced, known production blocker

The existing production `app/(admin)/admin-cases.tsx` manual `assignVolunteerToCase` transaction creates a manual offered assignment and updates `activeVolunteerSupportAssignmentId` **without checking an existing accepted automatic winner**. The emulator test intentionally reproduces those relevant writes **after** an automatic Volunteer has accepted:

- `autoVolunteerAcceptedAssignmentId` still references the accepted Volunteer and their lock remains present;
- `activeVolunteerSupportAssignmentId` is **overwritten** by the later manual offered assignment.

**A passing emulator test of this mismatch is evidence of a P0 BUG/RACE, not evidence that live integration is safe.** It demonstrates why simply deploying the staged algorithm with current live manual Admin behavior would be dangerous.

The existing Volunteer Web and Mobile `transitionAssignment` functions also directly update `responseAssignments` with Firestore client transactions; they do not implement this new one-winner arbitration. These need a separately reviewed compatibility change. This phase **does not** modify them.

## Absolute emulator isolation

GitHub CI installs Node 22, Java 21, pinned repository dependencies and launches `firebase emulators:exec --only firestore --project demo-volunserve-auto-phase4`. Tests refuse to start unless:

- `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`;
- `GCLOUD_PROJECT=demo-volunserve-auto-phase4`;
- `GOOGLE_CLOUD_PROJECT`, if present, is the same `demo-` project;
- `FIREBASE_SERVICE_ACCOUNT_JSON` is **unset/empty**.

The CI workflow does **not** install production service-account credentials, execute `firebase deploy`, run `render deploy`, contact production REST endpoints, or mount the new code in the app. The emulator starts from existing `firebase.json` using the **reviewed repo's Firestore rules**, but Firebase Admin SDK deliberately bypasses those rules. Thus **no Firestore Security Rules compatibility claim** may be inferred from these server transaction tests.

## Tests and risk gates

1. Real Firestore concurrent Accept: one accepted case winner and matching responder lock, one remaining offered.
2. Real same-user double Accept: one commit plus idempotent retry.
3. Real Decline: no accepted winner, reservation released, no lock.
4. Active manual case pointer: automatic acceptance blocked.
5. Expired task: acceptance blocked.
6. Revoked/suspended account: acceptance blocked.
7. Existing active assignment in another case: acceptance blocked.
8. **Expected P0 contradiction:** a later legacy manual Admin offered task overwrites the automatic accepted case pointer, proving co-existence remains unsafe.
9. Live server remains unwired and pre-existing Phase 1–3 + production signup/identity/certificates regression checks pass.

## Next development gate — must fix before production

**Phase 5 target: a shared real production-compatible state machine across all writers, not just the server.** Review and separately test:
- Admin manual offer and replacement; Volunteer Web/Mobile Accept/Decline and later lifecycle;
- canonical distinction between pending offers, selected accepted responder and actual response start/GPS;
- atomic case winner and cross-case locks with consistent notifications, audit and stale/expired offer behavior;
- Firebase Rules emulator tests with real Firebase client users/roles, and rejection tests, separate from Admin SDK bypass tests;
- Firestore indexes/query pagination, verified SJDM adjacency, durable worker and default-OFF rollback.

**Result interpretation:** The current Phase 4 can pass all regression tests while still returning **NO-GO** due to the reproduced manual-pointer overwrite. Do not describe the test suite as proof that actual live manual-vs-automatic races are already resolved.

**All modifications in this phase are test-only:** emulator test, QA workflow and this report. No live `backend/server.js`, `app/(admin)/admin-cases.tsx`, Volunteer Web/Mobile, Firestore rules, Auth, certificates, donations or hosting/deploy changes.
