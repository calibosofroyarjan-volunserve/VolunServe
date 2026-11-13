# VolunServe identity verification — final staging acceptance and release gates

**Checked 2026-11-13 (Asia/Manila). Scope: staging code and automated synthetic QA.** This is an evidence-based release checklist, **not** a claim that production liveness or official ID authenticity is complete.

## Implementation and evidence

| Component | Current status | Evidence and restrictions |
| --- | --- | --- |
| ID type selection, five government IDs, school-ID exclusion | **Implemented / automated policy tested** | OCR-only recognition of the selected supported type; cannot prove issuance |
| Front/back crop and sharpness screening, passport MRZ | **Implemented / automated policy tested** | Passport bio-page exception, front/back image quality and DOB conflicts block approval eligibility; MRZ is a textual consistency clue |
| Profile name / DOB / barangay comparison | **Implemented / synthetic-tested** | Profile fields from authenticated Node/Firestore, not user-provided text; address comparison is barangay only |
| Experimental SFace 1:1 + MiniFASNet single-frame PAD | **Integrated, NOT independently validated** | Numerical PyTorch/ONNX parity on synthetic inputs only; do not rely on these scores for authentication |
| Local webcam preview / crop guide | **Code implemented / synthetic tests passed** | Tkinter preview on Windows is local-only; live physical-camera accuracy and UI behavior not yet verified by developer on user's machine |
| Admin review list and Verify / Require Retry | **Implemented / synthetic-tested** | Server requires operational Admin, approved Resident/Volunteer target, independent issuer attestation, valid supported selected ID evidence and audit logging |
| Expo Admin Verify button policy | **Aligned and protected with synthetic regression** | Blocks unknown/blurry front/back images, any OCR warning, unsupported/mismatched ID, DOB/MRZ conflicts, and stale verified/pending review |
| Private staging ID/selfie uploads | **Intentionally DISABLED** | Node returns HTTP 423 before multipart processing; do not unlock for demonstration or manual review convenience |
| Real authenticated browser Admin review | **NOT completed** | Need approved staging Admin account and isolated synthetic Resident account; do not bypass authentication or invent a verified decision |
| Live-device PAD print/replay false-accept / false-reject accuracy | **NOT validated** | 9/9 self-run trials were inconclusive; 8/9 subsequent diagnostic frames had 2.7x crop outside view; no accepted trials establish spoof resistance |
| Official government ID issuance/validity | **NOT independently verified** | No government issuer API or formal authenticity process currently certified; an authorized LGU/Admin must perform an independently documented check |
| Privacy, consent, biometric retention and deletion in operational production | **NOT signed off** | Explicit consent, retention/deletion guarantees, access/security review and incident response policies still need formal review |

## Strict release decision

**Allowed for controlled defense demo:** Show the staged UI, simulated/synthetic OCR results, model readiness diagnostics, authenticated Admin review workflow design and synthetic automation evidence. Clearly identify synthetic inputs and experimental components. When the required personal-media upload gate remains HTTP 423, demonstrate **a simulated pending record**, not a claim of completed real user submission or genuine government ID authentication.

**NOT allowed for unrestricted production release:** Automatic Verified Resident promotion based on pretrained face score, facial movement, QR presence, OCR/ID layout similarity, a self-run pilot, or an unvalidated PAD model. Do not remove `STAGING_IDENTITY_MEDIA_UPLOADS_ENABLED=false` without approved privacy review and secured explicit end-to-end tests.

The server, not the frontend, remains the final authority. The Admin may verify only after an **actual independent check**, with issuer attestation and audit trail; automated detection alone is not authoritative.

## Remaining real-world sign-offs (not replaceable with unit tests)

1. Privacy/consent/retention/deletion policy reviewed, with storage and access controls. User-owned real ID/selfie test uploads require explicit authorization and secure staging configuration.
2. Approved staging Admin account + controlled synthetic Resident / Volunteer record: browser sign-in, queue, notes, Require Retry, Verify, audit and status propagation. Capture **no real personal identity document** in automated CI.
3. Independent model evaluation on consenting multi-device genuine / physical print / second-screen replay conditions, with device and session separation, false rejection/acceptance measures and class/threshold calibration. No claims of ISO/IEC 30107-3 certification without evidence.
4. Qualified issuer/authenticity validation protocol for each of the five government IDs; National ID PSA QR method is a reviewer procedure, not a verified issuer API integration.
5. Final regression of all VolunServe roles, user permissions, core thesis modules, Firebase rules and Android/web UI before planning a separate protected production release.

## Evidence pointers

- Synthetic backend Admin end-to-end transaction: `backend/test-admin-identity-flow-synthetic.cjs`.
- Backend selected government ID policy: `backend/selectedIdPolicy.js`.
- Staging media gate: `backend/test-staging-lab-auth-phase.cjs`.
- Actual Expo Admin frontend gate parity: `backend/test-staging-admin-review-ui-contract.cjs`.
- Local webcam visual preview: `identity-ai/pad_webcam_preview_tk_local.py`.
- Source and actual original-vs-ONNX model evaluation: `identity-ai/ONNX_COMPATIBILITY_AUDIT.md`.
- Private PAD field-study protocol: `identity-ai/PAD_REAL_DEVICE_DUAL_SCALE_QA.md`.

**Release status:** Staging development and automated tests may be complete for the specified features; real-device liveness, official ID authenticity and privacy-reviewed production operation are **NOT complete**.
