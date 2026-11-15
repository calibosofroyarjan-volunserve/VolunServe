# Automatic Emergency Volunteer Matching — Render release plan (STAGING ONLY)

## Verified hosting status as of 2026-11-15
- Render live backend `VolunServe`, branch `backend-live-protected`, instance type **Free**.
- Render staging backend `volunserve-backend-staging`, instance type **Free**.
- Both services have `autoDeploy: no`. No protected branch or environment has been changed by PR #571.
- Render Free spins down after 15 minutes idle; **not suitable for real-time, emergency-critical deadlines**.
- Render Starter is a possible paid always-on alternative to Firebase Functions Blaze, not a zero-cost solution. It is not a guarantee of emergency services.
- Never try ping/keepalive tricks to treat the sleeping Free instance as reliable.

## New code (PR #571)
- `backend/emergencyAutoDispatchWorker.js` can run on an already-upgraded *always-on* service; it polls new validated reports and outstanding Volunteer offers using durable Firestore transactions.
- `backend/server.js` exposes protected Admin endpoints:
  - `GET /api/admin/emergency-auto/status`
  - `POST /api/admin/emergency-auto/start`
  - `POST /api/admin/emergency-auto/disable`
  All require verified Firebase ID token and an approved operational Admin account. Disabled backend answers HTTP 503 for action endpoints.
- Automatic **new-case** discovery is limited to reports with `validatedAt >= cutoff`, an Admin-confirmed `incidentBarangay`, and no prior active manual/automatic task. Historical cases are never bulk-offered automatically.
- `functions/emergencyAutoDispatchCore.js` and existing `responseAssignments`, Firestore Rules and Volunteer acceptance screens are reused. Volunteer must accept; this is **not automatic police, rescue or medical dispatch**.
- When the verified nearest-barangay dataset is unavailable, the server skips Wave 2 instead of guessing and continues with qualified Volunteers elsewhere **within SJDM** (Wave 3).
- No new public listing, no disclosure of reporter GPS/contact to unrelated Volunteers; the existing authorized assignment flow governs visibility.

## Production activation prerequisites (NOT COMPLETED)
1. Obtain **explicit billing approval**, then upgrade the actual live/staging backend Render service from Free to Starter (or more reliable plan); do not do this automatically on the user's behalf.
2. Verify deployment uses an approved protected branch, stable health checks and a working Firebase Admin service account with only necessary permissions.
3. Before any *live* rollout, run Firestore emulator and real Android/Web acceptance, decline, timeout and critical escalation tests. Confirm that a Volunteer can receive, open and accept the offer; don't assume push delivery.
4. Check existing `firestore.rules` permit the intended account view. The new worker uses the privileged Firebase Admin SDK; do not grant public client write rights to auto matching.
5. Use **one automatic worker provider at a time**: either Firebase Functions Blaze OR Render. Do not enable both.
6. Only after QA and verified paid runtime, set **server environment**:
   - `VOLUNSERVE_AUTO_VOLUNTEER_RENDER_WORKER_ENABLED=true`
   - `VOLUNSERVE_RENDER_PAID_ALWAYS_ON_CONFIRMED=true`
   - `VOLUNSERVE_AUTO_VOLUNTEER_CUTOFF_UTC=<reviewed activation time in exact UTC ISO 8601>`
   These are operator attestations; the code cannot verify your billing plan from inside the process. **Never set them while Render is Free.**
7. Build the web app with:
   - `EXPO_PUBLIC_AUTO_VOLUNTEER_DISPATCH_ENABLED=true`
   - `EXPO_PUBLIC_AUTO_VOLUNTEER_MATCH_PROVIDER=render`
   Do not enable web controls while the actual worker is unavailable.
8. Use the approved Admin `/api/admin/emergency-auto/status` endpoint and verify real Firestore state/notifications before declaring success. Monitor service availability and logs continuously during acceptance testing.
9. Keep official emergency hotlines prominently available, especially for Critical/High incidents. If no Volunteer accepts or the worker is unreachable, Admin review and official emergency escalation are required.

## Barangay mapping
- The bundled official **62-name** registry is a spelling/coverage list, **not a street-level, legal or validated adjacency map**.
- No authoritative, current SJDM barangay adjacency polygon set was confirmed during this task. An older online dataset covers 59, not all 62.
- Wave 1 = matching the Admin-confirmed incident barangay.
- Wave 2 = **only** adjacent SJDM barangays from a separately verified configuration; otherwise skip without making a false proximity claim.
- Wave 3 = other approved and qualified Volunteers whose registered barangay is among the 62 SJDM names.
- A barangay-specific verified configuration may be stored in `systemSettings/emergencyVolunteerMatching` with `approved:true`, `enabled:true`, `neighborsByBarangay` keyed by confirmed names. Review source, completeness and correct borders **before approval**.

## Safe rollback
- Set `VOLUNSERVE_AUTO_VOLUNTEER_RENDER_WORKER_ENABLED=false` and redeploy **only after safely reconciling outstanding offers**.
- Admin Disable Matching is available for an unaccepted task; it does not silently cancel a Volunteer who accepted.
- Preserve the old manual-operations path; do not roll back or change PayMongo, certificates, ID/face verification, Firestore Rules, or production databases during this PR.

## Automated checks (do not replace real tests)
- `node scripts/test-automatic-emergency-dispatch-20261115.cjs`
- `node scripts/test-automatic-volunteer-responder-lock-20261115.cjs`
- `node --test backend/test-emergencyAutoDispatchWorker.cjs`
- `node scripts/test-admin-emergency-ui-consistency-20261115.cjs`
- `npx tsc --noEmit --incremental false`
- `npx expo export --platform web --clear`

**As of this PR, no live emergency automation has been enabled.**
