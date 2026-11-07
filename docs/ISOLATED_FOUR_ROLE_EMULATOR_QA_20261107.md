# VolunServe — isolated Auth & Firestore QA: final results and hosted-staging blockers

Date: 2026-11-07, Asia/Manila. **Source-level / local-emulator QA PASS**. **Real hosted E2E QA NOT YET POSSIBLE/NOT CLAIMED.** Production remains unchanged.

## Proven test result

- CI: https://github.com/calibosofroyarjan-volunserve/VolunServe/actions/runs/42385832713
- Job `isolated-synthetic-auth-and-rules` run status: **COMPLETED / SUCCESS**
- Test-only branch: `test/isolated-four-role-emulators-20261107`
- GitHub HEAD: `481484307b8933a25b01d77ed3408ad078f10083`
- Parent/approved four-portal UI review: `4d0950a8f8e1327c596fe91c3c94b98df2cd4357`, previously passed full source-preservation, TypeScript and Expo web build.
- Exact changed paths versus approved UI review: **TWO ADDED FILES ONLY**: `.github/workflows/validate-isolated-four-role-emulators-20261107.yml` and `scripts/qa-four-role-emulator-only-20261107.cjs`. Zero changed UI/API/backend/Rules/Auth application files; zero deleted files.
- Test runners used Firebase's special local demo project `demo-volunserve`; only local Auth emulator `127.0.0.1:9099` and Firestore emulator `127.0.0.1:8080`. Required GitHub CI, no cloud service-account env, no Firebase token, no staging/production cloud Auth or Firestore connection, no OIDC credentials and no deploy command.
- Emulator suite summary in final logs: **7 test groups passed, 0 failed**.

## What actually passed

| Synthetic test group | Actual result |
|---|---|
| Auth Emulator | Email/password signup, email starts unverified, duplicate signup rejected, invalid password rejected, correct sign-in accepted, local password-reset request accepted |
| LGU Admin Firestore permissions | 30 security rules tests passed, 0 failed |
| Admin / Volunteer assignments | Admin/Volunteer ownership and role access checks passed |
| Community Events | 28 security-rules tests passed, 0 failed, 0 skipped |
| Donation role isolation | Approved Admin access, donor-only receipt privacy and Super Admin financial access boundaries passed |
| Emergency/map Firestore rules | 11 checks passed, 0 failed |
| Admin community announcements | Admin publication and restricted role validations passed |

Everything used SYNTHETIC users/records. Auth test exercised Firebase Auth **emulator REST transport**, not actual app login/signup screens. Firestore tests exercised security rules, not React Native Web interactive flows.

## Existing connected Render resources (read-only audit)

- `volunserve-staging-api-shell` is an **inert/nonfunctional** staging shell; its own source `staging-backend/server.cjs` explicitly returns `STAGING_NOT_CONFIGURED` / 503 on operational endpoints. It has no connection to production data.
- `volunserve-identity-ai-staging` exists as a separate Render service; not yet verified as functionally connected to a dedicated isolated Firebase project.
- Existing four-role static design-review Render sites are sample/dummy-only; they cannot establish functional authenticated QA.
- Production `VolunServe` and `volunserve-identity-ai` services exist and remain unaffected by this test.
- No confirmed separately provisioned fully functional Firebase staging project is connected through the available tools. This is a **visibility/connection limitation**, not proof no such project exists in the Firebase Console.

## Actual hosted staging blockers (STOP before real UI E2E)

1. Create or identify a **genuinely separate Firebase project** (not `volunserve-3aa5b`) with its own Auth, Firestore, Storage and any needed Functions. Do not reuse production project credentials/data, production residents' identity images, donor records, or actual emergency response cases.
2. Register a **staging Web App** in Firebase Console. Capture **public nonsecret client fields only**: API key, authDomain, projectId, storageBucket, messagingSenderId and appId. Never send service-account JSON, Firebase private keys, PayMongo secrets or webhook secrets.
3. Configure only synthetic test accounts for Resident, Volunteer, Admin and Super Admin with staged role records and strictly staged Firestore/Storage rules. Never grant actual Admin role to an uncontrolled signup. Seed dummy emergency reports, events, assistance requests, donation records and certificate data.
4. Build the **real consolidated UI** in dedicated staging mode. The current green review build is production-configured for source review only. Never upload this build as a public staging website connected to production Auth/Firestore. A separate fail-closed staging backend routing path and production-endpoint audit are required.
5. Connect any necessary Render/identity/Cloudinary services only after they are guaranteed nonproduction and have separate fake data. Sandbox PayMongo only, with webhook isolation. The existing staging API shell remains disabled until properly set up.
6. Run browser tests with staging test accounts across desktop/tablet/mobile; verify actual persisted state transitions for all four roles, including password reset/email verification, announcements → notifications, incident → Admin assignment → volunteer accept/decline, Community Events join → attendance Time-In/Out → auto certificate, assistance, donation progress and sandbox payment, Super Admin settings and logs.
7. Reconfirm CURRENT live revision/rollback Hosting version, test staging rollback, reconcile any newly changed live version and explicitly approve the **single** guarded Hosting-only production release. No go-live until these gates pass.

## Current decision

**Emulator-source security QA: PASS. Live functional staging / Browser E2E: BLOCKED PENDING isolated Firebase project and backend integration. Production deployment: HOLD.**

No production changes, deploys or cloud data writes were performed.
