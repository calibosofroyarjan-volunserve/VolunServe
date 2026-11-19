# VolunServe — Phase 12: Dedicated Cloud-Compatible Read-Only Staging Adapter

**Review date:** 2026-11-19 (Asia/Manila)  
**Branch:** `review/auto-volunteer-phase12-isolated-cloud-preview-adapter-20261119`, based on Phase 11 draft PR #626, stacked back through Phase 1 and ultimately protected production commit `61baa713`.  
**Deployment decision:** **NO-GO for creating/deploying a cloud service, NO production/staging writes, and NO automatic dispatch.**

## Scope: cloud-interface adapter, not an activated cloud deployment

The additive `backend/autoVolunteerPhase12IsolatedCloudPreviewAdapter.js` exposes a **cloud-compatible, read-only** Express app factory. Unlike Phase 10's emulator-only app, it can accept injected Firebase Admin Auth and Firestore instances for a **FUTURE NEW** independent Firebase staging project. It deliberately does **not** initialize Firebase, load private credentials, start a listener, register a scheduler, or import into `backend/server.js`.

This phase deliberately does **not** port the Phase 6–9 **write** handlers from the emulator to cloud. Their authorization, cross-case lock concurrency, cancellation, notification consistency, full roster scalability, and durable managed scheduler still require separate review and independent non-production integration. Copying the Phase 10 module to Render with changed variables is explicitly unsafe.

The only exposed HTTP handlers in the unmounted app are:

- `GET /api/phase12/staging/health`: no project identifier, credentials or private account details; reports read-only mode and that scheduling and dispatch are disabled.
- `GET /api/phase12/staging/admin/cases/:caseId/preview`: real Firebase Admin `verifyIdToken(token, true)` contract, with verified email and canonical persisted `users/{uid}` approved operational Admin check, before reading the case/candidate Firestore data. Only aggregate wave/count/exclusions are returned; **never** Volunteer UID, email, address, GPS, full names, assignment IDs, case title or Firebase project ID. The handler ignores client-submitted role, UID, neighbor map and candidate roster.

Preview reuses `loadProductionPreviewInputs` (Phase 2 production-schema **read-only** reader) and `previewAllEligibleWave` (Phase 1), with Wave 2 **disabled** and a maximum **200 source records** per queried collection. If source completeness cannot be proven, the request blocks rather than silently omitting eligible Volunteers. It uses non-transactional snapshots: it is neither a live assignment decision nor a safe all-eligible dispatch plan at production scale.

## Mandatory runtime guard

The app factory and each HTTP handler refuse to operate unless **all** conditions hold:

- The injected `env` is the actual `process.env`, not a fabricated options object.
- `VOLUNSERVE_PHASE12_CLOUD_PREVIEW=enabled`.
- `VOLUNSERVE_AUTO_VOLUNTEER_PREVIEW=enabled`.
- `VOLUNSERVE_AUTO_VOLUNTEER_DISPATCH=disabled` **explicitly**.
- `VOLUNSERVE_PHASE12_MODE=new_isolated_read_only`.
- `VOLUNSERVE_PHASE12_NEW_FIREBASE_PROJECT` is a NEW non-`demo-` Firebase project ID, and is NOT the protected production `volunserve-3aa5b`, existing accepted staging `volunserve-volunteer-staging`, or old demo project `demo-volunserve-auto-phase4`.
- `GCLOUD_PROJECT` equals the dedicated project and `GOOGLE_CLOUD_PROJECT`, if present, matches it.
- The injected `db.projectId` and `authClient.app.options.projectId` **both** equal that project. No single service-account claim, caller query parameter or frontend config is trusted for this binding.
- No `FIRESTORE_EMULATOR_HOST` or `FIREBASE_AUTH_EMULATOR_HOST` (those belong to Phase 10), and no direct `FIREBASE_SERVICE_ACCOUNT_JSON` or `GOOGLE_APPLICATION_CREDENTIALS` file credential injection. Future cloud access should use an independently approved least-privilege workload identity, not copied production secrets.

These checks are **defense in depth** and do not independently prove Firebase project ownership, IAM permissions or approved deployment. Source-code flags are never a substitute for a separate cloud resource/security review. A different dedicated production app could still be misconfigured; release approval remains separate.

### Current Render services are explicitly out of scope

| Deployment | Render ID | Git branch | Instruction |
|---|---|---|---|
| Production `volunserve.com` backend | `srv-daofqomk1f9s73btsg20` | `backend-live-protected` | **Do not modify** |
| Prior accepted-Volunteer staging backend | `srv-dbsglle1egvs73dq7i8g` | `feat/emergency-auto-dispatch-server-staging-20261115` | Preserve `STAGING_E2E_002`, `STAGING_TEST_001` and responder locks |
| Existing staging UI | `srv-dbufki67bikc739qfmlg` | `feat/staging-gated-admin-volunteer-preview-ui-20261117` | Do not redeploy or repoint |

The Phase 12 module is not imported by their running server or the existing staging UI. Existing services have auto-deploy OFF. No new cloud project or Render service has been created, no deployment is requested, and no real Firebase Auth verification, cloud IAM exchange, or cloud Firestore reads are performed by CI.

## Offline contract testing

`backend/test-autoVolunteerPhase12CloudPreviewAdapter.cjs` uses an ephemeral **localhost Express HTTP server** backed by deliberately FAKE Firebase Admin-shaped Auth and Firestore adapters. It tests mandatory flags and bindings, forbidden Firebase projects, revoked/invalid token behavior, verified-email and approved Admin role checks, aggregate-only response privacy, malformed/forged inputs, 201-entry cutoff, private error suppression, runtime OFF switch, and lack of any write route or production import.

**Important distinction:** Auth token verification is **mocked** in Phase 12 to test the production *interface contract* without cloud secrets. The real signed-token verification in Phases 9–10 was performed only against local Firebase **Auth Emulator**. Neither kind of test establishes real cloud IAM permissions or hosted Firebase Auth correctness.

CI also runs the previous safe-read planner/preview/Phase 11 gates and existing backend identity, signup and certificate tests. Scope is only four new files: this read-only adapter, its fake-cloud HTTP tests, this report and no-deploy CI.

## Next release gates (none satisfied by this PR)

1. Provision a dedicated NEW Firebase project and separate NEW Render staging service with auto-deploy OFF, independent ownership/IAM verification and explicit cost approval. Do not reuse or wipe the old staging.
2. Build an independent staging-only runtime bootstrap that injects Admin Auth/Firestore from a reviewed workload identity and serves only this read-only adapter, with an authenticated non-production staging domain, CORS and logging/alert policies.
3. Verify live Firebase Auth token revocation/email and persisted Admin role against NEW fictional staging identities, then test real Firestore READ-ONLY preview and denies; capture client and service security logs without PII.
4. Validate official SJDM geography, complete paginated roster, Firestore Rules compiler/allowed/denied behavior, and all other assignment-writing paths before adding **any** cloud write adapter.
5. Separately design secure server-side Accept/Decline, Admin cancel, reliable notification and audit delivery, accepted-history preservation, and durable monitored scheduler; do NOT activate until all negative/race tests and operational controls pass.
6. Release gate remains **DRAFT/NO-GO**. Do not deploy to protected production or old staging, and do not activate real emergency automatic dispatch.

**Phase 12 completion means source/test implementation of a cloud-compatible READ-ONLY adapter — not cloud staging rollout or emergency assignment availability.**
