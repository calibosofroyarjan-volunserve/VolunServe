# VolunServe identity — consolidated acceptance gate (staging QA only)

**Date:** November 13, 2026 (Philippines). **Identity release status:** automated synthetic workflow only; no authorized real-user browser validation, no credentialed Firebase writes, no real biometric captures.

## Scope of the consolidated check

This is a single repeatable **no-deploy** CI acceptance test on existing backend route handlers (not isolated hand-written replacement decision logic). Run from repository root after installing no additional packages:

    node --test backend/test-staging-identity-acceptance-e2e.cjs

The test executes actual source for:
- `GET /api/admin/identity/reviews` with simulated JWT/auth role middleware and an **in-memory fake Firestore**;
- `POST /api/admin/identity/reviews/:uid/decision` with the actual transactional reviewer permissions, selected-ID policy, human-review attestation, audit writing, no-repeat safeguards and Require Retry;
- `GET /api/identity/status` from the synthetic Resident/Volunteer account after Admin decisions, checking final status propagation;
- the actual constant-false staging ID-media upload gate, confirming HTTP 423 before media processing;
- privacy-safe response shape: raw MRZ, selfie bytes and untrusted Firestore fields are never emitted to the Admin review queue or Resident status endpoint.

It simulates two **fictional** approved profiles and matching verification rows. A simulated independent review attestation is used **only to exercise backend branching**. No reviewer actually authenticated a passport, no issuer contacted, no face model validated, no Firestore/GCP service accessed, and no account is verified in a real project.

## Reconciled status semantics

The Resident status endpoint must return the **final Admin action** instead of a stale provisional `aiDecision: manual_review`.

- After a valid synthetic Admin Verify transaction: `identityStatus=verified`, `identityVerified=true`, `decision=verified`, with one activity log and no second decision permitted.
- After a Require Retry transaction: `identityStatus=failed`, `identityVerified=false`, `decision=retry_required`, and the retry attempt counter resets; no second decision permitted.
- Prior to a review: `identityStatus=pending`, `decision=manual_review`, `identityVerified=false`.
- No AI decision or face-model score alone grants the `verified` flag. The backend Admin transaction is still the only authority, and it requires an actual independent issuer/LGU validation to be represented truthfully in production.

Staging uploads are **intentionally locked (HTTP 423)**. No automated test may disable this merely to achieve an end-to-end pass. The synthetic integration is an *acceptance test for backend control flow*, not an actual end-to-end real browser/Firebase/face-image test.

## Release evidence

- CI: GitHub `Identity OCR unit tests (review only, no deploy)` on the latest feature commit; only claim a pass when the workflow is completed successfully.
- Baseline Admin role/access and anti-replay: `backend/test-admin-identity-flow-synthetic.cjs`.
- Frontend Admin eligibility aligned with actual Node policy: `backend/test-staging-admin-review-ui-contract.cjs`.
- Front/back OCR, passport MRZ, supported IDs: `backend/test-selectedIdPolicy.js` and Python tests.
- Real-device consented pilot: `identity-ai/PAD_WEBCAM_PILOT.md` (not independently validated).
- Master release blockers: `identity-ai/IDENTITY_FINAL_STAGING_RELEASE_CHECKLIST.md`.

## Go / no-go decision

**GO for an explicitly simulated thesis demo:** Show code, UI mock/sample records, synthetic controlled results, real authentication architecture, and manual human-review requirements with accurate labels.

**NO-GO for unrestricted real-ID staging capture or production biometric approval:** Real authorized Admin browser testing, privacy/security/retention sign-off, reliable independently measured genuine/print/replay liveness detection, accessibility/fairness evaluation, and independently checked government ID authenticity are incomplete. Do not claim a real person passed AI verification, store or upload their documents, bypass Admin access, or change protected live deployment without separate approval.

**Production `volunserve.com`, production credentials/Firebase, and staging media restrictions remain unchanged by this no-deploy acceptance check.**
