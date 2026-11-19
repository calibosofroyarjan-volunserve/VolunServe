# VolunServe Phase 7 — Persistent Automatic Wave Reconciliation (FIRESTORE EMULATOR ONLY)

**Date:** 2026-11-19 (Asia/Manila)  
**Parent:** Phase 6 draft PR #621, stacked on Phase 5/4/3/2/1, derived from protected production commit `61baa713`.  
**Activation decision:** **NO-GO for production. NO LIVE DISPATCH.**

## What is implemented in the development branch

`backend/autoVolunteerPhase7WaveWorkerEmulator.js` contains a **real Firestore Emulator-only, explicitly invoked, transactional wave reconciliation function**, without a live HTTP endpoint, cron job or production server import.

- Persistent `emergencyAutoDispatchBatches/{caseId}` contains `origin=phase7_demo_persistent_worker`, `status=waiting|supported|exhausted`, `wave`, completed waves, expiry and updated timestamps.
- On a genuinely approved, SJDM-allowlisted incident with no competing assignments, it offers to **every currently eligible Volunteer in the chosen wave** (max 40 audited candidates). The first wave uses the case's actual incident barangay, not the Resident's home barangay. Candidate profile, approval, identity and skills are re-read in the Firestore transaction.
- Creation of `responseAssignments/{caseId}_{uid}`, per-Volunteer reservation, deterministic Volunteer notification, deterministic Admin audit and batch/case status is **ONE Firestore Emulator transaction**. Worker retries cannot duplicate a batch or the initial notifications.
- Pending, unexpired offers keep the wave waiting. If all offers are declined or their deadlines pass, previously offered UIDs cannot receive another offer for the same case. Expired offers are marked `expired` and only matching reservations are released. The next eligible wave can be committed atomically.
- **Wave 2 intentionally SKIPPED.** There is NO independently verified SJDM neighboring-barangay adjacency source yet. Never infer geographic adjacency from names. Wave 3 offers to other SJDM allowlisted barangays.
- **Accepted responder stop:** When an offer is `accepted` / responding / on_site / completed, and the case's winner UID/assignment pointer matches, the runner records `supported` exactly once. It does not expire or overwrite the accepted assignment, lock, notification, or the response status.
- When all waves are exhausted, the case receives `autoVolunteerDispatch.state=needs_admin_review`; there is no fake empty Volunteer panel or automatic reassign after exhaustion.
- A later worker instance can inspect Firestore's persisted deadlines and resume when manually invoked, even if process-local counters were lost. **No 24/7 scheduling reliability is claimed.**

## Absolute runtime containment

The new module relies on Phase 6's existing **real process** emulator guard and additionally demands the actual Admin Firestore client's `db.projectId === demo-volunserve-auto-phase4`:

- `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`
- `GCLOUD_PROJECT=demo-volunserve-auto-phase4`
- matching `GOOGLE_CLOUD_PROJECT` if present
- `VOLUNSERVE_AUTO_VOLUNTEER_PHASE6_EMULATOR_WRITE=enabled`
- `VOLUNSERVE_AUTO_VOLUNTEER_DISPATCH` must **not** equal `enabled`
- `FIREBASE_SERVICE_ACCOUNT_JSON` unset.

The workflow uses `firebase emulators:exec --only firestore --project demo-volunserve-auto-phase4`, Java 21 and Node 22, with NO production credentials. A fabricated environment object cannot enable writes. No production Firebase, Render, Hosting, certificates, donations, Community Events, Auth policies or real accepted tasks are touched.

## Known P0 release blockers

1. **NOT a durable autonomous job scheduler.** Firestore persists the batch and due deadlines, but **someone must invoke** the runner after deadlines. No Cloud Scheduler/Tasks/paid worker, durable queue, uptime SLA, automatic lease, stalled-job alarm or outage recovery notification is integrated. A sleeping Render Free web service cannot provide reliable emergency automation. This review is a persistent *state and recovery algorithm* only.
2. **Client and server coexistence:** Phase 5's manual Admin guard protects an accepted auto winner but does not yet establish an explicit rule that blocks creating a new manual offer **while multiple automatic offers are pending**. Phase 7's worker observes conflicting manual assignments and fails closed on the next run, but that is not enough to prevent a legacy simultaneous manual offer. All manual, auto and Volunteer clients must share a reviewed pending-offer arbitration contract before production.
3. **Scalability:** This is a bounded complete-scan test fixture (max 200 applications, response assignments, locks, reservations; max 40 offers). Over-limit scans fail closed, rather than silently omitting eligible Volunteers. Large production pools need indexed, paginated and tested query design with consistent locks and revalidation.
4. **Unknown/legacy roles and real geography:** The SJDM barangay allowlist is inherited from staging and not independently authoritative. Wave 2 adjacency cannot be enabled without verified map and business review. Eligible account schemas, history, liveness/ID approvals and responder skills need real-data contract verification.
5. **Production notifications/audits:** Test-only deterministic message/audit fields require compatibility checks against existing Web/Mobile notification readers, admin audit UI, and retention rules. Phase 6 accepted notification uses its own test-only scheme.
6. **No real production API/offer fanout:** Phase 6 decision route and Phase 7 worker are both UNMOUNTED. There is NO Firebase Auth integration, no live Admin toggle, no real dispatch queue/worker or production Rollback operation. Tests using Firebase Admin SDK bypass Security Rules; client Rules compatibility is separately covered for Phase 5 and needs end-to-end tests after integration.
7. **Other accepted responder cases:** The worker stops only when there is one consistent accepted responder and case winner state. Inconsistent records fail closed for Admin review; it does not repair or rewrite acceptance history.

## Emulator QA scenarios

The new `backend/test-autoVolunteerPhase7WaveEmulator.cjs` tests all eligible Wave 1 fanout, idempotent and concurrent initial ticks, decline/pending timing, expiry/reservation release, Wave 3, terminal exhaustion, accepted wave stop at Wave 1 or Wave 3, second worker instance recovering persisted due dates, manual assignment conflicts, other-case reservations, missing verification/location, over-40 waves, invalid deadlines, empty eligible pool, and no running-server integration.

Prior Phase 6 server Accept/Decline transactions, Phase 5 Client Rules/manual coexistence tests, Phase 4 negative reproduction and earlier planning and backend regression tests remain required.

**Decision:** Phase 7 is complete only after its GitHub CI passes. It **does not** constitute a production deployment, automatic 24/7 scheduler, or approval to dispatch real emergencies. Keep this PR as **DRAFT**.
