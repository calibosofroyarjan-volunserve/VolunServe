# VolunServe Identity Review — Isolated staging handoff

**Status:** Draft PR #808, not deployed. Source branch: \`feat/identity-secure-evidence-admin-review-20261122\`, based on \`live-protected\`. Do not merge or deploy to \`live-protected\` before manual security validation.

## Why the current staging URLs are not yet this change
At the time of inspection on 2026-11-22:
- Render \`volunserve-backend-staging\` (\`srv-dbnp9ulg1s2s73daj250\`) and \`volunserve-identity-ai-staging\` (\`srv-dbnf63dg1s2s73choolg\`) deploy **\`release/identity-national-id-admin-gated-20261122\`**.
- Render \`volunserve-expo-resident-full-staging\` (\`srv-dbrfe0dbedkc73df01jg\`) deploys **\`preview/expo-resident-full-staging-web-20261113\`**.
- They do not serve PR #808. No Render service branch changes or new deploys were made.

## Required isolated staging configuration, before changing branches or deploying
The backend source requires \`VOLUNSERVE_RUNTIME_ENV=staging\` and detects \`RENDER_SERVICE_NAME\`/hostname containing “staging”. It refuses to start when isolation is missing. Configure the dedicated **full-staging** Firebase service-account JSON through Render's environment variable UI; do not copy production credentials into staging. The credential's \`project_id\` must be \`volunserve-full-staging\` and the \`client_email\` must be from that project's IAM domain.

The staging backend environment must include:

| Variable | Required non-secret value / rule |
| --- | --- |
| \`VOLUNSERVE_RUNTIME_ENV\` | \`staging\` |
| \`FIREBASE_SERVICE_ACCOUNT_JSON\` | **Private** service account JSON from \`volunserve-full-staging\`, configured only in Render's secret environment UI |
| \`IDENTITY_AI_SERVICE_URL\` | \`https://volunserve-identity-ai-staging.onrender.com\` (separate staging AI service) |
| \`ALLOWED_ORIGINS\` | \`https://volunserve-expo-resident-full-staging.onrender.com\` (only staging origins; local testing can add \`http://localhost:3000\`) |
| \`CLOUDINARY_CLOUD_NAME\`, \`CLOUDINARY_API_KEY\`, \`CLOUDINARY_API_SECRET\` | **Required:** a dedicated non-production Cloudinary cloud and API key/secret; the startup guard rejects missing credentials or the known live cloud |
| \`FIREBASE_PROJECT_ID\` / \`GOOGLE_CLOUD_PROJECT\` / \`GCLOUD_PROJECT\` (if set) | Must equal \`volunserve-full-staging\` |

The staging frontend build must include:

| Variable | Required value |
| --- | --- |
| \`EXPO_PUBLIC_VOLUNSERVE_FIREBASE_TARGET\` | \`staging\` |
| \`EXPO_PUBLIC_IDENTITY_VERIFICATION_API_URL\` | \`https://volunserve-backend-staging.onrender.com\` |
| \`EXPO_PUBLIC_VOLUNSERVE_STAGING_FIREBASE_API_KEY\` etc. | The complete Firebase **web config** for \`volunserve-full-staging\` (see \`lib/firebase.ts\`); none may fall back to production |

**Important:** The source of \`backend/\` must be deployed to the existing isolated staging backend *only after* its dependencies, correct branch, and dedicated credentials are confirmed. This PR's core UI and backend changes are not active just because the old staging services have green health checks.

## Smoke test sequence
1. Open the isolated staging frontend; verify the Firebase app is the full-staging project, not \`volunserve-3aa5b\`. Use **synthetic training/test ID images**, not a person's actual government ID, for initial media flow testing.
2. Capture or upload National ID **front**, **back**, and live selfie. Try missing back (must block) and absent consent (must block). Verify status transitions and that no AI attempt is consumed on parsing/storage outages.
3. Confirm the Python AI sees the existing \`idDocument\` + \`selfie\` fields. The new \`idBack\` is retained for authorized Admin evidence review, **not yet a verified ID authenticity/QR signature validator**.
4. As an operational Admin, open Identity Reviews, select the new submission, inspect ID Front/Back/Selfie, expand images, review AI decision, and record a reasoned decision. With missing or expired evidence, approval must be blocked.
5. As a normal Resident, Guest, Volunteer or unauthenticated caller, \`/api/admin/identity/reviews/:uid/evidence\` must fail with 401/403. Check the Admin audit record after an approved access.
6. Verify Cloudinary objects use \`authenticated\` type and a \`volunserve/identity-review-staging/\` prefix, that preview URLs expire after 5 minutes, and the 30-day retention cleanup cannot delete new replacement evidence.
7. Verify login/signup, Admin review queue, Volunteer and Emergency modules against staging before requesting any production merge.

## Important limitations
- A single face selfie, facial geometry and OCR keywords are *not* validated proof of physical liveness, ID authenticity, or government-issued identity. Manual LGU verification remains necessary.
- The existing staging services may be serving different code and credentials. Never submit real IDs to staging before the correct Firebase, Cloudinary, and AI isolation has been checked end-to-end.
- Prior submissions never persisted these photos; their original media cannot be reconstructed. Those Residents must resubmit.


## Read-only public staging preflight
The draft branch includes a no-deploy Actions workflow called **Preflight Isolated Identity Staging (Read-Only)**.
It sends only public GET requests to the dedicated staging backend/AI health endpoints, the staging web landing page,
and an unauthenticated GET to the Admin evidence route using a fictional synthetic UID.
It cannot read ID media, sign in, trigger AI attempts or write any account records.

- PASS on the anonymous evidence route means HTTP 401 or 403. It does not verify the role check with a real Admin token.
- NOT_DEPLOYED means HTTP 404 from old code. This is not a successful deployment of PR #808.
- Cloudinary configured means some credentials are present, not necessarily isolated. The new backend startup guard requires a separate cloud.
- This workflow makes no changes in Render or Firebase and is not a camera/face matching test.

## Manual staging deployment gate
The current Render integration supports triggering a deploy from the existing branch, but cannot change a service's
Git branch or inspect private environment variable values. The staging backend, staging AI and staging web services
are all on older branches. Their branch pointers must be updated to the PR code and the isolated Firebase and
Cloudinary credentials verified in Render before triggering a deploy. Do not redeploy an older branch and claim
that PR #808 was tested. Never place deployment credentials in GitHub commits, test output, or conversation text.
