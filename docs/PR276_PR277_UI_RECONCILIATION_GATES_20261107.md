# VolunServe — precise PR #276 versus #277 reconciliation gate

Audit date: 2026-11-07 (Asia/Manila). Status: **NOT APPROVED FOR PRODUCTION**.
Verified public live Hosting source marker: `e83f4a72c7cb733ff7bb888a6ac19bf3c0f076c4` (as of prior GET-only CI verification). Current live marker must be rechecked before any release.

Branches:
- PR #276 `design/four-role-web-mobile-finish-20261107` — head `8a712d03a82e5f0af31b25fb11cc569cee2b2f14`, draft, unmerged
- PR #277 `design/web-mobile-unified-roles-20261107` — head `2ba9a71cf92dc03926a62c81af961ca6130d9ede`, draft, unmerged
- Both descend from `preview/isolated-staging-backend-20261107` but are sibling branches, NOT supersets of one another.
- GitHub compare #276 → #277: **28 ahead / 30 behind**, 21 differing paths.

## Source-review result and safe selection policy

1. In spot comparisons of the operational module files, most differing lines were layout/color/spacing declarations; no missing **exact text matches** for high-signal onPress/submit/transaction/route lines were found in the files examined. This is a static heuristic only, not a guarantee.
2. **Do not copy #277 wholesale into a live release**, because it still contains staging Firebase/backend/auth wrappers and sample-review routes. Preserve the current production login, signup, role access and real workflows unless staged and explicitly approved.
3. Two design-review approaches conflict: #276 redirects an existing preview mode toward its distinct sample design review; #277 uses a **new standalone `/public/design-review` route** and adds a GuestWorkspace link. Prefer a dedicated route for isolated visual review to avoid replacing existing Guest preview, but audit that the link appears only where desired; don't expose an unintended public production design page.
4. Candidate #277's source-level UI guard `scripts/test-live-first-ui-only-20261107.cjs` is narrower than its 85-file diff vs live, and expressly rejects several changed paths. Do NOT treat earlier green UI tests or eight unrelated PR jobs as an all-module pass. A reworked candidate-specific manifest is required, followed by TS, Expo, browser and real isolated E2E.
5. Identical critical code in both refs and the live revision does not confirm behavior without runtime: check actual database writes, notifications, alerts, GPS, time-in/out, PDF certificates and PayMongo sandbox on **separate nonproduction infrastructure**.
6. The first isolated review build uses dummy Firebase credentials and a nonproduction sample UI, so it can validate appearance/navigation but **not** real user roles or persistence.
7. The live-oriented production release branch is **HOLD**; do not merge/rebase/cherry-pick or deploy any proposal until the manual acceptance list and rollback plan are complete. No production credential changes in this phase.

## 21 paths requiring reconciliation

