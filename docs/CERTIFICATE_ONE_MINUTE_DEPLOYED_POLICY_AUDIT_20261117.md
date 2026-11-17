# Community Event certificates — 1-minute policy and visible 30-minute mismatch

**November 17, 2026. Review only, NO deployment.**

## Verified current sources
- Public Hosting revision marker in Nov 17 GitHub CI: `f6139fdae5bce940356a62efc28f8e50935978d6`.
- At that live-derived source, `app/(admin)/community-attendance.tsx` displays **30m minimum met** and counts eligibility using an unconditional 30-minute test.
- Render production Web Service `VolunServe` is on branch `backend-live-protected`, and its latest confirmed live deployment commit is `4f3db7b3d12082cf50f0b3a191d00768fdea78c4` (deployed Nov 12).
- At that deployed backend commit, `backend/communityCertificateEligibility.js` defines a **permanent 1-minute threshold** for new verified attendance and completed events on or after **2026-11-10 14:55 UTC = 10:55 PM PHT**, **ONLY IF** `VOLUNSERVE_CERT_LIVE_ONE_MIN_PERMANENT_ENABLED=true`. Previously completed events/attendance still use **30 minutes**. Separately, exact test event + volunteer allowlists can opt in to 1 minute when `VOLUNSERVE_CERT_TEST_OVERRIDE_ENABLED=true`.
- We **cannot read/verify the actual Render runtime environment switch** using the connected read tools. Therefore the deployed service's live effective threshold is **not confirmed** from source/deploy history alone. Do not claim all users already receive a certificate after 1 minute.

## Scope of this draft PR
- Update **only the outdated Admin Attendance UI duration text and display-time calculation** to match the approved post-Nov10 1-minute policy, while retaining 30 minutes for older records.
- Use the existing backend issuer for authorization and issue decisions. UI text explicitly says the **server confirms actual eligibility and issues certificates**; no fake certificate can be generated client-side.
- No edits to any certificate backend, Firebase config, Firestore Rules, historical attendee data, stored certificates, login or Volunteer matching.
- Tests assert 60s eligible display for new completed events, 59s not enough, old records require 30m, and no pre-completion/future/over-24h bypass. CI blocks unrelated file changes.
- Do not merge or publish while protected Git history disagrees with actual Hosting revision. Need independent verification of the production backend flag before displaying 1 minute as guaranteed.

## Separate current task
- Draft PR #576 provides isolated staging-only Admin and Volunteer auto-match preview; this certificate label fix is deliberately **separate**, so it cannot affect that matching integration or live functionality.

**No actual certificate issuance, Hosting publish, Render restart or Firestore write is performed here.**
