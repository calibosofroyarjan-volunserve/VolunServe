# VolunServe — Design identity and validation review (preview only)

Status: **PROPOSED / NOT DEPLOYED**. Built on `fix/ui-consistency-dialog-20261107`.
No changes in this preview to Firestore Security Rules, Firebase Auth configuration, database records, backend endpoints, donation processing, or production hosting.

## Identity
- Brand: VolunServe — Community service & volunteering, City of San Jose del Monte, Bulacan.
- Brand palette: forest sidebar, emerald primary actions, white content surfaces, gray-green borders. **Red is for errors/emergencies** and amber for warnings only.
- Typography: system sans / Inter fallback. Restrained 26px page titles, 18px sections, 14px body, 13px labels, 12px captions. Avoid mixed decorative fonts and excessive 900-weight text.
- Icons: one outline family (Ionicons), one semantic symbol per module. **Keep existing VolunServe logo asset.** Do not present false official government affiliation.
- UI elements: 44px minimum actions, consistent 8/10/12px radii, clear keyboard focus, inline validation, concise English interface copy, 5-row paging where already required.
- Preview: separate self-contained HTML mock for review, with mock records only. It is not a functioning app deployment.

## Active workspace inventory and proposed icon mapping

| Role | Module | Proposed icon | Validation category |
| --- | --- | --- | --- |
| Resident | Overview | home | Read-only stats |
| Resident | Identity Verification | shield-checkmark | Identity consent, accepted ID type, upload review, admin approval |
| Resident | Emergency Reports | alert-circle | Title, details, SJDM location; **server-side** authorization and coordinates |
| Resident | Request Assistance | hand-left | Evidence, description, amount if applicable |
| Resident | Community Events | calendar | Event details, participation eligibility |
| Resident | Donations | heart | Amount, campaign eligibility; payment handled server-side |
| Resident | Community Updates | megaphone | Read-only announcement list |
| Resident | Notifications | notifications | Read-only notifications |
| Resident | Volunteer Application | person-add | Skills, availability, experience, motivation |
| Resident | Profile | person-circle | Name, optional contacts, protected fields |
| Volunteer | Emergency Tasks | hand-left | Accept/decline transitions and field completion details |
| Volunteer | Event Attendance | checkmark-done | Time-in/out eligibility and duplicate prevention |
| Volunteer | Certificates | ribbon | Read-only verification and certificate display |
| Admin | Command Center | home | Filters and review actions |
| Admin | Identity Reviews | shield-checkmark | Verified review outcome and audit |
| Admin | Emergency Reports | alert-circle | Case validation before assignment |
| Admin | Request Assistance | hand-left | Verification, document and decision controls |
| Admin | Community Events | calendar | Publishing details and roster management |
| Admin | Event Attendance | checkmark-done | Time and participant review |
| Admin | Certificates | ribbon | Issuance/verification |
| Admin | Donation Management | heart | Financial evidence and approval; preserve checkout |
| Admin | Announcements | megaphone | Title 3-120, message 10-2000, inline errors **wired in this preview branch** |
| Admin | My Profile | person-circle | Name/contact validation **wired in this preview branch** |
| Super Admin | System Overview | home | System metrics |
| Super Admin | Admin Accounts | people | Authorized role and account edits |
| Super Admin | Audit Logs | time | Read-only audit records |
| Super Admin | System Records | albums | Read-only records |
| Super Admin | System Settings | settings | Parameter range, emails and retention |

## Validation implementation status
- **Implemented in this branch:** reusable typed, pure `validateField` and `validateValues`, 12 form validation policy groups in `lib/volunserveValidation.ts`; Admin announcement title/message submit-time and per-field errors; Admin profile contact submit-time checks; Volunteer application shared checks and more precise feedback.
- **Already-existing validation to preserve, not reimplemented here:** Volunteer accept/decline/completion transactions, admin case verification, account roles, event participation, donations, identity processing, Firestore security rules.
- **Not yet proven or integrated across every screen:** every other form's inline errors and unified look. The policy registry is a checklist, **not live protection**. Must inspect each screen and its server-side validation before claiming coverage.

## Release acceptance criteria
1. Open mock preview on desktop and mobile; review and approve layout, copy, iconography, brand.
2. CI passes: custom validation tests, existing portal tests, TypeScript compilation, Expo web export. No CI job deploys.
3. Manual role-based QA on isolated staging Firebase (never production): resident, volunteer, admin, superadmin; unauthorized access, submission/undo, event join, donations sandbox, notifications, certificates, mobile responsive.
4. Verify accessibility (tab order, focus, color contrast, readable errors); validate empty, min/max, invalid formats and duplicate submits.
5. Confirm true backend/Firestore authorization; client validation by itself is insufficient.
6. Only after user review, plan a scoped merge and an explicit separately approved production release.

## External design references
- Atlassian Design System design tokens, typography and iconography.
- U.S. Web Design System typography guidance.
- GOV.UK Design System inline error messaging and error summary patterns.
