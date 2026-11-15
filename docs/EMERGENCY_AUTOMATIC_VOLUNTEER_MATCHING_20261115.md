# Emergency Volunteer automatic matching — staging release

## Purpose
This is **automatic Volunteer task-offering**, not dispatch of police, fire, ambulance, rescue professionals or LGU units. During any critical emergency, official emergency services take priority. Volunteers must explicitly accept a task; GPS tracking begins only when they start the existing response workflow.

## Final flow
1. Resident submits Emergency Report with valid incident GPS/photo.
2. An authorized LGU Admin reviews and validates.
3. Firestore case-update trigger evaluates **approved user accounts** + **approved Volunteer Applications**, verified identity, correct current SJDM barangay, genuine emergency skills, own-report exclusion, current tasks and responder locks.
4. Wave 1: offers sequentially to qualified Volunteers in the **incident barangay**.
5. Wave 2: offers to **independently verified adjacent barangays only**.
6. Wave 3: offers to qualified Volunteers in remaining SJDM barangays.
7. Each offer is recorded as `offered` in existing `responseAssignments` with a single active reservation. Volunteer must explicitly accept/decline. At the current default deadline of **three minutes**, an unanswered offer is cancelled atomically, and the next candidate is evaluated.
8. Accepted → existing Volunteer **Start Response → on-site → completion** flow. Do not enable live GPS at offer time.
9. No candidate, invalid/unknown incident barangay, absent verified adjacent map, status mismatch, or exhausted candidates → **Admin review** and privacy-safe escalation notice. No false promise that official responders were called.

## State and compatibility
- One Firestore session per case at `emergencyAutoDispatch/{caseId}`; all state is durable across retries/instance restarts
- One automatic reservation per Volunteer at `autoVolunteerReservations/{uid}`
- Existing `responseAssignments/{caseId}_{uid}`, `notifications`, `disasterCases`, `adminActivityLogs` remain the operational source of truth
- Admin dashboard reads `disasterCases.autoVolunteerDispatch` only — no new Firestore client permissions
- Original manual Offer Task is preserved when automation is not active; protected against simultaneous matching when auto state is `waiting` / `ready` / `accepted`
- Previously validated historic cases do not receive surprise offers automatically. An authorized Admin can explicitly start them using the callable API
- Admin may disable automation when no Volunteer has accepted. Accepted responders require coordinated authorized case management rather than silent cancellation
- **No Firestore Rules, Auth, payments, donation campaigns, certificate, emergency map or identity verification deployments** in this branch

## Production prerequisites — not yet satisfied
- **Firebase Blaze plan** and correctly deployed Cloud Functions v2 or an equivalent reliable always-on job service. The existing free Render web service may sleep; never rely on free idle Render for emergency timeouts
- Verified, auditable neighboring-barangay dataset in `systemSettings/emergencyVolunteerMatching`. Firestore document format:
  - `enabled: true`
  - `approved: true`
  - `neighborsByBarangay: { "<canonical SJDM barangay>": ["<independently verified neighboring SJDM barangay>", ...] }`
- Never set `approved=true` for an unverified/guessed adjacency list. **No neighboring barangay list is asserted by this PR**
- Ensure `VOLUNSERVE_AUTO_VOLUNTEER_DISPATCH_ENABLED=true` only in a reviewed **Functions** environment after deployment QA and billing confirmation. When absent or false, the new Functions are not exported and no automatic offers are sent
- For historical validated cases the gated callable is `startAutomaticEmergencyVolunteerMatching`; authorized manual override `disableAutomaticEmergencyVolunteerMatching`
- Validate all eligible users' `users/{uid}` account/volunteer flags and identity status, plus approved `volunteerApplications` before enabling

## Required manual QA before live activation
- Test on Firestore emulator with Resident/Admin/Volunteer accounts, including app mode switching
- Confirm *one* task offer per case and no user receives duplicate active offers across cases
- Confirm permissions: only approved operational Admin can start, and only actual Volunteer can accept a task
- Simulate Volunteer accept at the exact timeout boundary and verify one winner, not a cancelled accepted task
- Test refusal, offline/unresponsive Volunteer, worker restart, case rejected/closed during offer, Admin override, no nearby config, and fallback to citywide
- Check Android and web in-app notifications; do not claim Android push reached an offline device without a receipt
- Check page UI and response-map GPS only after Volunteer presses Start Response
- Verify **critical incidents immediately display official 911 escalation guidance**, independent of Volunteer match
- Test rollback and disabled-automation release before production

## Validation
`node scripts/test-automatic-emergency-dispatch-20261115.cjs`
`node scripts/test-emergency-volunteer-wave-planner-20261115.cjs`
`npx tsc --noEmit --incremental false`
`npx expo export --platform web --clear`

**Deployment status:** source-only staging. Live volunserve.com retains manual Volunteer task offering and its existing Firebase deployment until a reliable runtime, verified locality config and end-to-end QA exist.
