# Private local National ID + selfie experiment (staging only)

This is **not** a government document authenticity service and does **not** grant Verified Resident. This is a user-owned, consented **local-only** proof-of-concept combining existing OCR/front-back screening with existing experimental MediaPipe landmark 1:1 comparison. No national issuer/PSA authentication is implemented. No biometric liveness or anti-spoofing validation is claimed.

## Run on Windows

Use Python 3.11 with `identity-ai/requirements.txt`, and install the separate Tesseract OCR executable. Run `py -3.11 identity-ai/local_national_id_selfie_review.py` from the repository root, or use `Start-VolunServe-Private-ID-Review.cmd` from the repo root. Select **your own** National ID FRONT and BACK photos, and a selfie file or a consented webcam capture. Click REVIEW LOCALLY.

If the ID precheck is incomplete, it does **not** attempt face comparison. A green camera preview elsewhere indicates visible framing, not identity verification.

## Privacy / system boundaries

- This standalone script never sends HTTP requests or calls Firebase, Render, Cloudinary or a user-role endpoint. No app-generated image, embedding, government ID number, OCR text, or result is persisted. Original operator-selected input files remain unchanged. The operating system file picker and camera stack may have their own audit or permissions behavior.
- It executes OCR/screening in memory through existing `main.py` and `strict_document_screening.py`. A successful type-screen is **not** evidence of a genuine issued card.
- It is separate from all production identity uploads. The staging backend's **HTTP 423 upload lock remains enabled**. The app never promotes a user to `verified`.
- It does not compare stored profile name, birthday, address or barangay; does not check issuer validity; does not establish a live human is present. This is controlled local research and must never be used for a real account decision.
- Experimental face similarity is uncalibrated. Any verified-account workflow requires independent government ID checks by an authorized Admin, documented consent, audited privacy controls and validated anti-spoofing.

## Tests

`cd identity-ai && python -m unittest test_local_national_id_selfie_review.py` uses entirely synthetic inputs and requires no real photos. This is *not* real-image, webcam, model performance or end-to-end validation. Never upload real ID/selfie files to GitHub, ChatGPT or CI.
