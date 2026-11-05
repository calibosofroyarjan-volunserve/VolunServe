# VolunServe Final Combined Hosting Release — 2026-11-05

LIVE SOURCE baseline: `195984a90343d77910b398ef14b83522f0313f79` (Super Admin Enterprise System Records, Assistance Records, Audit Logs, View All, pagination and LGU Admin updates).

Signup/Login source: `d583e881fc49bc6b3d7a533cea0cd7588bcc9176` (premium green email-first, Login field validation, OAuth helpers, original-layout fallback). Only 21 explicit application/source/test paths ported. NO entire staging branch merge.

Preserve as-is byte-for-byte from the live baseline: app/(superadmin), app/(admin), components/admin, Firestore and Storage Rules, Firebase config, Cloud Functions, backend, Donations, Maps, Events, Resident and Volunteer workspaces, and production data.

**Hosting-only** candidate. The preview and production build turn premium Signup on with EXPO_PUBLIC_EMAIL_FIRST_SIGNUP=true. Firestore Rules remain unchanged to avoid breaking old-client profile-first flows. This does NOT enforce verified-email-only profile creation against direct SDK calls; stricter Rules and old-client transition remain a separate security migration.

Required safe release: expected live Hosting revision must match the baseline commit. Run automated TypeScript/Auth regression tests and an Expo build. Deploy a separate preview channel, validate its fingerprint, clone live Hosting to an emergency backup channel, recheck live revision, then clone the exact preview Hosting version to the live channel. Verify new live fingerprint and /signup, /login and /admin-login. Fail closed if a newer Super Admin deployment appears. Firebase Auth/Firestore/Storage/Functions remain untouched by this release.

Manual real-mailbox, Google OAuth and successful role-login acceptance are still required after release; deployment is not evidence of full end-to-end authentication security. No test users/data should be created in production just for UI review.
