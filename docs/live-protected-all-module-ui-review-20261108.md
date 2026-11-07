# VolunServe — Protected-live UI refinement and module validation plan
Date: November 8, 2026

## Source of truth

- Exact protected-live starting SHA: `8ea1d1a1f3a50ce7468180b948e94254416914bf`.
- Proposed review branch: `design/live-protected-all-modules-ui-20261108`.
- No release from outdated `main`; no direct writes to `live-protected`.
- Existing official production destination remains Firebase Hosting (project `volunserve-3aa5b`), with `volunserve.com` as custom domain. Design review is **not deployed**.
- Existing backend and identity services are out of scope for this styling change.
- The live Resident Home component `components/home/Home.web.tsx` is **untouched**, preserving its original banner, greeting, SJDM seal, weather, activity cards, Community Updates and Emergency Contacts.

## UI/UX direction

- Retain original emerald navigation, role-specific layouts and original Home hero artwork.
- Harmonize typography using `constants/volunserveLiveUi.ts`: page, section, card, body, label, metadata, eyebrow.
- Apply shared text roles to **actual module route source**, not the public sample preview.
- Keep original buttons, handlers, Firestore queries, assignments, notifications, uploads, donations, time-in/out, certificates, authentication and permissions.
- Honor responsive and special layouts (long hero text and compact variants stay distinct where no override was made).
- Follow broadly accepted enterprise UI patterns: clear heading hierarchy, 44-point touch target guidance, legible text, consistent spacing, visible loading/errors, and no surprise actions.

## Scope and validation boundaries

1. **Static guard** scans all TSX routes in `app/` and inventories TextInputs, handlers and possible validation signals in `reports/live-protected-ui-audit.md`. It checks every modified route has no changes outside the styling object and the new presentation-only import.
2. **Existing functional contract tests** cover login/signup, role navigation, Resident/Volunteer flow, Admin/Super Admin, pagination, volunteer time-in/out and community events, and other selected core behavior.
3. **TypeScript and Expo web export** must pass on this exact branch.
4. **Authenticated stage environment QA is still necessary** before any live rollout: Resident, Volunteer, Admin, Super Admin logins; records, forms, error states, input validation, uploads, donations sandbox, notifications, and approval/assignment completion.
5. **Visual QA is still necessary** in real desktop, tablet and phone browsers at 1440, 1024, 768, 390 and 320 CSS pixels. Check long names, menus, modal scroll, focus/keyboard, alerts, empty and loading states, and document accessibility.
6. A source-level validation signal is *not evidence that validation actually works* or that a malicious client cannot bypass it. Firestore rules and backend validations are independent security checks, untouched by these UI updates.
7. Do not claim 100% fully working, no visual regressions, or final production-ready based on the code audit alone.

## Release gates

- Freshly verify current production Hosting fingerprint and protected-live branch head before merge; stop if either changed.
- Inspect the diff side by side with the authentic production Home design; do not substitute a mockup preview.
- Resolve any failing tests and inspect the audit's outstanding validation cases.
- Review with authorized staging accounts before approving a PR to `live-protected`.
- Keep the production Firebase project, Auth, Firestore rules, Cloud Functions, Render backend, Cloudinary, PayMongo and all user data unchanged in a *Hosting-only* design release.
- Production should be published only from the verified protected-live source after checks and explicit approval; never from stale `main`.

## Reference patterns (not copied branding)

- Atlassian Design System typography: https://atlassian.design/foundations/typography
- Material Design accessibility and touch targets: https://m3.material.io/foundations/accessible-design/overview
- WCAG 2.2 understanding of target sizing: https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
