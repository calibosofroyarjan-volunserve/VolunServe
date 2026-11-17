# VolunServe — source reconciliation dossier (read-only, no deployment)

**Status: protected production reconciliation BLOCKED until independently reviewed.**

## Verified source anchors

- Last GitHub CI-observed Hosting release marker: `f6139fdae5bce940356a62efc28f8e50935978d6`, Firebase project `volunserve-3aa5b`.
- Current `live-protected` when this audit was prepared: `562ec20b97449116e5f4f6e8bac222f151e8225c`.
- The two source histories are **diverged**. An unreviewed merge, force-push, or automatic publishing from `live-protected` could overwrite live functionality.
- Hosting's public revision marker does **not** prove the compiled website exactly matches every file at that Git SHA. CI re-reads the public marker and fails closed if the pinned revision changed.

## Existing live module preservation

This audit branch is based on the Hosting marker commit and **adds files only**. The read-only CI requires exactly three new files and refuses changes or deletions to any original source. A separate PR #574 already provides an add-only pure matching preview without any Firebase writes, not production activation.

The comparison must preserve all of the following existing areas: Admin Emergency Reports, manual Volunteer assignments, Resident tasks, Volunteer web/mobile tasks, User Auth and identity verification, Community Events and certificates, Donations, Announcements, maps, Firebase Rules, and backend. Do not copy entire staged files over deployed code.

## Already established source incompatibilities

The following original production-marker source files have different Git blobs from `live-protected`. Their functionality MUST be reviewed individually; paths must not be overwritten blindly.

| Component | Marker Git blob prefix | Protected Git blob prefix |
|---|---|---|
| Admin Emergency Reports | `074691c015db` | `7abe1b7ee021` |
| Volunteer Web Tasks | `fdc46c279736` | `1b34304c928c` |
| Volunteer Mobile Tasks | `0321b1323100` | `3e20c90d1904` |
| Firestore Rules | `e169866a98f1` | `b6fa6a308592` |
| Firebase configuration | `a87435f9fea1` | `b13918ddb95b` |
| Backend server | `cfd4a9f784` | `1a9d28d327` |
| Web Login | `edeeea50fe1c` | `f7ecdbf1c85a` |

## Current reviewed changes

- PR #572 — Volunteer responder-lock code for review, based on the *different* protected branch; no live merge.
- PR #573 — separate Firestore Rules authorization review; 13 authenticated emulator assertions passed, but frozen-policy approval gate remains active.
- PR #574 — pure add-only planner and preview from the live-marker baseline; 30 checks passed, NOT production dispatch.

## Safe sequence to operational integration

1. Confirm current published marker in independent CI and verify functional deployed behavior, rather than trusting a marker alone.
2. Inventory source drift path by path. Identify and preserve any production-only features and changes before reconciling a canonical source.
3. Prepare exact narrowly scoped additive hooks (not a mass merge) to connect the staged matching engine to approved Admin Emergency Reports and Volunteer Tasks.
4. Run authenticated Firebase Emulator and web + Android end-to-end regression tests for existing manual assignment, Volunteer accept/decline, response map, notifications and event certificates.
5. Resolve the approved-rules baseline lock and the protected-source/production mismatch through formal review. **Do not weaken or disable safety CI.**
6. Use a reliable, available backend for actual emergency assignment deadlines. Render Free sleeping is not reliable enough for real unattended emergency dispatch.
7. Maintain feature flag OFF until reviewed deployment with rollback and explicit authorization.

No personal records are fetched or sent by this source audit; all verification is through public Hosting marker and repository Git history.

**Never merge/activate while `Verify Protected PR vs Current Hosting` reports mismatch.**
