# VolunServe — Sir's Friday Remock Master Revision Register
**Source authority:** `Mock defense note Oct 28.docx` (9 items), `Notes-for-Remock-oct-262026 (1)(2).docx` (51 items).  
**Friday:** 2026-10-30 (original notes say remock 2–6 PM; later adviser text says after lunch). Confirm exact check-in time with adviser.  
**Audit date:** 2026-10-28. **Code inspected:** `feat/lgu-staff-guided-application-private-evidence-20261028` at `4fbf164` plus this remediation branch.  
**Never claim QA completed merely because source/CI exists.** No live deployment or real-person biometric acceptance was proven in this audit.

## Status legend
- **CODE EXISTS—QA** = implementation is identifiable in GitHub but actual device/browser testing is pending.
- **PATCH—CI/QA PENDING** = proposed code fix committed in this remediation branch; no runtime proof yet.
- **PARTIAL** = some code exists but critical acceptance or documentation remains.
- **GAP** = cannot claim feature is implemented.
- **QA / DOCS REQUIRED** = run a precise acceptance test or align thesis paper; not proven missing from every route.

## Priority order for implementation and defense
1. **Oct 28 #1 + #9**: make Edit Profile name consistent with canonical name parts and replace occupation free-text with shared signup dropdown.
2. **Oct 28 #2 + #5**: verification at signup/login, safe disposable domain risk policy, email verified route guards and anti-abuse handling.
3. **Oct 28 #3** and **Oct 26 #1/#3/#8/#9/#10**: verify Admin credential provisioning, independent staff review, role gate, full audit.
4. **Oct 28 #4/#6/#7/#8**: SJDM account constraints, red required markers, Terms modal/login, email-vs-Google signup consistency.
5. **Oct 26 #5/#6/#11/#15/#25/#26/#28/#29/#32/#41/#46/#50/#51**: full end-to-end proofs for major resident/Admin/Volunteer flows.
6. **Remaining Oct 26 code, navigation, responsive UI and paper issues**: mark each acceptance as PASS / FAIL / BLOCKED with screenshots.

## Latest Sir notes — October 28 (exact order; 9)
| # | Sir's request | Audit | Code evidence / missing acceptance |
|---|---|---|---|
| 1 | Edit Profile name persists in main profile | PATCH—CI/QA PENDING | Profile edit saves canonical fullName + first/middle/last; Firebase Auth displayName mirroring; must test actual refresh and role dashboards. |
| 2 | Reject temporary/disposable email addresses | GAP | Current signup validates email format; no confirmed disposable-domain controls or enforced verified email before every login. |
| 3 | Admin account generated inside the system | PARTIAL | Super Admin has CreateLguAdminModal and LGU staff application; requires credential verification, generated credential policy and actual login QA. |
| 4 | Only City of San Jose del Monte accounts/location | CODE EXISTS—QA | Signup fixed Region III/Bulacan/SJDM and barangay list; backend/rules + existing legacy account location controls need review. |
| 5 | Login authentication and email verification | PARTIAL | Firebase email/password authentication and dedicated Admin portal exist; mandatory email confirmation on Resident login is not demonstrated. |
| 6 | Required asterisk must be red | GAP | Signup labels contain plain *; update accessible required marker styling without changing validation. |
| 7 | Terms and Conditions causes repeated login | QA | Reproduce modal close/session, back navigation, state reset and login redirect on desktop and mobile. |
| 8 | Create Account always uses Google / confusing | PARTIAL—QA | Signup exposes Google OAuth alongside email/password; make pathways and provider-link behavior unambiguous, confirm phone UX. |
| 9 | Edit Profile occupation dropdown and name update | PATCH—CI/QA PENDING | Shared taxonomy and category/specialization/Other dropdown implemented in new revision branch; test persisted fields and reload. |

