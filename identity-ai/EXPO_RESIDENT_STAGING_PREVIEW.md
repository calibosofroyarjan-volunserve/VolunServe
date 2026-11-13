# Latest Expo Resident web — isolated staging preview preparation

This PR protects the **actual latest Expo Router Resident/Admin frontend**
from reaching production services when the build is explicitly configured for
`volunserve-full-staging`. It does NOT deploy or merge any production branch.

## Verified review scope

- Expo build environment MUST be explicitly
  `EXPO_PUBLIC_VOLUNSERVE_ENV=staging` and
  `EXPO_PUBLIC_VOLUNSERVE_FIREBASE_TARGET=staging`.
- All six Full Staging Firebase Web App configuration fields must belong to
  `volunserve-full-staging`; mismatched or missing values abort the build.
  `EXPO_PUBLIC_IDENTITY_VERIFICATION_API_URL` must be the isolated Node staging
  service. The Python AI service remains private behind the Node backend.
- Staging assistance and donation endpoints now use only
  `https://volunserve-backend-staging.onrender.com`; default production URLs
  remain unchanged in a **production** build.
- Cloudinary public campaign photo uploads and external donation checkouts
  are explicitly blocked in staging **before** forming an image upload or
  initiating a payment session. The staging backend's own private ID/selfie
  upload HTTP 423 and manual Admin approval safeguards remain unchanged.
- GitHub CI typechecks and exports the Expo web bundle with synthetic-only
  Firebase metadata. No real staging account, webcam, government ID or
  authentication credentials are used by CI.

## What remains after a green build

A real authenticated staging Resident-to-Admin E2E test requires approved
**test accounts**, independent Admin authorization, and safe non-sensitive
data. External endpoints and Firestore/Storage rules require independent
browser/network review before any unrestricted staging rollout. Real
government IDs, selfies, liveness scores or automated Verified Resident
approval must NOT be used: issuer validity and PAD are not certified.

The Render legacy staging test lab
`https://volunserve-identity-test-staging.onrender.com` is a DIFFERENT
web app and remains read-only. A full Expo staging preview, when approved,
must be deployed on its own new staging-only static site/branch with
**auto-deploy OFF**, not on `volunserve.com` or existing preview sites.
