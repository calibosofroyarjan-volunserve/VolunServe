# VolunServe Phase 5 — Manual / Automatic Responder Coexistence Guard

**November 19, 2026 — code review only, NOT deployed.**  
**Feature status:** Automatic dispatch remains OFF. This branch is stacked on draft Phase 4 emulator PR #619, ultimately derived from protected production backend commit `61baa713`.

## Summary of the proposed safety fix

The live manual Admin flow presently sets `activeVolunteerSupportAssignmentId` when **offering** a single Volunteer assignment, while the proposed automatic flow selects a winner only after the Volunteer **accepts**. Phase 4 proved a late legacy manual offer could overwrite an accepted automatic responder's case pointer while the old responder's lock survived.

This Phase 5 review patch adds a shared, reusable check **inside the actual manual Admin client transaction**, adds compatible safeguards inside **both Volunteer Web and Mobile client transactions**, and adds **Firestore Security Rules protections** for outdated clients.

- `lib/emergencyVolunteerWinnerGuard.js` + `.d.ts`: pure shared checks, no Firebase imports or side effects. A proposed manual offer is blocked when the current case has an `autoVolunteerAcceptedAssignmentId`, an active assignment pointer for another Volunteer or a dispatch block. Reoffering the *same* previously declined task remains allowed if no automatic winner exists.
- `app/(admin)/admin-cases.tsx`: invokes `manualOfferConflictReason(currentCase, assignmentRef.id, volunteer.uid)` **after reading the current case inside the existing Firestore transaction**, before any new assignment, case pointer, notification or audit writes. No automatic dispatch or new UI feature is activated.
- `app/(tabs)/volunteer.web.tsx` and `app/(tabs)/volunteer.tsx`: use the same shared helper before any status mutation. The old clients must not directly **Accept** or **Decline** a server-managed automatic offer. Legacy manual assignments continue, provided the current case doesn't point to another responder. A server-confirmed automatic winner can continue its existing Responding → On Site → Completed flow only if its case winner and UID match.
- `app/(admin)/admin-cases.tsx` Cancel Assignment: if cancelling the exact accepted automatic assignment, clears that case's `autoVolunteerAcceptedAssignmentId` together with its matching existing active pointer. Does not erase other Volunteers, historical assignments, notification/audit records, or unrelated official LGU fields.
- `firestore.rules` (**DRAFT — NOT LIVE**): blocks direct Volunteer client status transitions from an automatic `offered` task, disallows legacy Admin status-only forging of automatic acceptance (while allowing cancellation), blocks old Admin clients from overwriting an accepted automatic case winner, and permits clearing that winner only when a **same-transaction** matching assignment is cancelled. Normal manually offered tasks remain supported.

## Validation and limits

Three independent test layers are included:
1. Pure unit/source tests check manual/automatic conflict decisions and actual use of the shared guard in Admin and both Volunteer apps.
2. Actual Firestore Emulator transactions demonstrate **a later corrected manual Admin offer is blocked**, and two concurrently racing corrected manual vs automatic operations cannot overwrite each other's case pointer. This uses a reviewed isolated transaction *reproduction*, not the entire Expo UI in an emulator.
3. Firebase Client SDK + Firestore Rules Unit Testing verifies that **outdated clients cannot bypass protection** for server-managed automatic offers; ordinary manual Volunteer Accept remains allowed; a selected automatic Volunteer may Start Response; an Admin cannot forge acceptance or overwrite an automatic winner, but can perform legitimate same-transaction cancellation.

Emulator-only tests run with `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`, `GCLOUD_PROJECT=demo-volunserve-auto-phase4`, and **no** `FIREBASE_SERVICE_ACCOUNT_JSON`. All data is synthetic and local. No production Firebase writes, Auth changes, service-account use, Hosting/Render deploy or real emergency report activation.

**Existing Phase 4 negative reproduction remains intentionally unchanged**: its legacy client still overwrites a pointer in the isolated test because it intentionally omits Phase 5's safeguards. This proves why both application changes AND Rules are needed; it is not proof production is already patched.

## Important remaining NO-GO production gates

1. **Phase 5 code is not deployed**. Old deployed clients, current Firebase Rules and production backend are not changed. Never claim the live conflict is fixed.
2. New server-side automatic assignment/winner transaction is still review-only, and real Auth, notifications, idempotent logs, service revalidation and release/rollback workflows have not been integrated.
3. Firestore Rules are a DRAFT and must pass all relevant existing Rules tests / permissions review, especially multi-role workflows, without a compiler-size breach.
4. Prevent server Admin SDK (which bypasses Rules) from overwriting a winner via independent reviewed transaction code. Every future server writer must share the case winner state invariant.
5. Do real Admin/Volunteer Web & Android integration tests, preserve existing manual assignment and certificate/donation/identity functionality, and ensure durable scheduler and approved SJDM adjacency/eligible data before any real dispatch rollout.
6. Add a plan for reoffering or clearing expired **other** pending automatic tasks following Admin cancellation, without resetting accepted responder history.

**Decision:** Phase 5 compatibility fix **implemented in an isolated development branch for review and emulator testing only**. Production automatic dispatch remains **NO-GO** until remaining gates pass. Preserve `volunserve.com` and production Render commit without changes.
