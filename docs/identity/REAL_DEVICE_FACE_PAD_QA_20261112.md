# VolunServe real-device face matching / replay QA (2026-11-12)

**Scope:** Staging camera lab only; not a certified presentation-attack-detection (PAD) test and not live production identity approval.

## Where to run

- Open `https://volunserve-identity-test-staging.onrender.com` using HTTPS on a physical Android phone (Chrome, optionally Edge) and Windows desktop Edge with a webcam.
- Use **Section 4: Test your camera (no upload)** for selfie and rear camera resolution, FPS, lighting and permission tests.
- Use the separate **Live Face Scan** camera stage for a consenting person and for benign printed-photo / second-screen replay attempts. This client-side challenge can be fooled. **Do not press Verify / submit ID photos** for this QA.
- Use **Section 5: Real-device face & replay QA** to record Pass / Fail / Inconclusive / Not tested. Copy only the JSON observations (no images, device identifiers or personal data).

## Physical testing and expected results

| Case | Action | Passing observation |
| --- | --- | --- |
| Android selfie camera | Tap local selfie camera test | Browser opens the camera, reports sensible resolution / FPS, then turns it off |
| Android rear camera | Tap local rear camera test | Rear camera selected when available; informative error otherwise |
| Windows Edge | Repeat with built-in/USB camera | Permission prompt, preview, stable frames and clean shutdown |
| Legitimate volunteer | With consent, complete live face challenge | One person can complete and capture. **This only proves usable camera guidance** |
| Two faces | With two volunteers, face both into frame | Challenge does not capture and prompts for only one face |
| Printed-photo presentation | Present only a printed photo of a consenting person, move it without another face | Log **Fail** if local challenge accepts it as live; otherwise Pass for this limited attempt. Does NOT prove PAD |
| Second-screen replay | Show a consented face video/photo on another phone or tablet | Log **Fail** if challenge accepts; otherwise Pass for this limited attempt; never claim replay immunity |
| Poor lighting / glare | Try a dim room / backlit scenario | Requests clearer image or guidance; no auto Verified Resident |
| Denied camera permission | Deny permission and retry | Clear error, no camera/photo upload or identity attempt |
| Match genuine vs impostor | **Only after isolated staging backend credentials and Admin consent are verified** | Independently measure genuine accept/review, impostor accept, false reject; NEVER auto approve |
| Admin gate | Use authorized **staging-only** test accounts | Identity status remains pending until independent authorized Admin review, even if similarity score is high |

## Nonnegotiable acceptance gates

1. **No production IDs, user accounts or Firebase projects** in staging; stage credentials are currently not yet independently verified. Keep authenticated face-match QA **Not tested** until staging isolation and media-retention policy are signed off.
2. No production images, face templates, ID photos, biometrics, or tokens in GitHub issues, logs, ChatGPT, email, the copied QA report, or bug screenshots.
3. Do not approve users from a movement challenge. Client-side blink/smile/head movements are camera usability cues, **not validated PAD**.
4. The current MediaPipe facial-landmark similarity is **not demonstrated to meet a specified false-match/false-non-match threshold** across representative user populations and lighting conditions. Report measured counts and confidence intervals only after independently obtained consented test data are available.
5. Biometric PAD requires an independently evaluated system and appropriate attack testing. NIST SP 800-63A-4 requires PAD for remote biometric collection with an IAPAR threshold less than 0.07 under ISO/IEC 30107-3:2023 tests for NIST-conformant use. Passing a handful of camera tests is not that evaluation.
6. If a photo or replay passes the client challenge, mark **Fail / observed spoof acceptance** and retain mandatory Admin review. Do not silently label it “liveness verified.”
7. If any case is Not tested / Inconclusive or a critical check fails, **do not claim complete real-device validation**. Do not release a PAD or auto-approval promise.

**Status at document creation:** local-only QA interface and synthetic automated regression tests are available; *physical device results, false-match rates, issuer authenticity and independent PAD remain unverified.*
