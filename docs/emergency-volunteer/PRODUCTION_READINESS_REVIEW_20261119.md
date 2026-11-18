# VolunServe — Automatic Volunteer Assignment Production Readiness Review
**Date:** 2026-11-19 (Asia/Manila)  
**Decision:** **NO-GO for production activation. GO for isolated, additive integration development and tests.**  
**Scope:** Emergency Reports / Admin approval / Wave 1→2→3 automatic eligible Volunteer offers / Volunteer Accept–Decline / responder locks / location response handoff.  
**Safety boundary:** Review only. No production Firebase, Firestore, Hosting, Render, certificates, donation campaigns, identity data, or existing assignments changed.

## 1. Exact revisions and deployment boundaries audited

| Item | Verified baseline | Meaning |
| --- | --- | --- |
| Production Render backend | `backend-live-protected` / `61baa71355f155bb7f66301be0e5f367d407cf0f` | Running on `volunserve.onrender.com`; no automatic 002 staging route is part of this baseline |
| Isolated staging backend | `feat/emergency-auto-dispatch-server-staging-20261115` / `ea9056afa1154e17478b73b3214b2bb8ddd548cc` | Separate `volunserve-emergency-match-staging-free.onrender.com`; fixed synthetic `STAGING_E2E_002` |
| Staging UI | `feat/staging-gated-admin-volunteer-preview-ui-20261117` / `72cc792d8c4bb9f59623d7743878194950d44c3d` | Staging-specific gated UI; **not** a production feature implementation |
| Production Firebase | `volunserve-3aa5b` in `lib/firebase.ts`, `.firebaserc` | Must not be used by fictional staging fixture provisioning |
| Staging Firebase | `volunserve-volunteer-staging` in test-only adapter and server gate | Isolated synthetic accounts and test offers only |
| Git history | Compared production protected branch against staging backend | **DIVERGED: staging has 273 commits absent from production; production has 29 commits absent from staging.** NEVER merge or deploy the entire staging branch to live. |

The production Render deploy SHA and `backend-live-protected` HEAD were compared and found **identical** at review time. Same for staging Render deploy SHA and staging branch HEAD.

## 2. What the isolated staging evidence actually proves

The recorded fixed-fictional `STAGING_E2E_002` test showed: **3 Wave 1 offers; 1 Volunteer accepted; 2 remaining offers expired; accepted responder lock 1/1; reservation 1/1; original offer notification 1/1; resident acceptance notification 1/1; admin decision audit 1/1; 0 subsequent-wave offers.**

The independent staging wave-stop readout showed `wave_stop_guard_confirmed` and **8 actual completed scheduled runs in that Render server process** with last scheduler result `supported`. Staging Render application logs separately recorded `[staging-002-waves] automatic scheduler completed: supported`. Synthetic GitHub CI included no-write accepted-responder tests.

These are **staging results for one controlled fictional acceptance path**, not proof of:
- 24/7 schedule reliability on Render Free; process-local counters reset after a restart or scale event.
- Unattended Wave 1→2→3 transitions on **actual** production reports, or 100+ eligible user fanout, timeouts, decline, restart and retry behavior in production.
- Authentication/authorization/Firestore rule compatibility across the current live Admin, Basic/Verified Resident and Volunteer roles.
- Production notification delivery, real GPS tracking after response start, or all downstream modules.
- A real dispatch, accepted emergency mission, emergency-service guarantee, or production approval.

**Never import, run, or enable `staging002*` modules, fixture account provisioning, or the fixed `STAGING_E2E_002` code against production Firebase.**

## 3. Production contract and blockers

