# Render certificate test-only 1-minute exception — production backend release

## Production source of truth

Render service `VolunServe`, URL `https://volunserve.onrender.com`,
ID `srv-daofqomk1f9s73btsg20`, uses GitHub branch `backend-live-protected`
and root directory `backend`. Auto-deploy is disabled. As inspected on
2026-11-10, the live deployed commit and `backend-live-protected` tip matched:
`97ed9ef6da2ccf46cc00ca80d601cbcd76d64c61`.

This change deliberately applies only to the actual Render backend branch,
not to the divergent web-hosting `live-protected` history.

## Server-only policy

By default minimum attendance remains **30 minutes**. The optional test
exception requires ALL THREE server-only Render environment variables:

- `VOLUNSERVE_CERT_TEST_OVERRIDE_ENABLED=true` (exactly lowercase `true`)
- `VOLUNSERVE_CERT_TEST_EVENT_IDS`: comma-separated Firestore event document IDs
- `VOLUNSERVE_CERT_TEST_VOLUNTEER_UIDS`: comma-separated Firebase Auth UIDs

**Production release must NOT set the enable flag or the allowlists.** Even if
both ID allowlists are accidentally present, without the explicit enable flag
the backend must continue enforcing 30 minutes. Only a pair where BOTH IDs
match *and* the separate enable flag is on may qualify with **at least 1 minute** of
Admin-verified service after event completion. All other required checks,
including participant joins, proposer separation, legitimate time-in/time-out,
event publication, completion and Admin verification still apply. Unset/false enable flag or blank ID allowlists disable exceptions. Do not store these variables in Expo public environment or
Firestore client-editable documents.

The Admin UI's existing **Retry Certificate Sync** calls Render's authenticated
`POST /api/admin/community-certificates/reconcile`; no UI endpoint change is
required. The background auto-sync also calls the same reconciliation helper.

## Verification and deployment hold

- CI: `cd backend && npm run check` validates existing backend tests, including
  startup auto-sync, plus test-only min-duration checks and simulated Firestore
  transaction/retry/idempotency tests.
- Deploy only after successful CI, independent code review, isolated staging
  integration with authorized test credentials, and exact allowlisted test
  event/volunteer IDs.
- Test 59 seconds (not eligible), 1 minute test pair (eligible),
  6-minute test pair (eligible), 29-minute ordinary participant (not eligible),
  30-minute ordinary participant (eligible), and repeated sync (no duplicates).
- Confirm API response, certificate private/public records, PDF and Verify ID
  before touching the production backend; remove test allowlists after demo.
- Never modify `main`, force-update `backend-live-protected`,
  or trigger a Render deploy from this draft PR.

This is a proposed release, not proof of successful live integration.


## November 10: Production code-only deployment
The operator requested a live deployment, but the authenticated staging
Admin → Volunteer certificate E2E test has not yet been completed. Therefore,
the only acceptable production deployment of this reviewed backend patch keeps
the **entire optional test exception disabled** (do not modify Render
`VOLUNSERVE_CERT_TEST_OVERRIDE_ENABLED` or either allowlist). The 30-minute
production default, existing Admin sync API and background recovery remain
unchanged. In particular the staging-wide 1-minute flag is **not** supported
on this production backend branch; never copy staging web/Firebase settings
to production. No production website or Firebase Hosting change is needed.

After deployment, verify startup/health and confirm the live Render commit.
The authenticated E2E PDF/checkpoint remains pending, and is not implied
by successful GitHub CI or a Render deployment.
