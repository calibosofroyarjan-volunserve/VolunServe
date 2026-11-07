# VolunServe identity AI staging verification checklist

Status: **PLAN ONLY**. This document does not provision a service, deploy a release, or access production records.

## Verified starting points

- Main Render backend live SHA: `24cc79d31fc4c498e6c6c0e33c0b063ffbca64f2`.
- Python identity AI Render live SHA: `f3e2a46cbf766ed8ff8516b6eadbc8b219b611b1`.
- Isolated test branch: `fix/identity-full-hardening-live-base-20261107`.
- Backend web service source root: `backend`; identity AI Docker service root: `identity-ai/`.
- Both existing production services have automatic deployment disabled.
- Current frontend defaults to the production Firebase project because `lib/firebase.ts` has `ENABLE_LOCAL_TESTING = false`; simply changing the backend URL does **NOT** isolate user data.
- `lib/identityVerification.ts` uses `EXPO_PUBLIC_IDENTITY_VERIFICATION_API_URL`, with production backend fallback.

## Stop / do not proceed until isolation is proven

1. Set up a separate **test Firebase project** (or properly isolated local Firebase emulators) with no production users, credentials, documents, or donations. Confirm Auth, Firestore and Storage all point to test resources.
2. Configure a separate test backend with its own test Firebase Admin credentials/project, an isolated identity AI internal key, and a test AI service URL. Never copy production secrets into a public document.
3. Build a **test-only** frontend whose Firebase config resolves to test Firebase and whose identity backend URL points to the test backend. Verify both in a non-secret diagnostic screen or log. Fail closed on unexpected production project IDs.
4. Use a separate test AI service built from the isolated branch; never deploy the test branch to either existing production Render service.
5. Use only synthetic image fixtures or volunteers' expressly consented test images; do not commit or log government ID numbers, identity images, OCR text, token values, or secrets.

## Minimum test matrix (test accounts and isolated database only)

| ID | Test | Expected behavior |
|----|------|-------------------|
| T01 | Test resident captures one supported ID + matching selfie | AI processes; eligible case enters `pending` manual review, not automatically verified |
| T02 | Different-person selfie | Cannot automatically verify; clear failure or manual-review result |
| T03 | Multiple genuine faces in the selfie | Reject ambiguous image with actionable retry text |
| T04 | Valid single portrait with overlapping detection boxes | Avoid duplicate-count false positive; confirm using consented samples |
| T05 | Blank/too small/corrupt image | Safe failure; no successful verification |
| T06 | Blurry/dark/glare-heavy image | Retake guidance; no unjustified approval |
| T07 | Document OCR inconclusive or type mismatch | Flag as inconclusive/mismatch; admin review required |
| T08 | AI cold start, unavailable service or timeout | Readiness fails gracefully before media upload; retry without consuming a verification attempt |
| T09 | Repeated/double-click submissions | Only one processing lease; no duplicate attempts |
| T10 | Valid manual admin `verify` decision with validation method | Only authorized Admin can change test resident from pending to verified |
| T11 | Admin `require_retry` with reason | Test resident receives retry-required status and explanation |
| T12 | Admin self-approval / unauthorized user | Access denied; no Firebase status change |
| T13 | Mobile browser camera denied / camera canceled / resumed | Clear message and recovery without lost account data |
| T14 | Identity verification form on desktop and native device | All steps and buttons usable; no console exceptions |
| T15 | Non-identity regression | Test login, signup, notifications and resident/volunteer navigation remain functional |

## Pass criteria before any production approval

- GitHub Actions: Python face-box + screening checks, real MediaPipe smoke tests and frontend TypeScript checks all green.
- End-to-end tests T01-T15 recorded with test date/device, anonymized result, and follow-up for any defect.
- Face-matching false accepts/false rejects checked on consented test pairs. A handful of examples is not sufficient for a claim of high biometric accuracy.
- OCR screening never presented as proof that a government ID is authentic; no liveness claim without an implemented and tested liveness detector.
- Production services, live Firebase, and users' records remain unchanged until separate release authorization.
- Review a before/after diff from the **exact two live Render commits**, prepare rollback commits and verify release target explicitly before deploying.

## Admin workflow note

The verified live backend exposes:
- `GET /api/admin/identity/reviews`
- `POST /api/admin/identity/reviews/:uid/decision`, supporting `action: "verify"` and `action: "require_retry"`.
The backend **does not expose a distinct reject action** for this route. Test the actual supported contract rather than assuming a third action exists.

## What is NOT yet proven

- Actual Firebase Hosting production artifact parity with the checked-in frontend source.
- Real-world identity portrait detection and same/different-person matching accuracy.
- End-to-end Admin review on a nonproduction deployment.
- A production-safe promotion, no-regression deployment, or genuine liveness detection.
