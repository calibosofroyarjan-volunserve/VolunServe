# VolunServe — Final Super Admin and LGU Admin Scope (Final Defense)

Status: **approved architecture and code-alignment checklist**. A listed screen means an existing application route; it does not imply that production deployment or user end-to-end acceptance has passed. Keep financial operations with LGU Admin only.

## 1. Authority boundary

| Role | Owner | Purpose | Forbidden |
|---|---|---|---|
| Super Admin (`superadmin`) | VolunServe programmer/system maintainers | Verify and grant LGU Admin access, manage administrative credentials, technical system settings, restricted read-only record oversight, privileged audit review | Approve donations/releases, dispatch responders, declare evacuation centers active, approve community events, certify attendance as LGU operator |
| LGU Admin (`admin`) | Independently verified LGU employees | Municipal operations, resident/volunteer identity and participation approvals, emergency cases, evacuation-center records, community event scheduling, donation/assistance approvals, announcements, reporting | Grant own Admin/Super Admin role, verify/promote LGU Admin applicants, change system security permissions |
| LGU Applicant (`applicant`) | Staff account requesting authorization | Submit email/password and basic employer/appointment information; inspect own application state | Any community, volunteer, financial or administrative operations until verified and promoted |
| Resident/Verified Resident, Volunteer, Guest | Community participants | Scoped community activities and approved volunteer work | All programmer or LGU administrative operations |

**Super Admin is not an "everything" role:** being a system owner should not bypass LGU operational segregation. Super Admin receives only limited technical visibility to permitted records, not privileged municipal payment controls.

## 2. Login and LGU personnel lifecycle

- `/login` — Resident authentication. Google OAuth belongs to residents, **not** privileged staff.
- `/admin-login` — one shared administrative **email/password** entry for active Admin and Super Admin; redirect **by verified role**, not by which tab was pressed. Current user-requested button text: **Request Super Admin Access**; it routes to a **staff application**, not to Super Admin-role enrollment.
- `/admin-request` — public staff-information application with separate Auth account. Requires name, work email, selected SJDM barangay, office/department, position, non-sensitive appointment reference and a strong password. A successful submission creates `role=applicant`, `status=pending_review`, `residentAccess=false`, `volunteerAccess=false`.
- `/(superadmin)/admin-accounts` — programmer independently checks applicant identity **and** legitimate LGU employment/appointment against the appropriate issuing office, without blindly trusting self-entered text or resident AI verification. Staff documents must not be uploaded to public user records. Reviewer records the reference, verification method, actor and timestamp.
- Only when all checks pass: the authorized Super Admin commits a **fresh credential-review record plus role change and audit record atomically**. Target becomes `role=admin`, `status=approved`, `adminStatus=active`. Never assign `superadmin` to an applicant through this flow.
- When verification is incomplete or negative: keep account unprivileged. A formal reject/return-for-more-information workflow must be implemented and emulator-tested before claiming full exception handling. No silent auto-approval.
- Suspended Admin: retain own login/account identity but **no operational reads/writes**. UI guard and Firestore rules both enforce suspension. Reactivation must be independently performed by authorized Super Admin and recorded.
- Admin logs into `/(admin)/command-center`, Super Admin into `/(superadmin)`. Both can sign out using their respective menus.

## 3. Final Super Admin information architecture

These are **existing routes**, not additional demo pages:

1. **System Overview** — `/(superadmin)`: actual Firebase user/account totals, pending staff applications, active/suspended LGU Admins, read-only service-count telemetry, data-fetch error states. No invented live metrics.
2. **LGU Verification & Accounts** — `/(superadmin)/admin-accounts`: applicant queue and credential review, verified Admin provisioning, suspension, reactivation and access revocation; each action is permission-controlled and audited.
3. **System Records · Read Only** — `/(superadmin)/all-records`: technical incident/account/event record monitoring only, where explicitly authorized. No payment receipts, donor financial records or transactional donation controls. Financial modules are not linked.
4. **Security & Audit Logs** — `/(superadmin)/admin-logs`: immutable record of actor, target, action, timestamp and review reference. No unaudited success state.
5. **System Settings** — `/(superadmin)/system-settings`: sanctioned configuration, official contact/hotline settings and technical controls; operational LGU case decision-making does not belong here.

