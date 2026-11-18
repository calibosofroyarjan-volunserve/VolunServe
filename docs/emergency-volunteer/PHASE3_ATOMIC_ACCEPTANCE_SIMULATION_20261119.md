# VolunServe Automatic Volunteer — Phase 3: Single-Winner Transaction Safety MODEL

**Date:** 2026-11-19  
**Branch base:** Draft Phase 2 review branch, ultimately based on protected production backend commit `61baa713`  
**Status:** **UNMOUNTED, OFF BY DEFAULT. NO PRODUCTION DISPATCH OR FIREBASE WRITES.**

## What Phase 3 actually provides

`backend/autoVolunteerAtomicDecisionPolicy.js` is a **pure review/simulation function**, not a Firebase transaction runner. It requires explicit review-only flags and a complete caller-provided *hypothetical* transaction snapshot and returns logical write intents rather than applying them.

- Proposed **Accept** semantics: offered → accepted; atomically select case-level winning assignment, set a case's `activeVolunteerSupportUid` and `activeVolunteerSupportAssignmentId`, create one `responderLocks/{uid}`, and preserve the existing reservation. First response does **not** start GPS; later explicit `Start Response` and permission are required in the real app.
- Proposed **Decline** semantics: offered → declined, release only the matching reservation, no case winner, no responder lock.
- **Idempotent repeat**: a consistent already-accepted offer with matching case winner and accepted lock returns `already_accepted`, while an already-declined offer returns `already_declined`; neither proposes new writes.
- **Fail closed**: missing/invalid expiry, stale case state, unsupported/revoked account, missing verified skills, self-response, existing manual or accepted case pointer, existing responder lock, missing/mismatched reservation, duplicate or conflicting assignment, and incomplete active-assignment verification.
- **No side effects**: no API route, Firebase import, Cloud Function, scheduler, Firestore Admin connection, notifications, outbox, credentials, cloud access or actual `runTransaction`. No module imports into live `backend/server.js` or Volunteer/Admin Web/Mobile.

The simulator tests two simultaneous hypothetical accept requests using a **serialized fake in-memory case**. The second proposal is refused after the first writes the case winner and responder lock to the fake store. This is **not proof** that real Firestore transactions serialize correctly with existing Admin/Volunteer clients.

## Critical current production incompatibility — P0 NO-GO

The existing live `app/(admin)/admin-cases.tsx` manual Admin `assignVolunteerToCase` transaction sets `activeVolunteerSupportAssignmentId` and `activeVolunteerSupportUid` **when an OFFER is created**, even before Volunteer acceptance. The live Volunteer Web/Mobile `transitionAssignment` flow currently uses client-side Firestore transactions on `responseAssignments`, and does not implement the proposed shared case-winner arbitration for automatic bulk offers.

**This means a safe automatic single-winner guarantee is not established against the existing manual Admin and client write paths.** A late manual offer may overwrite an automatic winner unless all competing producers/consumers share a reviewed atomic state contract. The Phase 3 policy intentionally REFUSES to claim this is solved.

The staging fixed-fictional E2E 002 accepted Volunteer 1 and verified locks, notifications and wave stop. Those results **do not** prove real production manual-vs-auto races or multiple concurrent accepts. Do not transplant staging Auth, passwords, service account, 002 routes or timers into production.

## Required review before building any actual write adapter

1. Agree on one canonical per-case field identifying a selected responder, with `offered` and `accepted` explicitly distinguished. Define compatibility/migration for existing manual assignments and old live case pointers.
2. Update the **manual Admin offer path** and **Volunteer Web/Mobile transitions** to respect the case-level decision invariant, under separately approved and tested changes. Do not remove working features.
3. Define authenticated server-owned accept/decline transactions, transactional read set (case, specific assignment, active case offer/winner, current approved user, volunteer application, lock, reservation and required conflict checks), timestamps, and an idempotent notification/outbox strategy. Reject stale or incomplete query sets.
4. Verify role restrictions, Firestore Rules client compatibility and verified production token requirements; Admin SDK bypasses Firestore Rules and thus demands server-side checks.
5. Test in **Firebase emulator**: two different Volunteers race to accept; duplicate accepts; manual Admin creation races with accepted automatic task; cancelled case; expired deadlines; suspension/revocation; mission completion; retries after worker restart; denied reads; cross-case busy lock. Require zero duplicate winner/lock and no loss of existing records.
6. Choose a durable, monitored scheduler to replace staging Render Free process-local `setInterval`, and design an immediate default-OFF kill switch and safe rollback that never resets an already accepted task.
7. Verify production staging parity and geographically validated SJDM adjacency before any canary; no general-rollout permission based on these unit simulations.

## Tests included in this PR

`backend/test-autoVolunteerAtomicDecisionPolicy.cjs` asserts default OFF, correct Accept/Decline write *intent*, idempotency, deadline fail-closed behavior, verified skills and identity, self-report blocking, manual winner and volunteer lock protection, wrong assignment IDs, fake serialized concurrent acceptance, and **no live server wiring**.

**P0 decision: NO-GO for applying these write intents to real Firestore.** This Phase 3 branch is for review, test and transaction-design agreement only. It may be discussed and revised but is not authorized to merge into the deployed branch or run on live infrastructure.

**Preservation:** No changes to `backend/server.js`, live Admin or Volunteer screens, Firestore Rules/Indexes, Firebase Functions/credentials, signup, identity verification, Community Events, donations, certificates or Render/Hosting releases.
