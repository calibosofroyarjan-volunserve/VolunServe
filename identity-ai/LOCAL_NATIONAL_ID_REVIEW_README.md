# VolunServe camera-only National ID + selfie lab (STAGING / NO UPLOAD)

This desktop tool performs a **private in-memory experiment**, not a government-issuer authenticity check or final identity verification. It is independent of the live site, and it cannot change any Firebase user status.

## Run locally (Windows Python 3.11)

Use already installed Python 3.11 packages from `identity-ai/requirements.txt` and Tesseract OCR 5.x accessible on `PATH`. From the staging repo root:

```powershell
$env:PATH = "C:\Program Files\Tesseract-OCR;$env:PATH"
py -3.11 .\identity-ai\local_national_id_selfie_review.py
```

Or double-click `Start-VolunServe-Private-ID-Review.cmd`. The old launcher filename is retained for compatibility; the app inside is now **CAMERA-ONLY**. On Windows, this launcher looks for a working `tesseract.exe` on PATH, or in common Program Files/user-local Tesseract-OCR installation folders, and temporarily adds that folder to **its own process PATH**. It also checks the OCR version before opening the camera. It does not install software or edit the system PATH. If the error says **Tesseract OCR is not available**, confirm the desktop executable is installed (the `pytesseract` Python library alone is insufficient). In PowerShell, check:

```powershell
Test-Path "C:\\Program Files\\Tesseract-OCR\\tesseract.exe"
& "C:\\Program Files\\Tesseract-OCR\\tesseract.exe" --version
```

If Tesseract is in a custom folder, add that folder to `$env:Path` for the current terminal session before launching the app. No government-ID, face or account data are needed to diagnose installation.

1. Read the consent statement and check it. Select webcam 0 (or 1 if Windows uses a different device).
2. Press **START LIVE SCAN**. Keep the National ID physical **FRONT** entirely inside the now-wider green/yellow guide (all four corners visible with a small margin). Move the card a little farther from the lens rather than cutting off its heading or bottom labels. Keep it level, sharp and evenly lit without glare. OCR tries periodically *locally*, not via a web API. It requires two successive readable front layout observations before capturing that frame in **memory only**. If the prompt says the heading is unreadable, adjust the card position/focus. If it says name labels are unreadable, improve sharpness and lighting. The scanner reports **no OCR names, card numbers or DOB** in that guidance.
3. Without closing the camera, flip the same ID to the **BACK**. Two successive OCR frames showing independent back field labels are required. Identical front, school ID or unreadable reverse side does not advance.
4. Remove the card; show exactly **one** face. An adequately framed, sharp face automatically triggers an in-memory selfie snapshot after stable video frames. Green only means a visible face, **not liveness or successful ID matching**.
5. The existing `screen_government_id` OCR/front-back and `run_face_verification` experimental 1:1 comparison run locally. The resulting text shows only sanitized statuses, without raw OCR, photos, card numbers or saved face embeddings. Both ID authenticity and liveness remain **NOT validated**.

No upload/gallery picker exists in the live camera screen. The app does not save photos to disk or upload to Firebase, Render, Cloudinary, GitHub or an identity backend. The staging HTTP 423 upload lock is unchanged. Cancel, window-close, CLEAR SCANS and consent revocation discard captured frames and pending OCR result buffers. After successful local comparison (or an error), the application also releases its references to all three captured images. **This is bounded in-process retention, not guaranteed secure memory erasure**: Python immutable byte objects, interpreter/native library copies or in-flight OCR threads cannot be cryptographically zeroized by the app.

**Limits:** OCR heuristics can miss a genuine National ID in poor light or with an older webcam. Philippine National ID variants have different layouts; physical front/back heuristics are not independently validated across card variants. A computer screen or printed fake may still display readable text. This app deliberately makes **no authenticity or liveness claim** and never grants `verified`.

## No-person synthetic tests

```powershell
cd "$HOME\VolunServe-Identity-Staging"
py -3.11 -m unittest discover -s identity-ai -p test_live_camera_scan_policy.py -v
py -3.11 -m unittest discover -s identity-ai -p test_local_national_id_selfie_review.py -v
```

These test pure OCR-side, quality, framing, and camera-only GUI contract logic using **fabricated text and bounding boxes**, not real ID images or user media. They cannot substitute for authorized physical camera/device verification or government ID validity checks.

## Exact duplicate camera-frame protection

The local scanner now fails closed **before OCR or experimental face comparison** if the ID front, ID back, or selfie reuse exactly the same encoded camera bytes. It also refuses missing and oversized frames. This mirrors the existing Node identity endpoint's basic exact-image-reuse safeguard, but **does not detect a re-encoded photograph, screen replay, photo-of-photo, deepfake, or synthetic face**. It must not be described as validated liveness or government ID authentication. No image hashes, image data, or face embeddings are persisted by this check.

## Selfie camera continuity (synthetic-tested)

The local webcam scanner now counts its ten consecutive acceptable selfie frames only while the one-face bounding box moves smoothly. Mild ordinary movement is allowed; a large jump, major size change, no face, unacceptable framing, or dropped camera frame resets the capture countdown before a new automatic selfie snapshot. A green frame means the *camera framing* looks usable, **not that a real person or matching ID holder has been verified**.

This check neither tracks identity across frames nor detects replayed videos, printed photos, masks or synthetic faces. It does not change YuNet/SFace similarity calibration or enable automatic Verified Resident approval. Actual camera quality and behavior across devices, lighting and accessibility needs still require consented human-in-the-loop testing.