**UI:** fixed emerald navigation on desktop, compact drawer on smaller screens, consistent active-state indicator, no duplicated operational sidebar. Use a single hierarchy and keep system-health charts subordinate to access-governance tasks.

## 4. Final LGU Admin information architecture

Existing routes stay intact and are grouped into one clear workspace:

- **Command Center** — `/(admin)/command-center`: live operational snapshot, pending actions and task links, including LGU-verified evacuation center records. No unrelated technical account provisioning.
- **Emergency & Assistance**
  - `/(admin)/admin-cases`: triage resident emergency reports, assess evidence/locations, dispatch authorized responders and track authentic GPS events only.
  - `/(admin)/assistance-requests`: review resident aid requests/evidence, approve or deny appropriately; keep distinct from emergency incidents.
- **People & Verification**
  - `/(admin)/identity-reviews`: resident AI-assisted verification with human decision gates where required; identity validation is not LGU employment validation.
  - `/(admin)/account-approvals`: approve or deny volunteer applications using defined qualifications.
  - `/(admin)/lgu-members`, `/(admin)/lgu-attendance`: assigned LGU personnel and attendance. These are operational personnel, NOT system Super Admin accounts.
- **Events & Volunteering**
  - `/(admin)/admin-events`: existing volunteer event/training workflow, distinct from resident-proposed Community Events.
  - `/(admin)/community-events`: review resident-proposed events, verify confirmed venue GPS pin and schedule, publish or reject, then manage real event state.
  - `/(admin)/community-attendance`: confirm volunteer self-check-in/out and prevent duplicates.
  - `/(admin)/certificates`: event-completion and verified-attendance certificates; technical Cloud Function maintenance remains with programmers.
- **Donations & Funds** — `/(admin)/donor-monitoring`: single LGU donation dashboard for approved assistance campaigns, transactions, provider statuses, alerts, and authorized fund reconciliation/release. PayMongo Sandbox payments never imply actual funds transferred; show truthful status and maintain receipts/audit.
- **Communication & Reports**
  - `/(admin)/create-announcement`: authorized scoped alerts and official updates.
  - `/(admin)/admin-analytics`: derived truthful operational reports.
  - `/(admin)/admin-disputes`: review/respond to case disputes with permission checks and immutable audit evidence.
- **My Profile** — existing profile link outside grouped operational menu; **Sign Out** in sidebar footer.

**UI:** role identity says *LGU Administration*, one Command Center, five organized collapsible module groups, no second donations page, no redundant overview cards, responsive accessible labels and active navigation, restrained evergreen/emerald-white theme.

## 4A. Final Xacton-inspired role-specific dashboard presentation (October 27)

The reference image is used for layout hierarchy, **not** literal financial or imaginary sales charts. Both roles keep the existing dark emerald navigational shell, restrained white cards, accessible current-state labels, and native responsive layout.

