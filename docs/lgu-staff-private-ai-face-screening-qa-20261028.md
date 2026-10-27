# LGU Staff Face-Similarity Screening — Integration & Defense QA
**Branch:** `feat/lgu-staff-guided-application-private-evidence-20261028`  
**Release state:** Draft. **NO production rollout of applicant IDs/biometrics** until privacy and end-to-end acceptance.

## What is implemented
- The Super Admin private evidence panel has an explicit **Run AI-assisted face comparison (review only)** action.
- Endpoint `POST /api/lgu-staff/face-screen` on the trusted Node/Express backend requires Firebase ID bearer token, checks approved `superadmin` role and a distinct pending `applicant` UID, then verifies that immutable applicant evidence metadata is present.
- The backend downloads only `front` and `selfie` images by their allowlisted private Firebase Storage paths with strict 4 MiB size, MIME, purpose metadata and image magic-byte checks. The applicant's ID, image pixels, employee documents, and bearer token are never included in the response or application logs.
- The backend forwards those two images to **existing** `identity-ai/main.py` `/verify` over HTTPS using an internal server-only secret and government ID type mapping. A single-purpose screening record restricts access to applicant/approved Super Admin and all client writes are denied by Firestore security rules.
- Three attempts maximum per applicant, transaction-based concurrency lease; AI unavailability or failure produces a manual-review result. It never changes `users.role`, `identityVerified`, `identityStatus`, or `lguAdminCredentialReviews`.
- The returned `faceSimilaritySignal` is informational: `similarity_signal_present` or `inconclusive_manual_review`. The decision is **always `manual_review_required`**. UI explicitly says that liveness, government ID authenticity, and LGU employment have NOT been verified.

## Required backend configuration
- `IDENTITY_AI_SERVICE_URL`: HTTPS URL of **the existing private** VolunServe Python AI service. This must be reachable by the Node backend, not from browsers.
- `IDENTITY_AI_INTERNAL_KEY`: same non-public secret configured on the Python AI service.
- `LGU_STAFF_STORAGE_BUCKET` or `FIREBASE_STORAGE_BUCKET`: exact private Firebase bucket (production project is configured in `lib/firebase.ts`). Verify that the Render service account has the necessary read permissions.
- The production backend must run **Node 22+**, allowing built-in `Blob` and `FormData`.
- Local emulator QA: point a **separate** local Node backend at test-only Firebase Admin credentials/emulators; use `EXPO_PUBLIC_USE_FIREBASE_EMULATORS=true` and `EXPO_PUBLIC_LGU_FACE_SCREEN_API_URL=http://localhost:<local-port>`. Emulator UIDs must NEVER be forwarded to Render/production. Do not run the private screening against real personal IDs during development.

## Important limitations
- Existing Python `identity-ai/main.py` is a MediaPipe facial-landmark **similarity estimator**, not a validated identity biometric matcher and not an official government-ID issuer verification system. It explicitly sets `livenessImplemented: false`. This new route **cannot** claim the camera capture was a real person or that the uploaded card is a legitimate government-issued ID.
- There is **no validated OCR, front/back ID data reconciliation, counterfeit detection, or active anti-spoof liveness** for LGU applicants yet. Those require an evaluated specialist service/model and calibrated error rates; implement only with appropriate technical and privacy reviews.
- The Photo upload intake currently offers selection of approved ID types. Selecting National ID / Passport / Driver's License does **not** prove the uploaded image belongs to that type. Super Admin must manually verify the actual document before authorization.
- No private photo or biometric embedding should be persisted in audit logs, notification payloads, public hosting routes or user-visible errors.
- No automatic LGU role promotion. The Super Admin independently verifies the identity and staff appointment from official LGU sources and records that in a fresh, auditable authorization decision.

## QA to complete with Codex before release
1. Node backend synthetic mocked integration tests for 401/403/409/rate limit, invalid paths, missing config, service timeout and AI raw `verified` converted to **manual review only**.
2. Browser and Android privacy/camera tests at 390px, 768px, 1440px; disabled permissions; upload interruption; anonymous/cross-account/suspended-admin access; BLOB URL revocation; network retries.
3. Real Firestore + Storage emulator tests for create-only evidence and forbidden forged similarity status; currently included in CI.
4. Front/back OCR, ID format classification, face-match calibration, and **actual liveness** separately evaluated with documented human-review fallback.
5. Data minimization, informed privacy notice, defined sensitive-data retention and approved deletion lifecycle, storage bucket CORS for authenticated browser blob access, malware scanner and object-signature validation.
6. LGU office's independent appointment verification, Super Admin audit trail, verified/pending rejection transitions, and refusal to auto-promote on any similarity score.
7. Only after all these: code review, CI green, merge and separately authorized Firestore/Storage/backend/web production deployment; verify role boundaries and live release fingerprint.

**Never show 'AI Verified' or 'Authentic Government ID' on this version.**