## Local card-region crop for hard-to-read ID text

The camera preview guide is not an OCR confidence indicator. In the private scanner, a centered, card-shaped rectangle may now be isolated **in memory** before Tesseract reads it; this reduces unrelated background and makes the printed labels occupy more of the OCR image. If the outline is uncertain, the original guide crop is used. The existing OCR heading, demographic label, front/back distinction, image-quality checks, two good reads, and school-ID exclusion still decide whether a local scan advances.

This does **not** enhance blurry pixels into authentic evidence, verify issuance, train a card recognition model, prove ownership or enable auto-approval. Card outline detection is heuristic; it can miss angled or low-contrast cards. A failed OCR read may still need better optics or a higher-resolution rear camera. The tool prints only sanitized guidance (never raw card text). Do not share photos or screenshots showing unredacted personal ID numbers, names, dates or faces when troubleshooting.

## Lower-quality webcam: compact guide + manual local-review option

For laptop cameras that cannot resolve the National ID's small printed labels, the live preview now draws a **smaller, centered** 76%-width ID guide. Automatic OCR still uses a wider source region and still requires the original National ID front/back evidence before advancing.

If the webcam cannot read the ID after reasonable attempts, there is an explicit **MANUAL CAPTURE FOR REVIEW — NOT VERIFIED** button for steps FRONT and BACK. Only use this with your own document and camera consent. It asks for separate confirmation, captures **one current camera frame in local memory**, and labels that step **NOT VERIFIED / manual capture**. It is not photo/gallery upload, cannot alter an account, and does not bypass final OCR/document-side screening. The selfie stage still requires its existing single-face framing check. If final OCR lacks enough evidence, the experimental face comparison is **not performed**, and the private report remains inconclusive with human review required. Manual capture must never be presented as government ID validation or liveness.

Keep card numbers, birthdays, full names and ID photos out of troubleshooting screenshots. If the laptop camera cannot deliver readable OCR text even after these changes, a higher-quality consenting webcam/phone-camera setup or an authorized manual review may be necessary; simply shrinking the yellow guide cannot add missing detail to a blurry image.

## Optional SFace 1:1 RESEARCH when laptop OCR stays inconclusive

If the private camera flow completes via **Manual Capture for Review** and the OCR report says `document_type_not_recognized`, the **normal** ID-photo-versus-selfie verification is intentionally **not performed**. That is correct fail-closed behavior; do not mark the ID accepted based on the picture or a similarity score.

There is now a **separate opt-in, non-decisional research observation** for that situation. In the repository root, start:

```powershell
.\Start-VolunServe-Private-SFace-Research.cmd
```

The launcher explicitly asks for consent before checking/downloading official OpenCV YuNet/SFace model weights (~37 MB) from OpenCV Zoo's Hugging Face distribution. SHA256-pinned downloads are required, and already verified local models are reused. Only model binaries are requested; your camera frames, ID images, names, OCR text, account info and selfies **are never uploaded**. The model files are local and excluded from Git; they are not bundled into the live app. The normal launcher does not enable this research mode.

On the camera tool main window, optionally check **SFace FACE RESEARCH ONLY**, scan your own ID front/back and selfie locally (manual capture permitted). After the existing strict OCR report, the tool *separately* attempts OpenCV YuNet one-face detection and SFace 1:1 cosine similarity on the **ephemeral** ID-front image and selfie.

- When model weights are missing/bad: it says **models unavailable**.
- When a face is too small, blurry, obscured, ambiguous or multiple faces are seen: **inconclusive**.
- When both single-face crops are usable: it may show an **uncalibrated cosine similarity for RESEARCH ONLY**, never a "matched", "verified", "live", "genuine ID", "approved" or pass/fail verdict.

This experimental observation does **not** bypass `screening_ready_for_face_comparison` for the normal verification path, does not certify identity or spoof resistance, and does not alter Firebase accounts, Admin decisions, or the blocked staging media upload. It has no accepted face-match threshold and is not fit for deployment. If laptop optics cannot produce a detectable ID portrait, the outcome may remain inconclusive even when the camera captures all three images. For actual authorization, readable ID documentation and independent manual/Admin review remain necessary. Do not send screenshots containing a real ID or face to debug this feature.

## Why SFace says "inconclusive" after all three captures

Camera capture and the separate SFace research experiment have **different** checks. A successful FRONT/BACK/SELFIE capture does not guarantee YuNet can find and align the small ID portrait or selfie. When OCR is inconclusive, the normal identity comparison intentionally remains blocked, even though an opt-in **research-only** SFace run may separately inspect images.

The optional offline SFace report now labels which processing stage could not complete: **ID portrait face not detected**, **selfie face not detected**, **ID/selfie alignment failure**, **ID/selfie feature extraction failure**, or **invalid similarity computation**. These are coarse, fixed diagnostic categories—no image coordinates, OCR strings, names, image contents, features, or raw exceptions are displayed or persisted. The stage is not a calibrated measurement, confirmed image-quality diagnosis, liveness finding, match/nonmatch, or government ID authenticity test.

If the result says **ID portrait not detectable**, the printed portrait is likely too small/soft for the detector; repeatedly rescanning with the same low-resolution webcam may not help. Use a higher-quality camera under appropriate consent for future research or refer to manual review. If it says **selfie face not detectable**, the live webcam capture may be too dim, off-center or indistinct. These hints never waive OCR rules or allow automatic Verified Resident promotion. Even a numeric SFace research score must not be used for an identity decision.
