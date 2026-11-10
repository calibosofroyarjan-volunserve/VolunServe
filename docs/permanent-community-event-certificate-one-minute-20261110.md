# Permanent one-minute Community Event certificate minimum

## Production source and scope
User approved permanent use of the one-minute minimum on 2026-11-10.

Release the reviewed production **Render backend only** from protected branch
`backend-live-protected`; service `srv-daofqomk1f9s73btsg20`, source
`backend/`. No `main`, production Firestore rules, Firebase Hosting, or
staging database updates are required for the backend eligibility behavior.

## Persistent policy
The previous seven-day auto-expiry is removed. The server-controlled
environment variable below controls a **permanent (no-expiry)** policy:

`VOLUNSERVE_CERT_LIVE_ONE_MIN_PERMANENT_ENABLED=true`

Only new Community Event attendance records with **both Time In and Time
Out** on or after **2026-11-10T14:55:00Z** and a Community Event completed
after that cutoff can qualify after **at least one full minute**. This
preserves the original production activation boundary.

Existing and previously completed attendance before the boundary retains
the original **30-minute** minimum. No mass retroactive certificate
generation. Other requirements unchanged: published/completed event,
participant joined, proposer cannot claim own event, explicit Admin
attendance verification, timestamps/IDs valid, certificate details
complete, certificate and public verification IDs deterministic,
notification issuance and existing duplicate/revocation guards.

Existing Admin Retry Certificate Sync and background reconciliation use the
same policy and are unchanged. No client-side bypass.

## Transition from old temporary settings
When deploying the new backend, **update, do not replace** the Render
environment with:
- `VOLUNSERVE_CERT_LIVE_ONE_MIN_PERMANENT_ENABLED=true`
- `VOLUNSERVE_CERT_LIVE_TEMP_ONE_MIN_ENABLED=false`

The old `VOLUNSERVE_CERT_LIVE_TEMP_ONE_MIN_START_UTC` and
`VOLUNSERVE_CERT_LIVE_TEMP_ONE_MIN_END_UTC` environment variables are
ignored by this code. They are not a deadline or time limit anymore.
Render environment update triggers a deploy on the correct protected
commit. Do not deploy `main` or `live-protected` via Render.

## Emergency rollback
Set `VOLUNSERVE_CERT_LIVE_ONE_MIN_PERMANENT_ENABLED=false` on **production
Render** to restore 30 minutes for subsequent issuances. Already-issued
certificates must not be deleted or silently revoked. Check Render's
deployment status and backend logs after changing any environment field.

## Verification
- Production backend regressions and isolated Firestore emulator tests.
- New unit checks for the permanent policy continuing through 2028.
- Confirm exact protected commit on the live Render service and successful
  startup.
- Signed-in Admin → Volunteer → PDF / Verify ID end-to-end workflow
  remains a separate validation; a successful server deployment cannot
  prove the browser flow completed.

## Existing website UI label
`volunserve.com` currently has an unrelated live-hosting branch history
divergence. A visual-only adjustment PR #395 remains draft/blocked. Do not
publish the protected website's unreleased backlog to update hardcoded
"30 minutes" text. Backend policy is authoritative; the old UI label may
be inaccurate until a separately reviewed live-derived website hotfix.
