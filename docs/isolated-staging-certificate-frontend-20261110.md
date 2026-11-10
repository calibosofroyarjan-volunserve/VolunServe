# Community Event certificate E2E staging frontend — Nov 10, 2026

This patch is **not a production website release**. It targets the existing
Render static review service `volunserve-consolidated-pc-mobile-review`
(`srv-dbnjnbgu01pc73cv337g`), using branch
`design/consolidated-four-role-desktop-mobile-20261107` only.

## Routing
- Admin Attendance **certificate sync only** targets
  `https://volunserve-backend-staging.onrender.com/api/admin/community-certificates/reconcile`
  when `EXPO_PUBLIC_VOLUNSERVE_STAGING_MODE=1`. Other backend operations
  retain their existing staging safety routing and disabled paths.
- Production web uses its preexisting Render backend URL, unchanged.
- Admin Attendance displays **1 minute** only in staging and **30 minutes**
  in production. Display is not an authority for certificate issuance.
- Volunteer Certificates / public ID verification already read from the
  Firebase instance selected by the isolated frontend config.

## Fail-closed browser Firebase
The actual static site build now **refuses** to start unless the client Firebase
project is exactly `volunserve-auth-staging`. The other Firebase public fields
must match and be complete as required by existing staging config. Existing
Render service environment variables are not readable through the connected
tooling, and must not be guessed; when not configured with the actual staging
Firebase Web app values the build must fail rather than reach production.

A CI Expo export against explicitly **synthetic** Firebase Web app values
validates code/build compatibility; it does **not** prove a working login
against real staging Firebase.

## Backend access
The staging Render backend must allow the exact review site origin in its
staging-only CORS config, without modifying production CORS. No direct
browser test should be attempted until that staging backend revision is live.

## Manual end-to-end (only with nonproduction test accounts)
1. Sign into the review site with a staging Admin and a separate staging
   Volunteer, not any live VolunServe user.
2. Complete a staging Community Event (published, proposer separate from
   attendee); Volunteer Time In, wait >= 1 minute, Time Out.
3. Admin verifies attendance, completes event, uses Retry Certificate Sync.
4. Check the issuer reports 1 issued or already existing; inspect Volunteer
   My Certificates PDF and public verification ID.
5. Repeat sync; assert no duplicate.
6. Verify ordinary production remains at 30 minutes and production deploy
   commit remains unchanged.

## Rollback
Staging backend setting `VOLUNSERVE_CERT_STAGING_TEMP_ONE_MIN` can be set to
`false` to restore 30 minutes (existing records are not revoked). Frontend
code rollback is limited to this preview-only branch/deploy.
Do not touch `main`, `live-protected` or `backend-live-protected`.
