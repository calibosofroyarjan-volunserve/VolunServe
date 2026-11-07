# VolunServe — protected production cutover checklist

Status: PREPARED ONLY, no production enforcement yet (Nov 7, 2026).
Target: protect Firebase Hosting deployments from outdated branches without touching Render, Firestore records/rules, Storage, Auth, or working UI.

## A. Existing state confirmed READ-ONLY

- Last confirmed Firebase Hosting revision: e83f4a72c7cb733ff7bb888a6ac19bf3c0f076c4. Recheck both live domains at every deployment; it is a snapshot, not a permanent baseline.
- GitHub default branch: main. GitHub repository is public.
- Render Backend and Identity AI currently have autoDeploy=no but are linked to main for manual deploys. No Render branch or settings changes were made.
- Seven examined legacy Firebase Hosting deployment workflows use historic pinned revisions and some shared repository-level Firebase service account secret names. This is a PARTIAL inventory.
- The source guard and test files exist on safety/live-first-release-guard-20261107. GitHub Actions push workflow execution status is not confirmed via the available connector.
- Proposed keyless protected Hosting workflow is an inert document at docs/deployment-proposals/approved-production-hosting.yml.example. It is NOT registered or enabled.
- Owner screenshots, November 7: GitHub Environment volunserve-production-hosting has a required reviewer and selected release/production-hosting branch restriction (1 matching branch); administrators cannot bypass.
- Owner screenshots, November 7: Google Cloud project 233201250762 has WIF pool volunserve-github-hosting, OIDC provider display name VolunServe GitHub Actions, and connected service account volunserve-protected-hostin@volunserve-3aa5b.iam.gserviceaccount.com (enabled/no keys, Firebase Hosting Admin only). Screenshot confirms connected service account, NOT a real OIDC token exchange. Actual provider ID is volunserve-github-actions, confirmed from edit-provider URL. Saved full CEL condition should still be verified before activation.
- Owner screenshot: legacy repository-level Actions secret FIREBASE_SERVICE_ACCOUNT_VOLUNSERVE_3AA5B remains present; despite this new protection, old workflows may still access it.

- November 7, 2026: OIDC auth-only GitHub run #42375267092 on release/production-hosting commit 67da72ec357114ae47be64031ab21b8b018d012b was approved by the authorized reviewer, and GitHub reports SUCCESS for "Exchange approved GitHub OIDC identity for short-lived Google token" and "Confirm short-lived token exists without displaying token contents". This confirms keyless service-account impersonation in the protected Environment; no Firebase/Render deploy commands were in the workflow. Run URL: https://github.com/calibosofroyarjan-volunserve/VolunServe/actions/runs/42375267092
- Important: This auth success does not validate Firebase Hosting CLI permissions, production artifacts, deployment rollback, or retirement of legacy deploy pathways. The old repository secret continues to exist and still needs an explicit, coordinated cutover.

- November 7, 2026: Firebase Hosting keyless READ-ONLY CLI smoke run #42376533289 on release/production-hosting (read-only test workflow) completed SUCCESS. Protected Environment approval, google-github-actions/auth@v3 and `firebase hosting:sites:list --project volunserve-3aa5b --non-interactive --json` all passed. Actual logs include `PASS: protected keyless identity can READ Firebase Hosting sites.` No Hosting deploy / cloud write commands. Run: https://github.com/calibosofroyarjan-volunserve/VolunServe/actions/runs/42376533289
- Limitation: this confirms LIST/READ only, not Hosting deploy/create-version rights. Logs have non-fatal Node deprecation and gitlink/submodule cleanup warnings. Must validate an isolated staging Hosting channel and release artifact/test checks before protected live cutover. Legacy repository secret and deployment-capable workflows remain active until scheduled verified transition.

- November 7, 2026: Added INERT PREVIEW-ONLY permission-test proposal at docs/deployment-proposals/preview-only-live-clone.yml.example. It clones the CURRENT Firebase Hosting live version to a DIFFERENT fixed public preview channel; NEVER rebuilds from outdated main or changes the live channel. It requires protected GitHub Environment approval but has NOT been registered or run, so preview-write permission remains UNTESTED. Firebase preview URLs use the same production backend/database resources; prevent interactive production data tests until staging isolation exists.
- Important preview deployment safety: verify both live domain release markers immediately before activation; fixed source is `volunserve-3aa5b:live`, fixed destination is `volunserve-3aa5b:vs-oidc-smoke-20261107`. Review plan before ANY cloud writes; preview clone may update that preview channel only. Default preview expiry is 7 days and must be monitored.

## B. Safety work to do BEFORE activating any production pipeline

