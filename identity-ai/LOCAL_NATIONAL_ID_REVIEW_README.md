# VolunServe camera-only National ID + selfie lab (STAGING / NO UPLOAD)

This desktop tool performs a **private in-memory experiment**, not a government-issuer authenticity check or final identity verification. It is independent of the live site, and it cannot change any Firebase user status.

## Run locally (Windows Python 3.11)

Use already installed Python 3.11 packages from `identity-ai/requirements.txt` and Tesseract OCR 5.x accessible on `PATH`. From the staging repo root:

```powershell
$env:PATH = "C:\Program Files\Tesseract-OCR;$env:PATH"
py -3.11 .\identity-ai\local_national_id_selfie_review.py
```

Or double-click `Start-VolunServe-Private-ID-Review.cmd`. The old launcher filename is retained for compatibility; the app inside is now **CAMERA-ONLY**.

1. Read the consent statement and check it. Select webcam 0 (or 1 if Windows uses a different device).
2. Press **START LIVE SCAN**. Keep the National ID physical **FRONT** inside the green/yellow guide, sharp and well lit. OCR tries periodically *locally*, not via a web API. It requires two successive readable front layout observations before capturing that frame in **memory only**.
3. Without closing the camera, flip the same ID to the **BACK**. Two successive OCR frames showing independent back field labels are required. Identical front, school ID or unreadable reverse side does not advance.
4. Remove the card; show exactly **one** face. An adequately framed, sharp face automatically triggers an in-memory selfie snapshot after stable video frames. Green only means a visible face, **not liveness or successful ID matching**.
5. The existing `screen_government_id` OCR/front-back and `run_face_verification` experimental 1:1 comparison run locally. The resulting text shows only sanitized statuses, without raw OCR, photos, card numbers or saved face embeddings. Both ID authenticity and liveness remain **NOT validated**.

No upload/gallery picker exists in the live camera screen. The app does not save photos to disk or upload to Firebase, Render, Cloudinary, GitHub or an identity backend. The staging HTTP 423 upload lock is unchanged. Stopping/closing discards incomplete captured frames; closing the app releases in-memory references.

**Limits:** OCR heuristics can miss a genuine National ID in poor light or with an older webcam. Philippine National ID variants have different layouts; physical front/back heuristics are not independently validated across card variants. A computer screen or printed fake may still display readable text. This app deliberately makes **no authenticity or liveness claim** and never grants `verified`.

## No-person synthetic tests

```powershell
cd "$HOME\VolunServe-Identity-Staging"
py -3.11 -m unittest discover -s identity-ai -p test_live_camera_scan_policy.py -v
py -3.11 -m unittest discover -s identity-ai -p test_local_national_id_selfie_review.py -v
```

These test pure OCR-side, quality, framing, and camera-only GUI contract logic using **fabricated text and bounding boxes**, not real ID images or user media. They cannot substitute for authorized physical camera/device verification or government ID validity checks.
