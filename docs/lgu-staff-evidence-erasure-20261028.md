# LGU Applicant Sensitive-Evidence Withdrawal & Erasure — PR #139
2026-10-28. **Draft only. No production deployment. All tests use synthetic files.**

## Implemented backend endpoints

Both use Firebase ID bearer authentication and the trusted Node Admin SDK, never expose public media URLs.

1. `POST /api/lgu-staff/privacy/request-withdrawal`: authenticated pending/rejected LGU applicant **only**. Atomically changes the applicant `users/{uid}.status` to `rejected` (denies new private Storage creates and Admin promotion) and creates `lguApplicantPrivacyRequests/{uid}` with minimal audit timestamp/status. Request is idempotent. It does **not** delete evidence immediately.
2. `POST /api/lgu-staff/privacy/purge-evidence`: approved programmer Super Admin only, different from applicant, body `{"applicantUid":"<uid>","confirmation":"PURGE_LGU_EVIDENCE"}`. Requires prior applicant withdrawal, applicant remains rejected, exact bucket configuration, and **server-only** `LGU_STAFF_EVIDENCE_PURGE_ENABLED=true`. This switch defaults OFF even if an application client is modified.
3. The backend examines the restricted UID-specific Storage prefix. Only 12 known files maximum (`front/back/selfie/lgu_proof` × jpg/png/webp) are accepted; unknown objects fail closed. It deletes those objects, then removes Firestore identity evidence metadata and informational face/OCR screening results, and writes a minimal backend-only completion audit. If Storage or Firestore fails, the request remains `purge_failed` for supervised retry. No application can forge a completed purge.
4. Both privacy collections have explicit Firestore rules: owner can read own request, Super Admin can read review/audit, all clients including Super Admin browser have no write access. Role-grant rules reject accounts with a privacy/withdrawal request even if earlier documents exist.
5. Mandatory offline mocked route tests cover privilege boundaries, idempotent withdrawal, unconfigured purge, unknown objects, storage failure and full synthetic success. Firestore emulator rule tests cover client forgery and unauthorized reads.

## Not completed / signoff required
This operation deletes *restricted identity evidence*, **not** the Auth account, the user profile (name, email, official appointment reference), preexisting credential review/audit history or any external systems. A legally approved personal-data erasure process must separately evaluate these records, legitimate retention obligations, disputes and backups. No automatic retention period is invented; approve a documented retention schedule, consent and notice, delete evidence after permitted periods, and conduct manual end-to-end browser/mobile QA. Do not enable `LGU_STAFF_EVIDENCE_PURGE_ENABLED` in production without authorization and verified IAM/storage bucket safeguards.

This feature does not make ID OCR an authenticity check or turn a still selfie into active anti-spoof liveness. For Nov. 3 final-defense demos, use synthetic IDs and emulator-only storage.
