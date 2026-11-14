# VolunServe Full-Staging Admin Access — Safe Preflight

Status: **read-only diagnosis implemented. Live Admin access NOT provisioned.**

This is only for the isolated `volunserve-full-staging` Firebase project and the
`volunserve-expo-resident-full-staging.onrender.com` UI. Production
`volunserve.com` uses a different Firebase Authentication and Firestore project.
Production Admin credentials, profiles, passwords and role flags must never be
copied into staging as a shortcut.

## What already works

The staging backend and website are deployed. Synthetic authenticated
Firebase Auth/Firestore emulator E2E has passed for Admin Verify, Reject and
Require Retry. Public staging health and anonymous-access-denial smoke checks
also passed. Neither result proves that a particular real staging Admin user
has been created or that ID/selfie uploads are enabled.

## Why the browser login says "Invalid email or password"

That message is returned by Firebase Authentication *before* the code checks
whether the user has an approved operational Admin profile. It may mean that
no email/password account exists in `volunserve-full-staging`, or the supplied
credentials are wrong. Do not ask users to send passwords, Auth tokens or
screenshots showing secrets.

## Read-only staging owner diagnosis (no writes)

An **authorized Firebase project operator**, working on a secured workstation
with credentials obtained from an approved secret manager, can run:

```bash
# Example only. Retrieve secrets through approved credential management;
# NEVER paste keys into chat, code, GitHub, logs or shell history.
export VOLUNSERVE_STAGING_STRICT=1
export VOLUNSERVE_DEPLOYMENT_ENV=staging
# Pre-existing authorized variables, not shown here:
# FIREBASE_SERVICE_ACCOUNT_JSON (belongs to volunserve-full-staging)
# IDENTITY_AI_INTERNAL_KEY
export IDENTITY_AI_SERVICE_URL=https://volunserve-identity-ai-staging.onrender.com
node backend/scripts/check-staging-admin-account.cjs --email=staging-admin@example.org
```

Replace the example email with the *existing staging account* email.
The script uses the **staging-only Firebase Admin SDK**, reads Auth by email,
and reads `users/{authUid}` once. It prints a fixed status code, not the
email/UID/credentials. It cannot create accounts, set roles, reset passwords,
grant access or deploy code.

| Diagnostic status | Required next action |
|---|---|
| `READY_FOR_STAGING_ADMIN_SIGN_IN` | Existing approved staging Admin may sign in with their separate staging credentials |
| `AUTH_ACCOUNT_NOT_FOUND` | Register or invite a dedicated account in **full-staging** using the normal authorized workflow |
| `AUTH_EMAIL_NOT_VERIFIED` | Complete normal Firebase email verification for that staging account |
| `AUTH_ACCOUNT_DISABLED` | Authorized staging project owner reviews the disabled status |
| `STAGING_PROFILE_MISSING` | Complete approved staging staff onboarding; do not generate a privileged profile from client code |
| `ROLE_NOT_ADMIN` / `ADMIN_NOT_APPROVED` | Use existing protected Super Admin LGU application review and approval; never edit the role from the public UI |
| `ADMIN_SUSPENDED` | Approved operator reviews suspension; no auto-reactivation |
| `AUTH_PROFILE_UID_MISMATCH` / `AUTH_PROFILE_EMAIL_MISMATCH` | Investigate cross-account inconsistency; never auto-link |
| `STAGING_ADMIN_PREFLIGHT_BLOCKED` | Check the project-scoped operator environment; the script refuses production credentials |

## Existing authorized Admin approval path

The application already contains
`POST /api/superadmin/lgu-applications/:uid/approve` with real Firebase Auth,
a persisted approved Super Admin reviewer, independent official LGU employment
verification, private proof validation, and an audit trail. Reuse that existing
workflow to onboard a staging Admin instead of inventing a public privileged
signup or bypassing approval. If no staging Super Admin exists, the authorized
project owner must arrange initial staging personnel provisioning under
institutional policy; **this PR does not silently bootstrap one**.

## Remaining blockers and permissions

- A specific authorized staging Admin account must exist and complete onboarding.
  The GitHub/Render connectors alone cannot inspect or create Firebase Auth users.
- Real ID/selfie media submissions remain **HTTP 423 disabled** by design.
  Do not flip the guard without security, consent, retention and access reviews.
- Real-device face matching and liveness remain unvalidated. Do not claim
  successful automatic identity verification based on synthetic tests.
- No code from this diagnostic PR should be deployed to production.
  The CLI runs only when deliberately invoked by an authorized operator and
  no live backend redeploy is necessary to use it from a secure checkout.
