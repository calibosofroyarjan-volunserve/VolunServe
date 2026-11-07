# VolunServe — live-first code reconciliation and protected-release hold

Date: 2026-11-07, Asia/Manila
Status: **READ-ONLY COMPARISON AND NON-EXECUTABLE DOCUMENTATION. NOT A RELEASE APPROVAL.**
Repository: `calibosofroyarjan-volunserve/VolunServe`

## Independent deployed source

- Confirmed current Firebase Hosting source marker from the GitHub Actions public GET-only verification #42378344467:
  `e83f4a72c7cb733ff7bb888a6ac19bf3c0f076c4`.
  Both `https://volunserve.com` and `https://volunserve-3aa5b.web.app` reported this exact revision, and the preview also matched.
- Preview channel `vs-oidc-smoke-20261107` served a clone of **CURRENT live Hosting**, not any new proposed UI. Its content check passed but its earlier cloning workflow ended red because of a subsequent list command requiring `firebase.json`. The clone step itself succeeded. Do not re-run cloning to fix verification.
- The preview shares production Firebase services, and the clone step warned that its domain was not auto-added to Firebase Auth authorized domains. Do not test live-account sign-in, donations, reporting, or data writes there.

## Current branches are NOT interchangeable

| Component | Verified source/reference | Comparison and risk |
|---|---|---|
| Live Hosting baseline | `e83f4a72c7cb733ff7bb888a6ac19bf3c0f076c4` | Deployed code to preserve |
| Protected release branch `release/production-hosting` | Verified via GitHub compare | 5 commits ahead, 0 behind exact live baseline; only 4 added GitHub test/preview workflow paths, **no application edits** |
| `main` | `cad593b6e0ab608060ae201ee199c22197d1a962` at audit | Diverged from live: 4 commits ahead and 12 behind; **unsafe** to deploy or merge as if it were a superset of live |
| Main-only certificate work | `backend/communityCertificateAutoSync.js`, `backend/server.js`, backend test and certificate workflow changes | Potentially useful new backend behavior; keep as separate backend/service review. Do not include in Hosting-only cutover or discard without analysis |
| UI draft PR #271 | `design/live-verified-ui-20261107` head `17297a7f2d59910cb7c495def6779c0e1c2bbbec` | Based on exact live revision, design proposal only, NOT deployed |
| UI draft PR #276 | `design/four-role-web-mobile-finish-20261107` head `8a712d03a82e5f0af31b25fb11cc569cee2b2f14` | Four-role responsive review branch derived from staging |
| UI draft PR #277 | `design/web-mobile-unified-roles-20261107` head `2ba9a71cf92dc03926a62c81af961ca6130d9ede` | Newer four-role real UI work; derived from staging and **not production-ready** |
| PR #276 vs PR #277 | GitHub compare: diverged, 28 ahead / 30 behind when comparing #276 → #277 | Sibling UI changes, **not** guaranteed to include each other's updates. 21 differing paths including Admin/Super Admin/Resident module screens and sample design-review route. Do not auto-pick the newest PR |
| PR #277 vs exact live | Ahead 125 / behind 0 | Includes 85 changed paths: UI, auth/staging-specific source, new test workflows and staging backend shell. A direct production merge is out of scope |

Data are current only at the moment of the comparison; re-query exact branch heads before any approval.

## Production release blockers (must be resolved in order)

1. **Freeze source identity.** Read both live domain markers again, get their full SHA and current Firebase Hosting version ID, and confirm no independent production deploy happened. The last verified SHA must not be blindly reused if live changes.
2. **Reconcile branches without dropping functionality.** Create a NEW review candidate based on the exact latest live source (not `main` and not old cache), apply explicitly selected and reviewed changes from PR #276/#277. Compare sibling branch differences path by path. Preserve live announcement dropdown, community events, donation progress, emergency flow, volunteer join/attendance/certificates and logout/session behaviors. Keep main-only certificate auto-sync on a separate backend release track until tested.
3. **Protect staging/data.** PR #277's public four-role design review uses sample data. A real authenticated production-like test needs a **separate Firebase project**, separate test accounts, and a nonproduction API/payment sandbox. Do not validate writes against the production-linked Hosting clone.
4. **Technical gate.** Require a full reviewed changed-path manifest and exact live-base ancestry. Run impacted source contracts, TypeScript, Expo Web export, browser checks (desktop and narrow mobile), and actual role-based end-to-end tests on isolated staging. Check that the staging-only Firebase switch does not produce unsafe production behavior.
5. **Review deploy workflow itself.** The keyless OIDC and Hosting READ smoke tests succeeded. Preview-WRITE succeeded to a non-live channel. This does **not** prove that the still-INERT production release proposal is correct or that user flows are bug-free. Ensure the protected candidate build includes the expected `firebase.json` and `dist`, handles known VolunServe submodule/gitlink checkout issue, checks live markers again immediately before publish, and has a tested rollback.
6. **Single approved path & credential cutover.** GitHub Environment `volunserve-production-hosting` and Google WIF provider are correctly restricted and tested; HOWEVER legacy repository-level Firebase service-account secret and old deploy-capable workflows still exist. Audit every historical workflow, manual/developer Firebase CLI credential, service account, Firebase Rules/Functions path, and Render manual deployment. After verifying replacement and recovery, restrict/revoke legacy credentials in one authorized operation so old branches cannot bypass the approval gate. Do not revoke early.
7. **One-time final approval.** Only after source, isolated QA, workflow, and credential gates pass: present exact candidate SHA, changed file list, current live SHA/version, expected behavior, rollback ID and go/no-go decision to the owner. NO production deployment without explicit owner approval.
8. **Post-release.** Verify both live markers and key role flows, audit logs, Firebase Hosting version, and rollback readiness. A green GitHub Actions badge alone does not prove full application behavior.

## Explicit decisions and non-actions

- **No merge of main or PRs, no new branch promoting UI, no live deploy, no Firestore or Auth writes, no Render deploy.**
- **No deletion/disablement/revocation of old secrets or workflows yet**, because the safe cutover is incomplete.
- **No claims that newer UI branches are deployed**; green generic PR CI jobs are not a substitute for full authenticated functional staging testing.
- **Keyless Hosting preview test is distinct from production release.** The approved cloning test created a temporary preview using production project Hosting resources, not a new UI deployment.

Links:
- Protected release source: https://github.com/calibosofroyarjan-volunserve/VolunServe/tree/release/production-hosting
- PR #276: https://github.com/calibosofroyarjan-volunserve/VolunServe/pull/276
- PR #277: https://github.com/calibosofroyarjan-volunserve/VolunServe/pull/277
- Successful read-only preview verification: https://github.com/calibosofroyarjan-volunserve/VolunServe/actions/runs/42378344467
- Keyless OIDC test: https://github.com/calibosofroyarjan-volunserve/VolunServe/actions/runs/42375267092
- Keyless Firebase Hosting read-only test: https://github.com/calibosofroyarjan-volunserve/VolunServe/actions/runs/42376533289
