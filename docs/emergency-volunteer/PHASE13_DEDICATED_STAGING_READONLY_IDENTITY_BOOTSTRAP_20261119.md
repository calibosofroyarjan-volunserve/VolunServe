# VolunServe — Phase 13 Dedicated Cloud Staging Security Bootstrap

**Date:** November 19, 2026 (Asia/Manila)  
**Base:** Draft Phase 12 PR #627, with earlier PRs stacked from protected production commit `61baa713`.  
**Release result:** **NO-GO. Review/testing only. No new cloud service, Firebase project, credentials, deployment, or scheduler created.**

## What Phase 13 adds

`backend/autoVolunteerPhase13ReadOnlyCloudBootstrap.cjs` is an **unmounted runtime bootstrap factory**, not a live Render entrypoint. Importing this module does not initialize Firebase, connect to any database, obtain service-account credentials, register a timer, open a network listener, or create a route.

When a *separately approved new isolated staging cloud service* eventually invokes it, the factory can call Firebase Admin SDK's `applicationDefault()` from the hosting service's ambient workload identity and create a **new named Admin app**, explicitly bound to the new Firebase project ID. It explicitly **refuses to reuse any pre-existing Firebase Admin app**, avoiding an accidental call through a production default app.

It verifies the injected Firebase Admin Auth client belongs to the newly created app, its `app.options.projectId` matches the selected project, and Firestore `db.projectId` matches the same project. On a mismatch it fails closed and attempts to delete the newly created app. It creates only the Phase 12 **GET-only, authenticated, aggregate read-only Admin preview** application; there is no automatic dispatch, assignment mutation, Cloud Tasks setup, timer or Web/Android production integration.

**No server listener is opened by this bootstrap, and `backend/server.js` does not import it.** It does not replace `backend/firebaseAdmin.js`, which remains unchanged for production certificate/identity/signup functionality.

## Mandatory defense-in-depth preflight

All flags must be present and consistent, otherwise nothing calls Firebase SDK:

- `VOLUNSERVE_PHASE13_BOOTSTRAP=readonly_candidate`
- `VOLUNSERVE_PHASE13_STAGING_ONLY=true`
- `VOLUNSERVE_PHASE12_CLOUD_PREVIEW=enabled`
- `VOLUNSERVE_AUTO_VOLUNTEER_PREVIEW=enabled`
- `VOLUNSERVE_AUTO_VOLUNTEER_DISPATCH=disabled`
- `VOLUNSERVE_PHASE12_MODE=new_isolated_read_only`
- `VOLUNSERVE_PHASE12_NEW_FIREBASE_PROJECT` set to a new, valid project ID, **never** `volunserve-3aa5b`, `volunserve-volunteer-staging` or `demo-volunserve-auto-phase4`
- `GCLOUD_PROJECT` and optional `GOOGLE_CLOUD_PROJECT` match the new project
- `RENDER_SERVICE_ID` is a brand-new service, **never** any of these existing services: production `srv-daofqomk1f9s73btsg20`, previous accepted-responder staging `srv-dbsglle1egvs73dq7i8g`, previous staging UI `srv-dbufki67bikc739qfmlg`
- `VOLUNSERVE_PHASE13_SERVICE_ID` matches `RENDER_SERVICE_ID`, and `VOLUNSERVE_PHASE13_STAGING_BRANCH` names a newly reviewed `candidate/auto-volunteer-cloud-...` Git branch
- No Firebase emulators or direct private service-account JSON/path environment variables
- Injected `env` must equal the **actual `process.env`**, not a fabricated object

**Important security distinction:** Environment variables and project labels are **self-declared**, not proof that GCP credentials lack access to production, a new Firebase project exists, a Render service is isolated, or an actual code branch was deployed. This code never attests cloud IAM and never authorizes deployment. The real service identity and Render Git branch must be independently inspected outside the application.

## Minimum IAM and hosting release checklist — NOT performed

1. Create a brand-new Firebase/GCP project and Render service under separately reviewed ownership, with no inherited production credentials, databases, custom domains, endpoints or Firebase service-account JSON. Auto-deploy must remain OFF. Do **not** use `volunserve.com` or alter old accepted staging tasks.
2. Establish a dedicated least-privilege GCP workload identity for this service that can **verify Firebase Auth tokens** and read the required **nonproduction** Firestore collections, with no ability to access production/old-staging data or modify production permissions. Review effective permissions, service-account impersonation and token-creator permissions with the IAM owner. Avoid broad Editor/Owner grants. Firebase Admin SDK operations bypass normal Firestore Security Rules, so IAM and verified server authorization are critical.
3. Independently review the exact Auth and Firestore Admin privileges required by the SDK in the new project, rather than guessing a universal permission list. The current phase contains **no signed IAM grant commands, Terraform provisioning, secrets or credentials**. Cloud access must be validated against a separately authorized fictional cloud staging project.
4. Test revoked token verification, verified email, approved operational Admin `users/{uid}`, role suspension, bounded Firestore source failures, zero private information in HTTP responses, logs, disabled dispatch, and server kill-switch on the real isolated cloud deployment.
5. Verify monitoring, on-call alerts, Cloud Scheduler or Tasks architecture, full official SJDM geographic allowlist (Wave 2 remains disabled), complete indexed roster at real scale, Admin/Volunteer Web/Android tests, safe cancellation and rollback before even considering cloud writes.
6. Review all other manual and automatic assignment writers against the case winner lock invariant; do not copy Phase 6–9 local-emulator write code into a cloud service unchanged.

## CI tests and limits

`backend/test-autoVolunteerPhase13ReadOnlyCloudBootstrap.cjs` uses **entirely mocked Firebase Admin SDK dependencies** and a local `127.0.0.1` HTTP listener for the Phase 12 read-only GET endpoints. The tests verify off-by-default environment preflight, denied protected project IDs and old Render services, fresh branch/service labels, no direct credential injection, no SDK initialization for denied environments, rejection of existing default Firebase apps, mismatch cleanup, ADC exception redaction, Admin-only GET preview, unauthorized role refusal, zero write operations and effective runtime kill switch.

Other Phase 12 cloud-interface, Phase 11 isolation, Phase 1/2 preview and backend identity/signup/certificate regressions are required by the no-deploy workflow.

**These are mock-credential unit/HTTP tests, not actual cloud IAM tests.** None proves Firebase Auth token verification against a real cloud project, managed workload identity binding or Firestore cloud permissions. The bootstrap has no deployment entrypoint and does not run on existing Render services.

**Next blocker:** An independently reviewed new project and new service, an approved read-only cloud deployment plan and verified effective IAM permissions are still required. **PR stays DRAFT/UNMERGED. Automatic emergency dispatch stays OFF.**
