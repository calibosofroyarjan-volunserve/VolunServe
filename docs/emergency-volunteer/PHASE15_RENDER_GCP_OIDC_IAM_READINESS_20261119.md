# VolunServe — Phase 15: Render→Google Cloud OIDC / IAM Security Readiness

**Date:** November 19, 2026 (Asia/Manila)  
**Base:** Draft Phase 14 PR #630, stacked on Phase 13–1 from the protected live backend.  
**Release decision:** **NO-GO. No Firebase/GCP/Render changes, no OAuth token issuance, no IAM grants, no deploy, no real emergency dispatch.**

## Newly verified external documentation

As of November 19, 2026, **Render officially supports managed OpenID Connect (OIDC) for Google Cloud on Pro workspaces or higher.** The previously documented blanket statement that Render has no supported keyless Google Cloud identity path is outdated.

- Render OIDC and GCP setup: https://render.com/docs/oidc
- Render plan features (OIDC Pro+): https://render.com/docs/platform-features-by-plan
- Google external Workload Identity Federation (WIF): https://docs.cloud.google.com/iam/docs/workload-identity-federation
- Google ADC external identity configuration: https://docs.cloud.google.com/iam/docs/workload-download-cred-and-grant-access
- Google Cloud Run service identity (alternative): https://docs.cloud.google.com/run/docs/securing/service-identity
- Google Firestore IAM roles: https://firebase.google.com/docs/firestore/security/iam
- Firebase Admin ID token/revocation validation: https://firebase.google.com/docs/auth/admin/verify-id-tokens

**Current Render service compute tier `free` does NOT establish the Render workspace's plan.** The connected Render workspace lists only `type=team`; the Pro-or-higher entitlement has **not** been independently inspected. Do not assert it is available on this account; the owner must check Render Workspace Settings/Billing. Render-managed OIDC is documented as a Pro+ workspace feature and could add costs. No plan change or paid action is authorized by this PR.

## Render-managed OIDC authentication design — future NEW service ONLY

Render's managed GCP OIDC creates rotating short-lived identity credentials and a Google `external_account` **ADC configuration file**, then sets `GOOGLE_APPLICATION_CREDENTIALS` to its generated path. It is NOT a long-lived service-account key and **must never be manually set to a copied private JSON key**. Render requires a properly configured GCP Workload Identity Pool and OIDC provider; the provider resource name uses the **numeric GCP project number**, pool ID and provider ID, not the Firebase project string.

The GCP provider must use the issuer for the exact Render workspace, e.g. `https://oidc.render.com/<workspace-id>`, and a Google IAM principal must restrict access to the **exact newly created Render service's OIDC subject**, of the form:

`workspace:<workspace>:environment:<environment-or-default>:service:<new-service-id>`

Never authorize an entire workspace, pool, `allUsers`, or wildcard OIDC subject. This avoids giving existing production/staging Render services unintended authority over the new Firebase project.

For **read-only preview**, `roles/datastore.viewer` is a candidate Firestore reader role and does not permit normal document writes; its effective scope and exact database permissions require a real GCP IAM review. Other Firebase Admin Auth operations, especially `verifyIdToken(token, true)` with revocation checking, may require **additional, independently tested Auth permissions**. Do not blindly grant Owner, Editor, Firebase Admin, or Firestore User as a workaround. Cloud SDK Admin requests do not rely on Firestore client Security Rules, so IAM is critical.

Service-account impersonation is a separate route. This Phase 15 proposal evaluator **blocks it pending a distinct exact `roles/iam.workloadIdentityUser` / target-service-account policy review**. It only evaluates a proposed **direct-federation read-only** identity shape; it performs **no real policy or token verification**.

### Critical compatibility gap with Phases 12–14

Phase 12 and Phase 13 existing bootstrap guards block `GOOGLE_APPLICATION_CREDENTIALS` categorically, which is appropriate for rejecting uploaded private service-account keys but **also blocks Render-managed OIDC**. Phase 15 tests explicitly reproduce this refusal so that a future engineer cannot mistakenly claim Render OIDC works unchanged.

