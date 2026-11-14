# Staging Hybrid Identity — privacy minimization and retention readiness

**Scope:** isolated full-staging source code, not production and not a go-live
authorization. ID/selfie upload endpoints stay disabled with HTTP **423**.

## Data inventory and enforced controls

| Data / pathway | Treatment in this source | Retention / status |
|---|---|---|
| Incoming ID front/back and selfie bytes | Transient request buffer forwarded only by protected Node-to-Python route; not uploaded to Firestore, Storage or Cloudinary by this flow | No photo archive in this flow; actual request, reverse proxy, runtime and cloud logs still need operator review before enabling uploads |
| Raw OCR, passport numbers, profile DOB, facial embeddings | Explicit allowlist sanitizes `documentScreening`; untrusted Python message and verificationId can no longer directly enter verification documents/API | New writes only; previously stored metadata remains until separately reviewed |
| Current `identityVerifications/{uid}` | Sanitized ID type/quality warnings, unvalidated face score, status/attempt counts, reviewer decision, admin notes | **No automatic deletion set.** Required for manual review and operational access. Data-retention period awaits approved policy |
| `identityVerificationAttempts` | Immutable, minimized attempt outcome codes. New attempts exclude copied biometric score, full document-screening structure and prior human review notes/reviewer UID | **No automatic deletion set.** May serve audit; lawful retention and deletion need owner approval |
| `identityDocumentPrecheckThrottle/{uid}` | Only per-user cooldown/window/count, plus `expiresAt` timestamp 48 hours after the last precheck | **TTL field only.** Firestore TTL is *not* automatically configured by the code; records will not be deleted until the platform TTL policy is explicitly enabled |
| `adminActivityLogs` and authorized reviewer notes | Existing reviewed decisions preserved; no destructive cleanup or record backfill is performed | Audit retention and access/deletion requests require an LGU-approved schedule |

## Additional protections in this change

- All four sensitive identity status/verification/Admin review endpoints send
  `Cache-Control: private, no-store, max-age=0`.
- Untrusted AI text (including potential OCR/ID names) is replaced by fixed
  enumerated user-facing explanations. Provider verification IDs must be
  opaque bounded ASCII tokens; malformed IDs use server-generated random UUID.
- Firebase token failure logs never echo exception message or token.
- Python identity exceptions log only a constant marker without raw traceback.
- All tests use **fictional data** and run without camera, Firebase or network.

## Mandatory operations **before** enabling real uploads

1. Authorize real staging Admin authentication/role setup through existing LGU
   credential and Super Admin approval process; verify project isolation.
2. Approve an explicit privacy notice/consent text, minimum necessary evidence,
   role-based access, data subject request and deletion process, retention policy
   (for active reviews, attempts and immutable Admin logs), breach response
   and cloud-backup/log handling with the responsible LGU/privacy officer.
3. Explicitly configure **Firestore TTL** for field `expiresAt` on collection
   group `identityDocumentPrecheckThrottle` in **volunserve-full-staging**,
   not production. Verify that TTL is enabled and its deletion lag;
   do not claim timed deletion merely because the field exists.
4. Audit historical records for previously stored unbounded provider messages,
   and decide lawful remediation; this patch **does not delete** them.
5. Validate photo consent, short-lived processing, no image/biometric logging,
   rate limits, authorized access, restore/deletion behavior and independent
   liveness/issuer authenticity limitations using **consenting test accounts**.
6. Re-run authenticated end-to-end staging only after approved security/privacy
   requirements. Stage green CI is not equivalent to real-camera validation.

This is technical privacy hardening, **not** a verified Data Privacy Act
compliance certification, issuer authenticity check or independent PAD test.
No Render deployment or production Firebase change is included.