## Remock notes — October 26 (exact order; 51)
| # | Sir's request | Audit | Code evidence / missing acceptance |
|---|---|---|---|
| 1 | Log-in to Admin | CODE EXISTS—QA | Dedicated /admin-login with role gate; test approved, rejected, suspended and non-admin accounts. |
| 2 | Super Admin overview with graphs, percentages, user totals | CODE EXISTS—QA | Super Admin overview subscribes to live Firestore counts, WorkspaceBarChart and approved percentage. |
| 3 | Create Admin account / revise paper | PARTIAL + DOCS | Super Admin create and LGU applicant/promotion paths exist; diagrams/paper must describe independent authentication and verification. |
| 4 | Five accounts per page, next five | CODE EXISTS—QA | Super Admin adminPage/applicantPage and Admin account approvals use PAGE_SIZE 5. |
| 5 | Emergency reports and assistance modules | CODE EXISTS—QA | LGU Admin sidebar contains Emergency Reports and Assistance Requests; test destination routes. |
| 6 | Functional Audit Logs | CODE EXISTS—QA | Super Admin admin-logs route and log writers exist; test event persistence, filters, actor and time. |
| 7 | Official emergency hotline numbers only in System Settings | QA | Check actual configured emergency contacts and eliminate unofficial test numbers. |
| 8 | Own authentication | CODE EXISTS—QA | Separate admin-login UI with Firebase Auth and role-scoped route guards; independently tested access needed. |
| 9 | Incorrect Create and Manage in Super Admin | PARTIAL—QA | Super Admin restricted to programmer governance, LGU Admin operations isolated; review labels/permissions. |
| 10 | Promotion criteria and full credential review to prevent misclick | CODE EXISTS—QA | Applicant evidence UI, independent office/original ID attestation, review gates; must test real decision and audit. |
| 11 | All records are incomplete | QA | Audit all Admin/Super Admin Firestore-backed lists, counts, pagination, missing records and access errors. |
| 12 | Admin dashboard comparison bar chart | CODE EXISTS—QA | Role-specific dashboards and WorkspaceBarChart in Super Admin; verify Admin comparison context. |
| 13 | Paper flow starts at login before dashboard | DOCS REQUIRED | Documentation and flowchart change, compare with actual route guards. |
| 14 | Remove redundant Admin navigation/links | CODE EXISTS—QA | Grouped sidebar changes merged to main; inspect every page for duplicate primary destinations. |
| 15 | Event attendance click goes directly to process | CODE EXISTS—QA | Admin events openAttendance handler opens attendance state; verify practical clicks. |
| 16 | Account Reviews accessible from dashboard | CODE EXISTS—QA | Command center links to Resident accounts and Volunteer approvals. |
| 17 | Review accessible without wrong intermediate page | QA | Follow cards and action links, verify click path and required review modal. |
| 18 | Bulleted dashboard and accessories | CODE EXISTS—QA | Grouped/nav sections in Admin; verify display against Sir's desired hierarchy. |
| 19 | Dashboard → Account Approvals hierarchy | PARTIAL—QA | Approval modules are linked, but verify dashboard nesting and labels. |
| 20 | Dashboard shows important actionable information | CODE EXISTS—QA | Command center exposes active case, pending review and Volunteer counts; validate correctness. |
| 21 | Identity and Volunteer Approval grouping | CODE EXISTS—QA | Identity Reviews and Volunteer Applications separated. |
| 22 | Volunteer approval order is reversed | QA | Check ordering, label hierarchy and request→decision screen. |
| 23 | Emergency and Assistance Management names align with paper | CODE EXISTS + DOCS | Current menu names: Emergency Reports, Assistance Requests, Emergency & Relief; reconcile paper. |
| 24 | Admin announcement area barangay dropdown | CODE EXISTS—QA | Guided announcement selectors previously merged; verify SJDM list and admin scope. |
| 25 | Test announcement publish and receipt | QA | Submit synthetic announcement, verify audience, read, and delete permissions. |
| 26 | Live map inside Emergency Report | CODE EXISTS—QA | Admin emergency-case detail has map tab and Google Maps navigation; inspect actual integrated map. |
| 27 | Community Event proposal wording ('emergency proposal' in notes) | CLARIFY IN PAPER | Existing design uses resident community-event proposal; don't conflate emergency report with event. |
| 28 | Reject past date/time in Community Events | QA—POTENTIAL GAP | Validate UI and server-side schedule; cannot infer full date/time enforcement from navigation tests. |
| 29 | AI validates real government ID and matching name | GAP | OCR classification, face similarity and optional AWS liveness are not certified issuer authenticity/name reconciliation; manual government ID review required. |
| 30 | Create Account text overlaps | QA | 390px Android/mobile and web responsive test with keyboard open. |
| 31 | Show password on mobile | CODE EXISTS—QA | Signup password Field and Admin login have eye toggle; mobile runtime needed. |
| 32 | Terms consistent; under-17 may not login | CODE EXISTS—VERIFY POLICY | Signup currently enforces age >=18, which is stricter than Sir's under-17 request; verify desired minimum age and backend checks. |
| 33 | Capture ID looks like a button | CODE EXISTS—QA | LGU staff intake has distinct camera/upload buttons; Resident ID verification capture needs separate test. |
| 34 | Loading state on buttons | CODE EXISTS—QA | Signup and LGU registration show ActivityIndicator while saving; test all key actions. |
| 35 | Simplify identity-verification notes | QA + COPY | Review resident and staff privacy/ID notices and rewrite only with approved policy. |
| 36 | Phone UI polished | QA | Test common widths, keyboard, modal and scroll overflow. |
| 37 | Protected modules start from login | CODE EXISTS—QA | Role route guards present; test deep links, stale sessions and signout. |
| 38 | Request Assistance sentence construction | QA + COPY | Compare user-facing instructions, form labels and confirmation language. |
| 39 | Request Assistance boxes turn red on invalid | QA | Inspect validation-specific error styling and failed submit. |
| 40 | Request Assistance description dropdown plus Others | QA | Check actual Assistance request form values against requested preset choices. |
| 41 | Request Assistance confirmation checkbox | QA | Check form validation and consent before submission. |
| 42 | Volunteer switch does not require second login | PARTIAL—QA | Single Resident/Volunteer account mode exists; no independent Volunteer password path intended. |
| 43 | Explain Volunteer mode in paper | DOCS REQUIRED | Describe Verified Resident→Volunteer application→Admin approval→mode switch without second login. |
| 44 | My Reports and Verification separate for Verified Residents | CODE/PAPER QA | Inspect sidebar and chapter p23; restore distinct pages if combined. |
| 45 | Switch mode to Verified Resident | CODE EXISTS—QA | setActiveMode resident/volunteer with eligibility control; test switching and private data. |
| 46 | Accepted/declined decisions visible | QA | Test status changes and notifications with separate accounts. |
| 47 | Map embedded in Volunteer Task for Verified Residents | QA | Inspect Volunteer tasks pages for route/map and no duplicate tabs. |
| 48 | Remove intrusive alert popups | QA | Check browser/native Alert usage and replace only unnecessary prompts; keep security errors. |
| 49 | AI verification: consult project reviewer | GAP / EXTERNAL REVIEW | Need approved verification scope, QA and non-fabricated recognition claims. |
| 50 | Emergency task response flow | QA | Test actual incident→Admin assign→responder response→resident status with synthetic data. |
| 51 | Community Events members list | QA | Check join count, member identities, privacy and attendee list in Admin/Volunteer pages. |

## Evidence to attach for PASS
For each item capture **branch/commit, file(s), test command, user role, browser/device, expected result, actual result, screenshot/video filename and PASS/FAIL/BLOCKED**. For login, test wrong-password, unverified email, suspended, applicant, and resident access attempts. For money only use PayMongo sandbox plus **simulated** disbursement; never assert actual GCash/Maya transfers. For biometric data use synthetic evidence and private/local emulators until privacy approval and device QA.

## Do not ship / self-approve
The private LGU staff evidence intake remains **disabled by default** in production. OCR keywords do not establish official ID authenticity; MediaPipe face landmarks are not a calibrated biometric identity match; AWS active liveness needs real provider credentials, privacy approvals and physical camera QA. No code or UI should silently promote an Admin based on AI, and no fake successful validation may appear in defense.
