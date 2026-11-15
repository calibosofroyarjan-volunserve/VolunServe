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

## Free Render staging — Admin-on-demand matching (code prepared, NOT deployed)

A safe, limited Free alternative has been added **in this draft branch only**.
After an authorized Admin validates a Resident Emergency Report **in a correctly
configured isolated staging app**, the client calls the authenticated staging
backend to offer one task to the next qualified approved Volunteer. This is
automatic candidate selection, **NOT autonomous 24/7 dispatch**. The Admin can
press `Check / Advance Pending Offer` to reconcile a declined or expired offer;
there is no background timeout guarantee while Render sleeps.

**Safety gates for a separate STAGING Firebase project (never production):**
- Backend service must deploy this reviewed staging branch, with server-side:
  - `VOLUNSERVE_AUTO_VOLUNTEER_ON_DEMAND_STAGING_ENABLED=true`
  - `VOLUNSERVE_AUTO_VOLUNTEER_STAGING_PROJECT_ID=<isolated staging Firebase project ID>`
  - `FIREBASE_SERVICE_ACCOUNT_JSON` must be the credentials for that **same
    staging** Firebase project; the actual production ID `volunserve-3aa5b`
    is explicitly rejected by the on-demand gate.
- On the **isolated staging web build only**:
  - `EXPO_PUBLIC_AUTO_VOLUNTEER_DISPATCH_ENABLED=true`
  - `EXPO_PUBLIC_AUTO_VOLUNTEER_MATCH_PROVIDER=render`
  - `EXPO_PUBLIC_AUTO_VOLUNTEER_STAGING_ONLY=true`
- The existing protected production API URL is not used by this staging mode.
  The client calls `https://volunserve-emergency-match-staging-free.onrender.com` with a
  verified staging Firebase ID token. The API checks an approved operational
  Admin account; no public offers or unauthenticated writes are allowed.
- `VOLUNSERVE_AUTO_VOLUNTEER_RENDER_WORKER_ENABLED` stays **false** and
  `VOLUNSERVE_RENDER_PAID_ALWAYS_ON_CONFIRMED` stays **unset/false** on Free.
  Do not use keepalives to bypass sleep and do not claim a three-minute timeout
  is guaranteed on Free.
- If matching fails, the report remains validated, the Admin is warned, and
  manual coordination and official emergency hotline escalation remain available.
  A Volunteer is not assigned until they explicitly accept.

**Outstanding activation work:** deploy staging branch to a separate approved
staging service; verify staging Auth and Firestore project isolation, Admin
credentials and end-to-end real devices; do not test with live incidents or
private Resident data. No protected/live branch or paid plan changes have
been made by this PR.

## Actual dedicated Free staging service — created November 15, 2026

- Render service: `volunserve-emergency-match-staging-free`
- Service dashboard: https://dashboard.render.com/web/srv-dbsglle1egvs73dq7i8g
- Public health: https://volunserve-emergency-match-staging-free.onrender.com/health
- Source branch: `feat/emergency-auto-dispatch-server-staging-20261115`
- Startup: `node backend/emergencyAutoDispatchStagingServer.js`
- Render plan is **Free**, with `autoDeploy:no`. Deploys must be triggered manually.
- Dedicated server intentionally does **not** run other VolunServe backend jobs
  (identity, payments, certificates, announcements, live API, etc.)
- Build gate runs 10 Node access-control/worker tests + two synthetic
  incident matching/locking scripts. Initial module-resolution failure was
  corrected by injecting synthetic Firestore into the offline test script.
- **Default server activation is OFF**, even though `/health` can return 200.
  This is intentional until staging Firebase and authenticated Admin flows are verified.
- The default CORS allowlist is empty. Only add the actual verified isolated
  staging web preview URL to `VOLUNSERVE_AUTO_VOLUNTEER_STAGING_ALLOWED_ORIGINS`.
  Do not add `https://volunserve.com` or production Origins.
- Set `VOLUNSERVE_AUTO_VOLUNTEER_STAGING_PROJECT_ID` to the separate Spark
  Firebase project ID, and securely paste `FIREBASE_SERVICE_ACCOUNT_JSON`
  into the **new staging service Render environment settings** (not chat,
  not GitHub, not client source). The project IDs must match, and production
  project `volunserve-3aa5b` is always blocked. Do not configure live credentials.
- After confirming Admin Auth + isolated Firestore and real-device checks,
  set `VOLUNSERVE_AUTO_VOLUNTEER_ON_DEMAND_STAGING_ENABLED=true`. Leave
  `VOLUNSERVE_AUTO_VOLUNTEER_RENDER_WORKER_ENABLED=false` and
  `VOLUNSERVE_RENDER_PAID_ALWAYS_ON_CONFIRMED=false` on Free.
- **Do not enable real case offers for unverified test accounts.** Use only
  synthetic/test cases in the isolated Firebase project; release to live
  requires separate QA and reliable operational uptime.

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
