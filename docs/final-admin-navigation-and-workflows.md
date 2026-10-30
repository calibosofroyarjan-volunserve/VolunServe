# VolunServe — FINAL Administrative Navigation & Workflow Contract
Last reviewed: 2026-10-30. Source of truth for administrative sidebar names and defense use-case descriptions.

## Terminology — locked

| Term | Meaning |
| --- | --- |
| Super Admin | Programmer/system security role; reviews and authorizes staff, monitors recorded Admin activities and updates, protects system settings. No municipal operational decisions. |
| LGU Staff Applicant | User who has submitted employment information; role `applicant`, status `pending_review`. No Admin access. |
| LGU Admin | Independently verified/promotion-approved city personnel; role `admin`, status `approved`, `adminStatus=active`. Performs community operations and manages residents/volunteers. |
| Resident Identity Reviews | LGU Admin review of **resident** identity cases; NOT a proof of LGU employment. |
| User & Volunteer Approvals | One existing LGU Admin page handling non-staff profiles and volunteer applications. Do not create a second approval page. |
| Admin Activity & Audit Logs | Recorded operational/access actions, actor, target and timestamp. No claim that every action is logged if it is not instrumented. |
| System Records (Read Only) | Programmer technical oversight; not an extra operational workspace or financial payment authority. |
| Command Center | Exactly one LGU operational landing page and overview. |

**Login CTA:** Existing approved text `Request Super Admin Access` navigates to `/admin-request`. It means request **verification by** the Super Admin team. It does **not** grant/apply for the programmer `superadmin` role.

## Super Admin final sidebar order — five destinations, no duplicates

| Order | FINAL visible name | Existing route | What happens inside |
| --- | --- | --- | --- |
| 01 | System Overview | `/(superadmin)` | Live pending LGU requests, active/suspended Admins, recorded Admin activity, system/access updates, shortcuts to review and audit |
| 02 | LGU Staff & Admin Accounts | `/(superadmin)/admin-accounts` | **First:** pending LGU Staff Applications; **Second:** independent identity, office/appointment verification; **Third:** verified promotion with atomic credential review and audit; **Then:** Admin accounts including suspend/reactivate/revoke |
| 03 | Admin Activity & Audit Logs | `/(superadmin)/admin-logs` | Inspect recorded Admin events with actor/time/target; check sensitive actions and incident-specific traceability |
| 04 | System Records (Read Only) | `/(superadmin)/all-records` | Technical read-only inspection of authorized records, never approval or financial release |
| 05 | System Settings | `/(superadmin)/system-settings` | Review authorized technical settings, edit permitted fields, save and check recorded administrative changes |

**Single official onboarding path:** `LGU Staff Application → pending_review → Super Admin independent verification → approved promotion + audit → LGU Admin login → Admin Command Center`. Legacy standalone direct-Admin profile creation is **not** available through the normal interface and is denied by Firestore rules; ordinary Residents cannot be promoted directly. Suspension, reactivation, and revocation remain available for already-approved Admins. Rejection and request-more-information exception handling still require verified implementation; do not claim these buttons exist yet.

**Monitoring:** Super Admin monitors **recorded** operational decisions; does not perform them. A system update in audit logs is not equivalent to uptime, a real deployment, or complete logs of every Admin operation.

## LGU Admin final sidebar order — one Command Center + five groups

| Order | Final visible group and pages | Existing destination(s) | Ordered workflow inside group |
| --- | --- | --- | --- |
| Home | **Command Center** | `/(admin)/command-center` | Triage urgent emergency first, then open each pending workflow, view live operational counts, pending Resident/Volunteer queues, and service analytics |
| 01 | **People & Verification** → Resident Identity Reviews → User & Volunteer Approvals → LGU Personnel → LGU Attendance | `identity-reviews`, `account-approvals`, `lgu-members`, `lgu-attendance` | Resident identity submission → LGU review → verified status; separate volunteer application → eligibility review → approve/reject; manage city-assigned personnel/attendance separately. Never review LGU Admin applicants here |
| 02 | **Emergency & Assistance** → Emergency Reports → Assistance Requests | `admin-cases`, `assistance-requests` | Emergency report → validate GPS/evidence → priority/dispatch → authentic responder tracking → close; separate verified resident assistance request → evidence and fund-target review → authorized LGU review and financial support handled under Donations & Funds. Emergency case responders and volunteer assignments have independent five-record pagination |
| 03 | **Events & Volunteering** → Community Events → Event Attendance → Certificates | `community-events`, `community-attendance`, `certificates` | Resident confirms event venue pin → proposes → LGU approves → volunteers join and perform tasks → self time-in/out → LGU attendance verifies → completion → certificate. Legacy Volunteer Event records remain in Firestore for preservation but the duplicate management route redirects to Event Attendance |
| 04 | **Donations & Funds** → Donation Management | `donor-monitoring` | Verified resident assistance campaign approved → provider donation → status reconciliation → LGU fund review → authorized release (sandbox release must say simulated) → resident acknowledgment → audit. No Super Admin financial action |
| 05 | **Communication & Reports** → Announcements → Disputes | `create-announcement`, `admin-disputes` | Review genuine operational information → publish scoped announcement; open dispute → review evidence → record decision; review actual announcement and dispute records; operational analytics display within Command Center |

**Retired from UI:** The former `/(admin)/relief-operations` destination redirects to Command Center. Historical Firebase data is retained; no Firestore rules, backend permissions, or other role modules are changed by this navigation cleanup.

**Important:** These five groups are an information hierarchy, NOT a rule that emergency handling must wait for an identity or volunteer workflow to complete. Urgent emergencies come first. Within each independent module, the lifecycle is sequential and has exactly one authoritative approval owner.

## UI contract

- Premium VolunServe emerald on dark sidebar, generous white content surface, subtle borders, small metadata, not colorful generic sales cards.
- Every function has one name and one visible route in sidebar; no duplicated Overview, Admin Management or Donations page.
- The active section expands automatically when navigated to; on Command Center, groups start collapsed to prevent clutter.
- One short page heading consistent with sidebar, one subtitle stating responsibility, one primary task, optional low-emphasis secondary actions.
- One workflow indicator where useful, not stacks of decorative cards/gradients/buttons. Counts come from real Firebase records; loading/unavailable ≠ zero.
- No live vehicle motion, evacuation occupancy, releases or locations may be fabricated. Private organizer GPS and donation records remain role-scoped.

## Validation / deployment

- UI/nav contracts and Firestore-emulator rejection of direct Admin creation and Resident promotion; positive pending-staff verified promotion remains passing.
- Existing Role/Auth/GPS/Donation/Event regression suites, `npx tsc --noEmit`, Expo Android JavaScript bundle and web static export.
- GitHub merge does not publish to `volunserve.com`. Hosting and updated Firestore rules must be separately reviewed/deployed and real applicant → review → Admin login must be E2E-tested with authorized test users. Do not reset the original local VS Code workspace.
