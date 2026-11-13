# VolunServe identity workflow — final staging privacy gate

The Windows camera-only tool and private face-detection research pilot are
working as **local QA**. They do not authenticate a Resident or prove liveness.

## Current release state

- Read-only authenticated Firebase profile and identity status checks: staging QA
  functionality; full real-account/Admin end-to-end validation not yet proven.
- Python AI readiness, OCR, profile-comparison and experimental face/PAD models:
  health and synthetic contract tests only; issuer authenticity and independently
  measured PAD accuracy are **not validated**.
- **Staging ID/selfie media uploads: intentionally disabled** by
  `STAGING_IDENTITY_MEDIA_UPLOADS_ENABLED = false` in the Node backend.
  `/api/identity/document/precheck` and `/api/identity/verify` both use
  `requireStagingIdentityMediaApproval` and return HTTP 423 instead of
  accepting multipart ID/selfie media.
- **Frontend fixed**: `checkIdentityEngineReady()` now requires BOTH
  `ready: true` and **`mediaSubmissionEnabled: true`** in the
  authenticated readiness response. It no longer treats a healthy AI server
  as proof that media submission is permitted. Before even opening a
  government ID camera, web and native UI call this readiness gate and
  surface the pause message. The backend remains authoritative.
- Real biometric auto-approval and ID issuer authenticity checks remain off.

## Why this is needed

Before this change, the backend could correctly block sensitive uploads while
the web/native UI still invited the Resident to photograph government IDs,
passed the health check and then received HTTP 423. That was confusing,
exposed unnecessary sensitive images locally and wasted the Resident's time.

This change does NOT enable verification, upload photos, deploy staging/live,
or invent a substitute for a completed independent PAD/security/privacy review.

## Remaining independent go-live requirements

The authorized project owner must commission/complete real-device
security/privacy validation, independent PAD performance evaluation
(including genuine users and print/replay attack classes), government issuer
authenticity methods, evidence access/retention/deletion review, and an
authenticated staging Resident-to-Admin end-to-end acceptance test.

Only after those reviews can the owner consider a separate approved
staging-media enablement/deployment change. Do not flip upload safety flags or
auto-verify IDs to make a thesis demonstration appear finished.

For thesis demonstration right now, show **local camera-only quality QA**,
synthetic OCR checks, read-only staging identity status, and Admin review policy
tests. Clearly describe all face/PAD outcomes as **experimental shadow scores**.
