# LOCKED — Sir Pavia Super Admin & Next Workstream Scope

**Agreed October 29, 2026.** This contract applies to draft PR #145 and future development continuity. It preserves the user-approved dark emerald/mint Super Admin visual identity. **No automatic production merge/deploy is authorized by this document.**

## I. Super Admin: exact sidebar/navigation order (five modules ONLY)

1. **System Overview** — genuine Firestore KPI totals (registered users, administrative users, emergency reports, assistance requests), percentage and service-area bar chart; two independent five-record activity tables with numbered pagination **above** table rows. Registered users ≠ real-time online-user count; do not fabricate presence metrics.
2. **LGU Staff & Admin Accounts** — guided staff access-application oversight, pending staff reviews, existing LGU Admin accounts and Staff Privacy Requests, in that order. Verified independent credentials and guarded promotion; no arbitrary create-Admin shortcut. Each record list: **five per page**, controls above the rows.
3. **System Records** — read-only oversight of emergency/assistance cases, resident/volunteer records, current Community Events and proposals, attendance, credential-review metadata, legacy events, and other approved oversight collections. **Five records per category/page**, controls above cards. NO emergency dispatch, assistance approval or donation fund release here.
4. **Audit Logs** — real Firestore `adminLogs` and `adminActivityLogs`, permission/availability errors, search, action categories, actor/target/time details, **five per page**, controls above rows. Keep audit append-only; do not fabricate historical records.
5. **System Settings** — approved public official emergency hotline options and authorized configuration controls; a settings form is **not** a paginated record list.

**Locked UX:** keep approved screenshot style (premium emerald sidebar, mint header, simple clean cards and graphs). All data lists show just five records for each page with visible numbered **Previous / 1 / 2 / Next** controls BEFORE the list. Do not use infinite-scroll/Load More to navigate records. Normal vertical page scrolling remains enabled for long content, especially mobile or credential dialogs; do not hide inaccessible content.

## II. Responsibility separation

- **Super Admin** = programmer-controlled governance only: read-only overview/records, authorized staff approval, immutable auditing, system settings.
- **LGU Admin** = actual LGU operations (emergency responses and responder assignment, Request Assistance decisions, donation fund-release handling in **sandbox**, events/volunteer attendance and certificates).
- **Resident/Volunteer** = role-appropriate submissions, response/status tracking, attendance and acknowledgments.
- Do not introduce redundant pages or transfer LGU operational powers to Super Admin.

## III. Explicitly deferred (do not silently enable)

**Real LGU Credential Verification:** true government ID/selfie/appointment document intake, original-ID authenticity, employment checks, independent verification and production authorized account walkthrough. The user explicitly postponed this work. Guard existing code; do not silently enable private evidence intake or loosen security to make a demo pass.

## IV. Next implementation workstream, in agreed sequence

1. **LGU Admin Emergency Reports** → case intake/review → responder/resource assignment → track real authorized state updates → resolution and audit.
2. **Request Assistance and Donations** → resident request → LGU review → approved campaign → PayMongo **sandbox** donor transaction → LGU review/authorization → **simulated only** fund release → resident confirmation and immutable audit.
3. **Community Events and Certificates** → resident proposal → LGU approve/publish → eligible volunteer join/skill matching → start → self time-in/out → LGU attendance verification → event completion → certificate issue.
4. **Cross-module source/emulator/QA** and then authorized real-user live acceptance, safe branch reconciliation and reviewed deployment; never claim a draft commit is already live.

## V. Release controls and contract tests

- Do not reorder five Super Admin modules or create additional Super Admin operational modules without the user explicitly revising Sir Pavia scope.
- `scripts/test-pavia-pagination-email.cjs` has a **locked navigation order** test, record-pagination tests, and read-only governance checks. CI should fail on scope drift.
- PR #145 is currently **draft and unmerged** and based on `fix/friday-emergency-hub-navigation-20261028`. The production release remains a separate controlled action. Protect newer `main` Login/Resident changes while reconciling.
- User's local uncommitted working tree and production Firebase/Render/Auth data must not be overwritten for scope locking.

This file documents what to preserve and what to tackle next; it is **not** a statement that every future real-world end-to-end acceptance has been completed.
