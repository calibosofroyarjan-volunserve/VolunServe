# VolunServe original face-only AI — release plan and evidence (2026-11-25)

**Status: QA-ONLY. NOT RELEASED. DEPLOY BLOCKED.**

The selected behavior is the **October 23 original** National ID portrait → live selfie → one-to-one MediaPipe face comparison, **without OCR, national ID text, birthdate, profile-name reading, mandatory ID back, or mandatory head-motion challenge**. Keep the **identical currently published Resident identity screen**: green Resident sidebar, three progress steps, government ID selector, and adjacent Front and Back camera/upload panels. Back ID remains visible but optional for matching. Back and front never become proof of government issuance merely because they have the correct label.

Production release snapshots were built from *divergent histories*, so do **not** merge entire Git branches or deploy a single merged monorepo. Deploy/rollback these components **independently**:

| Surface | Exact currently deployed/public source commit (read-only) | Selected QA candidate (NOT DEPLOYED) |
| --- | --- | --- |
| Render Node | `d06aeb1e0a572bf8581a99d7064da0a8d2430ed4` | `2e3af19a9c2c539a60cc2e3079dd57e85c7108aa` |
| Render Python AI | `319152e6a1cad5e54653c20e87bd1551a82b219e` | `e9f92fedeab95eca769ebf379992c90b3dfd00e0` |
| Published Hosting web | `5af28d279618dacd5eab518e5e0d52259eae8844` | `50b384900b8235b7fd3d6220a85ca2c682d37a49` |

**QA-only cross-service workflow:** `.github/workflows/qa-original-face-only-cross-snapshots-20261125.yml`. It checks out the three refs separately and runs source-diff scope checks, the original historical matching-function equality check, the exact published stylesheet equality check, Python synthetic security/face-only tests, Node private consented evidence/Admin tests, a local mocked-HTTP Node→Python result contract test, and the real Hosting web TypeScript check. **No hosted uploads, real biometrics, production Firebase writes, or Cloudinary calls**.

## Functional contract

1. Basic Resident supplies their own **National ID front portrait** and optionally the ID back (no text OCR). The camera/file input never presumes ID issuance is authentic. Explicit private-evidence consent applies to both front/optional back and the next selfie.
2. Resident captures a selfie. The original `run_face_verification` face-landmark similarity implementation is preserved byte-for-byte. It is not validated liveness/anti-spoofing, and its score is not a calibrated identity probability.
3. The authenticated web client calls Node `POST /api/identity/verify-face-only`. This route is **disabled by default** unless Node's explicit `VOLUNSERVE_FACE_ONLY_ENABLED=true` is set on the intended service. Node forwards media to Python `POST /verify-face-only` with the matching private `IDENTITY_AI_INTERNAL_KEY`; the dedicated `GET /api/identity/face-engine-health` checks private authentication without OCR readiness.
4. Python only permits the declared `national_id` type. It returns preliminary `decision="manual_review"` even when the face score crosses the historical threshold, so Node must persist `pending` + `requiresManualReview`; not `identityVerified=true`.
5. Node retains only consented ID/selfie evidence in private **authenticated** Cloudinary assets and returns only metadata to regular clients; only authorized Admin can access short-lived signed view links.
6. Authorized operational Admin compares the photos and independently verifies that the presented physical ID is genuinely valid before approving; issuer validation method, attestation, and privacy-safe notes are required and audited. **A preliminary AI face match alone must never promote the Resident**.
7. School/employee/other unsupported IDs **cannot be reliably rejected by a face-only algorithm** based on the printed/card type. The declared type is restricted, but manual Admin inspection is necessary. Never claim this setup automatically authenticates a government ID.

## Hard blockers before any real hosted ID/selfie test or live switch

- Staging Firebase credentials have not been independently demonstrated to belong to a non-production Firebase project (live project: `volunserve-3aa5b`). Avoid any hosted test using production accounts or records.
- Secure private Cloudinary for staging previously reported **not configured**; the existing production Cloudinary setup must **not** be copied to staging or modified for sandbox QA.
- The real **hosted** Node↔Python private key equality has not been demonstrated using the isolated candidate pair. Local synthetic keys/HTTP responses are *only* contract tests.
- No end-to-end synthetic media upload from an isolated test Resident via Render→Cloudinary→Firestore→Admin→Resident status has passed. No biometric accuracy/PAD validation or real issuer authenticity check exists.
- The earlier `identity-final-integration-gate-no-deploy-20261112.yml` was malformed on other branches and may still be a separate release workflow concern; treat historical failures independently from these dedicated QA runs.
- Protect current production Firebase Rules, email signup/login, Emergency Reports manual Volunteer assignment, event attendance, auto-certificates, donations, and original Hosting design.

## Release sequence only AFTER blockers resolve

1. Verify isolation of both staging credential sets (no secret values in CI logs), Cloudinary separate staging account, and matching staging Node/Python internal key. Apply strict staging guard and confirm it prevents all production SDK access.
2. Deploy the **Python** candidate to verified isolated staging first. Check `/health` and denied no-key private routes. No ID uploads until all isolation checks pass.
3. Deploy the **Node** candidate to verified isolated staging with `VOLUNSERVE_FACE_ONLY_ENABLED=false`. Confirm existing OCR endpoints still behave unchanged. Check its own dedicated face-only readiness after turning the flag ON in isolated staging only.
4. Deploy the **web** candidate to isolated staging with `EXPO_PUBLIC_VOLUNSERVE_ORIGINAL_FACE_ONLY=true`. Test a consented synthetic fictional ID portrait + synthetic selfie; cover Python match outcome, private Cloudinary storage, authorized Admin image retrieval, independent approval and Resident status, negative unsupported ID and wrong-key tests, 3-attempt policy.
5. Only after measured successful hosted E2E and no regression, coordinate a **small controlled production rollout** in dependency order: Python route, Node route OFF, Hosting feature build, then Node face-only flag ON. Keep production key and provider configuration unchanged; monitor for 401/503, storage failures and Admin queue problems.
6. **Rollback:** switch off Node face-only flag (feature gate) and restore previous Hosting build while preserving any newer unrelated changes; redeploy prior per-service SHAs only if safe and explicitly authorized. Do not wholesale reset Firestore, Cloudinary, or production branches.

No production deploy, environment variable change, paid service, real photo upload, live account mutation or new access grant is authorized by this QA runbook.
