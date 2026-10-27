# VolunServe LGU Admin — Residents and Volunteers workspace contract

## Goal
One LGU Admin account with two clearly separate workspaces and notification views. Do **not** create new Admin login roles or duplicate resident/volunteer documents.

### 1. Residents Management
- **Resident Directory**: Registered Basic/Verified Resident accounts, approved status, search, suspension/reactivation and five records per page. Existing volunteers remain residents in the directory.
- **Identity Reviews**: Government ID/face/manual review evidence, eligibility and final LGU identity decision. Any automated identity authenticity or biometric matching remains *unverified* until independently tested.
- **Assistance Requests**: Individual resident non-emergency assistance/evidence review. Emergency incidents belong in Emergency Reports.
- **Community Events**: Resident-proposed events and LGU publication decisions (volunteer attendance managed separately).
- **Resident Notifications**: Alerts addressed to the signed-in LGU Admin with explicit resident identity, resident account or resident assistance types. Tabs: All, Unread, Identity, Accounts, Assistance. Pending identity work remains accessible through its actual review queue, not guessed from notification count.

### 2. Volunteers Management
- **Volunteer Applications**: Resident -> volunteer application verification, eligibility (Verified Resident), skills/availability review, approve/reject and audit.
- **Volunteer Events**: LGU-created volunteer event scheduling/capacity/status. Distinct from resident-proposed Community Events.
- **Event Attendance**: Time-in/out and LGU attendance verification, not duplicating event creation.
- **Certificates**: Approved and verified participation certificates.
- **Volunteer Notifications**: Alerts addressed to the signed-in LGU Admin about volunteer applications, event tasks and attendance. Tabs: All, Unread, Applications, Events, Attendance.

### 3. Other independent LGU groups
- Emergency & Relief: emergency incident reporting, response management and multi-household relief.
- LGU Staff Operations: city personnel and attendance; NOT resident volunteer applications.
- Donations & Funds: solely LGU-admin donation review, balance, approvals and transfers.
- Communications & Reports: announcements, disputes, read-only analytics.
- Command Center: action priorities and shortcuts into these unique modules. Never recreate their CRUD interfaces or management buttons.

## Notification delivery and privacy
- Both inboxes use the **same** Firestore `notifications` collection with existing recipient-only rules, query `userId == current admin UID` or legacy `recipientUid == UID` and deduplicate.
- Resident and volunteer views filter **explicit source scope/type**, not guessing from recipient title/content. Unknown legacy notification types stay unclassified, so they never leak into a wrong section.
- Mark Read updates only `read:true` for the signed-in admin's already-read-authorized documents. Five notifications per page, filters and loading/error/empty states are independent.
- Trusted Firebase Functions will create minimal, recipient-scoped work alerts when a **volunteerApplications** document transitions to `pending` and a **users** document transitions to `identityStatus:pending` for residents. Event triggers are idempotent via event-hash doc IDs and existence check to avoid duplicate alerts/resetting a read acknowledgement.
- Alert payloads contain *no* names, emails, government ID numbers, face data, addresses, request evidence, or finance details.
- These new automatic alerts require **reviewed Cloud Functions deployment** in addition to website deploy. The UI cannot create or deliver alerts without the source system emitting them. Other notification producers may require later integration; do not imply completed notifications for every action.

## Approval and release checklist
1. On a separate QA worktree based on `feat/lgu-resident-volunteer-workspaces-notifications-20261027`, run:
   ```powershell
   node scripts/test-lgu-resident-volunteer-workspaces.cjs
   node scripts/test-admin-workspace-unified-ui.cjs
   npx tsc --noEmit --pretty false
   npx expo export --platform web
   npx expo export --platform android
   ```
2. In Firebase emulators with synthetic records, verify:
   - Basic resident can appear in the Residents Directory without volunteer rights.
   - Identity verification action only in Identity Reviews; residents list does not approve staff.
   - Verified resident can submit volunteer application; pending queue shows item; approve/reject/status actions/audit work.
   - Resident/Volunteer inboxes do not show each other's categorized messages, and cannot show other recipients' notifications.
   - Mark Read, pagination, filters, unauthorized role redirect, sidebar expanded state.
   - Trigger new pending application / pending identity status via emulator, assert only approved Admin recipients, no sensitive payload, no duplicates on retries.
3. Browser QA on desktop 1440px, tablet 1024px and mobile 390px, with clean typography, no overflowing tab strips or duplicate navigation.
4. Verify production Firestore rules, Firebase Functions changes, web release and real-device push separately with release approval. **No live release occurred in this branch.**

**Boundary:** Super Admin only verifies/promotes LGU staff and handles platform oversight. Never add donation disbursement approval rights to Super Admin.
