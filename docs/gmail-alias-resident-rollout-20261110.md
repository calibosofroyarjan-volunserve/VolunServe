# Gmail mailbox uniqueness — production migration and rollback plan

**Status: DRAFT / NO DEPLOY.** These changes prevent multiple **Basic Resident profiles** for
`name@gmail.com` vs `n.a.m.e@gmail.com` / `name@googlemail.com`, provided the
correctly paired Firebase Rules are active. They do **not** block Firebase Auth
UID creation or detect unknown disposable Gmail providers.

## Exact-source safety

- Hosting comes from the actual published-site derived candidate, originally
  PR #356, then dependent Gmail-claim PR #363. Never publish from stale `main`
  or an unrelated `live-protected` website checkout.
- Active production Firestore Rules source comes from PR #358 and dependent
  Gmail-claim PR #364. Never publish the diverged 5,827-line site snapshot as
  the active Rules file.
- Pin the reviewed Git SHA and active Rules fingerprint, confirm current
  Hosting marker, take fresh matching versioned backup, and keep rollback.
- Run separate offline/Firestore emulator, staging Firebase Auth, and real-device
  tests before approving the production release.

## Before any live changes: read-only inventory

1. Obtain a security-approved, read-only inventory of existing users whose
   persisted role is `resident` or `volunteer`, with exactly UID/email/role/status
   needed for canonical Gmail claims. Do not print PII in public GitHub logs.
2. Canonicalize only `gmail.com` / `googlemail.com`: lowercase the local part,
   strip dots and `+tag` suffix, map both domains to `gmail.com`. Do **not**
   fold Yahoo, Outlook, enterprise, or unrelated mail domains.
3. Compare each canonical key to existing alias-claim keys. Report only totals
   for missing/duplicate/conflicting entries in public CI. If two different
   UIDs map to one mailbox, STOP. Resolve manually with account-owner proof,
   record preservation, and an explicit recovery process. Never auto-delete,
   merge identities, or overwrite ownership.
4. After collisions are resolved, perform an explicitly authorized, idempotent
   Admin-SDK transaction backfill for every eligible existing verified profile.
   Fail closed on any key collision, do not overwrite claims, audit each write
   securely, and retain rollback plan.

## Coordinated deployment (no blind one-step rollout)

1. Stage **claim-compatible Rules**: permit the new immutable
   `gmailAliasClaims/{canonical}` create/get contract while preserving the
   previous `users/{uid}` CREATE semantics. Do *not* require claims yet.
   Check current active-rules base fingerprint again.
2. Deploy the reviewed **site-derived frontend** that creates the claim and
   Resident profile in one transaction. Confirm new Gmail / googlemail,
   legitimate Yahoo/Outlook, and Google signup flows; watch Firebase errors.
3. Once no permitted signup path can create claimless Gmail Resident profiles,
   publish **final enforcing Rules** from the reviewed active Rules baseline:
   `users/{uid}` CREATE requires the matching same-commit Gmail claim.
   Verify direct SDK claimless writes are denied. Existing user login/roles
   must remain unchanged.
4. Verify production integrity, rollback readiness, and security logs after
   each stage. Stop on any IAM, tests, drift, rules compiler, quota, or hosting
   marker discrepancy.

## Rollback

- Roll back site Hosting with the verified exact live version/channel, not an
  outdated default branch. Restore the saved active Rules version if a phase
  blocks legitimate registration.
- Do not delete accumulated aliases during a rollback; retain them until a
  reviewed migration specifically authorizes any cleanup.
- Neither an already-created Auth UID nor a claim with a different UID can be
  silently merged or overwritten.

Firebase Security Rules can enforce atomic write invariants using
`getAfter()`; the Spark plan does not provide pre-Auth-creation blocking.
