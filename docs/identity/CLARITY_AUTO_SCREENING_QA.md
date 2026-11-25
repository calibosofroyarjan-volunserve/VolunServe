# Clear photo auto-screening + blurry manual review (QA candidate)

Request: clear supported government ID + matching face => automatic AI screening pass;
blurry, uncertain, mismatched photo => human review/rescan.

**This deliberately does NOT automatically grant Verified Resident access.**
A sharp photo can depict a forged ID or a picture of another person; the
existing original MediaPipe score is not independently validated liveness/PAD.
Actual government issuance and liveness are not established by photo clarity.
The `identityVerified` privilege transition remains restricted to trusted,
server-authenticated issuer/PAD/validated face attestations or Admin approval.

## Backend behavior
- `clarityScreeningStatus=auto_passed`: OCR-recognized supported ID, adequate
  image quality, no document warnings, possible name/DOB consistency,
  and a positive AI face match. The resident is still Pending Admin Review.
- `manual_review`: low sharpness, unknown quality, or ambiguous face and OCR.
  Low-quality scans are assigned `blurry_id_review`.
- `rescan_required`: unsupported (including school ID), or explicit ID mismatch.
- Face-only historical flow lacks authenticated image-quality screening and
  therefore cannot claim a clear/valid government ID based on match score alone.
- No new media or credentials, no new Firestore rules. No production deploy.

## QA
`node --test backend/test-identityClarityScreeningPolicy.js`
The CI workflow runs this test and existing identity/signed-proof/review tests
without deployment. Does not constitute hosted E2E or biometric validation.
