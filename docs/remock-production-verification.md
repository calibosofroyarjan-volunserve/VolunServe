# VolunServe final remock: release and production verification

Target: Firebase project `volunserve-3aa5b`, official Hosting domain `https://volunserve.com`.
Source: `main` branch, which already contains Emergency Reports, authorized real GPS response map, LGU-verified shelters, Community Events venue picker, attendance and certificates.

## What CI proves (and does not prove)

The PR workflow runs Node tests, Firestore emulator security checks, TypeScript, Expo production web export, and `node scripts/verify-hosting-release.cjs`.
The export validator checks critical static routes and creates `dist/volunserve-release.json` containing the Git revision.
A separate public, read-only HTTP probe checks website routes and (if present) the revision marker. It is **informational** because a PR cannot be responsible for an older production deployment.
Neither CI nor a 200 response proves successful real-device GPS, Admin/LGU login, live Firestore permissions, identity-provider authentication, or end-to-end dispatch.

## Deploy manually only from tested main

From an authorized workstation with Firebase CLI logged into the correct project:

```bash
git pull --ff-only origin main
npm ci
npx tsc --noEmit --pretty false
node scripts/test-event-map-route-ux.cjs
node scripts/test-event-pin-picker.cjs
npx expo export --platform web --clear --max-workers 1
node scripts/verify-hosting-release.cjs
npx firebase use volunserve-3aa5b
npx firebase deploy --only hosting --project volunserve-3aa5b
VOLUNSERVE_EXPECTED_SHA=$(git rev-parse HEAD) node scripts/check-live-hosting.cjs
```

**Do not run** `firebase deploy --only firestore,functions,storage` just to release UI. Separate security-rules deployment is only for a changeset that actually modifies rules, and must follow dedicated emulator tests and official authorization.
The Hosting deployment publishes the web app, **not** an updated Android APK/IPA. A new mobile app build is needed separately.

## Live defense QA: controlled test accounts only

1. Public/guest: verify official Call 911 shortcut opens a dialer but never claims automatic dispatch. Do not place a real test 911 call.
2. Resident: log in as a designated test Resident; submit a legitimate test report only within an authorized test environment, with a clear TEST designation. Verify case ID, reporter-only case listing, duplicate protection, and current status.
3. LGU/Admin: log in using independently verified LGU role and review a permitted test case. Assign a vehicle type (e.g. ambulance) and dispatch an authorized responder. Vehicle metadata alone must not show motion.
4. Authorized responder: explicitly grant foreground location on the device; confirm real GPS readings under the correct case ID. Test updates and stale/no-GPS status without assuming a vehicle physically moves.
5. Resident: open Track Response for the exact same case. Confirm only the assigned responder is visible and other Residents cannot access its location. Use test-only devices; do not fabricate GPS traces.
6. Evacuation shelters: only centers with LGU verification reference, status `active`, verified coordinates and recent recorded updates appear. Directions must open the exact saved facility coordinates. Empty directory must never be represented as proof that no shelters exist.
7. Community Events: choose barangay + venue, inspect an automatic suggested pin, adjust if needed, then confirm. Verify Admin review uses exactly those coordinates and Volunteer route opens the same location.
8. After approved completion, verify role-based permissions, attendance certification and donation functions independently. Run these in an authorized sandbox, not against live personal records.

## Stop conditions and status language

- **MERGED**: code on `main`.
- **CI PASSED**: automated test and export steps green.
- **DEPLOYED**: public Hosting release marker matches the exact expected Git SHA.
- **E2E TESTED**: observed authenticated Resident, LGU/Admin and responder workflows on actual configured devices.
- **BLOCKED**: required credentials, verified LGU accounts, online provider, or device permission unavailable.

A passed merge/export is not a deployment. A deployed marker does not by itself prove the full end-to-end scenario. Never seed fake shelters, responder locations, or actual emergency requests into production for a demonstration.
