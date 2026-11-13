# VolunServe phone SFace + anti-spoofing staging research — acceptance criteria

**Status: EXPERIMENTAL / NOT VALIDATED / NOT FOR RESIDENT VERIFICATION**

## Boundaries
- Phone static staging page only, with distinct opt-ins for camera capture, face presence and SFace cosine research. It never uploads photos, face embeddings, image contents or ID text.
- No automatic Verified Resident status, biometric authorization, change to Firebase Auth/Firestore, AI backend or production.
- ID FRONT/BACK manual capture does not establish real government issuance, card-side correctness, OCR accuracy or holder identity.
- The phone SFace pipeline uses MediaPipe FaceLandmarker (5 selected landmarks), OpenCV SFace ONNX, 112×112 image warping and raw-RGB NCHW float input, mirroring OpenCV preprocessing. **This alignment and browser inference have not been cross-validated against OpenCV SFace on real phones**.
- The full SFace model is SHA256-pinned to the exact official OpenCV Zoo distribution. If the file cannot be fetched, has different bytes or the model cannot run, the app reports inconclusive. It never fabricates a score.
- Image quality and automatic portrait recognition can remain inconclusive despite high phone camera resolution.

## Model/benchmark parity gate — BEFORE relying on a cosine score
1. Compare the Python OpenCV SFace `FaceRecognizerSF.alignCrop`, `feature`, `match` outputs to the browser ONNX pipeline on **synthetic or fully consented, non-ID test frames**. Establish alignment pixel deviation and numerical score tolerance before interpreting browser numbers.
2. Verify at least two supported real phones on secure HTTPS over different lighting and framing conditions; document the exact browser, camera API resolution and model-load status.
3. Test same-person/different-person comparisons with explicit written consent and appropriate demographic representation, without preserving images by default. Define the false-accept/false-reject and confidence-interval methodology. Do not adopt an arbitrary similarity cutoff based on two pictures.
4. If any parity/accuracy gate fails, keep SFace limited to **Research cosine only**, not even a provisional Verified Resident recommendation.

## Independent presentation-attack/liveness gate (NOT IMPLEMENTED)
A **single still selfie cannot establish liveness**. The existing phone demo saves one selfie image and has no PAD evidence. An unvalidated blink prompt, face movement or camera frame does not certify resistance to spoofing.
- Design a distinct, consented **live camera video** PAD test and evaluate it on supported phones; do not add bypasses to the actual verification route.
- Build an authorized, non-sensitive evaluation corpus for bona-fide subjects and controlled **print/photo, display replay and prerecorded-video attacks**. Do not upload this material into a public repository or log it to analytics.
- Keep attempt labels, per-attack-type outcomes, lighting conditions, camera models and reject/retry counts, with privacy safeguards and authorized evaluation review. Report attack presentation classification error rate (APCER) and bona fide presentation classification error rate (BPCER) by relevant testing conditions, rather than anecdotal screenshots. Use ISO/IEC 30107-3 terminology when reporting.
- Set deployment acceptance criteria and independent reviewer signoff **before** exposing any automatic approval. Until then all PAD results must say **NOT TESTED / NOT VALIDATED**.
- Reject unknowns, missing camera consent, multiple faces, zero/NaN embeddings, model corruption and network/model initialization errors as **inconclusive**, never verified.

## Staging release checklist
- [ ] No-deploy synthetic browser unit tests pass.
- [ ] Staging release isolation tests and Expo build pass.
- [ ] Browser verifies model SHA256 and shows the numeric research result only after separate explicit consent.
- [ ] Real phone model download and camera inference tested (currently pending).
- [ ] Browser SFace alignment and numeric parity compared with OpenCV (currently pending).
- [ ] Independent liveness/PAD benchmark completed (currently pending).
- [ ] Government ID issuer authenticity checks and profile-data matching separately validated (currently pending).
- [ ] Administrator identity-review decision is authoritative; identity data uploaded or processed remotely only after approved privacy/security workflow (currently not enabled).

**Release policy:** A successful build is NOT the same as a validated identity-verification feature. Staging demo may report research results only. Production `volunserve.com`, backend media upload lock, and Firebase Verified Resident authority must not be changed by this work.
