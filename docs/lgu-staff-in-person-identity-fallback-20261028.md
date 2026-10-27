# LGU Administrator Identity Presence — Responsible Manual Fallback (PR #139)

2026-10-28. **Draft only, no production activation.**

The current MediaPipe landmark matching service is not a validated liveness detector (`livenessImplemented:false`) and Tesseract cannot confirm Philippine government issuer authenticity. Therefore a selfie, OCR marker and similarity score MUST NEVER automatically grant LGU Admin role.

## Programmer Super Admin approval gate
The pre-existing protected 5-step applicant evidence viewer, independent LGU official appointment confirmation and same-transaction credential review remain mandatory. Additionally, the reviewer must *actually* meet the living applicant **in person**, inspect the original physical government-issued ID, and compare ID portrait to the observed person. Reviewer makes a new explicit checkbox attestation; it is reset on each applicant. The verified credential record includes fixed `identityPresenceMethod:in_person_original_government_id_review` and `identityPresenceConfirmed:true`. Firestore rules require both fields in the fresh credential review and same-batch Admin grant. A remote video chat, still photo, mock blink animation or uncalibrated anti-spoof ML output does not satisfy this requirement.

This is **human-attested evidence**, not cryptographic proof of attendance or validated issuer document authentication. The reviewer must not check it unless real in-person verification occurred. For synthetic defense demonstration, describe it as a demonstration of the human approval control, not a genuine physical meeting or verified real ID.

## Before release
- Official department confirmation from independently sourced office details
- Written biometric/data privacy consent, retention, deletion and incident response
- Real-device camera and responsive UI checks with synthetic media
- Approved issuer/source-of-truth document checks where available
- Real active liveness provider and tested SDK only if remote KYC is required
- Separate review of Storage CORS, malware/content sniffing, EXIF stripping

No client-selected checkbox can replace organizational verification, and no AI signal may promote itself.
