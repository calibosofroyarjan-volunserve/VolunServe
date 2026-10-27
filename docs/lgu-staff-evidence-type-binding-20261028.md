# PR #139 — Preserve Government ID Type Across Interrupted Uploads

2026-10-28. Draft implementation only; **no production sensitive intake enabled**.

A prior interrupted submission could reuse an earlier `front.*` object after the applicant changed their declared ID type in the five-step wizard. The UI also retained the earlier front photo on type switch.

## Now enforced
1. Switching among National ID, driver's license, and passport clears the selected front **and** back images, requiring a fresh document selection.
2. Every private evidence object (front/back/selfie/LGU proof) now includes the declared `idType` in restricted Storage object custom metadata.
3. Storage Rules only permit allowlisted `idType` values and reject missing metadata. The owner cannot overwrite submitted objects.
4. Interrupted-upload resume validates both original `purpose` and **matching ID type**. Existing evidence of a different ID type blocks retry for manual intervention (never overwrites or silently relabels an ID).
5. Approved Super Admin web preview and private Node OCR/face routes fail closed if stored `idType` differs from immutable Firestore evidence metadata. They still do not establish ID authenticity or liveness.
6. Backend integration mocks, Storage emulator checks and static wizard contract regression tests were updated.
7. Python OCR adds backside school/company-marker checks; **only** a non-authoritative document type signal, never automatic approval.

## Honest limitation
A malicious client can label a school or other photograph as a supported ID type. Metadata cannot prove what the actual picture depicts. Real document authenticity requires authorized issuer-backed verification and/or supervised manual inspection. Image type/EXIF sanitization, approved retention/deletion, anti-spoof liveness, real-device camera QA and official LGU employment confirmation are still blockers. There is no bypass of the production release gate: `lguIdentityIntake/release` remains absent/false by default.

**Migration note:** Existing synthetic applicant evidence uploaded before this change lacks `idType` Storage metadata; it must not be silently accepted for screening. In the emulator, reset only synthetic test fixtures/recreate the applicant. Never overwrite or delete real evidence outside an approved privacy deletion process.
