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

By default minimum attendance remains **30 minutes**. Exact test event
and volunteer matching must both be configured in Render environment:

- `VOLUNSERVE_CERT_TEST_EVENT_IDS`: comma-separated Firestore event document IDs
- `VOLUNSERVE_CERT_TEST_VOLUNTEER_UIDS`: comma-separated Firebase Auth UIDs

Only a pair where BOTH IDs match may qualify with **at least 1 minute** of
Admin-verified service after event completion. All other required checks,
including participant joins, proposer separation, legitimate time-in/time-out,
event publication, completion and Admin verification still apply. Blank variables
disable exceptions. Do not store these variables in Expo public environment or
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
