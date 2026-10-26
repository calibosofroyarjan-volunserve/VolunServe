# VolunServe — Remock alignment / acceptance contract (26 Oct 2026)

**Sources:** `Notes-for-Remock-oct-262026.docx` (9 pages) and `VolunServe_Mock_Defense_LatestEdit (2).docx` (84 pages). **This is a worklist, not a declaration of completion.** The next remock is Friday, 30 October 2026, 2–6 PM, per notes.

## Blocking: verify with the actual professor's checklist

| Priority | Required behavior | Current evidence from main code | Verification / acceptance test |
|---|---|---|---|
| P0 | Separate Admin login; login before any Admin/Super Admin dashboard | `app/admin-login.tsx` already exists and authenticates with Firebase; `app/login.tsx` and `app/login.web.tsx` link to it. This still needs **production deployment and browser test**, and paper must show login first | Private window: unauthenticated /admin redirects to login; normal Resident admin-login rejected; valid Admin enters Command Center; suspended Admin rejected; Super Admin routed correctly. |
| P0 | Legitimate LGU Admin enrollment and documentary credentials, no blind Resident promotion | `app/(superadmin)/admin-accounts.tsx` currently promotes any approved non-admin account using a Firestore batch. This does **not** prove LGU employment; flow is incomplete | Obtain authorized LGU eligibility criteria, employment identifier verification, private evidence access, approval decision, explicit credential review and audit log; enforce on backend/Firestore, not only button. Test unverified user denied. |
| P0 | Paper roles and sequence align with exact routes and outputs | Scope currently lists Super Admin, Admin, Basic Residents, Verified Residents, Volunteer, Guest | For each role, document Sign-in → authentication → authorization → dashboard → authorized actions → logout. **Volunteer uses same Resident login and switches mode, no second login.** |
| P0 | True complete end-to-end demo, not mock status | Need live test accounts and backend/Firebase connectivity | Screen-record unedited test of each published feature; clearly distinguish PayMongo Test Mode and unsupported payout. |
| P0 | Identity ID valid and name consistent; AI uncertainty escalates | Python MediaPipe service has a /verify endpoint; don't assume name validation or ID authenticity without testing | Real sample allowed ID types; mismatched name rejected or put under manual review; invalid document rejected; failed AI -> safe manual LGU review, no auto-approval. |
| P0 | Emergency/assistance records and full map lifecycle | `app/(admin)/admin-cases.tsx`, `assistance-requests.tsx`, `admin-live-map.tsx` exist | Resident creates evidence+location; Admin reviews; Volunteer accepts/declines; GPS within case/task context; progress/status visible; all audit logged. |
| P0 | Mobile signup and age/terms consistent | `app/signup.tsx` and `signup.web.tsx` currently enforce 18+; remock notes say block **below 17** — **conflict to clarify, don't quietly weaken policy** | Resolve age threshold with adviser and reflect same rule in UI, server authorization, and paper. Responsive signup, toggle password, visible capture ID and loading. |
| P1 | Super Admin account lists paginated 5 per page | **PR from this work:** 5 entries per page with Previous/Next; not live until merged/deployed | 12 test accounts should paginate 5/5/2, searching/filtering resets page, no missing results. |
| P1 | Super Admin dashboard actual graphs and percent totals | **In this PR:** `app/(superadmin)/index.tsx` subscribes to real Firestore record totals with bar comparisons and percent of approved user accounts; this still requires **Firestore-permission testing and deployment** | Confirm actual count consistency with approved Firestore docs, graceful permission errors, mobile responsiveness, and reload. |
| P1 | Super Admin All Records complete | `app/(superadmin)/all-records.tsx` has several collections; review missing assistance request collection | Test real request visible and counted, search, access control, errors. |
| P1 | Super Admin audit logs complete | `app/(superadmin)/admin-logs.tsx` exists | Initiate action -> durable stored log -> reload -> visible, actor/time/target; failure of audit should not be misrepresented as success. |
| P1 | Admin dashboard actionable account reviews, correct module naming, event attendance direct click | `app/(admin)/command-center.tsx` and routes exist | Active review cards navigate to relevant work queue; correct identity then volunteer order; no duplicate sidebar actions; direct attendance process. |
| P1 | Announcement barangay selection and recipient filtering | `app/(admin)/create-announcement.tsx` currently hard-wires own assigned barangay | Clarify authorized scopes, provide allowed dropdown(s), test that unrelated barangays cannot receive/read restricted message. |
| P1 | Events reject concluded/past date-times in local time | Resident event proposal code must be audited | Date/time validation at UI AND backend: start > now, end > start, closed events not selectable, tests including time zones. |
| P1 | Request Assistance clearer fields and validation states | `app/(tabs)/resident.tsx` wizard exists | Correct prose; red errors on invalid required fields; short description select + Other; checkbox, loading, successful request trace. |
| P1 | Volunteer mode and response task joined GPS, accept/decline, avoid intrusive alerts | Existing volunteer module and `ResponseFlow.web.tsx` require audit | Same Resident login, approved volunteer role gate, accepts/declines persisted; task map shown in task; proper admin updates. |
| P1 | Verified Resident My Reports and Identity Verification separate | Existing role navigation requires audit | Two clearly separate panels and correctly named paper role and screenshots. |
| P1 | Community Events participant list | Events code has participants logic but must test | Admin/Resident authorized view of actual member list, no leaking private identity docs. |
| P1 | Official emergency hotline alone contains official number | `(superadmin)/system-settings.tsx` requires audit | Official public hotline distinct from personal/admin number; no conflicting public number. |

## Correct role flows for paper and system

### Super Admin
**Administrative sign-in (email/password via Firebase Auth)** → authorized active Super Admin check → dashboard with authentic analytics → create/review/manage verified LGU Admin accounts → read all authorized records → audit logs → official system settings → sign out. Do not mix with LGU donation payment processing.

### LGU Admin
**Administrative sign-in (existing own admin identity)** → authorized active Admin check → Command Center with account queues → review pending identities, then volunteers → review emergency/assistance cases and maps → coordinate response → manage community events/attendance/certificates → publish verified donation campaigns and reconcile sandbox payments → announcements/reports → sign out.

### Resident / Volunteer
Guest (public-only) → Resident sign up → **Resident sign in** → Basic Resident → ID + selfie AI verification or manual review → Verified Resident → protected assistance and event proposals → apply for volunteer → Admin approval → switch to Volunteer Mode using **the same signed-in account** → task acceptance/decline, map, attendance and certificates. No duplicate Volunteer credential system.

## Non-negotiable security and acceptance rules

- No public/ordinary user can grant own Admin role, change approval or forge verified Firestore financial totals.
- Backend authorization and Firestore rules must enforce actual actor roles; hide-only UI is not authorization.
- Do not change age cutoff without reconciling the 17/18 conflict with adviser.
- ID photos and LGU credential evidence stay private; visible account confirmation may show **safe profile/credential metadata** only, not passwords or secret keys.
- Real funds must not be represented by PayMongo sandbox demos.
- For every item: code review → typecheck and production Expo export → deploy Firebase/Render separately → real sign-in E2E test → capture evidence and status (PASS/FAIL/BLOCKED). The existence of a screen or passing CI does not prove functionality.