**DO NOT simply remove that guard:** it currently prevents unsafe credential injection. A separate, audited Phase 16 adapter must distinguish Render-generated short-lived `external_account` configuration from static `service_account` JSON and validate its provider, exact audience, issuer/service identity binding, effective IAM, and source provenance. A file path, env flag or matching JSON alone is not sufficient proof that a token/config was actually issued by Render.

## Added executable evidence — offline review only

`backend/autoVolunteerPhase15RenderOidcIamPreflight.cjs` is a **pure, read-only policy proposal evaluator** that checks submitted metadata for:

- Dedicated NEW Firebase project, numeric GCP project number, NEW Render service (never protected production or historical accepted-responder staging).
- Pro+ entitlement and service ownership marked for independent review rather than inferred from a server environment flag.
- Exact OIDC issuer workspace, exact subject restricted to a single new service, and WIF provider/audience match.
- Proposed ADC configuration is of type `external_account`, token type OIDC JWT, Google STS token URL, local credential token source rather than arbitrary HTTP/executable source, and contains no static `private_key` or OAuth client secret.
- Direct federated IAM proposal contains exact single-service principal and only the narrow candidate Firestore viewer role. Broad Writer/Owner/Editor/Admin/Token Creator roles, cross-project access and service account impersonation are blocked.
- Independent effective IAM verification, approved Auth revocation access, actual authenticated read-only cloud canary and negative production/old-staging permission tests **remain required**.

**Important:** The module never reads the actual generated credential file, network, Firebase, Render, IAM policies or tokens. All submitted metadata/evidence booleans are potentially self-declared and cannot prove cloud permissions. Even with every boolean set to true and a plausible proposal, status is only **`HUMAN_REVIEW_REQUIRED`**, with `deployAuthorized=false` and `dispatchEnabled=false`.

`backend/test-autoVolunteerPhase15RenderOidcIamPreflight.cjs` uses wholly fictitious OIDC resources to test wrong project/issuer/audience, missing plan proof, wildcard principal, unexpected secret key, broad IAM role, cross-project grants, and previous Phase 13/12 managed-ADC refusal. No project config or credential material from the user's real resources is committed.

CI adds only these review/test files, this document and a no-deploy workflow. Prior Phase 14/13/12/11 offline tests and existing backend signup/identity/certificate regressions are preserved. Source branches for protected production and accepted fictional staging are not changed.

## Future decision paths (not executed)

| Option | Prerequisite | Current status |
|---|---|---|
| New Render staging + GCP OIDC | Render **Pro+** workspace, NEW service, NEW Firebase project, independently reviewed single-service WIF IAM policy and an updated Render-managed ADC runtime gate | **NO-GO / entitlement unverified** |
| New Google Cloud Run staging | NEW independent GCP/Firebase project, approved attached service identity, Cloud Run billing/cost review, independent IAM/read-only E2E, dedicated deploy and no live branch change | **NO-GO / unprovisioned** |
| Stay on local Firebase emulators | No real cloud IAM required; supports Phase 10/9/8 offline E2E | **Available in CI; not real cloud E2E** |

No free-tier guarantee is implied for Cloud Run or Firebase. Paid resources, IAM permissions, custom domain or worker creation need explicit budget/owner approval.

## Hard release gates

1. Verify Render workspace plan, service ownership and OIDC availability through independent provider controls. Do not infer from current free service compute plan.
2. Authorize **one new project and one new service** without reusing protected `volunserve-3aa5b`, historical `volunserve-volunteer-staging`, or the existing Render services.
3. Review actual provider issuer, exact new-service subject/audience and real IAM binding on the **new** project only. Prove production/old-staging access denied.
4. Review Auth revocation verification permissions and all Firestore reader capabilities; use only the smallest approved permissions.
5. Implement and test a separate narrowly gated Render-managed `external_account` ADC compatibility path. No static service-account keys.
6. Execute signed-in **real new-cloud** Auth and Firestore read-only canary under operator authorization; review errors/logs/role changes without leaking Volunteer PII.
7. Do not activate any assignment writes, scheduler or live dispatch. Full lifecycle, canonical winner, official SJDM geographic adjacency, scaling, 24/7 monitoring, cancelled-offer notification and rollback remain unresolved.

**Final Phase 15 result: review-ready IAM proposal validation, NOT a cloud identity connection or deployment. PR remains DRAFT, NO-GO.**
