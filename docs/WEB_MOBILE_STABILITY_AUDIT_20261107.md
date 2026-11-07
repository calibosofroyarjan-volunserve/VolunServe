# VolunServe Web + Mobile Browser Stability Review

**Status: Draft preview only. Not merged or deployed.**

Base: `feat/volunserve-identity-validation-preview-20261107` (draft PR #269).

## Issues identified from source

1. **Potential unintended logout on a temporary Firestore error** — the root auth guard used to invoke `logoutUser()` after a failed profile read on protected routes. This could cause a bounce to Login during connectivity problems. Changed to a fail-closed verification screen with explicit **Try again** and **Sign out**. Confirmed missing profiles may still resume Signup where eligible; rejected, suspended and email-unverified accounts remain blocked.
2. **Profile listener race on account switches** — `useUserSession` now ignores callbacks from older auth listeners and never reuses a different UID's profile. When a listener errors, the same UID's previously loaded profile remains available rather than automatically resetting to null. Backend Firestore rules remain authoritative.
3. **Accidental/duplicate logout prompts** — confirmation now required on Admin and Super Admin; Resident mobile and Home web prevent duplicate dialogs when buttons are clicked rapidly. Explicit confirmation is still required to execute `logoutUser()`.
4. **Inconsistent headers and cards** — shared `VolunServeText` (type scale) and `VolunServeCard` (surface) were added. Admin headers, Volunteer web/phone task headers, and announcement form use shared design elements. Home web cards and Volunteer summary card surfaces are aligned.
5. **Mismatched module icons** — Admin Emergency Reports and Community Events, and Volunteer Emergency Tasks now use matching Ionicons across relevant portals.

## What was not changed

- Firebase Auth and Firestore Security Rules or their privileges.
- Database, Cloud Functions, Render backend, payments and donations.
- Assignment transition transactions, response evidence and certificates.
- Existing routes/links except preserving the same logout destination after confirmation.
- Production hosting or live data.

## Testing

- CI workflow: `.github/workflows/validate-web-mobile-stability-20261107.yml` — static behavior regression tests, existing portal/auth tests, TypeScript and Expo web export, **no deploy**.
- Offline interactive review: separate HTML mock with role switching, module cards/forms, sample account connection-retry and logout-confirmation scenarios, no live Firebase data.
- Browser prototype smoke tests: desktop 1360×850 and mobile 390×844, menu handling, role changes, session-recovery and signout dialogs, zero JS errors and no horizontal overflow in those two simulated viewports.

## Next QA before any production release

- Authenticated staging Firebase account tests for every role: desktop Chrome/Edge; Android Chrome/mobile web; slow/offline network transitions.
- Verify actual Firebase profile read failure, suspended status, expired email verification, account switch, redirect and back navigation.
- Test all clickable cards, overlays, notifications, dropdowns and dialogs for accidental taps and keyboard focus.
- Test responsive typography at 320px, 375px, 390px, 768px, 1024px and desktop widths.
- Audit all remaining per-module bespoke cards and forms, since a shared component alone does not convert every screen.
- Test real form submissions, event joins, time-in/out, assistance, identity upload and PayMongo sandbox separately.

**Do not claim every bug has been fixed:** this is a focused, code-reviewed first pass. Do not deploy without the user's express approval and end-to-end staging QA.
