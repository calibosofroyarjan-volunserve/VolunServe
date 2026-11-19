# VolunServe — Phase 8: Pending Offer Arbitration & Durable Scheduler LEASE (EMULATOR)

**Date:** 2026-11-19, Asia/Manila  
**Stack:** Phase 8 on draft Phase 7 PR #622, Phase 6 PR #621, Phase 5 PR #620; all ultimately based on production commit `61baa713`.  
**Release status:** **NO-GO for production — DRAFT, NO LIVE CHANGES.**

## A. Critical pending-wave fix in the existing manual Admin path

Previous Phase 5 protection blocked an outdated manual Admin offer **after** a Volunteer had accepted, using `autoVolunteerAcceptedAssignmentId`. There was still a race **before** acceptance: Phase 7 offers many eligible Volunteers while `disasterCases.autoVolunteerDispatch.state = waiting` and the active responder pointer is empty.

This Phase 8 draft fixes that gap in two layers:

1. `lib/emergencyVolunteerWinnerGuard.js` checks the **latest case data inside the Admin's existing `runTransaction`**. It blocks a new manual offer while `autoVolunteerDispatch.state === waiting`, regardless of whether someone has accepted. This is shared with `app/(admin)/admin-cases.tsx`, already modified in Phase 5. Normal manual offers for cases without a pending batch remain available.
2. **Draft-only Firestore Rules** `preservePendingAutoWave()` blocks outdated Admin clients from changing active responder pointers or clearing/spoofing the waiting state. It permits unrelated review notes without changing the wave. Its behavior is verified with **real Firebase Client SDK Security Rules Emulator** tests.

To end a wave and permit manual dispatch, a future **server-verified cancellation** must atomically retire pending offers, release matching reservations, record audit reasons and move the case to a final permitted state. That cancellation API **does not exist** in Phase 8; pretending that a stale deadline alone clears the pending batch would be unsafe.

## B. Lease and recovery design — NOT A 24/7 scheduler

`backend/autoVolunteerPhase8LeaseSchedulerEmulator.js` adds a **demo-project-only Firestore lease prototype**, not a deployed scheduler.

- Persistent `autoVolunteerSchedulerLeases/{caseId}` records a random private worker claim token, `leaseUntilMs`, `claimedAtMs`, attempt count, last result, and next due time.
- Worker can claim only an **existing Phase 7 batch** in `waiting` state whose persisted offer deadline has passed, or a newly accepted responder case that needs early wave STOP. No new incident, assignment or batch is created just by claiming.
- Contending claimers read/write the same lease document in a Firestore transaction. Only one wins before lease expiry.
- A crash may leave a lease: after its 45-second timeout, another worker can atomically reclaim it; an old holder cannot acknowledge a replaced lease.
- The test-only `invokeEmulatedDueWave` runs Phase 7's idempotent reconciliation after claiming the due batch, then acknowledges the result. If a Volunteer is already accepted, it marks the batch `supported`, creates **zero additional offers** and preserves the existing responder lock.
- Persistent `nextDueAtMs` makes due state observable to a future independently verified scheduler. It does **not** wake itself, poll, make network requests or schedule an external service.

**Important limits:** This lease is NOT a complete production fencing protocol, because Phase 7's reconciliation transaction does not yet verify the lease token. Idempotent per-case Firestore transactions protect the demo from duplicate offers, but a production job needs generation/fencing checks, cost/load limits, max retry/recovery policies, expiry/lease observability and incident-operator alerts.

### Recommended production scheduler architecture (not created)

A future separately approved implementation may use a managed durable queue (e.g. Google Cloud Tasks with authenticated worker invocations) to enqueue the next deadline; alternatively use a monitored Cloud Scheduler periodic reconciliation that queries indexed due batches. Production requires least-privilege service identity, explicit Firebase project isolation, dead-letter/retry policy, idempotent job IDs, exponential backoff, per-case rate controls, outage recovery and observable alerts.

**No background scheduler was provisioned, purchased, configured, activated or authorized by this Phase 8 PR.** A Free Render web-service timer remains unsuitable for emergency response guarantees.

## C. Emulator tests

`backend/test-autoVolunteerPhase8PendingSchedulerEmulator.cjs` covers: waiting-wave manual guard; concurrent initial wave-vs-manual case transaction; Firebase Client SDK Rules denying outdated Admin pointer/status hijack while allowing ordinary case notes and non-wave manual assignments; missing-batch claim; not-due wait; simultaneous lease claims; lost-worker lease expiry and stale-owner rejection; persisted Wave 1 expiry → Wave 3 next deadline; accepted responder early `supported` STOP; rejected forged runtime flags.

The CI must rerun Phase 7 expiry/stop, Phase 6 server decisions, Phase 5 Admin/Volunteer and Rules tests, and earlier non-dispatch regressions. No real Firestore records, Firebase credentials, Hosting, Render, Rules deployment, production service or task data may be touched.

## D. Remaining P0 gates

- No verified production geography/neighboring SJDM barangay map (Wave 2 intentionally disabled).
- No end-to-end production-compatible Auth/permissions for real Volunteers, admins, denied Roles, mobile/Web behavior or existing notification consumers.
- No approved live write API / worker, deployment or rollback; no staged reconciliation revalidation against live historical data.
- No reliable paid/managed 24/7 wake-up, monitoring, alerting, authoritative lease fencing or proven recovery SLA.
- No reviewed Admin cancellation workflow for pending automatic waves.
- Over-40 wave and over-200 scan fail-closed caps still need indexed/paginated scale design.
- Firestore Rules draft must be checked for compiler limits and all relevant application permissions in later integration before any rollout.

**Decision:** Complete only when emulator CI passes. Even when tests pass, production dispatch activation remains **NO-GO**. Leave the stacked PR **DRAFT and UNMERGED** until appropriate reviews.
