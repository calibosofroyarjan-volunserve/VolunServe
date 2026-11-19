# VolunServe — Phase 11: Isolated Cloud Staging Readiness Audit

**Date:** 2026-11-19, Asia/Manila  
**PR:** Draft Phase 11, based on Phase 10 PR #625, stacked back through Phase 1.  
**Decision:** **NO-GO FOR CLOUD DEPLOYMENT; no cloud staging application has been created.**

## Executive finding

Phase 10 is an authenticated **local Firebase Auth + Firestore Emulator** application, not a cloud staging candidate. Its `backend/autoVolunteerPhase10LocalApp.js` and Phase 6–9 writers refuse to run unless the real process uses `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`, `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099`, and `GCLOUD_PROJECT=demo-volunserve-auto-phase4` with a matching Firestore client project. Replacing the environment variables on a Render service **must not** be treated as a safe integration path. The real Firebase cloud auth/Firestore adapter and separately approved service-account scope have not been implemented.

### Actual current services observed in Render, November 19

| Service | Render ID | Git branch | Deployment state | Policy |
|---|---|---|---|---|
| Live VolunServe backend | `srv-daofqomk1f9s73btsg20` | `backend-live-protected` | Live at `61baa71355f155bb7f66301be0e5f367d407cf0f` | **Never modify** from this phase |
| Existing emergency-auto staging backend | `srv-dbsglle1egvs73dq7i8g` | `feat/emergency-auto-dispatch-server-staging-20261115` | Live at `ea9056afa1154e17478b73b3214b2bb8ddd548cc` | Keep accepted fictional Volunteer/lock unchanged |
| Existing emergency-auto staging UI | `srv-dbufki67bikc739qfmlg` | `feat/staging-gated-admin-volunteer-preview-ui-20261117` | Existing separately deployed UI | Do not repoint this to experimental server |

The three services are configured with **auto-deploy OFF**, and their pull-request previews were not enabled when inspected. This review did **not** read, rotate or modify their service environment secrets.

**Isolated staging Firebase already in use:** `volunserve-volunteer-staging`. Existing accepted fictional `STAGING_E2E_002` and `STAGING_TEST_001` tasks, reservations, notification evidence and audit records must not be reset, deleted, reused or reissued. The live Firebase project is `volunserve-3aa5b`. A new cloud candidate must have a **new, independently verified Firebase project and new Render service**, rather than writing into either existing project.

## This PR's executable fail-closed preflight

- `backend/autoVolunteerPhase11CloudIsolationGate.cjs`: **pure read-only** check of a proposed cloud staging configuration. Explicitly refuses known production, existing staging and emulator project IDs; refuses three existing Render service IDs, protected branches, Render auto-deploy and credentials/production writes. Requires separate evidence of real cloud Auth/Firestore adapters, permissions, released notification consumers, verified SJDM geography, full-roster correctness, independently reviewed scheduler, monitoring, costs, and explicit approval.
- Even if someone fabricates **all** checklist answers as `true`, it returns `HUMAN_REVIEW_REQUIRED` and **always** reports `stagingDeploymentAuthorized=false` and `productionDispatchAllowed=false`. It **cannot** deploy.
- `scripts/check-auto-volunteer-phase11-cloud-readiness-20261119.cjs`: source-only audit with **no Firebase/Render network calls or secrets**. It checks the current production-based candidate for unintended import of the local-only module and emulator guard markers.
- **Independent branch evidence**: the existing staging server file is NOT in the protected-production-based Phase 10 working tree. Phase 11 CI fetches the specific separately deployed staging Git branch, extracts only `backend/emergencyAutoDispatchStagingServer.js` with `git show` into a temporary file, then audits that source for the recognized fictional staging fixture protection markers and no accidental Phase 10 module import.
- This cross-branch check is **static only**. It does not infer that staging Firebase or cloud secrets are safe or that an accepted task can be reissued. No production or staging Firestore access occurs.

## Cloud staging setup checklist for a future *separately authorized* release

1. **Isolated resources:** provision a brand-new Firebase project and brand-new Render backend service; verify exact ownership and IDs independently. Do not reuse the two existing Firebase projects or three existing Render services. Set auto-deploy OFF and all real emergency dispatch OFF.
2. **Dedicated branch:** create an explicitly reviewed `candidate/auto-volunteer-cloud-...` branch, based on the protected production semantics plus individually ported Phase 1–10 changes. Do not bulk-merge diverged staging branches or copy local-emulator code unchanged. Ensure existing login, verified identity, certificates and donations are unaffected.
3. **Real cloud adapters:** replace the demo-only adapters with independently reviewed, authenticated and least-privilege Firebase cloud code. Verify revoked ID tokens, email verification, approved Admin/Volunteer roles, approved application/skills, exact assignment ownership, and all competing manual vs automatic writers using consistent case-winner transactions.
4. **Firestore Rules and data contract:** independently verify the draft Rules compile within actual service limits and test both allowed and denied client operations. Prevent old clients from bypassing winner invariants; Firebase Admin SDK writes bypass Rules and therefore need server-side checks.
5. **Eligibility:** confirm the complete official SJDM barangay list and adjacency. Wave 2 stays OFF until validated; all-eligible fanout must safely handle more than the demo's 40 offers and 200 source records using a documented indexed/paginated contract.
6. **Notifications / privacy:** check browser and mobile notification consumers, one-time audits, cancellation notices, data retention, GPS permissions and life-cycle STOP. Protect usernames, GPS and private resident information from logs and aggregate previews.
7. **Scheduler:** choose, fund and test an authenticated managed background job (e.g., Cloud Tasks or a scheduled scan) with reliable trigger, retries, lease fencing, idempotent event IDs, cost controls, rate limiting, an outage alert and safe pause. A Firestore lease and manual due-scan do NOT run themselves.
8. **Staging validation:** use only NEW fictional identities and NEW fictional cases in the NEW project. Verify Create → Offer All → Accept/Decline → Single Winner → Stop Waves → Safe Cancel on Web/Mobile while preserving prior accepted staging evidence elsewhere. Execute rollback/kill-switch and alarms tests before considering live.
9. **Release decision:** record independent QA/security/operational sign-off and cost approval. Production release, if separately authorized later, must be an isolated reviewed commit with dispatch default OFF and an immediate no-data-loss rollback. This Phase 11 preflight does not grant that authorization.

## Blockers reported by the Phase 11 gate today

- No NEW isolated cloud Firebase project has been created or verified.
- No NEW Render service has been created or verified.
- A production-compatible cloud backend Auth/Firestore adapter has not been built from the emulator-only Phase 10 modules.
- Full production Rules, client compatibility, authenticated Cloud staging E2E, official SJDM geography and fanout scaling remain unverified.
- No funded/monitored 24/7 managed scheduler exists, and no accepted operational alert/recovery SLA has been validated.
- No release approval for a cloud staging deployment is present.

**Therefore: Phase 11 is a source/configuration *readiness review*, not Phase 10 cloud deployment.** Keep this PR DRAFT and do not merge, deploy, create a service, reset a staging fixture or activate any dispatcher without a separate explicit authorization and independent isolation proof.
