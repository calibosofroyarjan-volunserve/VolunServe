# VolunServe live-first production deployment contract

This branch `live-protected` was created from the **actual Firebase Hosting frontend commit**
`e83f4a72c7cb733ff7bb888a6ac19bf3c0f076c4`, confirmed by the public
`https://volunserve.com/volunserve-release.json` marker.

## Strict rule
**Do not deploy the outdated `main` branch.** App fixes must be derived from
the latest verified live frontend revision. Render backend is a separate service
with its own deployed source; Firebase Hosting releases NEVER deploy backend,
Firestore rules/indexes, functions, or identity AI.

## Safe procedure
1. Inspect `volunserve.com/volunserve-release.json`. Record the exact 40-char `revision`.
2. Only apply a narrowly approved app/UI fix onto `live-protected`, which must
   **descend from the current live revision**. Do not merge outdated `main` wholesale.
3. Validate changes; use `verify-live-protected-source.yml` (NO DEPLOY).
4. When an actual release is authorized, invoke `release-live-protected-hosting.yml`
   manually from **live-protected**. Supply `expected_live_sha` and exact `approved_files`
   as JSON, including only app-level changed paths. Its gate checks live again
   immediately before publishing. Changes to Firebase config, Firestore, backend,
   workflow policies, or deletions are blocked.
5. Confirm the new production revision marker equals deployed commit.

## Required one-time owner-only GitHub settings — before ANY production release
1. GitHub Settings > Branches: protect `live-protected` (PR before merging;
   do not allow force-pushes or deletion; do not bypass).
2. Settings > General > Default branch: select **live-protected** instead of
   outdated `main`. Do this only after verifying frozen workflows here.
3. Settings > Environments: create **production**, set selected branch policy
   to only `live-protected`. Configure required reviewers if feasible.
4. Place a newly generated, least-privileged Firebase Hosting deployment service
   account JSON in that **environment only**, secret name
   `VOLUNSERVE_PRODUCTION_HOSTING_SERVICE_ACCOUNT`. Do not create a
   repository-level secret with that name. Do not paste credentials into chat.
5. Remove/rotate the existing repository-level
   `FIREBASE_SERVICE_ACCOUNT_VOLUNSERVE_3AA5B` after confirming the environment
   secret is prepared. Historical branch workflows cannot be fully contained by
   editing this branch alone while they have access to that old repo secret.
6. Render production auto deploy must remain OFF. Deploy Render backend only
   from its verified live commit using a separate reviewed process.

Until steps 1–5 are completed, do not attempt to release. The manual workflow
is deliberately missing credentials and fails closed. All 16 historical
release/index workflows are frozen on this branch; existing branches may retain
old copies, which is why secret removal is essential.

**Rollback:** Do not reset or overwrite live blindly. First independently
verify current production revision, compare approved differences, and choose
a known-good commit with its complete feature history.
