# VolunServe — Phase 2: Secure Admin Read-Only Volunteer Preview (UNMOUNTED)

**Reviewed:** November 19, 2026 (Asia/Manila)  
**Branch:** `feat/auto-volunteer-phase2-admin-preview-review-20261119`  
**Base:** Phase 1 review branch, itself based on protected production commit `61baa713`.  
**State:** **DRAFT ONLY / NO LIVE DEPLOY / NO PRODUCTION DATA ACCESS PERFORMED.**

## Why this phase

Phase 1 implemented a pure SJDM three-wave matching planner with **no write methods**. Phase 2 adds only an unmounted, authenticated Express route factory and a read-only Firestore source adapter reflecting the present VolunServe collections:

- `disasterCases/{caseId}` — real Admin-validated incident; **incidentBarangay**, `emergencyBarangay`, or `barangay`, never inferred solely from Resident `reporterBarangay`
- `volunteerApplications` — bounded full scan; compare status case-insensitively to `approved`, then read canonical `users/{uid}` for each approved application
- `responseAssignments` — bounded full scan (including active, old, declined and unknown statuses) for previous attempts / busy users and existing manual task conflicts
- `responderLocks` — bounded full scan for any already-reserved responders

**Hard limit:** at most 200 documents in each collection (read limit 201 to detect truncation), with max 40 preview candidates in any wave. **Exceeding limits blocks the preview**, never silently treats a partial scan as the full eligible pool. This is a conservative review-only limit; production requires pagination/query-design/index review before real use.

All reads are best-effort **nontransactional snapshots**; even a successful preview could be stale immediately and is not authorization to dispatch. This is intentional, not a final production implementation.

## Auth and privacy contracts

`registerAutoVolunteerAdminReadOnlyPreview(app, {db, requireFirebaseUser, requireOperationalAdmin, env})` takes the **existing live backend middleware** as mandatory injected dependencies. When explicitly registered in a separately reviewed future integration:

1. `requireFirebaseUser` verifies the **unrevoked Firebase ID token**, verified email and completed profile (see existing `backend/server.js`).
2. `requireOperationalAdmin` checks persisted `users/{uid}` for **approved Admin** role and not suspended.
3. Route repeats the persisted profile approval check, requires the exact feature flag `VOLUNSERVE_AUTO_VOLUNTEER_PREVIEW=enabled`, and refuses preview when dispatch is enabled.
4. It validates the Firestore document ID and accepts **no client-supplied roster, adjacency or identity field**. Neighbor-wave configuration stays disabled pending explicit independent review.
5. The only response fields are aggregated wave number, eligible count, approval/source counts, exclusion codes and diagnostic status. **Candidate IDs, names, emails, GPS and case details never appear in the HTTP JSON.**
6. The response sets `Cache-Control: no-store, private`, and exceptions return generic codes, not raw Firestore errors.

**Important:** This route is currently **NOT mounted**. No import was added to live `backend/server.js`. No environment variables have been changed on production Render. These new modules do nothing in running production.

## Controlled route for a FUTURE separately approved release

`GET /api/admin/emergency-auto/preview/:caseId`

This route must be mounted only after Phase 2 source review, production Firebase emulator testing and explicit deployment authorization. An authenticated account alone is insufficient: approved operational Admin role is mandatory. Preview returns **aggregate-only** output with `readOnly:true` and `dispatchEnabled:false`, not a task offer or a real assignment.

## Known risks / blockers

- **Geography:** The 62-name SJDM allowlist inherited from staging remains **provisional** until geographic authority review. Any unknown barangay fails closed.
- **Data model differences:** Older volunteer applications may use various status/identity fields. The reader follows canonical users records and deliberately refuses to assume missing account approval/identity. This could exclude legitimate legacy candidates until migration policy is independently reviewed.
- **Query scalability:** Global 201-document bounded reads may fail once there are more than 200 applications, assignments or locks. Use reviewed index-supported pagination with proven complete snapshots or bounded case-specific queries in a subsequent phase; do not increase cap blindly.
- **Consistency:** No Firestore transaction encloses the preview reads. Real dispatch must revalidate case, volunteer approval, active assignments and responder lock inside a **server-authorized atomic transaction**.
- **Middleware provenance:** The route factory is only safe if future mounting uses the **real existing production** `requireFirebaseUser` and `requireOperationalAdmin` functions in the correct order. Test doubles in CI do not prove live Firebase authorization.
- **Security and privacy:** Review logs, CORS, response caching, request rate limits, least-privilege IAM and Firebase emulator rules before mounting. Do not return candidate UIDs to an Admin browser unless there is a documented need with correct privacy controls.
- **No background job:** This phase adds no timers or dispatch functions. The production durable scheduler, single responder-winner transitions, manual Admin coexistence and rollback still require separate implementation/review.

## Preserved by this stacked PR

**No changes** to live `backend/server.js`, `backend/adminAccess.js`, `functions/index.js`, Firestore rules, Auth, Admin Emergency Reports UI, Volunteer Web/Mobile, identity verification, donations, community events, or certificate issuance/auto-sync.

Tests are mocked **without production Firebase credentials**. The dedicated workflow runs syntax, new endpoint/loader privacy and role tests, Phase 1 planner tests and existing backend regression tests, with a strict five-file Phase 2 allowlist relative to the Phase 1 branch.

**Decision:** Phase 2 code review candidate prepared, **NOT production ready**. Do not merge into `backend-live-protected` or deploy until the later integration/release review is explicitly approved.
