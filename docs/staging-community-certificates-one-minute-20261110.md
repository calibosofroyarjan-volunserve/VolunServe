# Isolated staging certificate test release — 2026-11-10

## Target
Render service `volunserve-backend-staging` (ID `srv-dbnp9ulg1s2s73daj250`)
is configured to use GitHub branch
`fix/identity-full-hardening-live-base-20261107` and root directory
`backend/`. The production Render service uses a **different** branch,
`backend-live-protected`, and is not in scope here.

The user confirmed the staging service's
`VOLUNSERVE_DEPLOYMENT_ENV=staging` and the configured service account's
`project_id=volunserve-auth-staging`. These are safe configuration indicators.
Before deploying, additionally verify the live staging Identity AI URL points
to `https://volunserve-identity-ai-staging.onrender.com`, that the staging
environment's secret is still present, and that no override has disabled the
staging guard. **Never expose the service account JSON or private keys.**

## Test-only eligibility
By default, all participants require at least **30 minutes**.
For a dedicated staging event and volunteer only, configure these SERVER-only
Render environment variables with the exact staging Firebase IDs:

- `VOLUNSERVE_CERT_TEST_EVENT_IDS`: comma-separated staging Firestore
  `communityEvents` document IDs
- `VOLUNSERVE_CERT_TEST_VOLUNTEER_UIDS`: comma-separated staging Firebase Auth
  volunteer UIDs

Both must match or the 30-minute production default remains in force.
Unverified attendance, incomplete/unpublished events, time anomalies and
event proposers cannot receive a certificate. The normal Admin Render sync
API remains the source of truth and retains transaction duplicate/revocation
checks.

## Validation gates
1. The staging-only PR CI checks original staging isolation tests, new
   eligibility/issuance tests and 8 real Firestore emulator cases, with
   `demo-` project and `FIRESTORE_EMULATOR_HOST` guard.
2. Review the staging PR before merging to the staging branch; do not
   merge the unrelated production PR or force-update any branch.
3. Confirm staging Render service's configured Firebase project and identity
   AI URL, then trigger only the staging service deployment when approved.
4. Create dedicated **staging** Admin, event, volunteer and attendance;
   production's existing 6-minute event is not copied automatically.
5. Verify API `/api/admin/community-certificates/reconcile` with a staging
   Admin, complete/verified event, and exact staging IDs; confirm generated
   private and public certificate records, notifications and repeated sync
   idempotency. Verify volunteer My Certificates/PDF/Verify ID in staging.
6. Only after passing the controlled staging tests consider separate production
   PR #386. Do not set test-only environment allowlists for real participants.

This document is a test plan, **not a declaration that staging is deployed**.
