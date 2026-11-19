# VolunServe — Phase 14: Independent Cloud Staging Read-Only Service Entry Point

**Review date:** November 19, 2026 (Asia/Manila)  
**Base:** Phase 13 draft PR #628, chained back through Phase 1 to protected production commit `61baa713`.  
**Release decision:** **NO-GO for any real cloud deployment or automatic emergency dispatch.**

## What has been prepared

`backend/autoVolunteerPhase14StagingServer.cjs` is a real, independently runnable **read-only HTTP entrypoint** for a future, separate, approved staging service. It is deliberately **NOT** imported by production `backend/server.js` and does not replace the production `backend/package.json` start command. Importing the module makes no network connections, initializes no Firebase apps, and starts no listeners.

An explicitly authorized operator of a **brand-new isolated service** could in the future run `node backend/autoVolunteerPhase14StagingServer.cjs` as that service's start command, only after obtaining a new independently verified Firebase project, Render service and secure identity. **That has not happened in this PR.**

The entrypoint first checks all Phase 13 Firebase-project / new-Render-service / dedicated-branch / dispatch-OFF conditions and additional Phase 14 flags:

- `VOLUNSERVE_PHASE14_LISTENER=read_only_canary`
- `VOLUNSERVE_PHASE14_ALLOW_WRITES=disabled`
- `VOLUNSERVE_PHASE14_NO_WORKER=true`
- `VOLUNSERVE_PHASE14_BIND_HOST=0.0.0.0` for a future reviewed cloud HTTP listener, or `127.0.0.1` for local offline tests
- `VOLUNSERVE_PHASE14_CLOUD_INGRESS=read_only_reviewed` when the host is `0.0.0.0`; **this self-declared flag does NOT prove a firewall, authorization, TLS, WAF or private ingress**
- An explicit valid `PORT` (1024–65535 for production-like startup). In local offline tests alone, `PORT=0` is permitted when `NODE_ENV=test` and the listener binds `127.0.0.1`.

Default is **OFF**, and no Firebase SDK is initialized before runtime checks pass. The process creates the Phase 13 isolated named Firebase Admin app, validates Auth/Firestore project binding, then launches only Phase 12's authenticated **GET** read-only health/aggregate Admin preview. It rechecks the flags immediately before listening, closes the listener and Admin app on normal shutdown, and attempts to clean up the app if startup fails. No route is defined for accepting, declining, or offering Volunteers, Admin cancellation, GPS tracking, Cloud Tasks, or scheduling.

**Important:** A passed runtime guard is NOT an authorization to deploy, and `0.0.0.0` can expose HTTP traffic if the external service is misconfigured. The real cloud environment must independently enforce network access controls and Auth.

## Critical cloud identity finding

**Render external services do not inherently provide a Google Cloud metadata-server workload identity.** The Phase 13 bootstrap uses Firebase Admin `applicationDefault()`, but we have **not** established a valid or properly scoped ADC workload identity for a new Render service. That is a blocker to actually starting the cloud service.

The current Phase 12/13 gates also reject `GOOGLE_APPLICATION_CREDENTIALS` and service-account JSON, intentionally avoiding copied production keys. Some Google Workload Identity Federation configurations use an `external_account` credential configuration file referenced via `GOOGLE_APPLICATION_CREDENTIALS`. **This candidate would currently reject that pattern**. Do not bypass the check by injecting a static production service-account key or falsely marking IAM as verified.

Before choosing hosting or identity design:
1. Determine with the project/IAM owner whether the dedicated service can use an approved, revocable and least-privilege **credentialless** workload identity mechanism supported by that host, or consider a separate Google Cloud environment such as Cloud Run, where an attached dedicated service account may support metadata-based ADC.
2. Verify actual Firebase Auth `verifyIdToken(token, true)` and complete read-only Firestore source access for only the NEW project. Verify absence of effective permissions on production `volunserve-3aa5b` and existing historical staging `volunserve-volunteer-staging`, including inherited organization/service-account impersonation routes.
3. Keep data access as narrow as the SDK permits; **Firebase Admin SDK bypasses client Firestore Security Rules**, so Auth and Firestore IAM plus backend authorization must be independently assessed and tested. Do not guess an IAM role or create grants in a PR.
4. Obtain explicit approval for any cloud identity, Firebase project, Render service, billing, and exposure of a new endpoint.

No real ADC credentials, IAM bindings, Firebase projects, service accounts, Render services or cloud resources have been created or changed here.

## Future isolated staging configuration outline — NOT active configuration

Only after independent approval and verification, configure a **NEW** service with:

| Setting | Future value / decision |
|---|---|
| Repository | `calibosofroyarjan-volunserve/VolunServe` |
| Git ref | A **new separately reviewed** `candidate/auto-volunteer-cloud-...` branch with only the audited changes |
| Root directory | Repository root, with only `backend` dependencies required by the staging entrypoint |
| Build | `npm ci --prefix backend --ignore-scripts --no-audit --no-fund` |
| Start | `node backend/autoVolunteerPhase14StagingServer.cjs` |
| Deploy setting | **Auto-deploy OFF**, manually approved deployment only |
| Firebase project | NEW independent verified project, **not** production or existing staging |
| Cloud identity | **UNRESOLVED:** externally validated ADC or alternative secure host/identity integration required |
| Listener | Explicit assigned `PORT`, `0.0.0.0` and independently reviewed ingress, TLS and access controls |
| Feature controls | Phase 12 + 13 read-only flags, Phase 14 listener flag, **dispatch disabled, writes disabled, worker absent** |
| Data | Only new fictional test accounts/cases; no copy of existing private records or accepted staging task |
| Monitoring | Redacted operational status, no token/project/account data, incident kill switch and rollback instructions |
| Cost | Explicitly approved by owner before provisioning |

This is a **documentation outline**, not a live `render.yaml`. A root Render Blueprint has deliberately NOT been added, preventing an accidental infrastructure rollout.

## Offline Phase 14 CI

`backend/test-autoVolunteerPhase14StagingServer.cjs` builds a **fake Firebase Admin SDK**, does not call Google or Render, binds a real local HTTP listener to `127.0.0.1`, and checks:

- Default OFF and cloned env object rejection before any SDK calls.
- Production/old staging project and old Render service IDs denied.
- Missing read-only flags and missing external ingress-review flag denied.
- Bad host/port and production ephemeral port denied.
- Startup refusal before calling Firebase, invalid candidate cleanup, and private SDK error redaction.
- Changing the kill switch during asynchronous initialization prevents listen().
- Real localhost health and authenticated Admin preview routes from Phase 12/13, denied Resident, only aggregate counts, no candidate identities, no POST/write routes.
- Runtime OFF makes further reads unavailable, idempotent shutdown, Admin SDK cleanup, listener bind conflict cleanup.
- Existing `backend/package.json` start continues running the original production `backend/server.js` unchanged, and no production import exists.

GitHub CI also runs earlier Phase 13/12/11 reviews, matching preview and current backend identity/signup/certificate regression tests. The PR adds **exactly four new files**: isolated entrypoint, test suite, this document and a strict no-deploy workflow.

## Remaining release gates

The new identity, project, service, effective IAM, DNS/network boundary, staging-only authorized test users, exact schema and Firestore indexes, trusted geographic adjacency, source-scan scaling, mobile/browser E2E, monitored durable scheduler, manual vs auto winner invariants, cancellation and rollback all remain unverified.

**No real Firebase/Render deployment has occurred. PR stays DRAFT/UNMERGED. Production and historical staging remain unchanged. Emergency automatic dispatch remains OFF.**
