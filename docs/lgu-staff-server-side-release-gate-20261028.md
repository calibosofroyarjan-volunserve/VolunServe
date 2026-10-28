# PR #139 — Mandatory server-side private-evidence release gate (2026-10-28)

**Status: draft, production intake disabled. Do not deploy or merge without approved privacy/security release.**

## Problem fixed
`EXPO_PUBLIC_LGU_STAFF_PRIVATE_EVIDENCE_ENABLED` only hides/disables the
application's submit action. An attacker or outdated SDK could bypass the UI
and write directly against deployed Firebase Storage/Firestore rules.

## Rules behavior
- Both `storage.rules` applicant evidence `allow create` and
  `firestore.rules` applicant evidence `allow create` require
  `lguIdentityIntake/release` to exist with `enabled: true`.
- Absent release document and `enabled: false` **deny creation**.
- This configuration document is unreadable/unwritable by all client roles,
  including Super Admin. Only the trusted Firebase Admin SDK / privileged
  operational release procedure can change it.
- Reading already-submitted evidence stays limited to its owner and approved
  programmer Super Admin so disabling new intake does not strand manual review.
- Storage evaluates two Firestore documents per create: applicant profile and
  release config. This respects the Storage Security Rules cross-service limit.

## Emulator synthetic testing ONLY
The mandatory Firestore and Firestore+Storage emulator tests explicitly test:
missing flag denies, disabled flag denies, no client can turn the gate on,
trusted fixture enables `lguIdentityIntake/release`, and then all existing
role, ID allowlist, MIME, immutability and privacy checks apply. Existing
emulator fixtures using this flow must seed the release config through
security-rules-disabled test context (or another trusted emulator-only setup).
Never enable it for production on the basis of synthetic CI results.

## Release checklist (blocked)
Written privacy notice, consent and lawful basis; deletion/retention and
incident plan; restricted live credentials and real hardware QA; verified
government-ID/document authenticity handling; independent official office
confirmation; working real anti-spoof liveness or explicitly documented
manual in-person identity review; bucket/CORS, data lifecycle and access
audit. Production remains unapproved. The UI flag is an additional guard
and **not** a substitute for this server-side gate.