| Path | Changed lines | Initial classification |
|---|---:|---|
| `.github/workflows/test-browser-four-role-20261107.yml` | 37 | TEST INFRA: #277-only runner; verify full run and artifacts |
| `.github/workflows/validate-four-role-design-review-20261107.yml` | 69 | TEST INFRA: #277-only runner; verify full run and artifacts |
| `app/(admin)/_layout.tsx` | 16 | ADMIN: primarily styling differences in spot checks; manually test authenticated workflows |
| `app/(admin)/admin-cases.tsx` | 15 | ADMIN: primarily styling differences in spot checks; manually test authenticated workflows |
| `app/(admin)/assistance-requests.tsx` | 21 | ADMIN: primarily styling differences in spot checks; manually test authenticated workflows |
| `app/(admin)/community-events.tsx` | 15 | ADMIN: primarily styling differences in spot checks; manually test authenticated workflows |
| `app/(admin)/identity-reviews.tsx` | 11 | ADMIN: primarily styling differences in spot checks; manually test authenticated workflows |
| `app/(superadmin)/_layout.tsx` | 26 | SUPER ADMIN: primarily styling differences in spot checks; verify forms and permissions |
| `app/(superadmin)/admin-accounts.tsx` | 17 | SUPER ADMIN: primarily styling differences in spot checks; verify forms and permissions |
| `app/(superadmin)/admin-logs.tsx` | 11 | SUPER ADMIN: primarily styling differences in spot checks; verify forms and permissions |
| `app/(superadmin)/all-records.tsx` | 21 | SUPER ADMIN: primarily styling differences in spot checks; verify forms and permissions |
| `app/(superadmin)/index.tsx` | 33 | SUPER ADMIN: primarily styling differences in spot checks; verify forms and permissions |
| `app/(tabs)/_layout.tsx` | 20 | RESIDENT/VOLUNTEER: styling in spot checks; test cases, events, donations, tasks |
| `app/(tabs)/community-events.tsx` | 13 | RESIDENT/VOLUNTEER: styling in spot checks; test cases, events, donations, tasks |
| `app/(tabs)/donation.tsx` | 17 | RESIDENT/VOLUNTEER: styling in spot checks; test cases, events, donations, tasks |
| `app/(tabs)/resident.tsx` | 3 | RESIDENT/VOLUNTEER: styling in spot checks; test cases, events, donations, tasks |
| `app/public/design-review.tsx` | 4 | PREVIEW ROUTE: #277 standalone route; do not replace legacy Guest preview |
| `components/guest/DesignReviewWorkspace.tsx` | 528 | MAJOR CONFLICT: two different sample-data UIs; do not auto-merge |
| `components/guest/GuestWorkspace.tsx` | 15 | PREVIEW LINK: preserve Guest view and verify no production auth path bypass |
| `scripts/test-four-role-design-review-20261107.cjs` | 26 | TEST INFRA: re-run candidate-scoped suites; no production effects |
| `scripts/test-web-mobile-four-role-browser-20261107.cjs` | 68 | TEST INFRA: re-run candidate-scoped suites; no production effects |

## Functional regression acceptance matrix (all test accounts and records must be isolated)

| Role/workflow | Minimum real staging test | Disposition |
|---|---|---|
| Authentication | email+Google sign-in, email verification, invalid/disposable email handling, forgot password, role redirect, logout | BLOCKED: no isolated staged auth tests yet |
| Resident | home, guest read-only, announcements, notifications, incident report/map, verified identity, volunteer application | BLOCKED: requires separate Firestore/Auth/Storage/Functions |
| Admin | new announcement → resident notification, verification approval, volunteer assignment, case and assistance approvals, roster and attendance | BLOCKED: requires staged services |
| Volunteer | emergency invitation accept/decline, GPS and map, Time In/Out, joined events, PDF certificate generated/downloaded | BLOCKED: requires staged services |
| Donations | amount progress bar, PayMongo sandbox payment, request approval and beneficiary receipt | BLOCKED: no production payment testing |
| Super Admin | account/role management, system settings save, records, audit logs, permissions | BLOCKED: requires staged roles |
| Desktop/mobile | 320 / 375 / 390 / 768 / 1024 / 1440 widths, layout overflow, sidebar/modal controls, accessible buttons | Pending independent real-app visual checks |
| Backend & data | compare exact production Hosting marker immediately before any release; preserve Render deploy & Rules/Functions | BLOCKED: only repository source checks completed |

## Required next implementer action (not performed by this document)

- Prepare a fresh, non-deploying integration candidate directly from the current live source (after refresh of live marker), cherry-pick **reviewed visual-only** changes, and treat staging-only connection/auth code as a separate build path. A branch must be free from any auto-deploy triggers before pushing.
- Provision a genuinely separate Firebase project and backend/payment-test resources (never copy production secrets, residents' IDs or real financial data).
- Test every line of the matrix; do not claim production-safe from CSS comparisons.
- Produce changed-path manifest, exact candidate SHA, full test evidence and rollback Hosting version for explicit owner go/no-go.

**Non-actions:** No live or production branch changes, no database writes, no workflow runs/deployments, no secret revocations, no production login experiments.