1. Inventory ALL deploy-capable GitHub Actions workflows on all relevant refs and all external/manual Firebase deploy methods. Identify every entry point with access to FIREBASE_SERVICE_ACCOUNT_VOLUNSERVE_3AA5B or FIREBASE_SERVICE_ACCOUNT. Confirm no automatic trigger can deploy a stale source. Inventory Cloud Functions/Rules and Render separately.
2. Confirm who owns the Firebase project, service account IAM and GitHub settings. Record deployment credential scope without printing keys. Prefer dedicated minimal-permission Hosting service account and short-lived credentials where possible.
3. Configure GitHub Settings > Environments > New environment:
   - Name: volunserve-production-hosting
   - Deployment branches: selected branch **release/production-hosting only**.
   - Required reviewers: choose the authorized owner/maintainer. If one person triggers AND approves releases, do not enable "Prevent self-review" without a second authorized approver, or releases may deadlock.
   - Prevent bypassing protection rules if available and approved.
   - The WIF proposal requires NO JSON service-account key or new environment secret.
   - Confirm WIF provider restrictions for exact repo, branch, protected environment; confirm impersonation binding is restricted to this repo.
   - DO NOT paste secrets into chat, PRs, documentation, or Actions logs.
   GitHub environments for public repos support these controls; exact UI/options can vary by plan and repository policies.
4. BEFORE removing existing repository-level secrets, test the new workflow with an isolated controlled release process, verify least-privilege IAM, and record rollback. Then cut over in a planned maintenance window: remove or rotate broadly accessible old credentials; disable/retire conflicting deploy workflows ONLY after confirming no required functionality or admin procedure depends on them.
   - IMPORTANT: adding WIF and protected GitHub Environment does NOT protect production while old repository-level Firebase secrets remain usable by legacy workflows.
   - Merely disabling a workflow on main might not disable copies on other branches or external users' credentials.
5. Review/approve the proposed workflow YAML. The workflow configuration can live on default branch as a control plane, but the build must checkout ONLY an exact approved candidate SHA descended from latest verified live Hosting source; require branch HEAD match, full allowlist, staging QA, clean build and pre-release marker checks.
6. Verify the protected environment pauses deploy until authorized review. Give id-token:write ONLY to approved deploy job in the protected environment. Independently test a keyless auth-only workflow (NO deploy) for GitHub OIDC claim conditions, workload provider full ID and service-account impersonation. Test fail-closed with invalid SHA, wrong repo/branch/environment, stale marker, backend file, rules changes, renamed/deleted files, and missing permissions; none may deploy.
7. Complete relevant authenticated staging acceptance for Resident, Volunteer, Admin and Super Admin: Login/Signup, role menus and notifications, announcements, maps, Volunteer Join/Time In-Out, certificates, emergency tasks, donation SANDBOX, manual identity review if within scope. Automated TS/build tests alone are not enough.
8. Record recovery source and Firebase Hosting release/version; write a tested rollback procedure with required approval (Firebase Hosting rollback affects web assets only, not database record states).
9. Immediately before approved live Hosting deploy recheck BOTH public live release markers, ensure candidate SHA + branch match, run tested artifact verification, and require human production approval. Immediately after deploy confirm exact marker on both domains and role-critical flows.
10. After cutover, test that legacy workflow triggers fail safely due to disabled routes/credentials. Audit logs and notify maintainers if unexpected deploy occurs.

## C. Template architecture (NOT ACTIVE)

- A manual workflow only; no push-to-main auto-deploy.
- Verify job: no production credentials, checks out approved candidate SHA + pinned independent guard; source allowlist, two-domain marker, regression tests/TypeScript/web export, uploads exact built dist artifact.
- Deploy job: references protected environment, cannot run before verified preflight and human reviewer approval; rechecks live immediately before action, downloads exact tested dist, validates project and marker, deploys **Hosting only**.
- Keyless auth proposal: google-github-actions/auth@v3 with id-token:write, project_id=volunserve-3aa5b, verified provider resource (expected projects/233201250762/locations/global/workloadIdentityPools/volunserve-github-hosting/providers/volunserve-github-actions), and service account volunserve-protected-hostin@volunserve-3aa5b.iam.gserviceaccount.com. Actual provider ID confirmed from Google Cloud provider Edit screen on November 7, 2026.
- Deployment proposal: install exact locked dependencies and use Firebase CLI Application Default Credentials: npx --no-install firebase deploy --only hosting --project volunserve-3aa5b --non-interactive. Practical auth-only tests must confirm restricted IAM role and installed Firebase CLI support WIF/ADC.
- Never silently merge newest main commits into live; cherry-pick only reviewed, tested, approved changes.
- Backend and Identity AI need separate release approval and SHA checks. Render autoDeploy off is not a guarantee against accidental manual deployments.

## D. Important limitations and next human action

The repository owner has manually created GitHub Environment and Google Cloud WIF setup (supported by screenshots). The available GitHub connector can edit repository files/branches and read some runs; it does NOT expose GitHub Environments/secrets management or Google Cloud IAM APIs. Recheck the provider's saved claims and complete no-deploy OIDC auth tests in GitHub Actions before any activation. No private keys should be created or shared here.

Do not promote the proposed workflow or modify live deploy credentials until the checklist is satisfied and the owner expressly approves the cutover.
