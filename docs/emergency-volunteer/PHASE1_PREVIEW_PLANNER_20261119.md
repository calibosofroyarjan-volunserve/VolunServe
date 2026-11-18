# Automatic Volunteer — Phase 1: Pure Production-Base Preview Planner

**Date:** November 19, 2026  
**Branch base:** Protected production backend commit `61baa71355f155bb7f66301be0e5f367d407cf0f`  
**Release state:** **NOT READY FOR LIVE. DISPATCH DEFAULT OFF.**  
**No effect on actual emergency operations.**

## What this candidate adds

- `backend/emergencyAutoVolunteerReadOnlyPlanner.js`: pure in-process planner. It accepts caller-provided snapshots and returns the selected wave and candidate IDs **without** Firestore reads, writes, authentication, notifications, timers, reservations, response tracking or task assignment. **No production server or UI imports it.**
- `backend/autoVolunteerSJDMBarangays.review.json`: a 62-name SJDM list copied from isolated staging as a provisional allowlist. **Not independently validated as authoritative for real-world dispatch**; requires separate geographic review. Unknown or missing barangays fail closed.
- `backend/test-emergencyAutoVolunteerReadOnlyPlanner.cjs`: isolated tests covering admin validation, strict account/identity/skills, self-report, active manual assignments and responder locks, all eligible within wave, wave 2 only with an explicitly reviewed adjacency map, citywide fallback, duplicate identities, caps, and default-OFF behavior.
- A dedicated **no-deploy PR workflow**. It checks only allowed new files; unrelated runtime modules must be unchanged.

## Hard gates

The preview requires **both** an explicit call to the pure function and caller options:

- `env.VOLUNSERVE_AUTO_VOLUNTEER_PREVIEW === "enabled"`
- `env.VOLUNSERVE_AUTO_VOLUNTEER_DISPATCH !== "enabled"`
- A verified, open case, valid incident barangay, known reporter UID, and no manual/accepted case pointer.
- Complete trusted snapshot scans: Volunteer applications + approved profiles, existing assignments, responder locks. Missing or truncated data aborts; an empty returned list is **not** proof that all eligible Volunteers were checked.
- Up to 200 input records for audited preview and **max 40** candidates per wave. Larger groups fail closed pending a reviewed batching strategy.

Candidate IDs must never be exposed publicly; preview is not an authenticated API and does not create an assignment.

## Current limits and next phase

1. The proposed module does **not** run automatically, hook the live Admin validation handler, or talk to production Firebase. It is a compatibility foundation, **not** production dispatch.
2. Reconcile the case geography fields: `incidentBarangay` / `emergencyBarangay` / `barangay` are accepted; `reporterBarangay` alone is **not** trusted to describe the incident location.
3. Integrate verified production read-only query snapshots behind a server-authenticated, **OFF-by-default** Admin preview path; require complete index-scoped queries and authorization.
4. Separately design atomic competing-offer transitions, one accepted responder, manual-assignment coexistence, reliable scheduling, safe cancellation, notifications, and rollback.
5. Test with emulators and independent security review. No production deploy, Firebase rule modification, or real emergency dispatch is authorized by Phase 1.

**Explicit preservation:** Existing production `backend/server.js`, `firestore.rules`, `app/(admin)/admin-cases.tsx`, Volunteer Web/Mobile screens, signup, identity, donations, events and certificates must stay byte-for-byte untouched by this PR.
