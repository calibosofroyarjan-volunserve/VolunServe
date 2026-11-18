# Staging-only Admin + Volunteer UI preview connection — 2026-11-17

**Status: Draft, review only. Production OFF.**

## Source baseline

This PR is based on the live-derived, add-only Volunteer matching adapter PR #574,
not the divergent protected live branch. It proposes a **small additive UI
connection** without replacing existing Admin or Volunteer screens.

## What is connected

- New `components/admin/AutoVolunteerMatchPreview.tsx` renders **inside the existing
  Admin Emergency Reports → Volunteer Matching / Personnel tab**, before the
  original `ReferenceVolunteerMatching` and `VolunteerEligibilityValidation`
  components. Those original components and assignment actions remain untouched.
- It reuses the Admin screen's already-loaded `incident`,
  `approvedVolunteers`, `assignments` and `SJDM_BARANGAYS` without
  re-querying identity/application data.
- Only when the staging-only feature flag is ON does it subscribe to
  `responderLocks`. Missing/denied snapshot blocks rather than inventing
  an available Volunteer. That one collection subscription is allowed only
  for authorized Admin in the isolated staging Firebase project.
- The source adapter is read-only: no `setDoc`, `updateDoc`, `addDoc`,
  `runTransaction`, notifications or assignment writes.
- Existing Volunteer Web and Android task cards show a **staging preview
  label** only for `createdBy: "automatic_matching_engine"`.
  The existing manual task lifecycle is unchanged. Staging auto-offers
  must still use the existing verified staging Volunteer portal for
  server-checked acceptance/decline and expiry validation.

## Hard OFF switch

The UI panel, new responder-lock subscription and auto-match label are
enabled **only when all three conditions** hold:

1. `EXPO_PUBLIC_VOLUNSERVE_ENV=staging`
2. Firebase config `projectId=volunserve-volunteer-staging`
3. `EXPO_PUBLIC_VOLUNSERVE_AUTO_MATCH_UI_PREVIEW=true`

The production Firebase project `volunserve-3aa5b` CANNOT pass this gate.
A client-visible flag does not authorize any task dispatch; authorization,
expiry, and locks still require backend checks and approved Firestore rules.
No new Firebase credentials or staging account details are stored in code.

## Regressions and release gates

- The dedicated CI verifies every line of the three pre-existing Admin/Volunteer
  screen files survives **in its original order, byte-for-byte** (insertions
  only). No replacements, deletions, backend/server edits or Firebase Rules edits.
- Full TypeScript typecheck and existing Volunteer/Admin regressions run in
  the no-deploy workflow.
- Do not merge to `live-protected` or publish `volunserve.com` because the
  protected source and published live history remain divergent.
- Do not claim real automatic production dispatch: the separate matching
  worker needs independently tested always-available runtime, review of PR
  #573 Firestore permission policy, and real-device end-to-end testing.
- Keep the existing emergency hotline fallback independent of volunteer
  matching. Staging previews are not official emergency response.

Production and real emergencies remain unchanged by this review branch.

## Legacy sidebar test expectation predates the published baseline

The archived `scripts/test-resident-volunteer-sidebar.cjs` expects the
Volunteer sidebar to contain only Home, Emergency Tasks and Community Events,
but the pinned, published-source `app/(tabs)/_layout.tsx` already contains
the separate Certificate tab. That old test therefore fails *before this
change*; it is not evidence that this feature-flagged preview broke navigation.
We preserve the existing sidebar file byte-for-byte and do not delete
Certificates to satisfy an outdated snapshot. The CI instead executes the
actual-source portal, existing Volunteer dispatch, and Community Events
regressions in addition to strict original-line preservation.

## Additional baseline-dependent historical regression

The existing `scripts/test-defense-unified-lgu-volunteer-dispatch.cjs`
fails a condition that expects a retired external Google Maps call in the
historical Admin file. The published-source `admin-cases.tsx` still has
that reference. This feature branch did **not** add or alter it. We are
not deleting a map feature or changing existing Emergency Reports UI to make
an unrelated historical expectation pass.

Instead, the review CI uses `test-legacy-module-blobs-20261117.cjs`
to verify the exact Git object IDs of existing login, signup, map,
Events, Certificates, Donations, backend, Firebase Rules and Functions
against the pinned live-derived base; it also runs compatible Portal
and Community Events regressions. The original Admin/Volunteer screen
lines are independently proven unmodified by the additive UI test.

**This remains a code-only staging preview, not an end-to-end backend
acceptance or a production release.**

## Synthetic automatic offer trigger after Admin validation (Nov 17)

The review branch now also contains an **explicitly staging-gated hook**
`requestStagingAutoOfferAfterAdminValidation`. It runs only after
`reviewVerification(..., "validate")` commits the original Firestore
validation transaction, and only for an **initial** validation of the
fictional `STAGING_TEST_001` case.

- Gate: isolated Firebase project `volunserve-volunteer-staging` AND
  `EXPO_PUBLIC_VOLUNSERVE_AUTO_MATCH_UI_PREVIEW=true`.
- Only `STAGING_TEST_001`, previously `reported` and not already
  `validated`, may send a request. Real incidents cannot use this hook.
- The request uses the current staging Admin's Firebase ID token and calls
  the isolated Render staging backend's existing `/api/admin/emergency-auto/start`
  endpoint. That backend still checks Admin authorization, synthetic fixture,
  expiry and transactional Volunteer/lock eligibility independently.
- A backend refusal, missing token, failed fetch or sleeping Free Render
  results in **no confirmed offer** and does not undo case validation or
  remove manual Volunteer assignment controls. Never treat HTTP 200
  alone as proof of an actual assigned Volunteer.
- The Render staging server enforces an exact Origin allowlist; until a
  staging UI origin is explicitly allowlisted, a browser can be
  rejected. **Do not weaken CORS or allow production site origins.**
- New offline behavioral tests mock the backend, verify no production-case
  requests, validate token + case ID, and refuse false successes.
- This hook is **not deployed to a staging Expo web build** by the current
  PR. Existing isolated Render test pages are separate and remain unchanged.
- Real-time automatic dispatch on actual production reports is **NOT
  enabled**. Real emergencies still require official channels and
  reliable, approved responder operations.
- A separate historical test update only changes expectations to protect
  the already-published My Certificates desktop tab. Donation role gates
  and mobile navigation stay unchanged.

Do not merge into production while the protected Hosting revision
reconciliation and Firestore Rules review remain blocked.