**Programmer Super Admin System Overview:**
- Four live Firestore KPI tiles: pending LGU staff applications (\`applicant/pending_review\`), approved active LGU Admins, suspended Admins, and registered accounts. Placeholder/loading and permission-denied states must never masquerade as zero.
- Real source-comparison chart: accounts, emergency reports, assistance requests, and community events. These are read-only **record counts**, not daily growth or uptime.
- Recent LGU Admin activity from \`adminLogs\` and \`adminActivityLogs\`, restricted to actors currently marked LGU Admin. Actor, action, description and real timestamp appear only when recorded. The complete audit list remains at \`/(superadmin)/admin-logs\`.
- System/access changes from recorded administrative audit events, including credential administration or settings updates. This is **not** a GitHub deployment or system-uptime monitor; unavailable records are labeled, never invented.
- Access to verification, audit and system settings remains linked to existing routes. Operational LGU-only payment and response controls remain absent.

**LGU Admin Command Center:**
- Xacton-inspired KPI row uses current incident reports, non-staff pending user profiles, pending volunteer applications and only independently verified active evacuation centers.
- Distinct workflow targets for account review (\`/(admin)/account-approvals\`), Render-based AI identity verification (\`/(admin)/identity-reviews\`), emergencies (\`/(admin)/admin-cases\`), volunteer approvals and relief. AI identity review count is not invented using generic pending-user counts.
- LGU personnel applicants (\`role=applicant\`) are excluded from Resident/Volunteer approval queue; only the programmer Super Admin can inspect and promote them.
- Existing workload chart, real capacity data and expanded evacuation-center management remain, without creating new dashboard pages or duplicating service modules.
- No speculative responder activity, payment balance, maps availability, trendline or live-vehicle movement is shown.

**Limitations and launch gates:** the Super Admin feed includes only actions successfully written to admin audit collections and may not capture every Admin operation; coverage must be tested for sensitive workflows before claiming complete monitoring. Emulator/TypeScript/build checks are not a substitute for authenticated production end-to-end tests. The dashboard visual revision requires a separate Hosting deployment; changed Firestore permissions from other merged PRs must be deployed and verified explicitly.

## 5. End-to-end workflows and owner

### LGU staff verification (Super Admin owns)
`Apply → pending_review → independent identity & employer authorization check → promote as admin (atomic review+log) OR remain pending/reject → admin email/password sign-in`. Never promote based only on self-entered data. Suspend/restore on separate audited action. Firestore must deny suspended LGU Admin operational reads.

### Resident identity (LGU Admin owns)
`Basic Resident → AI face/ID submission → Pending identity review → LGU Admin decision → Verified Resident`. Verification is necessary for assistance/selected privileges but does not create LGU Admin access.

### Emergency Response (LGU Admin owns)
`Resident reports authentic coordinates and evidence → LGU Admin validates and prioritizes → selects ambulance/fire/rescue/service vehicle when authorized → dispatch assignment → actual responder GPS & operational status updates → resolved with official audit`. Never fabricate vehicle movement, location, available responders or arrival times. Verified evacuation centers must be displayed inside Emergency Report/Response context, with optional route guidance to real mapped pins and explicit operational status.

### Assistance and donations (LGU Admin owns)
`Verified Resident requests aid with evidence and justified target → LGU Admin reviews → approved campaign → donors contribute through authorized provider/Sandbox → payment confirmation → LGU Admin financial verification → reviewed fund release (demo transfer explicitly marked simulated) → resident acknowledgement → immutable audit`. Super Admin cannot financially approve.

### Community Events (LGU Admin owns)
`Verified Resident proposes location/barangay/venue with confirmed map pin, date/time → LGU Admin verifies the real GPS destination and proposed schedule → Admin approves/publishes → volunteers join according to qualifications → volunteer self time-in/out → LGU Admin verifies attendance → event completes → verified certificates`. Road routes are on-demand navigation to **actual event venue coordinates**, not the proposer's live GPS. Programmer Super Admin cannot approve/publish/start/complete operational events.

### Reports and communication (LGU Admin owns)
`Operational records → scoped announcements or analytics → review/dispute resolution → recorded outcomes`. Sensitive contact and personal data obey the minimum-necessary principle.

## 6. Security / completion criteria

1. Resident or applicant cannot access either administrative route.
2. LGU Admin cannot read/write programmer-only credential reviews or promote accounts.
3. Super Admin cannot process donation payments, fund release, or LGU event lifecycle.
4. Suspended Admin cannot read another account or operational records despite retaining an authenticated Firebase session.
5. Fresh independent LGU review must accompany each promotion atomically.
6. Role-check source tests + Firebase emulator tests + `npx tsc --noEmit` + Expo Android JS bundle + web production export must pass.
7. Production is **not verified** until deployed `volunserve-release.json` matches the merged GitHub SHA, correct Firestore rules are deployed separately, and authorized end-to-end role flows work.
8. Do not reset, delete or overwrite uncommitted local VS Code files; sync via isolated clean worktree.

The same workflow must appear in the capstone manuscript, role use-case diagram, DFD/sequence flows and defense scripts. Build verification is not the same as a real municipality's eligibility confirmation.