| Gate | Live evidence / concern | Release criterion |
| --- | --- | --- |
| **P0 — Branch preservation** | Production's 29 unmatched commits include certificate/identity/backend/security updates; staging diverges widely. | Create a **fresh feature branch from the exact protected production commit**. Port only reviewed reusable algorithmic components with tests; do not merge staging wholesale. |
| **P0 — Real case integration** | Live Admin `app/(admin)/admin-cases.tsx` has `reviewVerification` and `assignVolunteerToCase` flows, `disasterCases` and `responseAssignments`. Staging server accepts only one synthetic case. | After an explicit authorized Admin validation, create a real, server-mediated, idempotent offer batch for that verified report. Never assign to an unvalidated/rejected/cancelled report. Preserve existing manual Admin assignment. |
| **P0 — Offer vs. active case semantics** | Live manual assignment sets `activeVolunteerSupportAssignmentId`/Uid when **offering** one volunteer; staged bulk offers treat multiple `offered` records as not yet accepted. | Define one authoritative per-case transition: **many pending offers, at most one accepted responder** (or explicitly revise requirement). Do not make an offer alone look like a confirmed field responder or start GPS. Serialize accepted winner and manual assignments. |
| **P0 — Auth and rules** | Live Firestore rules restrict `responseAssignments` creation to Admin-specific fields; `responderLocks` keys/transitions are strict. Live volunteer Web/Mobile `transitionAssignment` currently uses client Firestore transactions. | Design a **server-enforced automatic-offer path** (with Auth token, approved capability/identity/skills and deadline checks) distinct from legacy/manual client transactions. Emulator-test all roles and rules; do not relax broad production rules. |
| **P0 — Double-assignment concurrency** | Staging uses server-side locks/reservations; live manual path already has responder locks; existing live task transitions do not reference bulk batch state. | Race-test Admin manual offer vs automatic wave, two acceptors, duplicate requests, revoke/disconnect, case close and expiry. Atomic per-case winner, idempotent notifications and no overwritten accepted assignment. |
| **P0 — Reliable scheduler** | Staging uses `setInterval(..., 20000)` on a **free Render web service**. Render can sleep/restart; a process heartbeat is not durable. | Use a durable and monitored job runner/queue with idempotency, retry/restart recovery and alerts, or keep automatic wave escalation disabled until a reliable option is available. Free sleeping web process is NOT the release scheduler. |
| **P0 — Default OFF and rollback** | Test switches are separate staging-only flags. Live release controls for the real engine have not been verified. | Production engine **OFF by default**; explicit Admin/policy authorization before canary; separate queue and kill switch. Rollback disables new offers without deleting already accepted work, historical audit, field reports or GPS data improperly. |
| **P1 — Geographic and identity parity** | Live records can use `reporterBarangay`/emergency barangay; staging planner reads `incidentBarangay`, `emergencyBarangay`, `barangay`. Approval fields also differ by role/account history. | Normalize production case/profile schemas; confirmed **SJDM-only** barangays; Wave 2 only if verified adjacency exists, otherwise skip it. Never guess adjacency/location, treat unknown identity/skills as not eligible pending review. |
| **P1 — Responder lifecycle** | Live Web/Mobile supports accepted→responding→on_site→completed, field reports, resident confirmations and live location. | End-to-end test that automation stops on acceptance; **GPS starts only after explicit start response and permission** and stops on completion/cancel; field reports, notifications, admin map and completion remain intact. |
| **P1 — Fanout limits & indexes** | Staging has **40-offer-per-transaction** and `limit(201)` reads. Production `firestore.indexes.json` contains 5 indexes and no explicit responseAssignments/volunteerApplications composite entry. | Define batching or bounded failure mode for larger cohorts, establish real query requirements and indexes, test denied/missing index conditions and rate limits, and avoid unbounded fanout. |
| **P1 — Security review** | The fictional staging credentials/key exposure previously identified has not been remediated in this review; production is separate. | Rotate/secure staging secrets through the owner **before expanding access**. Never print secrets in logs or commit them; verify production IAM least privilege separately. No secret replacement occurs as part of this review. |
| **P1 — No unrelated changes** | Production `backend/server.js` currently retains `startCommunityCertificateAutoSync`, verified Firebase signup checks, identity checks, donations, community events, certificates. | Before/after immutable release contract checks, live smoke tests, zero unrelated diffs to these modules, and exact Hosting/Render revision verification. |

**High-risk contract mismatch:** Production Firestore's `responseAssignments` Admin create allowlist accepts `caseId,volunteerId,volunteerName,caseTitle,status,createdBy,createdAt,updatedAt`; staged server offers use additional fields such as `offerMode`, `wave`, and `expiresAtMs`. Admin SDK bypasses rules, but **client reads/writes, field validation, and app transitions still require deliberate compatibility review**; do not simply copy staged data into the live collections.

**High-risk event semantics:** Existing manual live Admin offers already increment some assignment metadata and mark a particular volunteer as active before acceptance. A production bulk implementation must not reuse that manual-offer mutation for every candidate or create contradictory active-case pointers.

## 4. Proposed safe production integration sequence (not executed)

