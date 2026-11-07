# VolunServe — all-module UI / button audit & controlled cleanup

**Status: DRAFT REVIEW, NOT DEPLOYED.** This is an additive pass on `design/live-verified-ui-20261107` (draft PR #271). That branch was created directly from Firebase Hosting's previously verified production source `e83f4a72c7cb733ff7bb888a6ac19bf3c0f076c4`, **not from outdated main**.

## Module-by-module review process

Run `node scripts/audit-volunserve-module-controls-20261107.cjs` (requires installed dependencies). It walks all active and legacy route TSX files under Admin, Super Admin, Resident/Volunteer, and key Auth screens. It produces `reports/volunserve-ui-controls-inventory.md` and `.json`. Each module receives its own counts for clickable controls, direct handlers, explicit accessible roles, inputs, labels, and color values. The report is attached to the no-deploy GitHub CI as a downloadable artifact.

This is a **source audit**, not a proof that clicking a button actually works. A control with visible text may not need an explicit accessibility label; conversely, `onPress` alone does not prove the backend function succeeds. These are manual-review indicators, not guaranteed bugs.

## Review checklist by role

| Workspace | Main modules / flows to check in staging |
| --- | --- |
| Super Admin | System Overview, Admin Accounts, System Records, Audit Logs, Profile, System Settings |
| Admin | Command Center, identity reviews, emergency reports, assistance, community events, event attendance, certificates, donations, announcements, profile, permitted staff/operations |
| Resident | Home, identity verification, emergency reports, assistance, events, donations, updates, notifications, profile and volunteer application |
| Volunteer | Home, Emergency Tasks, community events, attendance, certificates, progress, notifications and profile |
| Authentication | Email and Google login/sign-up, verification, password reset, role redirects, deliberate logout |

## Actual implementation in this draft

- **Global UI:** shared live-based sidebar colors, navigation and module icons from PR #271.
- **Shared action:** `components/ui/VolunServeButton.tsx` — primary/secondary/danger/ghost, standard 44-point target, consistent font, icon, busy/disabled accessibility state.
- **Shared text field:** `components/ui/VolunServeField.tsx` — consistent typography, border, required marker and optional inline error.
- **Admin > Announcements:** two real shared fields and real shared publish button; existing minimum title/message validation, template choice, and Firestore `addDoc` flow remain.
- **Super Admin > System Settings:** shared save action, existing form wrapper uses shared field, consistent card typography; existing permission and server save workflow remain.
- **Resident > Volunteer Application:** shared submit action and calmer cards; existing `formValid`, eligibility verification and Firestore batch approval-request process remain.
- **Shared pagination:** protect NaN/zero/invalid size and page values, improve 44-point tap targets in all modules already using the shared component.
- **Volunteer > Emergency Tasks:** desktop/mobile common headers and cards inherited from PR #271; accept/decline and field-report transactions untouched.

## Explicitly not complete yet

The many individual buttons and forms inside long modules (Community Events, Request Assistance, Donation checkout, Emergency Reports, Super Admin accounts, etc.) are **cataloged for inspection**, not all refactored in this single PR. Live role-based interaction tests are still necessary for every save, modal, link, report, notification, PayMongo sandbox payment, attendance and certificate download. Never claim 100% bug-free or that every form is fully standardized based on this pass.

## Release gates (must all pass)

1. `node scripts/test-live-first-ui-only-20261107.cjs`: allowlist vs the exact live source; no Firebase rules, auth, Render backend, payments, certificates or emergency engine modifications.
2. `node scripts/test-live-controls-consistency-20261107.cjs` plus existing Admin, Resident, Volunteer and Super Admin regression suites.
3. TypeScript `npx tsc --noEmit`, Expo web export, and the full static inventory.
4. Manual visual inspection in desktop and mobile widths (320, 375, 390, 768, 1024, 1440); check overflow, input errors, focus, scroll, loading and disabled states.
5. **Authenticated staging** with test accounts in each role. Exercise real navigation, logout, announcements, report permissions, assistance, volunteer task transitions, PayMongo sandbox, attendance, certificates, and error recovery.
6. Re-check the production release marker immediately before any separately approved deploy; compare again against a fresh live fingerprint to avoid overwriting newer features.

**Do not merge these changes into outdated main or deploy to production as part of this draft.**
