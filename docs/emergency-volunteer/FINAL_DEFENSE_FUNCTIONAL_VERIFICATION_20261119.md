# VolunServe — Final Defense Functional Verification Pack

**Prepared:** November 19, 2026 (Philippines)  
**Defense target:** November 21, 2026  
**Scope:** VolunServe production web app, production backend, separate isolated emergency-match staging, and local Firebase Auth/Firestore emulator QA.  
**Deployment authorization:** **NONE.** This pack performs PUBLIC, READ-ONLY HTTP GET checks only.

## 1. Actual environment labels — never mix these up

| Environment | URL / system | What we can honestly claim |
|---|---|---|
| PRODUCTION — Web | https://volunserve.com | Public HTTP availability can be checked remotely. A 200 response DOES NOT verify JavaScript, login, sign-up, real forms, Firebase operations or Android |
| PRODUCTION — Backend | https://volunserve.onrender.com/health | Read-only server health GET can confirm the live backend process answers. Production Render deployed commit **61baa71355f155bb7f66301be0e5f367d407cf0f** as read on Nov 19 |
| STAGING — Existing backend | https://volunserve-emergency-match-staging-free.onrender.com/health | Separate Render staging version at **ea9056afa1154e17478b73b3214b2bb8ddd548cc** as read on Nov 19. Accepted fictional **STAGING_E2E_002** must NOT be reset or overwritten |
| STAGING — Existing public synthetic demo | https://volunserve-emergency-match-staging-free.onrender.com/demo | Public **synthetic** planning demo: NO real offers or account changes |
| STAGING — Existing UI | https://volunserve-auto-volunteer-ui-staging.onrender.com | Separate UI, not the live app and not proof Phase 10 new API works there |
| LOCAL EMULATORS — QA | Firebase Auth 127.0.0.1:9099 + Firestore 127.0.0.1:8080 | Draft Phase 10 Admin/Volunteer authenticated HTTP tests and Phase 9 cancellation races passed on GitHub CI. This is *not* production or cloud staging |

The request to verify the actual live UI **cannot** be satisfied by HTTP GET alone. We must retain **NOT TESTED** for live authenticated flows unless someone carries out and observes those actions in a browser with authorized fictional/test accounts.

## 2. Automated public read-only test

**Source:** `scripts/defense-live-readonly-public-smoke.cjs`

The GitHub Action makes **only ten fixed GET requests**, without tokens, cookies, POST requests, case IDs or write access:

1. Production web `/`, `/login`, `/signup` — check HTTP 200 and a basic HTML shell. *Does not claim the JavaScript page renders or works.*
2. Production backend `/health` — check expected JSON `ok:true` and `service:volunserve-backend`. *Does not prove identity AI, donations, certificate workflows or Firestore health.*
3. Production backend `/api/identity/status` with NO token — require 401/403. *This is an anonymous access guard smoke check, not an authenticated security test.*
4. Existing staging backend `/health` — check `officialEmergencyDispatch:false` and staging service marker.
5. Existing staging backend `/demo-data` — check `mode:synthetic`, `doesNotSendOffers:true`, and `wave2Configured:false`. *Does not create offers.*
6. Existing staging protected Admin status and Volunteer task GET with NO token — require 401/403.
7. Existing staging UI `/` — check only public HTML shell.

The script writes **only status codes, environment labels and aggregate Pass/Fail/Indeterminate** into `defense-live-http-smoke-report.json`; no raw HTTP response body or PII is saved. GitHub Actions attaches the JSON as a downloadable test artifact.

On a network timeout / DNS failure / free-tier cold-start / restricted runner it marks **INDETERMINATE**, which is **NOT** evidence that the app is down. A public smoke PASS means only the checked HTTP paths responded as expected. The script never mutates remote accounts, accepted tasks, event attendance, certificates, payments, Rule deployments or Firebase data.

## 3. Manual acceptance matrix — perform only with approved fictional/test accounts

**Current state of every row: NOT TESTED MANUALLY IN THIS AUDIT.** Do not mark a row PASS until the actual UI was observed and an anonymized screenshot or screen recording has been saved.