1. **Fresh protected-base candidate:** Start from `backend-live-protected` at the currently deployed SHA; keep `main`/live Hosting and protected Render branch unchanged. Cherry-pick/adapt only **side-effect-free** SJDM-wave eligibility logic and its unit tests; exclude staging auth, provisioner, fixed-case routes, URLs and synthetic credentials.
2. **Shared production data contract:** Specify canonical case verification fields, volunteer application approval/identity requirements, skill normalization, 3-wave geography, offer expiry and `one accepted responder` policy. Define compatibility with older manual assignments, currently busy responders, `responderLocks` and post-accept task lifecycle.
3. **Server-controlled APIs and transactions:** New authenticated and role-gated Admin validation trigger, read-only plan/preview and server-side accept/decline actions for automatic offers. Server checks verified production Firebase token; locks and case winner are transactionally enforced. **Manual** task path remains untouched and available.
4. **Durable worker:** Add a monitored, retryable mechanism; if no reliable scheduler budget/infra is available, mark automatic-wave progression **not production ready** and continue using manual dispatch. Never rely on free web `setInterval` for emergency availability.
5. **Separate emulator/sandbox integration:** Run real-schema fixtures and denied-access tests (Admin, resident, verified Resident, Volunteer, suspended/unverified accounts). Test 0/1/many volunteer candidates, parallel accepts, decline/expiry/next waves, automatic vs manual conflict, fatal retry, restart, network failure, duplicate/late events and 40+ fanout.
6. **Protected release candidate:** Add additive UI behind server-controlled **OFF** feature flag on both Web and Android, with per-account/admin rollout. Verify only authorized modules changed. Require explicit human review before any rules/index/Hosting/Render releases.
7. **Canary and production authorization:** First a read-only production eligibility preview without offer writes. Separately authorize limited canary only after all gates, monitoring, customer impact and rollback have owners. **No automatic dispatch until then.**

## 5. Immutable preservation and rollback checklist

- [ ] Capture exact protected production backend commit, Hosting release SHA, Firebase Rules SHA and existing Auth policies before release.
- [ ] Existing emergency case review and manual assignment still work unmodified when the new feature flag is OFF.
- [ ] Existing Resident/Verified Resident/Volunteer logins, ID review, community events, donations, certificate time rules, AutoSync and notifications pass regression.
- [ ] Authorization prevents unauthenticated, unverified, suspended and unrelated roles from dispatching or accepting offers.
- [ ] Automated offers do **not** change active case marker or live GPS until a responder explicitly accepts / starts response, as specified.
- [ ] Server transaction allows only one accepted winner, respects existing manual responders, and cannot rewrite an accepted assignment on retry.
- [ ] Scheduler has durable observability, missed-run alerts and recovery; simulated process restarts cannot miss deadlines or create duplicates.
- [ ] Production dry-run (no writes) and canary results reviewed; incident operators can stop the feature immediately.
- [ ] Rollback command/process disables **future automatic batches and waves** first; preserves accepted tasks, pending safe records and all audit history for authorized resolution, does not delete production data.
- [ ] Subsequent deploy verification confirms existing live revision, and every claimed production change is scoped.

## 6. Sources inspected directly

**Production code (protected branch):**
- [Live Admin verification, manual Volunteer offer and case pointer logic](../../app/(admin)/admin-cases.tsx)
- [Live Volunteer Web task state transitions](../../app/(tabs)/volunteer.web.tsx) and [Mobile transitions](../../app/(tabs)/volunteer.tsx)
- [Live Firestore rules](../../firestore.rules), [indexes](../../firestore.indexes.json), [Firebase config](../../lib/firebase.ts)
- [Protected production Render backend](../../backend/server.js), [backend checks](../../backend/package.json)
- [Existing production signup/certificate boundary CI](../../.github/workflows/validate-render-signup-security-production.yml)

**Staging source and previous test evidence:**
- [PR #607 — staging UI/client integration](https://github.com/calibosofroyarjan-volunserve/VolunServe/pull/607)
- [PR #612 — read-only accepted responder evidence](https://github.com/calibosofroyarjan-volunserve/VolunServe/pull/612)
- [PR #613 — read-only wave-stop verification](https://github.com/calibosofroyarjan-volunserve/VolunServe/pull/613)
- [PR #614 — actual scheduled run heartbeat](https://github.com/calibosofroyarjan-volunserve/VolunServe/pull/614)

**Review limitation:** Connector source inspection, Git history comparison, Render deploy metadata, staging logs and user-confirmed staging checks were reviewed. No production Firebase reads/writes, emulator tests against production settings, Hosting rollout, IAM audit or full live end-to-end tests were conducted in this review. Findings should not be represented as production validation.

**Final recommendation:** Keep current live feature set unchanged. Start an isolated **additive production-base integration PR** after the safety contract is agreed. **NO-GO** for real automatic Emergency Report dispatch until the P0 gates above pass.