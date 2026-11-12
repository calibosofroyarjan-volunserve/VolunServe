# VolunServe Identity Verification — Release Gate and Device Acceptance
**Review-only staging checklist (2026-11-12). Never deploy automatically.**

## Immutable production boundary
- Current published Hosting marker reported by existing GitHub CI: `2cd63d318ecb6b0dfc52706308e05d0b5806d874`.
- Current `live-protected` reference reported by CI: `28a7a7490fb90b1205c963b474fc817f07312b03`.
- Git history comparison indicates **diverged**: protected is 542 commits ahead and 25 behind the deployed revision. This is **not** a linear deployment update.
- Do **not** change the release marker manually, force merge unrelated branches, publish the full protected backlog, disable release guards, or overwrite production Firebase/Render configs to make tests pass.
- PR #412 is AI/backend/UI code only; PR #413 isolates optional DOB Firestore policy modification for permission review. Both must stay draft until review and release management.

## Tests already automated (no real PII)
- Strict five-ID OCR categories: National ID, Driver's License, Passport, UMID, PRC ID; School/Student/Employee/Library labels are not acceptable.
- Non-passport front + back; passport biological data page only (no reverse requirement).
- Missing/identical/likely reversed sides, unreadable text, blurry photos, unknown and mismatched IDs.
- DOB mismatch, ambiguous date format, residential barangay mismatch/absent details (no fabricated match).
- Authenticated private precheck and verification route handler checks with synthetic bytes.
- Node selected ID, issuer-review/approval guard, Firestore create-only DOB and cross-module TypeScript.
- Production is never touched by these synthetic or demo-emulator checks.

## Required real-camera evaluation — NOT yet passed
Perform only in an authorized staging environment with **dedicated test accounts and consented test documents**. Never upload real IDs to GitHub issues, PRs, or logs.

| Scenario | Expected safe behavior |
| --- | --- |
| Five supported document types, good light and focus | Type/side OCR clues; **still unverified authenticity** |
| School ID, employee ID or unrelated card | Unsupported/retry, no face verification bypass |
| Clear front shown in back slot / back shown in front slot | Retry or inconclusive; no approval |
| Same front scanned twice, altered copies or QR-like printout | Retry/inconclusive; never automatic approval |
| Very blurred selected National ID | Rescan or Admin review; never approved by blur alone |
| DOB differs from saved profile | Manual correction/review, not fraud conclusion |
| Address absent or no residential address on ID | Inconclusive, not a fabricated match or automatic rejection |
| Printed face, screen playback, video replay, deepfake/face swap | **Never mark liveness validated**; independent PAD verification is missing |
| AI offline, OCR failure, image too large | No verification, no unexpected attempt charge, clear retry message |
| Browser permission denied / native camera permission denied | Friendly error, no upload attempt |
| Admin approve without independent proof/notes or invalid ID | Server rejects approval |
| Admin independent approved government ID review with proper evidence | Audited manual approval only |

## Remaining staging requirements
1. Obtain a confirmed isolated Firebase project and Render staging workspace/service before any real-media testing. Do not reuse production Firestore or production users for staging.
2. Verify source and published site lineage **and** reconcile 25 missing deployed-lineage commits. Agree on a reviewed source-of-truth and backup/canary release plan.
3. Security review and explicit approval for PR #413 optional DOB Firestore creation rule. Existing staff-role guard is intentionally failing on non-staff rule changes.
4. Exercise real camera, OCR languages/formats, manual Admin review, retention/privacy policy, and consent across desktop browser and Android.
5. Independently validate issuer authenticity and presentation-attack detection before advertising automation. **No current implementation may auto-grant a Verified Resident badge based on OCR/face match.**
6. Confirm login, signup, resident roles, emergency reports, events, donations, and certificates with cross-module regression and a rollback plan.

Current finding: **Unit and synthetic route tests are evidence of code-level behavior only**; they are not proof of government-document authenticity, real-device accuracy, anti-spoofing, live availability or production readiness.
