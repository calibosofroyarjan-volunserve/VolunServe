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
| LGU staff email ownership and suspended-account security | New staff applications require `emailVerificationRequired: true`; Firestore rejects disabling that flag; login and restored sessions deny `adminStatus: suspended` | Code committed to PR #145; emulator/CI verification pending, no production account created |
| Live staff ID and selfie intake | Production staff evidence collection remains intentionally gated until privacy/security release approval; emulator preview does not imply live enrollment is available | **Release blocker** for full real LGU staff application workflow; do not claim it works in production |
| Admin account list needs 5 per page | Super Admin Admin accounts **and** LGU applicants both use 5 per page; Previous/Next buttons | Implemented in source; actual browser paging still to test |
| All Records missing emergency/assistance | `app/(superadmin)/all-records.tsx` has Emergency Cases, Assistance Requests, Volunteer Applications, Events and other tabs | Existing code; check real reads |
| Audit Logs functional | `admin-logs.tsx` subscribes to `adminLogs` and `adminActivityLogs` | Existing code; missing action writers and permissions need audit |
| System Settings official numbers only | Require verified official source with recent verification; no sample numbers | Still open: cross-module contact audit |
| Super Admin must not release donations / dispatch | Operational actions limited to LGU Admin; maintain role checks | Paper revised; existing code/rules to regression-test |

## 2. LGU Admin
| Observation | Decision / evidence | Status |
|---|---|---|
| Separate Admin login + correct role access | `/admin-login` and guards already exist | Existing code |
| Dashboard account-review visibility and useful graphs | Command Center + `WorkspaceBarChart`, clickable review queue; Admin Resident and Volunteer approvals each show 5 per page | Existing implementation; browser click-through still to test |
| Identity and Volunteer Approval names/order | `Identity Reviews`, `Volunteer Applications` actual screens | Paper revised; existing UI |
| Emergency and Assistance Management missing naming | `Emergency Reports`, `Assistance Requests` actual modules | Paper revised |
| Map should be INSIDE Emergency Reports | Resident `Report Emergency / Track Response`; Admin `admin-cases` → authorized map; no duplicate Resident sidebar | Existing draft PR #144; not deployed |
| Redundant admin sidebar/old Attendance route | Route grouping exists; avoid breaking existing Event Attendance processing | Still open: human usability walkthrough |
| Announcements should allow barangay dropdown | Searchable 62 official SJDM barangays; Firestore create permits approved city LGU Admin selecting exactly one verified SJDM barangay, forbids Residents/Super Admin and creator impersonation | **Changed here; authorization expanded beyond previously assigned-only area — LGU approval required** |
| Event approval past-date validation | Resident and Admin share Asia/Manila schedule validation; newly published events store startsAt/endsAt for Firestore server-time Join gate; legacy events require migration for uniform protection | Changed, emulator tests; browser test still needed |
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
| Temporary email accepted | Resident web/mobile prevalidate; registration, LGU staff intake and Admin creation block 51,321 known MX-validated disposable domains and subdomains before creating accounts | Implemented in source; cannot block **every** unknown domain without trusted Identity Platform beforeCreate |
| Email authentication | New email/password signups send confirmation email, sign out, and are denied protected login, root route and Firestore permission until verified; legacy accounts unchanged | Implemented in source, emulator tested; browser delivery/sign-in test pending |
| Under-17 access restriction | Existing policy is **18+**, stricter than handwritten below-17 note. Firestore signup rule now rejects under-18 profile and mismatch with Auth email | Changed here; do not claim DOB authenticity |
| Terms match actual platform | 18+, SJDM, no automatic 911 dispatch, consent/location dependency and sandbox donation limits added to mobile/web terms | Changed here |
| ID capture button and loading | Existing web camera flow; cannot assert all device browsers are functional | Still open: browser/mobile capture smoke |
| AI verifies valid government ID/name | Face-only AI decisions always stay pending; LGU Admin must independently review original ID and confirm legal name. No automatic official-ID issuance/OCR authenticity proof exists | Manual gate implemented; **automated ID authenticity/real name matching still open** |
| Edit profile name/occupation | Polished emerald Edit Profile with First/Middle/Last Name fields, searchable official SJDM Barangay dropdown, Occupation and Specialization dropdowns, vertically scrollable form with visible scrollbar and fixed Save/Cancel footer. Legal name saves independently of unchanged occupation; canonical `fullName` updates Firestore/Auth and Home prioritizes it. | Updated in PR #145 with regression tests; **TypeScript/CI and browser/mobile acceptance pending; production not deployed** |

