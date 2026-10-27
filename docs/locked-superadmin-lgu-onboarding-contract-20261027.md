# LOCKED — VolunServe Super Admin and LGU Admin onboarding contract
Date: 2026-10-27. Priority: complete this administrative flow BEFORE any further resident/volunteer UX expansion.

## Immutable separation of duties
- Super Admin = programmer/system governance: independently confirm LGU employment/authorization, promote pending LGU staff, manage access, audit and settings. Never approve emergency dispatch, donation releases, or city-service operations.
- LGU Admin = verified operational LGU staff: city services, identity/volunteer reviews, emergencies, events, attendance, certificates, announcements, disputes, and donation operations.
- Never create LGU Admin directly from a general resident account. The only normal grant is PENDING LGU STAFF APPLICANT -> independently verified -> PROMOTED ADMIN with atomic credential review/audit. Existing login remains independent.
- A real face and even an authentic government ID do NOT by themselves prove employment or authority to serve as LGU Admin.

## Mandatory guided application and confirmation lifecycle
1. Staff applicant registers with official name, email, office/department, position, assigned locality, appointment reference and password; no administrative permission.
2. Applicant selects a supported GOVERNMENT-ISSUED PHOTO ID only. School IDs and company IDs are not substitutes for the primary government identity proof; LGU employee ID can be supplementary.
3. Guided capture of relevant front/back ID surfaces per supported ID type (if an ID has no reverse-side identity data, don't invent it); OCR extracts relevant fields, flags low-quality scans and discrepancies. ID validation and OCR must be described as assistance, NOT proof of authenticity unless an approved source confirms it.
4. Guided live selfie and tested liveness + optional face-to-government-ID comparison, with consent, accessible exception/manual review and no publicly displayed match score. Do not mark these functional without a real, validated provider/integration.
5. Applicant uploads employment evidence: certificate of employment OR appointment document; and a signed official authorization/endorsement for administrative access. Private, access-controlled storage; restrict MIME, file size, downloads, retention, and reviewer access. Never expose IDs/selfies in public profile or logs.
6. Super Admin reviews submitted identity and appointment evidence, checks discrepancies, then INDEPENDENTLY confirms employment and scope via in-person official office visit, independently sourced LGU callback, verified institution email, personnel/appointment records, or Other with substantive source details. A method selection alone is not evidence that confirmation occurred.
7. Review actions: Pending; Request More Information; Retake ID/Selfie; Manual Review; Confirmed Identity; LGU Employment Confirmed; Rejected (with reason); Promoted. Limit attempts and never automatically reject only because of model confidence.
8. Promote to LGU Admin ONLY when legally permitted, all required evidence and independent confirmation are successful; record actor, time, target, source/reference and atomic audit. Never rely solely on client/UI gates.
9. Approved LGU Admin signs in through independent admin login and arrives at Command Center. Suspended/revoked access is enforced by server rules.

## UX/UI (premium emerald, non-redundant)
- Wizard on application: 1. Staff Details -> 2. Government ID -> 3. LGU Documents -> 4. Submission Review; applicant sees status and actionable errors.
- Super Admin opening screen: actual pending staff applications, active/suspended Admins, registered counts, recorded Admin actions and governance changes. Overview is summary; detailed review happens once in LGU Staff & Admin Accounts.
- Staff account review: Applicant Summary -> Submitted Evidence -> Independent Verification -> Three confirmations -> Promote. Wide responsive panel; one primary action; no duplicate Create Admin shortcut.
- LGU Admin opening screen: Command Center with urgent operational queues and links to existing authorized modules. Do not copy Super Admin account verification into LGU Admin portal.
- Prefer compact select/dropdown plus Others -> specify for closed sets (department, case classification, verification method). Do not use Others to override roles, access scope, ID eligibility or unsupported documents.
- Pagination EVERY admin-facing potentially long record list: 5 rows/page by default (including pending staff, existing Admin accounts, audit activity, personnel and operational queues as appropriate); search/filter then paginate; Previous/Next, page X of Y, loading/empty states, no missing rows or forced huge nested scroll panels. This is a requirements target; existing pages must be audited before claiming implemented.

## Release gates / honest status
- Current source already has staff application, independent review/promotion, some account pagination, and Firestore promotion rule guards.
- Not yet verified/implemented across the full flow: private identity document storage and permissions, OCR, approved-ID authenticity checking, liveness, government-ID face matching, structured document submission, and complete pagination across all admin lists.
- No production deployment/role change until code, Firestore-emulator security, TypeScript, Expo Android/web bundle, authorized test accounts and real browser E2E pass.
- Never write real personal government IDs or biometrics as test fixtures. Use synthetic/test data.
- Preserve original local VS Code worktree and all existing emergency GPS, events, certificates, donation and authentication features.
