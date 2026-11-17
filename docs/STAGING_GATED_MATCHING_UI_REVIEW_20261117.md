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
