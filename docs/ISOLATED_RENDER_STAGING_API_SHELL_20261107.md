# VolunServe staging backend shell — isolated by design

Created as a separate, **free** Render web service on November 7, 2026. This does **not** replace the live VolunServe backend.

- Service: `volunserve-staging-api-shell`
- Service URL: `https://volunserve-staging-api-shell.onrender.com`
- Source branch: `preview/isolated-staging-backend-20261107`
- Auto deploy: **off**
- Runtime: Node 22 compatible, built-in `http` only, no third-party packages
- Required environment: `VOLUNSERVE_STAGING_API_MODE=isolated-shell`
- Firebase, PayMongo, Cloudinary, and production backend imports: **none**
- Production credentials are refused even if inadvertently supplied.
- Browser CORS: disabled by default until a dedicated staging preview origin is approved.

## Endpoints

| Method and path | Expected response | Explanation |
|---|---|---|
| GET /health | HTTP 200, `productionConnected:false` | Process is running, not connected to live resources |
| GET /api/staging/readiness | HTTP 200, `realLoginReady:false` | Honest readiness flag, no live business functionality |
| POST /api/identity/verify | HTTP 503 | Prevent identity data upload in dummy staging |
| POST /api/paymongo/checkout-session | HTTP 503 | Prevent payment checkout in dummy staging |
| All other routes and methods | HTTP 503 | Block real data changes until staging services exist |

The GitHub workflow `Validate Isolated Staging Backend (No Deploy)` runs offline rejection tests and a read-only external smoke check of the staging URL.

## Status / required missing dependency

**This is a scaffolding service, not a functional copy of the VolunServe API.** For actual role tests, a *new, separately managed Firebase project* with staging Auth/Firestore/Storage/Functions is needed, plus staging-only backend credentials and seeded **fictional** accounts. Do not use the live `volunserve-3aa5b` Firebase service account or database.

The existing `volunserve-identity-ai-staging` Render service was found separately; its backend source, credentials and data isolation have **not** been verified by this PR. Do not assume it is safe for real identity images until a security review is complete.

Real user sign-ins, donation checkout and uploads remain disabled. The existing UI review branch `preview/isolated-staging-readiness-20261107` builds the actual Expo web source with a deliberately nonexistent staging Firebase. It is not yet a fully operational staging website.

Production Render backend `volunserve.onrender.com` and Firebase Hosting `volunserve.com` remain untouched by this work.
