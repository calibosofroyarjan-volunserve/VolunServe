# VolunServe identity camera: on-device staging QA release gate

**Scope:** User-assisted Chrome/Edge mobile and desktop camera behavior. **No production deployment.**
**Date:** 2026-11-11
**Candidate:** Backend + web/native draft PR #410; Python AI draft PR #409.
**Pre-existing test lab:** https://volunserve-identity-test-staging.onrender.com

## Critical separation

- The test lab is deployed from `preview/identity-only-staging-web-20261108`, not the `release/identity-backend-from-protected-20261111` candidate branch.
- Staging test lab uses Firebase project `volunserve-auth-staging`, staging Node service `volunserve-backend-staging`, and staging AI service `volunserve-identity-ai-staging`. It is **not** equivalent to an E2E test of draft PRs #409/#410.
- Render showed the three staging deployments as **live** in its deployment metadata on 2026-11-11, but no direct user-device/browser HTTPS end-to-end success has been demonstrated.
- The camera diagnostics in section 4 of the staging page work **without login** and send **no photos, videos, identifiers, or telemetry** to servers. Avoid the verification submit button for these basic checks.
- Never use real PhilSys National IDs, passports, driver's licenses, UMIDs or PRC IDs for initial staging QA. No screenshots of identity media, passwords, or Firebase tokens should be shared in bug reports.
- Local camera challenges are not validated presentation-attack detection or proof of liveness.

## Stage A — user-device camera diagnostics (no uploads, no account required)

On a physical mobile browser over HTTPS, open the staging test lab and scroll to **4. Test your camera (no upload)**.

| Check | Action | Expected observation | Record |
| --- | --- | --- | --- |
| A1 front selfie camera | Tap **Test front/selfie camera**, allow camera permission | Camera opens, local FPS/resolution/lighting report appears, camera track stops after check | PASS / FAIL / UNTESTED |
| A2 rear ID camera | Tap **Test rear/ID camera** | Browser attempts environment-facing camera, report appears, capture stops | PASS / FAIL / UNTESTED |
| A3 permission denial | On a second run, deny camera permission temporarily | Clear guidance; no endless spinner; no uploaded media | PASS / FAIL / UNTESTED |
| A4 permission recovery | Restore camera permission in browser/site settings; retry | Check can start again without a new account | PASS / FAIL / UNTESTED |
| A5 background / screen lock | Start camera, switch tab or lock device, then return | No persistent webcam indicator or unexpected background capture | PASS / FAIL / UNTESTED |
| A6 camera source | Test on phone; compare front and rear results | Different camera reported if physical device and browser support both; some browsers may choose same camera | PASS / FAIL / UNTESTED |
| A7 desktop/browser | Repeat A1–A4 in desktop Chrome or Edge (if available) | Permission and diagnostics are understandable on desktop | PASS / FAIL / UNTESTED |

The diagnostic `camera_basic_checks_passed` means only that heuristics found no warnings: at least 640x480 resolution, roughly 10+ observed FPS and adequate sampled lighting. `needs_review` means inspect `warnings`; neither status proves face-match performance, ID authenticity or anti-spoofing.

Use **Copy diagnostic result** to provide **only** camera requested, resolution, observed FPS, lighting, check and warnings. Do not share captured frames.

## Stage B — local simulated scan; never submit personal ID (manual user QA)

If Stage A is successful, on the same staging page review the **Scan ID front / Scan ID back / Live face scan** local UI using a clearly fabricated, large **DEMO / NOT A REAL ID** card.

1. Start front ID camera and check framing/glare guidance, auto-capture, preview, and **Scan again / Retake**.
2. Start back ID camera and verify it captures the back separately. Check passport selection hides the back side.
3. Cancel during the camera opening/capture process; reopen and ensure there is no stale photo and camera track has stopped.
4. Check rear/front camera selection in the camera source menu, if supported.
5. If volunteering to test live selfie movement, check **one face**, **no face**, **multiple faces**, near/far, mirrored prompt, and cancel/back/retake. **Do not treat a successful prompt as validated liveness or PAD**.
6. Leave without pressing **Run staging verification**; confirm that local photos are not uploaded.

**Important:** Stage B runs the older staging camera implementation. The new PR #410 capture session cancellation behavior has been tested with offline mocked canvas image callbacks, but still requires separate actual-browser/phone verification after an explicitly isolated candidate preview is prepared.

## Stage C — authenticated and candidate E2E (BLOCKED until approved test setup)

**Do not run with personal IDs or production accounts.** Requires test accounts belonging only to `volunserve-auth-staging`, separate Node/Python staging deployments built from candidate code or an explicitly reviewed equivalent, protected media handling and explicit consent. Test:

- Engine readiness without consuming verification attempts; safe retries only for known transient 503 states.
- Front/back file requirements (passport exception), exactly five ID choices, school ID and employee ID rejection, mismatch rejection, corrupt or blurry national ID routed for rescan/manual review.
- Admin review gate: no automatic `verified` status because OCR or profile name matched; only authorized review/issuer evidence.
- Confirm unsuccessful uploads and browser cancellation do not retain unexpected media; test rate limiting, auth access control and deletion policy.
- Real Android app/ APK splash and native camera flows need distinct APK+device tests. A successful Android **JavaScript export is not an installed APK**.

## Reporting

Record device model, OS/browser version, whether it is front or rear camera, the copied JSON diagnostic (without images), and PASS/FAIL/UNTESTED for A1–A7. For failures, include only the error message, what action triggered it and whether camera permission was allowed. Do not send IDs, selfies, tokens, passwords or identifying screenshots.

## Release decision

CI passed for draft PR #409 (including 13 synthetic Docker OCR/MediaPipe tests) and PR #410 (including 5 offline camera capture behavior tests, TypeScript, web and Android JS bundles). **Production release gate is NOT MET.**

No live merge/deploy until independent actual browser and Android physical-device validation, authorized staging E2E, document authenticity strategy, independent Admin approval requirements, and defensible anti-spoofing/PAD evaluation are explicitly reviewed.
