# VolunServe — protected production cutover checklist

Status: PREPARED ONLY, no production enforcement yet (Nov 7, 2026).
Target: protect Firebase Hosting deployments from outdated branches without touching Render, Firestore records/rules, Storage, Auth, or working UI.

## A. Existing state confirmed READ-ONLY

- Last confirmed Firebase Hosting revision: e83f4a72c7cb733ff7bb888a6ac19bf3c0f076c4. Recheck both live domains at every deployment; it is a snapshot, not a permanent baseline.
- GitHub default branch: main. GitHub repository is public.
- Render Backend and Identity AI currently have autoDeploy=no but are linked to main for manual deploys. No Render branch or settings changes were made.
- Seven examined legacy Firebase Hosting deployment workflows use historic pinned revisions and some shared repository-level Firebase service account secret names. This is a PARTIAL inventory.
- The source guard and test files exist on safety/live-first-release-guard-20261107. GitHub Actions push workflow execution status is not confirmed via the available connector.
- Proposed protected Hosting workflow is an inert document at docs/deployment-proposals/approved-production-hosting.yml.example. It is NOT registered or enabled.

## B. Safety work to do BEFORE activating any production pipeline

1. Inventory ALL deploy-capable GitHub Actions workflows on all relevant refs and all external/manual Firebase deploy methods. Identify every entry point with access to FIREBASE_SERVICE_ACCOUNT_VOLUNSERVE_3AA5B or FIREBASE_SERVICE_ACCOUNT. Confirm no automatic trigger can deploy a stale source. Inventory Cloud Functions/Rules and Render separately.
2. Confirm who owns the Firebase project, service account IAM and GitHub settings. Record deployment credential scope without printing keys. Prefer dedicated minimal-permission Hosting service account and short-lived credentials where possible.
3. Configure GitHub Settings > Environments > New environment:
   - Name: volunserve-production-hosting
   - Deployment branches: selected branch **release/production-hosting only**.
   - Required reviewers: choose the authorized owner/maintainer. If one person triggers AND approves releases, do not enable "Prevent self-review" without a second authorized approver, or releases may deadlock.
   - Prevent bypassing protection rules if available and approved.
   - Put NEW credential in Environment secrets only: FIREBASE_PRODUCTION_HOSTING_SA.
   - DO NOT paste secrets into chat, PRs, documentation, or Actions logs.
   GitHub environments for public repos support these controls; exact UI/options can vary by plan and repository policies.
4. BEFORE removing existing repository-level secrets, test the new workflow with an isolated controlled release process, verify least-privilege IAM, and record rollback. Then cut over in a planned maintenance window: remove or rotate broadly accessible old credentials; disable/retire conflicting deploy workflows ONLY after confirming no required functionality or admin procedure depends on them.
   - IMPORTANT: putting a new secret in an Environment does NOT protect production while old repository-level Firebase secrets remain usable by legacy workflows.
   - Merely disabling a workflow on main might not disable copies on other branches or external users' credentials.
5. Review/approve the proposed workflow YAML. The workflow configuration can live on default branch as a control plane, but the build must checkout ONLY an exact approved candidate SHA descended from latest verified live Hosting source; require branch HEAD match, full allowlist, staging QA, clean build and pre-release marker checks.
6. Verify the protected environment pauses deploy until authorized review and does not expose its secret to verification jobs or old branches. Test fail-closed with synthetic invalid SHA, wrong branch, stale marker, added backend file, changed rules, renamed/deleted file, and missing secret; none may reach production deploy.
7. Complete relevant authenticated staging acceptance for Resident, Volunteer, Admin and Super Admin: Login/Signup, role menus and notifications, announcements, maps, Volunteer Join/Time In-Out, certificates, emergency tasks, donation SANDBOX, manual identity review if within scope. Automated TS/build tests alone are not enough.
8. Record recovery source and Firebase Hosting release/version; write a tested rollback procedure with required approval (Firebase Hosting rollback affects web assets only, not database record states).
9. Immediately before approved live Hosting deploy recheck BOTH public live release markers, ensure candidate SHA + branch match, run tested artifact verification, and require human production approval. Immediately after deploy confirm exact marker on both domains and role-critical flows.
10. After cutover, test that legacy workflow triggers fail safely due to disabled routes/credentials. Audit logs and notify maintainers if unexpected deploy occurs.

## C. Template architecture (NOT ACTIVE)

- A manual workflow only; no push-to-main auto-deploy.
- Verify job: no production credentials, checks out approved candidate SHA + pinned independent guard; source allowlist, two-domain marker, regression tests/TypeScript/web export, uploads exact built dist artifact.
- Deploy job: references protected environment, cannot run before verified preflight and human reviewer approval; rechecks live immediately before action, downloads exact tested dist, validates project and marker, deploys **Hosting only**.
- Deployment action: FirebaseExtended/action-hosting-deploy@v0 with channelId=live, projectId=volunserve-3aa5b, entryPoint=app.
- Never silently merge newest main commits into live; cherry-pick only reviewed, tested, approved changes.
- Backend and Identity AI need separate release approval and SHA checks. Render autoDeploy off is not a guarantee against accidental manual deployments.

## D. Important limitations and next human action

The available GitHub connector can edit repository files/branches and read some runs; it does NOT expose the GitHub Environments or GitHub Actions secrets/settings management actions needed for protected-environment creation or credential migration. These steps must be completed by an authorized repository owner in GitHub Settings, or through a separate authorized workflow that can operate the GitHub UI. No secrets should be shared here.

Do not promote the proposed workflow or modify live deploy credentials until the checklist is satisfied and the owner expressly approves the cutover.
