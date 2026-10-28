# Sir Pavia — VolunServe Final Revision Register
**Review date:** October 28, 2026  
**Defense checkpoint:** Friday, October 30, 2026 (after lunch)  
**Source:** Six photographed annotated manuscript pages (16–21), typed remock observations, and original VolunServe thesis DOCX.  
**System branch:** `fix/pavia-final-scope-revisions-20261028` (stacked on draft PR #144, not deployed).  
**Paper:** separately generated revised Scope & Limitations DOCX (the original Library DOCX remains unchanged).

### How to interpret status
- **Existing code:** Source was found; not an assertion that all real-account flows are tested.
- **Changed here:** New committed source on this branch, not production deployment.
- **Still open:** Must not claim completed during defense.
- **Requires decision:** Security or scope policy must be approved before implementation.

## 1. Super Admin (developers / system account oversight)
| Sir Pavia observation | Verified source / required behavior | Status |
|---|---|---|
| Login must precede dashboard; own authentication | `app/admin-login.tsx` is a dedicated operational entry; `app/(superadmin)/_layout.tsx` rejects wrong role | Existing code; real sign-in not yet proven |
| Dashboard graphs, percentage, active-user count | `app/(superadmin)/index.tsx` has source-driven KPIs and percent/visuals | Existing code; check real data |
| Create/manage wording is incorrect | Staff **apply** first, independent Super Admin credential review, promotion/suspension recorded; no unverified direct Admin creation | Revised in paper; current code in `admin-accounts.tsx` |
| LGU staff credentials must be visible and independently verified | Fields for office, position, credential reference, verification method, in-person original government ID, evidence acknowledgments | Existing code; authenticity requires human observation |
| Admin account list needs 5 per page | `ADMIN_PAGE_SIZE = 5` | Existing code |
| All Records missing emergency/assistance | `app/(superadmin)/all-records.tsx` has Emergency Cases, Assistance Requests, Volunteer Applications, Events and other tabs | Existing code; check real reads |
| Audit Logs functional | `admin-logs.tsx` subscribes to `adminLogs` and `adminActivityLogs` | Existing code; missing action writers and permissions need audit |
| System Settings official numbers only | Require verified official source with recent verification; no sample numbers | Still open: cross-module contact audit |
| Super Admin must not release donations / dispatch | Operational actions limited to LGU Admin; maintain role checks | Paper revised; existing code/rules to regression-test |

## 2. LGU Admin
| Observation | Decision / evidence | Status |
|---|---|---|
| Separate Admin login + correct role access | `/admin-login` and guards already exist | Existing code |
| Dashboard account-review visibility and useful graphs | Command Center + `WorkspaceBarChart`; detailed review in separate functional queue | Existing code; assess click-through in browser |
| Identity and Volunteer Approval names/order | `Identity Reviews`, `Volunteer Applications` actual screens | Paper revised; existing UI |
| Emergency and Assistance Management missing naming | `Emergency Reports`, `Assistance Requests` actual modules | Paper revised |
| Map should be INSIDE Emergency Reports | Resident `Report Emergency / Track Response`; Admin `admin-cases` → authorized map; no duplicate Resident sidebar | Existing draft PR #144; not deployed |
| Redundant admin sidebar/old Attendance route | Route grouping exists; avoid breaking existing Event Attendance processing | Still open: human usability walkthrough |
| Announcements should allow barangay dropdown | Searchable 62 official SJDM barangays; Firestore create permits approved city LGU Admin selecting exactly one verified SJDM barangay, forbids Residents/Super Admin and creator impersonation | **Changed here; authorization expanded beyond previously assigned-only area — LGU approval required** |
| Event approval past-date validation | Admin checks future date and endTime; client now also refuses joining expired events | Changed here |
| Community Events participant list | `app/(admin)/community-events.tsx` renders joined Volunteers | Existing code |
| Donation/assistance process | Actual transactions, approval, evidence and permissions; sandbox-only claims | Still open: full simulated end-to-end |

## 3. Public signup, authentication and profile
| Observation | Evidence / action | Status |
|---|---|---|
| Registration Login-first and same credentials | Separate login and signup; Resident→Verified→Volunteer mode transition | Existing code/paper revised |
| Mobile password eye | Web and native `Field` show/hide toggles already implemented | Existing code |
| Signup text overlap / phone layout | Responsive form exists but must be checked at 360px, 390px, 768px | Still open: visual screenshots |
| Red required-field asterisks | Signup Field/Dropdown labels now render red `*` | Changed here |
| Always Google on Create Account | Native create-account entry is now email/password-first; Google not required; existing Google-linked account compatibility retained | Changed here |
| Temporary email accepted | Known disposable domains blocked before Auth UID creation | Changed here, **not comprehensive** |
| Email authentication | New email/password signup attempts to send Firebase verification link; Basic account still usable without enforced email-verification gate | Changed here; **remaining security gate open** |
| Under-17 access restriction | Existing policy is **18+**, stricter than handwritten below-17 note. Firestore signup rule now rejects under-18 profile and mismatch with Auth email | Changed here; do not claim DOB authenticity |
| Terms match actual platform | 18+, SJDM, no automatic 911 dispatch, consent/location dependency and sandbox donation limits added to mobile/web terms | Changed here |
| ID capture button and loading | Existing web camera flow; cannot assert all device browsers are functional | Still open: browser/mobile capture smoke |
| AI verifies valid government ID/name | AI-assisted comparison cannot prove official document issuance. Human reviews and evidence gates must be represented accurately; name mismatch must be safely rejected or flagged | **Still open — authenticity claim prohibited** |
| Edit profile name/occupation | Profile writes canonical name and separate legal fields, updates Firebase Auth displayName, has occupation dropdown | Existing code; test persistence after logout/login |

## 4. Emergency, assistance, events and Volunteer
| Observation | Decision / evidence | Status |
|---|---|---|
| Volunteer uses same approved Resident login | `Switch to Volunteer Mode` | Existing code/paper revised |
| Volunteer Accept/Decline missing | `volunteer.tsx`, `volunteer.web.tsx` include `offered→accepted/declined` transitions | Existing code; test account |
| Emergency response map must live in task | Original deep link retained from Volunteer Tasks; Resident map in Emergency Reports | PR #144; draft/not deployed |
| No fabricated LGU/shelter/GPS | Two sourced permanent Dulong Bayan building pins; other pins only from authorized records. Recorded route estimates are not live Google traffic | PR #144; current real facility dataset not fully independently audited |
| Ended events still joinable | Added schedule-based guard in UI and transactional recheck; Admin verifies start/end time | Changed here; browser still needed |
| Time-In/Time-Out/certificates | Existing server-timestamp and Admin verification logic | Existing code |
| Event member list | Existing joined participants view | Existing code |
| Event GPS organizer privacy | Uses consent and joined participant scope | Existing code, verify permission rules |
| Request Assistance text, dropdown, confirmation checkbox, errors | Added optional suggested short descriptions with free-text fallback and a mandatory accessible declaration checkbox before submission; existing amount, supporting evidence and step validation retained | **Changed here; real form/browser test still required** |
| Volunteer history/notification duplication | Use My Progress/Notifications for Volunteer; personal Donations through Resident Mode | Paper revised; navigation audit open |
| Profile edit dropdown | Occupation category/specialization implemented | Existing code |

## 5. Documentation (revised in separate DOCX, not uploaded over original)
- Title: **Scope and Limitations of the Study**.
- Roles ordered: **Super Admin → LGU Admin → Basic Resident → Verified Resident → Volunteer → Guest User**.
- Every operational role explicitly starts at login, except Guest public information.
- **Super Admin approves vetted staff; it is not the LGU command, emergency dispatcher or donation fund handler.**
- No duplicate Volunteer account login; same identity changes active workspace.
- Verified Resident emergency map is under Emergency Reports; Volunteer case navigation remains under Tasks.
- System describes real saved cases, not automatically confirmed dispatch/physical capacity/official ID authenticity.
- Limitations are now written with explanatory labels rather than unsupported blanket claims.

## Release/test gates
1. `node --test scripts/test-pavia-final-flows.cjs` for event schedule boundaries and UI wiring.
2. `npx firebase emulators:exec --only firestore --project demo-volunserve "node scripts/test-pavia-resident-registration-rules.cjs"` for actual registration permissions (synthetic records only).
3. Test announcement role and author permissions using `scripts/test-pavia-announcement-rules.cjs`; run existing admin, staff auth, emergency, event and GPS route checks.
4. `npx tsc --noEmit` + `npx expo export --platform web`.
5. Browser manual: Resident signup and identity review; Admin and Super Admin login; case, volunteer approval and event Join/Decline; original profile name/occupation after refresh; mobile width.
6. Do **not** merge, call live fully functional, or update Firebase production until branch-stack review and real-account preview acceptance.

## Key unresolved architectural risks
- Email-verification link is not yet an access-enforcement gate for all authenticated Basic Resident actions.
- Disposable-email blocklist cannot cover every temporary provider.
- AI document authenticity and face-name/legal identity matching require independent review and field-level rejection evidence.
- Announcement barangay picker conflicts with current rule locking LGU Admin to assigned barangay.
- Separate LGU Personnel account/attendance code still exists and should not be silently deleted without schema/roles migration.
- PayMongo sandbox and LGU simulated fund release must never be called real money.