| ID | Actual app/environment | Manual test with explicit authorization | Expected acceptance evidence | Status |
|---|---|---|---|---|
| M01 | Production Web | Open Home, Login and Signup in desktop Chrome and mobile browser | Layout renders, no console errors or blank screens | NOT TESTED |
| M02 | Production Web | Existing fictional Basic Resident logs in using email/password, then signs out | Redirect to correct Basic Resident page, no Guest fallback | NOT TESTED |
| M03 | Production Web | Existing fictional account completes email verification, then signs in | Verification enforced; no profile bypass or unwanted auto Guest linking | NOT TESTED |
| M04 | Production Web | Try malformed email, temporary domain and disallowed-provider email only in client form WITHOUT submitting real account creation | Clear validation feedback; server blocking remains separately unverified | NOT TESTED |
| M05 | Production Web | Try Forgot Password using a dedicated, owner-approved test email | Expected reset experience without exposing whether a third-party account exists | NOT TESTED |
| M06 | Production Web | An existing approved fictional Volunteer logs in | Volunteer tab/menu, pending tasks and Events accessible | NOT TESTED |
| M07 | Production Web | With existing authorized fictional report, Admin inspects case and map | Case pin and SJDM boundary display correctly; no real emergency modified | NOT TESTED |
| M08 | Production Web | Admin checks manually assigned Volunteer on an **existing fictional** case only | Correct assignment/winner status; no duplicate responder | NOT TESTED |
| M09 | Production Web | In a dedicated approved test event ONLY, test Volunteer Time In/Out and Admin attendance confirmation | Exactly one attendance record; correct status. Avoid creating an event or mutating real user history merely for the defense | NOT TESTED |
| M10 | Production Web | Dedicated test event certificate after **the stated 1-minute test policy**, only if confirmed in current live settings | PDF includes correct user, event and dates; no duplicate on replay | NOT TESTED |
| M11 | Production Web | View existing donation campaigns/receipt history; use payment **sandbox only** if proven sandbox | Campaign total/history accurate; no real money or release action | NOT TESTED |
| M12 | Production Web | Review verification status of an already authorized fictional Basic Resident | Verified status appropriate; no accidental approvals or real-ID usage | NOT TESTED |
| M13 | Staging (separate) | Inspect existing `STAGING_E2E_002` accepted responder **read-only** | Existing accepted responder preserved; do NOT press reset/reissue/bulk-send/start/cancel | NOT TESTED |
| M14 | Local Firebase Emulators | Repeat Phase 10 fictional Admin → eligible offers → Volunteer Accept/Decline → canonical winner → STOP, and Phase 9 cancellation race | **Automated CI passing**; any actual browser demonstration must be separately performed and labeled LOCAL EMULATOR | CI TESTED; BROWSER NOT TESTED |
| M15 | Android | Launch actual APK on a physical supported device and inspect login, task, map/GPS permissions | No stuck splash screen and task flow works | NOT TESTED |

**Do not perform any write-heavy or destructive acceptance step on production without an approved dedicated test case and explicit permission.** No real emergency case, actual resident identity documents, real payment, accepted staging responder or private user data should be altered for the demonstration.

## 4. Safe 5–7-minute final defense route

**Demonstrate only features you actually observe working.** Suggested sequence:

1. **Overview (30–60 seconds):** Explain VolunServe’s SJDM scope and roles (Admin, Basic/Verified Resident, Volunteer, Guest, Super Admin).
2. **Resident (60 seconds):** Log in with an existing fictional account. If login is broken, show the already verified screenshots without claiming a successful live login.
3. **Community Events (60–90 seconds):** Show an existing event, Volunteer attendance record and certificate only if verified working in the actual environment; otherwise use labeled system design slides.
4. **Emergency Response (90 seconds):** Show the actual Admin report/map interface. For **automatic matching** specifically, show the labeled **local emulator** or separate **staging** evidence, not as a production feature.
5. **Donation transparency (45 seconds):** Use view-only campaign screens and existing sandbox evidence, not a real payment.
6. **End (30 seconds):** Summarize completed testing, known limitations and the next controlled deployment gates.

**Concise truthful panel explanation:**

> “VolunServe supports community volunteering management within the City of San Jose del Monte. We validated the automatic Volunteer offer, acceptance and single-responder decision workflow in isolated Firebase Auth and Firestore Emulators, with separate staging testing. Full live integration of automatic dispatch and a monitored 24/7 scheduling mechanism are still pending release validation and operational approval.”

Do not present local emulator CI, public HTTP status, or source code checks as proof that real production signup, email verification, certificate, payment or GPS mapping has passed.

## 5. Release blockers requiring additional engineering

- Securely port the **draft** Admin manual-vs-auto case-winner guards, Volunteer Web/Mobile transition protections and Firestore Rules into a reviewed production integration branch. Current branch chain is DRAFT/UNMERGED.
- Real cloud staging identity and Firebase Auth/Firestore tests. Render OIDC workspace entitlement and effective IAM are not verified.
- End-to-end automatic dispatch write pipeline plus complete eligible roster (remove demo 40-offer/200-document limitations), correctly verified SJDM adjacency and map integration.
- Managed reliable 24/7 scheduler with lease fencing, retry/alerts, durable notification outcomes and rollback.
- Live authorized-browser and physical Android/device testing across the real deployed frontend/backend versions.
- Explicit approved release; do **not** merge or deploy all prior prototype branches automatically.

**As of this review, PRODUCTION AUTOMATIC VOLUNTEER DISPATCH remains NO-GO.**
