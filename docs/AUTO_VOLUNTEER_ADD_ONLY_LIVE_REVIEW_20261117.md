# VolunServe — Add-only Automatic Volunteer Matching review candidate

**Status: isolated read-only preview. Not a production deployment.**
**Source:** last independently CI-verified Hosting marker `f6139fdae5bce940356a62efc28f8e50935978d6`.

## Non-negotiable compatibility promise

This branch adds new files **only**. The existing production-source blobs for Admin Emergency Reports, Volunteer Tasks, Certificates, Announcements, Donations, login, identity, Firebase, backend server, Firestore rules, and deployment configuration remain byte-for-byte unchanged relative to that base commit.

- No file deletions, existing-file rewrites or renames.
- No deployment, Firebase Admin credentials, Firestore writes, or notification sends.
- No import into the production backend or live UI. Production remains disabled.
- Never run an emergency response workflow through a sleeping Free Render process.

The preview planner is a straight copy of the tested staging wave planner from the staging feature branch, placed in `backend/additiveEmergencyMatching/planner.cjs`; all reads/writes to actual Firebase would require a **new, separately reviewed integration and security permission release**.

## Additive capabilities prepared

- Pure, deterministic Wave 1 same-barangay / Wave 2 verified adjacency / Wave 3 citywide preview.
- Checks incident validation, volunteer approval and identity verification, skill matching, self-report, busy volunteers and SJDM scope.
- Critical/high severity is marked as requiring official emergency escalation. Volunteer matching is never a substitute for an official emergency hotline.
- Feature gate disabled by default; the only explicit enabled test configuration requires the isolated `volunserve-volunteer-staging` project and never production `volunserve-3aa5b`.
- Regression suite fails when **any existing live source file** is changed or deleted.

## What is NOT completed by this branch

This package **does not automatically assign any real volunteers**. It intentionally has no production registration hook and is not yet visible on `volunserve.com`. Staging previously demonstrated offer + acceptance, but production needs independently validated authenticated integration and stable availability.

## Safe release sequence

1. Re-verify live release marker immediately before any promotion.
2. Reconcile divergent `live-protected` versus the actual deployed source; do not mass-merge or overwrite functional application code.
3. Approve and emulator-test the security rules proposal in draft PR #573, then review web/Android compatibility in draft PR #572.
4. Create a separate small, **reviewed** integration hook that preserves every existing module; test old manual assignment, Accept/Decline, notifications, Events, Certificates and login, including real-device tests.
5. Use an always-available, audited backend for time-sensitive real cases; Free Render sleeping is unsuitable for unattended emergency matching.
6. Back up approved state, use feature flag OFF by default, inspect a staging release, and require an explicit deployment approval with rollback.

**Do not merge this branch into protected live** until the divergent-history release guard is resolved.
