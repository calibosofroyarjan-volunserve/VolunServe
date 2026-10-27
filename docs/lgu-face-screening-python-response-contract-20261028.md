# LGU Face-Screening Python Response Contract — 2026-10-28

**Draft PR #139, synthetic-only CI; not production deployed.**

Previously the Node bridge trusted `status:pending`, `decision:manual_review` and a threshold-passing `matchScore` without verifying that the result also came from the deployed expected face engine, used the correct declared ID type, included valid quality values, and truthfully identified liveness capability.

New `hasExpectedPythonContract` requires:
- Python `ok:true`, `status:pending`, `decision:manual_review`.
- Recognized actual engine `mediapipe-landmark-1to1-v1` (this is an **unvalidated landmark geometry signal**, not a biometric identity-certification provider).
- `idType` matching the server-side mapped immutable ID type (`national_id`, `passport`, or `drivers_license`).
- Both numeric image-quality scores in `[0,1]` and `livenessImplemented:false`.
- Only then can the score/threshold check produce `similarity_signal_present`. Any malformed/mismatched response falls back to `inconclusive_manual_review`.

All outputs and Firestore records still have `identityDecision:manual_review_required`, `documentAuthenticityVerified:false`, `livenessImplemented:false` and NEVER update user role. Added mock integration tests for wrong engine, ID type, missing quality, falsely implemented liveness, and failed engine result. This validates contract handling, **not model accuracy, spoof resistance, official issuer authenticity, or real-camera capture**.

**Codex work required:** run tests and independent code review in separate worktree, assess real mobile camera quality and whether MediaPipe landmark score has acceptable false accept/reject rates on consented test-only imagery; otherwise route to human review. Do not auto-promote applicants or deploy sensitive identity features.
