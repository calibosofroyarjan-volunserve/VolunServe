# VolunServe LIVE-FIRST deployment safety policy

STATUS: DRAFT / NO DEPLOY. Prepared November 7, 2026. This policy file and its source guard do not change production GitHub release workflows, Firebase, or Render settings.

## Rule for every future release

LIVE FIRST. BACKUP FIRST. Preserve ALL approved and verified working features. Never use an outdated main branch as a silent deployment source.

The newest commit is not automatically the newest working deployment. Every proposed fix must begin from the CURRENT verified deployed commit for its specific service, then explicitly reconcile tested and approved improvements from other branches.

## Last observed production source (re-check before every release)

- Firebase Hosting: e83f4a72c7cb733ff7bb888a6ac19bf3c0f076c4 (verified via public live marker on November 7, 2026). This is a last-observed revision, NOT a permanent deployment target.
- Render Backend: 24cc79d31fc4c498e6c6c0e33c0b063ffbca64f2 (reported live on November 6).
- Render Identity AI: f3e2a46cbf766ed8ff8516b6eadbc8b219b611b1 (reported live on October 30).

Separate services need SEPARATE verified baselines, tests and approval. A Hosting-only UI fix must not deploy backend or Identity AI.

## Read-only source guard prepared in this branch

Run scripts/guard-live-hosting-source.cjs BEFORE the web build and AGAIN immediately before any owner-approved Hosting release. It requires:
- VOLUNSERVE_APPROVED_LIVE_SHA: exact current Hosting commit (40 lower-case hex characters)
- VOLUNSERVE_APPROVED_CANDIDATE_SHA: exact reviewed candidate commit (40 characters)
- VOLUNSERVE_APPROVED_FILES_JSON: JSON array of EVERY approved changed path.

The guard checks release markers at BOTH volunserve.com and volunserve-3aa5b.web.app. A missing, stale, invalid, or inconsistent marker BLOCKS RELEASE. It also checks the candidate is exactly approved and descends from live; all changed paths are explicitly allowed; no unexpected tracked edits exist; no files are deleted/renamed/copied; and a Hosting-only release does not modify Firebase rules/config, Cloud Functions, Render backend, Identity AI or legacy release workflow paths.

Tests: node --test scripts/test-guard-live-hosting-source.cjs

Passing the guard verifies source consistency ONLY. It does not prove login, payments, notifications, role permissions, ID scanning, buttons, maps, or certificates work end-to-end.

## Tasks REQUIRED before this becomes enforceable for production

1. Inventory and review ALL GitHub Actions jobs that could deploy Firebase Hosting, Firebase Functions/Rules, backend or AI. Legacy workflows on old branches may bypass the new guard.
2. Create a protected GitHub Environment for production releases, with restricted release branches and human approval when available. Move deployment credentials into that environment; remove/rotate old broadly accessible secrets ONLY after a tested migration plan and explicit owner approval.
3. Add a single canonical manual-approved release workflow. It must run unit/emulator/build/role-specific staging tests; read the current live marker; take a rollback reference; run this source guard BEFORE build and immediately BEFORE release; deploy only the approved target; then verify the new live revision and real flows.
4. After evaluating the consequences, retire or disable conflicting legacy deploy workflows and require protected release environment permissions. Do NOT make this change without explicit authorization.
5. For each UI fix, preserve the verified live source and compare all changed paths. Never auto-merge every newest main commit. Do not claim a 100% bug-free deployment after static tests alone.
6. For backend and AI use service-specific release safeguards, deployment SHA checks and independent approval; never reuse frontend-only rules for their deployment.
7. No production release, deletion, force push, secrets rotation, rules/function change or irreversible Firestore/Storage modification without direct owner approval.

## Current caveat

This is a prepared fail-closed script plus a synthetic no-deploy CI test. It is NOT YET wired to the production deploy path. The original production workflows and broadly configured credentials (if any) remain unchanged. A release cannot be called globally protected until all bypass routes have been audited and restricted.
