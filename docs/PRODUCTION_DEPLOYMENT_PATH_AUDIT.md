# VolunServe production release pathways: preliminary audit
Date: 2026-11-07 (Philippine time)
Status: READ-ONLY FINDINGS + DOCUMENTATION ONLY. INCOMPLETE INVENTORY. NO SETTINGS CHANGED.

## Protection objective

Prevent an old GitHub main or a historic release branch from silently overwriting current working Firebase Hosting, Render Backend, or Identity AI. Every new fix must start from the most recently verified LIVE source and preserve separately approved newer features.

## What was directly inspected

Verified Hosting release marker supplied by user and GitHub SHA lookup:
e83f4a72c7cb733ff7bb888a6ac19bf3c0f076c4.
The release marker is a *last-observed* source reference. Do not hardcode it as current in future deployment without rechecking both public Hosting domains.

Direct Render service settings (read-only, November 7):
- VolunServe backend, srv-daofqomk1f9s73btsg20, rootDir backend, branch main, autoDeploy no, autoDeployTrigger off; last reported live SHA 24cc79d31fc4c498e6c6c0e33c0b063ffbca64f2.
- volunserve-identity-ai, srv-db65olvlot8c738vchjg, rootDir identity-ai, branch main, autoDeploy no, autoDeployTrigger off; last reported live SHA f3e2a46cbf766ed8ff8516b6eadbc8b219b611b1.
A manual Render deploy might still build a different main commit. A controlled service-specific deployment process is required.

## Confirmed files capable of Firebase Hosting deploys

This is a partial list from files checked individually. Do not assume other legacy workflow paths/branches are safe or absent.

| Workflow file | Checked ref | Trigger branch in file | Pinned prior live baseline | Deploy capability |
|---|---|---|---|---|
| .github/workflows/release-automatic-volunteer-certificates-20261106.yml | main | main, on workflow-file push | 6339a61645f831ac5786ca58e30165bf66e421f9 | Firebase Hosting live |
| .github/workflows/release-notification-bell-live-20261106.yml | live commit | release/live-notification-bell-dropdown-20261106 | 4d19663f0469dda55f3ff86b5e1c6843923c7bad | Firebase Hosting live |
| .github/workflows/release-reconciled-admin-live-20261106.yml | live commit | release/reconcile-restored-admin-latest-main-20261106 | dcf0427aeb83f518a98c01985bc7eabafbbb6fab (previous live) | Firebase Hosting live |
| .github/workflows/release-remove-lgu-emergency-live-20261106.yml | live commit | fix/remove-lgu-personnel-emergency-only-20261106 | a5fb8e3bd54cf321bb26cf364ed598a2fe84e055 | Firebase Hosting live |
| .github/workflows/release-volunteer-certificates-from-live-20261106.yml | live commit | release/volunteer-certificates-preserve-live-20261106 | 6339a61645f831ac5786ca58e30165bf66e421f9 | Firebase Hosting live |
| .github/workflows/release-live-announcement-validation-20261106.yml | live commit | hotfix/live-announcement-validation-final-20261106 | e9341c6d0cdf905ee3fc0079d5bbfc5d827ce36c | Firebase Hosting live |
| .github/workflows/release-volunteer-time-buttons-after-emergency-20261106.yml | live commit | hotfix/live-attendance-after-emergency-release-20261106 | 18272c00ee395087f6293552890117011c7dddbc | Firebase Hosting live; workflow_dispatch also exists |

All seven reviewed Hosting workflows use a release-marker comparison and the concurrency group volunserve-production-hosting-release. This helps but is NOT a central authorization guarantee. They also refer to shared FIREBASE_SERVICE_ACCOUNT_VOLUNSERVE_3AA5B or FIREBASE_SERVICE_ACCOUNT repository secrets. A workflow outside this list might be able to access those secrets; current inventory is incomplete.

Another inspected path is .github/workflows/release-firestore-rules-only-safe.yml on main. It contains an authorized manual firestore:rules deployment guarded on main. It is a DIFFERENT production-change category and must be included in the wider credential/permissions inventory. Do not disable it without functional and authorization review.

## New guard prepared on independent branch

Branch safety/live-first-release-guard-20261107 was created directly from exact Hosting commit e83f4a72c7cb733ff7bb888a6ac19bf3c0f076c4.
- scripts/guard-live-hosting-source.cjs — no deployment; exact ancestor, SHA, approved file set, and both current live markers are checked.
- scripts/test-guard-live-hosting-source.cjs — synthetic fail-closed tests only.
- .github/workflows/validate-live-first-release-guard-20261107.yml — no secrets and no deploy.
- docs/LIVE_DEPLOYMENT_POLICY.md — approved intent, not an active enforcement mechanism.

GitHub connector only exposes pull-request-triggered workflow runs for a commit and combined statuses. It returned no corresponding status for the new push workflow; GitHub Actions CI status is therefore UNVERIFIED, not failed and not passed.

## Next required safety work (DO NOT EXECUTE WITHOUT SPECIFIC AUTHORIZATION)

1. Finish inventory of ALL workflows, including older branches, GitHub environments and any external/manual Firebase deploy credentials. Branch names do not prove active permissions.
2. Review which users, secrets, and bots can deploy Firebase Hosting, Firebase Rules/Functions, and Render services. Never print or expose secret values.
3. Prepare a single production approval path with protected GitHub Environment, restricted branches, appropriate approvers, and controlled credentials. Avoid changing active credentials until a verified cutover and rollback plan exists.
4. Verify preflight on real live markers + reviewed candidate SHA, then complete role-specific integration tests in staging; only after approval may a production deploy workflow be activated.
5. Restrict old deployment paths, including manual and automation bypasses. A script alone does not enforce global safety while old secrets remain available elsewhere.
6. Re-verify current live revision immediately before a release and immediately afterwards. Never equate successful HTTP routes with end-to-end functionality.

## Explicit non-actions

No merge, deletion, workflow disablement, secrets edits, Firebase deployment, Firestore writes, Storage writes, or Render deployment was performed as part of this audit.
