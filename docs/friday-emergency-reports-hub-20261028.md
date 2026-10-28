# Friday Emergency Reports Hub — regression acceptance

Scope: navigation consolidation on top of the unfinished strict-SJDM map branch. This PR does NOT change dispatch, responder roles, GPS, security rules, case data, or verified facilities.

## New navigation
- Resident sidebar/mobile: Emergency Reports, Community Events; no redundant Response Map entry.
- Emergency Reports: **Report Emergency** and **Track Response** views, reusing existing report screen and response map.
- Existing /map-tracking URLs remain for backwards-compatible Volunteer Tasks / LGU personnel and deep links. My Reports and Resident report shortcuts link into Emergency Reports with caseId.
- Community Events already has Location & Map and road-route buttons in event details.

## Must demonstrate in authenticated browser and phone
1. Enter Emergency Reports and switch Report Emergency / Track Response with no blank map or lost login.
2. Submit a synthetic case. Track Response opens the same case ID; reports from other residents cannot be read or modified. Repeat for duplicate prevention and My Reports.
3. With multiple active reports, the selected case must NOT jump to another case. Confirm both mobile and web.
4. LGU Admin reviews the same synthetic report and assigns a specific responder/response type. No responder icon, GPS, ETA or live occupancy until verified.
5. Test responder status on the resident side, then arrival and verified closure. Record audit timestamps; fail clearly on missing permissions.
6. Check verified LGU/shelter facility pins only where Firestore has legitimately validated data. Test directions; do not auto-generate fictional facilities.
7. Community Events location map and directions still work; Volunteer Tasks still reach their mission response map.
8. Verify Firebase preview release SHA matches this branch. **Do not merge or deploy to production without CI, role tests and privacy QA.**

## Defense challenge/response
**Where is the Response Map?** Inside Emergency Reports under Track Response; the original map engine and case IDs are preserved.

**Is it Waze / automatic ambulance dispatch?** No. This is case-based map monitoring; dispatch is a logged LGU action and live GPS requires authorized device updates.

**What happens without an official facility record?** The icon is absent. Historical addresses never masquerade as verified, open shelters.

**Can a resident track a different resident's case?** Firestore rules must deny it, and this must be verified with separate accounts.

**Is the map truly real-time?** The case status and certain facility records use Firebase listeners; live responder position needs consent and an authorized fresh GPS feed. No fake ETA or movement.

## Current status
Source branch only. No manual browser/mobile QA, Firebase preview deploy or live facility verification proven by this document.
