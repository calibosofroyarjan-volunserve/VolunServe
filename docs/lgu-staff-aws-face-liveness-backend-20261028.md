# LGU Staff — AWS Face Liveness Backend Preparation (PR #139)

Date: 2026-10-28. **Draft, feature disabled. Do not deploy sensitive data collection.**
This document describes a *server-side integration preparation*, NOT finished real-device liveness.

## Implemented on the Render Node backend
- `POST /api/lgu-staff/liveness/start` authenticates Firebase applicant with **verified email**; checks the user has pending LGU applicant role, current ID evidence and consent, no privacy withdrawal, and an approved server-only `lguIdentityIntake/release.enabled` flag. It checks a separate `LGU_STAFF_ACTIVE_LIVENESS_ENABLED=true` switch, a configured AWS region, and permits at most **three sessions** per applicant. Backend calls Amazon Rekognition `CreateFaceLivenessSession` using AWS SDK v3, stores a short-lived session ID only in backend-only Firestore, and returns the session ID to that authenticated applicant to drive an approved AWS SDK camera stream.
- `POST /api/lgu-staff/liveness/result` accepts the applicant's *exact server-created* session ID and queries Amazon Rekognition `GetFaceLivenessSessionResults` directly; **never accepts a client-supplied score or success flag**. It checks a separately approved internal `LGU_STAFF_LIVENESS_MIN_CONFIDENCE` threshold. Response is limited to nonnumeric `live_presence_checked`, `checking_live_presence`, or `manual_review_required`; all outcomes have `identityDecision:manual_review_required` and `adminAccessGranted:false`. The numeric confidence stays transient inside the backend and is never persisted/logged or returned.
- Server's `lguApplicantLivenessSessions/{uid}` Firestore collection is **inaccessible from every client**, including programmer Super Admin. Only Firebase Admin SDK backend may read/write. No photos/videos/audit images are persisted in this controller.
- Region and provider credentials never reach the browser. AWS permissions for the Render service should be minimum-scope: `rekognition:CreateFaceLivenessSession` and `rekognition:GetFaceLivenessSessionResults` in a supported region, plus a **separately scoped browser streaming credential mechanism** described below.
- New mandatory CI synthetic mock tests cover unavailable service, role/verified-email/consent/withdrawal protections, duplicate session, session mismatch/expiry, no scores, low scores, incomplete results, and outage. Emulator rules verify client cannot read or forge raw session data.

## Configuration — NOT SET, DO NOT ENABLE YET
`LGU_STAFF_ACTIVE_LIVENESS_ENABLED=false` (safe default), `AWS_REKOGNITION_REGION` (supported chosen region), `LGU_STAFF_LIVENESS_MIN_CONFIDENCE` (security/privacy approved threshold), AWS SDK default IAM credential chain. `@aws-sdk/client-rekognition` is declared in `backend/package.json`. Before any deployment, run `npm install` in `backend/` to regenerate and commit `backend/package-lock.json`, verify deterministic install and credentials via approved secrets manager. **Never add AWS secrets to GitHub files, UI environment or PR comments.**

## Essential remaining work (not implemented)
1. **AWS account and Face Liveness access** with billing, IAM and regional data-residency/security approval.
2. Frontend live camera streaming: integrate the official `@aws-amplify/ui-react-liveness` FaceLivenessDetector for the web and the official Android SDK for native builds, with appropriately scoped **temporary AWS credentials** (for example Cognito or server-brokered STS), *not* Expo ImagePicker static selfie. Must verify AWS session ID binding, stream completion and replay prevention.
3. Genuine liveness detector hardware QA on browser/Android using consented synthetic identities, image/replay spoof attempts, network disconnect and expired sessions. Determine a validated calibration threshold, supervised fallback and failed-attempt policy.
4. ID *authenticity* is independent: use legitimate issuer validation such as official National ID verification and original-ID manual review; OCR keywords do not establish authenticity. LGU employment must be independently confirmed.
5. Written biometric consent, privacy impact assessment, retention/deletion schedule, data residency notice, accessibility and security review. `lguIdentityIntake/release` should remain absent/false until approval.

## UI contract
Professional emerald/mint identity flow, **no numeric face-match scores or confidence percentages anywhere user-visible**. A provider "live presence" signal **does not** establish that the ID belongs to the user or grant LGU Admin privileges; programmer Super Admin manual approval, in-person original ID, and official employment confirmation remain mandatory. Do not imply this is GCash or an official issuer service.

Official integration references:
- https://docs.aws.amazon.com/rekognition/latest/dg/face-liveness-programming-api.html
- https://ui.docs.amplify.aws/react/connected-components/liveness
