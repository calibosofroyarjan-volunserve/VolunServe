# Sir Pavia — Super Admin Governance Audit Matrix

**As-of source:** PR #145 draft branch, October 29, 2026. This is an implementation/validation ledger, **not a claim of live production acceptance**.

## Approved authority boundaries

- **Super Admin:** system overview, LGU staff account governance, read-only System Records, Audit Logs, and approved System Settings. It **cannot** dispatch emergency responders, release donations, or grant itself LGU operational powers.
- **LGU Admin:** emergency cases/assignments, Resident/Volunteer review, Community Event approval/attendance and certificates, and **sandbox-only** donation fund release workflow. Sensitive LGU identity intake and production original-ID verification are explicitly **out of scope for this iteration**.
- **Resident/Volunteer:** individual submissions, voluntary attendance, and sandbox release acknowledgment only within their own authorized scope.

## Governance event coverage

| Decision / state transition | Producer | Audit write | Verification |
| --- | --- | --- | --- |
| LGU staff promotion, Admin suspension/reactivation/revocation | `app/(superadmin)/admin-accounts.tsx` | `adminLogs`, atomic with the profile/credential-review mutation | Source + Firestore emulator + protected browser QA |
| Public contact and retention settings | `app/(superadmin)/system-settings.tsx` | `adminLogs`, atomic with settings update | Source + Firestore emulator + protected browser QA |
| LGU volunteer approve/reject | `app/(admin)/account-approvals.tsx` | `adminLogs`, atomic batch with account/application updates | Source + Pavia CI, production acceptance pending |
| LGU resident suspension/reactivation | `app/(admin)/account-approvals.tsx` | `adminLogs`, atomic batch with account update | Source + Pavia CI, production acceptance pending |
| Community Event publish/reject | `app/(admin)/community-events.tsx` | `adminLogs`, in the proposal transaction | Source + emulator append-only audit test, production acceptance pending |
| Community Event start/complete | `app/(admin)/community-attendance.tsx` | `adminLogs`, in the status transaction | Source + emulator append-only audit test, production acceptance pending |
| Volunteer attendance verification | `app/(admin)/community-attendance.tsx` | `adminLogs`, in the attendance transaction | Source + emulator append-only audit test, production acceptance pending |
| Emergency/assistance operational state transitions | `app/(admin)/admin-cases.tsx`, `backend/server.js` | `adminActivityLogs` in existing operational transactions | Existing source/CI coverage, full live workflow pending |
| Sandbox donation release review, authorize/reject, simulated send, resident acknowledgment/dispute | `backend/fundReleaseDemoRoutes.js` | `fundReleaseDemos.audit` plus privacy-minimized `adminActivityLogs`, in same server transaction | Backend reconciliation tests, no real payout |
| Audit feed viewing/filtering | `app/(superadmin)/admin-logs.tsx` | Real-time read-only `adminLogs` + `adminActivityLogs`, search, categories and 5 records/page | Emulator browser QA |

## Integrity protections

1. Both audit collections are append-only under Firestore security rules: authorized actors may create, cannot update or delete. Super Admin can read; unauthorized Resident/Volunteer cannot.
2. Sensitive identity images, full wallet numbers, passwords, and donation amounts are **never** copied into general governance audit entries.
3. Operational and corresponding governance events in the revised client flows commit together. A failed audit write rejects the underlying transaction/batch. Backend sandbox stage events commit with their simulated release state.
4. No placeholder actors or fabricated live Firestore statistics are permitted. Use synthetic records **only** on `demo-volunserve` emulators.

## Still separate from audit implementation

- **Real LGU government ID/selfie/appointment verification:** intentionally postponed by the project owner. Do not enable private evidence production intake just to pass the defense.
- **Production release:** reconcile stacked PR #145 and its unmerged Friday base against `main`; complete exact-SHA CI and authenticated Hosting-only deployment. Do not alter Functions, rules, or Render unless their change is explicitly scheduled and authorized.
- **Live acceptance:** real authorized Resident/LGU Admin/Super Admin sessions and operational Emergency, Assistance, PayMongo sandbox, and Events-to-Certificates workflows must be tested and documented before claiming production end-to-end success.
- **Historical logs:** audit fixes are prospective and **do not fabricate or backfill** old events; a missing historical audit cannot be inferred to have occurred.
