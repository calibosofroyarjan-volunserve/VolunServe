# VolunServe — Phase 16: Render-Managed Google OIDC ADC Compatibility (DRAFT ONLY)

**Date:** November 19, 2026 (Asia/Manila)  
**Base:** Phase 15 draft PR #632, nested with previous Phase 1–14 review-only branches.  
**Release decision:** **NO-GO for cloud deploy or live automatic dispatch.** This change has no production runtime integration or cloud actions.

## Why this change is necessary

The official <https://render.com/docs/oidc> documentation states that a Render **Pro or higher** workspace can connect an individual service to a Google Cloud Workload Identity Federation provider. On redeploy, Render detects `GCP_WORKLOAD_IDENTITY_PROVIDER` and writes an external-account ADC configuration file for the service's short-lived OIDC identity; Render sets `GOOGLE_APPLICATION_CREDENTIALS` to that generated file. **Do not manually set the variable.** Google Cloud also supports external-account ADC without long-lived service-account private keys; see <https://docs.cloud.google.com/iam/docs/workload-identity-federation>.

Phases 12/13 categorically refused any `GOOGLE_APPLICATION_CREDENTIALS`, blocking that official managed-OIDC pattern along with unsafe static keys. The Phase 16 DRAFT patch introduces a **narrow opt-in exception** to those gates for a locally readable, syntactically correct Render-style `external_account` configuration. It does not make an official Render origin or IAM trust decision.

## Exact source changes

- **NEW `backend/autoVolunteerPhase16RenderManagedOidcGate.cjs`** checks the actual `process.env` only, read-only mode, dispatch disabled, direct federation only, and explicit `GCP_WORKLOAD_IDENTITY_PROVIDER` pinned to `VOLUNSERVE_PHASE16_EXPECTED_WIF_PROVIDER`.
- It reads **only the small local ADC JSON config** referenced by `GOOGLE_APPLICATION_CREDENTIALS`, with a strict 16-KiB limit, absolute non-symlink regular file checks, non-world/group-writable mode, owner check and bounded read. It **does not read the OIDC token's contents**. Its local token source must exist, be a small non-symlink regular file, and not be writable by groups/others.
- It validates `type=external_account`, the exact `//iam.googleapis.com/{GCP_WORKLOAD_IDENTITY_PROVIDER}` audience, OIDC JWT subject token type and `https://sts.googleapis.com/v1/token` endpoint. It refuses any `private_key`, `private_key_id`, `refresh_token`, `client_secret`, arbitrary URL/executable source, unsupported source fields, service-account impersonation URL, `GCP_SERVICE_ACCOUNT_EMAIL`, and `FIREBASE_SERVICE_ACCOUNT_JSON`.
- **DRAFT updates to `backend/autoVolunteerPhase12IsolatedCloudPreviewAdapter.js` and `backend/autoVolunteerPhase13ReadOnlyCloudBootstrap.cjs`** reuse that guard when (and only when) `GOOGLE_APPLICATION_CREDENTIALS` is present. If it is absent, the previous read-only mock/ambient ADC tests are unaffected. If present but unrecognized, the previous `standalone_service_account_files_not_approved` / `standalone_credentials_forbidden` errors remain.
- Explicit opt-in:
  - `VOLUNSERVE_PHASE16_RENDER_OIDC_MODE=schema_review_only`
  - `VOLUNSERVE_PHASE16_DIRECT_FEDERATION_ONLY=true`
  - `VOLUNSERVE_PHASE16_EXPECTED_WIF_PROVIDER` must equal the exact Render-configured `GCP_WORKLOAD_IDENTITY_PROVIDER` resource.
  - All existing Phase 12/13 project, Render new service, dedicated candidate branch, read-only mode and dispatch OFF gates continue to apply.

## What this validation DOES NOT PROVE

**Critical:** Any local file of the right shape could pass these file-format tests. A `GOOGLE_APPLICATION_CREDENTIALS` path, Render environment variable, GCP provider name or matching JSON **does not cryptographically attest** that Render issued the OIDC token, that the token has the correct issuer/`sub`, that GCP will accept it, that an IAM policy has been applied correctly, or that effective privileges are read-only. The fake local token in CI is deliberately **not** a valid JWT and is never exchanged with Google.

We therefore return `provenRenderOrigin=false`, `provenCloudIam=false` and `automaticDispatchAuthorized=false` even when a config passes the shape check. The Phase 13 bootstrap continues to return `cloudIAMAttested=false` and Phase 14 still returns `cloudDeploymentAuthorized=false`. **No automatic production or cloud staging deployment approval can be inferred from a passed test.**

Render-managed credential format could vary or use token-file rotations/symlinks incompatible with this strict file policy. Such differences should **fail closed** until the actual generated config can be inspected securely in a separately authorized and verified NEW isolated staging service, with no secrets copied to GitHub or logs.

## Real release prerequisites (not performed)

1. Independently verify the connected Render workspace's **Pro+ OIDC entitlement** and any subscription cost. Existing service compute plan `free` does not establish workspace plan.
2. Obtain explicit authorization for a **NEW** independent Firebase/GCP project and **NEW** Render service. Never reuse production `volunserve-3aa5b`, old accepted-Volunteer staging `volunserve-volunteer-staging`, or current Render services.
3. Configure a Google OIDC provider with the actual Render workspace issuer, `google.subject=assertion.sub`, default audience, and an exact **new-service** subject. Avoid wildcard IAM principals and broad roles. See <https://render.com/docs/oidc> and <https://docs.cloud.google.com/iam/docs/workload-identity-federation>.
4. Independently audit the *effective* GCP IAM and Firebase Admin Auth permissions needed for `verifyIdToken(token,true)`, including revocation checks. A Firestore viewer grant alone may not support every Auth API.
5. In a NEW separately authorized cloud canary, verify that Render generated the ADC file, actual `external_account` shape and service identity, real valid/revoked Firebase Auth tokens, read-only Firestore access, and **denied** access to production/old staging. Do not share credential contents or tokens.
6. Keep production and old staging branches untouched; review Cloud IAM billing, logging, private ingress, alerting, official SJDM geography, all-eligible roster scaling, cancelled notifications, canonical case winner semantics, and the 24/7 scheduler **before** any write-enabled emergency dispatch.

## Offline Phase 16 tests

`backend/test-autoVolunteerPhase16RenderManagedOidcGate.cjs` uses only Node temporary **fictional local files**, a fake Admin SDK and an ephemeral localhost Express server. Tests cover opt-in OFF, safe synthetic `external_account` config shape, Phase 12/13/14 compatibility, arbitrary credential file rejection, private-key JSON rejection, pin mismatch, wrong STS/audience, impersonation, executable/URL sources, invalid token source, symlink and file-mode protections, malformed/overlarge files, dispatch kill switch, Firebase project mismatch and GET-only mock staging startup.

The no-deploy CI checks exact six-file scope (four newly added and two modified review-only files), reruns all prior Phase 15–11 security tests and original backend identity/signup/certificate regressions. No Render/GCP/Firebase calls, IAM changes, cloud credentials, service provisioning, billing, cloud scheduler, real emergencies or production writes occur.

**Phase 16 = code/schema compatibility review, NOT an authenticated GCP connection, effective IAM attestation or staging deployment. Keep the PR DRAFT/UNMERGED.**
