# VolunServe — LGU Applicant Credential Evidence (2026-11-05)

## What is implemented
- A clean LGU staff application with official work email, staff name, department, position, appointment reference and SJDM barangay.
- Exactly **two private attachments**: (1) LGU Employee ID; (2) one Certificate of Employment / Appointment Order / official LGU authorization letter.
- JPG, PNG, PDF, max 5 MiB per file; basic magic-byte validation, no original file names in object paths.
- Secure Firebase Storage objects at `lguApplicantProofs/{uid}/employee-id` and `lguApplicantProofs/{uid}/supporting-document`.
- The new Storage rules restrict upload/update to the owner of a pending applicant profile; only that applicant and approved Super Admin may read; there is no public `getDownloadURL` use, file listing is prohibited.
- Existing LGU staff applications remain `role: applicant`, `status: pending_review`; no Admin permissions are granted on submission. If upload fails, applicants can resume with their own credentials.
- Super Admin Pending LGU Applications and approval modal display protected proof status and authenticated **View Proof** actions. New applications must have both documents before the approval button can activate; the independently verified office/appointment and credentials-confirmation checks remain.
- Existing applications created before the rollout cutoff retain manual review compatibility; avoid retroactive denial.
- Existing Unified Login, Signup, Admin/Resident/Volunteer modules, backend, Firestore Rules and production data are unchanged.

## Security and privacy limitations
- A file extension, MIME field or browser magic-byte check cannot prove a document is authentic. The Super Admin must verify employment and authority with an independently obtained official LGU contact.
- Uploaded evidence contains personal data. The privacy notice, access controls, incident response, audit and retention/deletion processes must be adopted before taking real staff documents. Super Admin deletion is supported by Storage rules; automatic timed deletion is not yet configured. Do not promise automatic deletion or store unnecessary National IDs.
- Direct SDK `getBlob()` requires an appropriate bucket CORS configuration for web viewers. **Do not use `getDownloadURL()`** as a shortcut: tokenized links may remain publicly retrievable.
- Production `storage.rules` was deliberately **not deployed**. The verified UI preview connects to the live Firebase project whose existing Storage Rules deny the new proof paths: never ask applicants to upload actual IDs on preview.
- Existing GitHub Hosting deploy service account `volunserve-hosting-deploy@volunserve-3aa5b.iam.gserviceaccount.com` lacks `storage.buckets.list` access (403). Its attempts to describe the configured and legacy buckets returned 404 (not sufficient to distinguish absent bucket from inaccessible resource). Secure Storage bucket name, CORS and deployment permissions must be verified by an authorized Google Cloud project owner.
- Manual real-mailbox verification, real authorized reviewer login and browser file read/write are not yet acceptance-tested. No production data or user accounts were created.

## Verified checks
- TypeScript and Expo web export succeeded.
- Existing Login, Signup and Admin role regression scripts succeeded.
- Firestore + Storage emulator passed owner upload; denial of other users, wrong roles, oversized and wrong-MIME files; read only for owner and approved Super Admin; no list; Super Admin-only delete.
- Firebase Hosting isolated preview deployed and Chrome verified UI labels.
- No Firebase live Hosting/Rules, Functions, or production data changed by this feature branch.

## Safe production release order
1. Confirm the **actual** Firebase Storage bucket and restricted Admin service permissions with project owner. Verify scoped secure browser CORS on `https://volunserve.com`.
2. Set explicit privacy/retention procedures and test with **synthetic, non-sensitive** documents in an isolated Firebase project, including applicant resume and Super Admin access.
3. Confirm no newer Admin/Super Admin Hosting release has superseded base `4520b201c9f6e86f810d2b7c3c1377c158ac424e`. Rebase/port only scoped changes if live advanced.
4. Back up production `storage.rules`; deploy **only Storage Rules** after successful emulator verification. Confirm existing disaster and announcement Storage flows remain valid.
5. Publish a new Hosting preview with the same source, verify both documents upload to the private paths and are retrievable only by approved Super Admin; verify failed and retry flows.
6. Backup current live Hosting; deploy **Hosting only** and smoke test /admin-request, /login, /signup, Super Admin pending applications and other retained modules. Preserve rollback artifacts.
7. Roll back Hosting to its backup and Storage Rules to the original audited version if the new proof upload/reader fails; never roll back Firestore to permissive roles.

**Decision:** Preview code is ready for controlled acceptance, but production upload is blocked pending actual bucket/CORS/permissions verification. Do not represent this as deployed and operational.
