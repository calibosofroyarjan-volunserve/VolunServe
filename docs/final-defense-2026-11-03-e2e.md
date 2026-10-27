# Final defense rehearsal — November 3, 2026

Local-only setup for the validated integration branch. Run all commands from that worktree or a verified clone, rather than the dirty original main workspace. Production data, emergency reports, payment providers and deployments are outside this rehearsal.

## Start the isolated environment

Terminal 1 (keep running):

```powershell
npx firebase emulators:start --only auth,firestore --project demo-volunserve
```

Terminal 2:

```powershell
$env:FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099'
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'
node scripts/prepare-defense-emulator-accounts.cjs
$env:EXPO_PUBLIC_USE_FIREBASE_EMULATORS='true'
npx expo start --web --localhost
```

Use the localhost URL printed by Expo. The emulator opt-in only applies to localhost / 127.0.0.1 browser sessions. Restart Expo after changing the flag. Normal configuration is unchanged when the flag is absent. The native Super Admin gate remains web-only. Native emulator runtime is not configured by this preparation.

The seed script requires exactly the localhost emulator endpoints above. It creates or signs into synthetic accounts and sets their approved profiles in demo-volunserve only. It leaves accounts available for the rehearsal. Running it again restores those synthetic profiles; it does not clear the database.

| Role | Local email | Login route |
| --- | --- | --- |
| Resident | resident.defense@example.test | /login |
| LGU Admin | admin.defense@example.test | /admin-login |
| Volunteer | volunteer.defense@example.test | /login |
| Super Admin | superadmin.defense@example.test | /admin-login |

All four use the fictional emulator password `DefenseDemo!2026`. These are not production accounts. Open separate browser profiles for each role to avoid shared Auth state.

## Resident → LGU Admin → Volunteer acceptance evidence

1. Resident signs in. Confirm Resident mode and Community Events access. Submit a synthetic proposal titled `DEFENSE TEST — Community Cleanup`, with valid venue, confirmed pin, schedule, description and volunteer tasks. Record proposal ID and screenshot.
2. LGU Admin signs in separately. Open Community Events, read the proposal and approve/publish. Confirm one official event with matching proposal ID and no duplicate event.
3. Volunteer signs in separately. Confirm Volunteer mode, find published event and join. Check participant count increments once; duplicate joining must not increase capacity.
4. LGU Admin starts the event. Volunteer records time-in and time-out. Volunteer must not be able to self-verify attendance.
5. LGU Admin verifies attendance and completes the event. Confirm participant timestamps, verifier UID and completed status. Record event ID and screenshots from each role.
6. Resident cannot approve events or read someone else's private proposal. Event proposer cannot join their own event. Verify sign-out and role redirects.
7. Organizer voluntarily enables GPS only if the browser permits it; stop sharing after switching modes. Denied location permission must leave manual venue pin usable. Use synthetic fixtures for automated GPS checks.
8. Super Admin review: use the LGU Staff Applications queue for a synthetic pending applicant. Review identity, LGU employment, office, position and appointment reference. Confirm promotion stays disabled until all required fields and review attestations are complete; approve through Promote Verified Staff, then check the audit record and LGU Admin role. Do not promote a basic Resident or use direct account-creation shortcuts. The resulting role is LGU Admin, not programmer Super Admin.

Capture date/time, browser, account role, proposal/event IDs, screenshot path, expected result, actual result and PASS/FAIL for every step. Seeded identity approval is a test fixture, not an Identity AI verification result.

## Repeat automated checks

```powershell
node scripts/check-defense-integration.cjs
npx tsc --noEmit --pretty false
npx firebase emulators:exec --only firestore --project demo-volunserve "node scripts/check-defense-integration.cjs --rules"
npx firebase emulators:exec --only auth,firestore --project demo-volunserve "node scripts/prepare-defense-emulator-accounts.cjs"
```

Run emulators:exec only after stopping Terminal 1; the ports must be free. Rules tests clear the local demo Firestore fixture database, so reseed afterward. Do not run them during a manual rehearsal.

## Separate acceptance gates

- UI clicks/screenshots are a manual acceptance gate; SDK/rules checks do not establish browser E2E success.
- The current /admin-request secondary Firebase client does not connect to the local emulators through the opt-in flag. Do not submit that form in the emulator-only rehearsal; pending-applicant browser testing needs a separately prepared synthetic fixture or reviewed secondary-client emulator wiring. The automated rules suite covers pending submission and approval using synthetic identities.
- Android export verifies JavaScript bundling, not an APK build, installation, GPS hardware or device runtime.
- Storage uploads, Cloud Functions, certificate delivery, external Identity AI and payments are not emulated in the Auth+Firestore setup. Certificate eligibility is covered by offline unit tests (29 minutes rejected, 30 minutes accepted, idempotent issuance); actual delivery remains a separate gate.
- Do not invoke donation/payment actions or submit emergency reports during this rehearsal. This setup does not redirect every external backend to an emulator.
- VS Code live dirty-buffer state cannot be controlled from this session. Both original layout versions and the merged disk layout are backed up; compare the editor with disk before reloading, and never save an older buffer over the merged file.
