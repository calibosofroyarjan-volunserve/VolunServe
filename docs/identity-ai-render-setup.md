# VolunServe: activate actual AI ID-to-face comparison (Render)

## Why the camera scan can pass but verification does not

The mobile/web face detection is local (MediaPipe in the browser). Actual ID-to-face matching is performed by a **separate Python FastAPI service** under `identity-ai/`. The Node backend at `https://volunserve.onrender.com` only forwards authorized requests to that service.

Do not lower the matching threshold or set Firestore `identityVerified=true` to make tests look successful. The Python engine currently returns **pending manual review**, even for a high match score, because ID authenticity and liveness are not verified.

## Current capabilities and limitations (October 30, 2026)

The **same authenticated verification pipeline** serves the Resident's Profile → **Be a Verified Resident** (web and mobile) and the LGU Admin's **Resident Identity Reviews** screen.

1. Resident selects the government ID type and captures a physical ID photo and selfie.
2. The Python MediaPipe engine compares the ID portrait with the selfie using 1-to-1 facial landmark geometry.
3. Tesseract OCR checks whether the ID text appears consistent with the selected ID type: Philippine National ID, driver's license, passport, or another recognized government ID.
4. Inconclusive or mismatched document text is flagged for independent review.
5. Node stores only allowlisted assessment status, document type signals, attempt metadata and audit information. Raw OCR, ID numbers, photos, selfies and embeddings are never saved to Firestore in this flow.
6. LGU reviewers see the **same assessment** shown to the Resident, and record an independent validation method before approving identity.

**Limitations:** OCR does not prove official issuance, expiry validity or tampering resistance. A single selfie cannot prove liveness. This is *government ID type plausibility screening*, not accredited bank-grade KYC or government registry validation. The service returns authenticityVerified=false and livenessImplemented=false, and requires manual LGU verification. Do not claim automatic identity authenticity during defense.

Both interfaces use the shared DocumentScreeningSummary component. LGU Personnel account creation and employment credential validation remain a separate administrative workflow.

### Quick checks before production

- Run: python -m unittest discover -s identity-ai -p test_document_screening.py -v
- Run: node scripts/test-unified-identity-ai-government-id-screening.cjs
- Run: node --check backend/server.js and npx tsc --noEmit --pretty false
- The Python Identity AI Docker image needs Tesseract and pytesseract, both declared in its existing Dockerfile/dependencies.
- Deploy and independently verify **Python AI** and **Node backend** on Render, not Firebase Hosting alone.
- Confirm the private AI authentication check and use only consented synthetic or privacy-safe demo ID images.
- Have LGU carry out actual independent document validation before recording a successful verification.
## 1. Deploy the Python AI service in Render

1. In Render Dashboard, select **New > Web Service**; connect the same VolunServe GitHub repository.
2. Set **Root Directory** to `identity-ai`.
3. Choose **Docker** as the runtime (uses `identity-ai/Dockerfile`, which installs Python, OpenCV, MediaPipe and dependencies).
4. Set `IDENTITY_AI_INTERNAL_KEY` to a newly generated long random secret. **Never paste this secret in chat, GitHub, or public env files.**
5. Deploy; use enough instance memory for OpenCV/MediaPipe. Check Deploy and Logs for dependency/build failures.
6. Open `https://<your-ai-service>.onrender.com/health`. Expect `ok: true`, `verificationEngineReady: true`, and `internalAuthConfigured: true`.

## 2. Connect the EXISTING VolunServe Node backend

In **Render > VolunServe (Node backend) > Environment** set:
- `IDENTITY_AI_SERVICE_URL` = `https://<your-ai-service>.onrender.com` (no `/verify` suffix required).
- `IDENTITY_AI_INTERNAL_KEY` = exact same secret as the Python AI service.

Save and redeploy the Node backend. Its public `https://volunserve.onrender.com/health` must report `identityEngine: "volunserve_ai_configured"`. That public field checks configuration, not reachability.

The app's authenticated `GET /api/identity/engine-health` performs a real readiness check against Python `/health`; a 200 response with `ready: true` confirms the Python service is online and has its internal key configured.

## 3. Rebuild & redeploy the mock-defense preview

From `VolunServe-Latest` in PowerShell:

```powershell
git pull origin main
npx expo export --platform web --clear
npx --yes firebase-tools@latest hosting:channel:deploy mock-defense-oct24 --project volunserve-3aa5b
```

Open the newest Firebase preview URL. Sign in with a **Basic Resident** test account, scan a *physical* valid government ID with consent, complete the live face scan, and press Start AI Verification. With this fix the app checks AI readiness first and shows a clear error without consuming an attempt if Python is unavailable.

## 4. Correct result and troubleshooting

- `identity_ai_not_configured`: Missing `IDENTITY_AI_SERVICE_URL` on backend.
- `identity_ai_key_missing`: Backend `IDENTITY_AI_INTERNAL_KEY` missing.
- `identity_ai_unreachable`: AI Render service down/incorrect URL/timed out.
- `identity_ai_not_ready`: AI service responds but does not report ready, or has no internal key.
- `401` from AI: Internal keys may not match.
- `pending` and a face match score: AI performed comparison but manual Admin review is still required; this is **not** automatic identity verification.
- `failed`: Poor ID/face quality or comparison failure; read the returned message and respect the configured attempt limit.
- `verified`: Only when supported verification criteria are genuinely met; do not fabricate it for demonstrations.

In Firestore, the `identityVerifications/{uid}` record stores status, score and attempt metadata. Do not expose ID and face images in logs or screenshots. Never commit private ID files.
