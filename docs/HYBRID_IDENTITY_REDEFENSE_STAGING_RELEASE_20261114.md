# VolunServe Hybrid AI Identity Verification — Defense Scope and Safe Release Plan
_Checked 2026-11-14 Asia/Manila. Staging-only; NOT a production release or certified biometric verification._

## Locked workflow
Resident sign-in / registration → five supported government IDs (National ID, Passport, Driver's License, UMID, PRC ID) → OCR and profile checks (name, DOB, barangay) → existing face similarity (preliminary / uncalibrated) → operational Admin queue → explicit Verify (independent issuer attestation), Reject submission, or Require Retry → profile-owned final identity flag. No AI-only Verified grant.

## Verified implementation audit
- **Implemented / automated synthetic tested:** accepted-ID allowlist; unsupported/school ID rejection when detected; front/back controls (passport bio-page exception); OCR and preflight with the registered name, birth date and barangay; document blur/status warning codes; server-side authenticated Admin review; transaction/audit; bounded retry attempts and one true Verified source.
- **Implemented, NOT independently validated:** geometry-based face comparison and research-only SFace; preliminary score is not identity proof. MiniFASNet PAD and second shadow classifier are NOT calibrated/certified for spoof resistance. Never display these as Passed identity/liveness.
- **In this PR, awaiting CI:** separate Admin rejection outcome with reason and audit; Resident rejected result on web/native; explicit unvalidated face/PAD descriptions.
- **Blocked:** current staging backend intentionally returns HTTP 423 for sensitive ID/selfie uploads. This prevents real authenticated multipart Resident→AI→Admin end-to-end testing. Do not disable it without approved privacy/retention and protected media controls.
- **Not implemented:** durable encrypted, strictly authorized per-Admin display of original ID/selfie images. Existing Admin queue instead shows sanitized OCR and reviewer evidence; Admin MUST use an independent approved validation method and should never pretend to have inspected an unseen picture.
- **Not validated:** actual mobile-camera/OCR accuracy, full authenticated Admin browser click flow, same-device/cross-device match calibration, print/replay false accept rate, government-issuer authenticity, sensitive media retention/access/deletion sign-off.

## Preserve release boundary and rollback
- No production Hosting, Firebase Rules, Firestore/Auth, production backend or identity AI changes in this PR. Do not bulk-merge `integration/identity-full-staging-20261112` into production.
- Prior confirmed Render deployments for rollback references:
  - Staging Node backend `srv-dbnp9ulg1s2s73daj250`, last live commit `c465dbde7a4ed595b3df017b705afb2a521523cb`.
  - Staging Python AI `srv-dbnf63dg1s2s73choolg`, last live commit `3ed9328ad1b59940af9013a6458c5715420039bc`.
  - Staging Expo static site `srv-dbrfe0dbedkc73df01jg`, last live commit `f3ecfe0309e1af3da55040216d9ee1442654333b`.
- Snapshot prior branch heads and service deploy IDs before any staging release; only release a CI-passing commit to the appropriate isolated service. Do not unlock staged media-gate flags or change Firebase accounts/data.
- Verify postrelease `GET /health`, capability gate `HTTP 423`, authenticated Admin authorization, non-Admin forbidden, synthetic five-ID and Admin Verify/Reject/Retry tests, and Resident verified flag remains Admin-only.
- If any regression, stop release; redeploy the recorded previously LIVE service revision via an explicitly approved controlled rollback and confirm health. Do not touch production or data. Render service latest *live* deploy alone is not a rollback execution.

## One-week defense recommendation
Demonstrate only the completed authenticated/role-gated screen and synthetic/pseudonymous decision test evidence, labeled as such. With no approved real-media ingestion, do not present synthetic verification as completed real user ID/face checks. User can explain biometric AI as a reviewer-assistance signal, NOT official issuer or liveness certification.

**Release decision:** No production publish until identity privacy/authorization controls, applicable real-user staging consent/E2E validation, and a verified protected Hosting rollback procedure pass.