## 4. Emergency, assistance, events and Volunteer
| Observation | Decision / evidence | Status |
|---|---|---|
| Volunteer uses same approved Resident login | `Switch to Volunteer Mode` | Existing code/paper revised |
| Volunteer Accept/Decline missing | `volunteer.tsx`, `volunteer.web.tsx` include `offered→accepted/declined` transitions | Existing code; test account |
| Emergency response map must live in task | Original deep link retained from Volunteer Tasks; Resident map in Emergency Reports | PR #144; draft/not deployed |
| No fabricated LGU/shelter/GPS | Two sourced permanent Dulong Bayan building pins; other pins only from authorized records. Recorded route estimates are not live Google traffic | PR #144; current real facility dataset not fully independently audited |
| Ended events still joinable | Philippine time client guard + transaction + newly published event server-time gate; existing legacy records without timestamps need migration | Implemented for new events, legacy remains open |
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
- Email delivery/sign-in must still be checked with a real new account; source and Firestore emulator enforce new-account email verification before protected access.
- Offline disposable-domain list covers over 51,000 known providers; newly created or private domains can still bypass unless Firebase Authentication with Identity Platform blocking functions are configured. No account plan/upgrade change made.
- AI document authenticity and face-name/legal identity matching require independent review and field-level rejection evidence.
- Announcement barangay picker conflicts with current rule locking LGU Admin to assigned barangay.
- Separate LGU Personnel account/attendance code still exists and should not be silently deleted without schema/roles migration.
- PayMongo sandbox and LGU simulated fund release must never be called real money.

## October 28 additional pagination and registration review
| Specific reviewer requirement | Source behavior | Honest acceptance status |
|---|---|---|
| Super Admin Admin accounts: 5 accounts per page | `app/(superadmin)/admin-accounts.tsx` uses `ADMIN_PAGE_SIZE = 5` with previous/next | Implemented; user browser proof pending |
| Super Admin LGU applicants: 5 per page | Same component has independent LGU applicant pagination | Implemented; user browser proof pending |
| Admin Resident Directory + Volunteer Approvals: 5 per page | Shared `app/(admin)/account-approvals.tsx` uses `PAGE_SIZE = 5` | Implemented; user browser proof pending |
| Admin Identity Reviews: 5 per page | `app/(admin)/identity-reviews.tsx` now paginates filtered cases | Changed; user browser proof pending |
| Admin Community Event proposals: 5 per page | `app/(admin)/community-events.tsx` now paginates proposals; search/filter reset page | Changed; user browser proof pending |
| Block common temporary mail during signup, not merely after submission | Resident web/mobile show the rejection on the first signup step; both use central policy | Changed, source test; camera and delivery still unverified |
| New disposable domain appearing tomorrow | Requires regularly refreshed blocklist or trusted Firebase Auth `beforeCreate`; no claim of universal rejection | Still open |
| No black browser alert | Shared in-app dialogs and Login inline messages; source-level check | Automated test passes; real-device screenshots pending |
| Mobile responsive screenshots | Need 360px/390px browser, native Android, camera permission paths | Still open |

**Do not treat source existence as complete real-account user acceptance.** PR #145 remains draft and not deployed to production.


## October 28 follow-through — tested source changes on PR #145

- **Additional 5-per-page queues (new commits):** Super Admin System Records and Audit Logs, plus LGU Admin Emergency Cases and Assistance Requests. Search and status filters reset to page 1. Emergency details follow the selected case on the current page. The shared `ListPagination` handles Previous/Next and clamped page counts. Regression coverage added to `scripts/test-pavia-pagination-email.cjs`.
- **Disposable email next-stage security:** The existing web/native/LGU intake/admin creation checks use 51,321 offline domains. Added `functions/disposable-email-domains.json` and `functions/registrationEmailBlocking.js` as a *prepared* Identity Platform `beforeUserCreated` policy. It is deliberately **not exported or deployed** while the Firebase Identity Platform upgrade/trigger availability is unknown. The tests check that it stays inactive pending readiness confirmation.
- **No false completion claim:** These UI pages are client-paginated; Firestore listeners may still read larger result sets. A future backend query-cursor optimization is distinct from the present five-record display requirement.
- **Still unresolved:** true Firebase Auth-level rejection of all/unknown disposable domains; actual mobile browser and camera UX; AI government-ID issuer authenticity; legacy event migration; LGU Personnel role consolidation; full cross-role emergency and donation E2E.
