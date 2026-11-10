# Community Event certificate test-only eligibility — release checklist

## Current authoritative sync path

The Admin Attendance **Retry Certificate Sync** button calls the existing Render endpoint
`POST /api/admin/community-certificates/reconcile` using a verified Firebase ID token.
The Render server validates the signed-in approved Admin/Super Admin, reads completed
events and verified attendance from Firestore, computes eligibility, and issues certificates
through atomic/idempotent transactions. Event completion and attendance verification also
use this same endpoint. **Do not replace the existing button with a second callable.**

Firebase Functions contains a separate event/attendance-trigger issuance implementation.
The same exact-ID minimum-duration policy is now applied there for compatibility, but the
new test behavior does not require activating Firebase Functions or upgrading Spark.

## Testing policy and environment

**Default 30 minutes.** One-minute eligibility applies only when BOTH these explicit
server-controlled allowlists match the exact Firestore document ID and Firebase Auth UID:

- `VOLUNSERVE_CERT_TEST_EVENT_IDS`: comma-separated `communityEvents` document IDs
- `VOLUNSERVE_CERT_TEST_VOLUNTEER_UIDS`: comma-separated approved test volunteer Auth UIDs

Configure these in the Render service backend environment when deploying the verified
Render changes. If Firebase Functions are separately deployed and used in the environment,
their runtime would need the same allowlists for consistent behavior. Empty/unset values
or mismatched event/account IDs always fail closed to 30 minutes. No client field, UI toggle,
user profile metadata, or event content grants a testing exemption.

**Do not turn on an allowlist for production participants or real official events.**
Use only a disposable test event and a dedicated test volunteer UID, and remove the
allowlists after demonstration. IDs must be obtained from Firestore/Auth; never guess.

## Test and release verification

1. `cd functions && npm test` (Firebase Functions policy regression tests)
2. `cd backend && node --test test-communityCertificateEligibility.js`
   (Render policy and verified-event integrity gates)
3. `node --check backend/communityCertificates.js` and check Functions syntax.
4. In an emulator/staging Firestore database with a dedicated test Admin,
   volunteer and event: 59 seconds must fail, 1 minute must qualify only for
   the exact allowlisted pair, and a non-allowlisted participant must require
   30 minutes. Confirm the 6-minute volunteer test record can issue if the
   event was completed and the attendance has valid Admin verification.
5. Check the existing Render endpoint with `execute:false` dry run, then
   `execute:true` with the test Admin token. The summary must report
   `eligibleCount`, `issuedCount`, `alreadyExistingCount`,
   `skippedCount`, and `failedCount`. Repeated calls must never duplicate
   certificates, public verification entries, or notifications.
6. Verify that unverified/non-Admin callers are denied; revoked certificates
   are never reissued; completed but ineligible participants remain unissued.
7. Verify the Volunteer My Certificates record, PDF, certificate ID verification,
   and Admin attendance/sync summaries on web and mobile widths.

The Admin UI still displays **30+ minutes** as the normal production guideline.
This is intentional and should not claim every short-duration record is eligible.
The server response decides eligibility for the allowlisted test pair.

## Deployment guards

- All edits must originate from `live-protected` on a review branch; NEVER update
  the outdated `main` or force-push the protected branch.
- Review the PR, confirm it is current with the live branch, run CI and staging
  integration tests, and confirm Render service repo, root directory and auto-deploy
  settings **before** releasing.
- Do not assume a GitHub commit automatically changes the running Render service.
- Do not change the live Firestore documents or deployment settings solely to
  prove the one-minute rule before the verified release.
- Remove both test allowlists after successful controlled demonstration.
