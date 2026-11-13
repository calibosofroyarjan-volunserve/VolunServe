# Staging identity test-lab privacy release notes

This Render static site is the **legacy isolated staging test lab**, not the
latest Expo Resident app. Its branch is
`preview/identity-only-staging-web-20261108`; its sole allowed Firebase project
is `volunserve-full-staging` and its Node service is
`https://volunserve-backend-staging.onrender.com`.

## Safe preview behavior

- Staging test-account login and email verification remain supported.
- Authenticated AI health/readiness and **read-only own Resident status** checks
  remain supported. Health is NOT permission to upload biometric media.
- The five supported government ID types remain visible for educational
  explanation, but private ID front/back, selfie, and both consent/submit paths
  are **disabled**. The backend continues to enforce HTTP 423 on sensitive
  POSTs. Do not take photographs of genuine government IDs in the preview.
- While experimental webcam research can display a consenting face locally,
  front/back government-ID camera entry is disabled. Local face QA
  **does not validate identity or liveness**. Captured QA images cannot
  populate verification-form File inputs through DataTransfer or other means.
  They are cleared on sign-out and navigation away.
- The browser facial-expression challenge previously accepted a replay video:
  this remains documented as an unvalidated presentation attack, not as
  evidence of biometric reliability.

## Checks and release boundaries

Run `node identity-staging-web/build-check.cjs` in the repository root.
Its existing ID, camera, OTP/reset, isolation and Admin review tests also run
the new `test-readonly-media-privacy.cjs`. Never turn off the media
pause to bypass failing checks. Render auto-deploy is off for this static site,
so a manually triggered staging-only deploy is required after the GitHub
review and build checks succeed.

**Not done here:** importing the latest Expo Resident identity screens,
independent biometric PAD testing, validating real government ID authenticity,
real-account authenticated Resident-to-Admin acceptance testing, or enabling
`Verified Resident` automatically. Those require separate reviewed work.

No changes to `volunserve.com`, protected live branches, production
Render services, staging backend ID upload gate, or Firebase rules.
