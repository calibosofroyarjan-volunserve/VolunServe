# VolunServe — six-digit email verification (staging-only proposal)
_19 November 2026. Security review required before any live cutover._

## Goal and scope
Use a six-digit one-time passcode sent directly to the registered Gmail/Yahoo inbox instead of requiring the user to click a Firebase Auth email verification link. After successful entry, a trusted Firebase Admin function sets the **same** Firebase Auth UID's `emailVerified = true`, and the existing Basic Resident profile wizard continues unchanged. The email and password sign-up/login remain available, with Google optional. No new login identity or replacement Resident profile is created.

Firebase Auth's standard `sendEmailVerification` sends an **action link**, not an arbitrary six-digit human code. A secure custom OTP sender and admin-side verification are required for this flow.

## Components in this branch
- `components/auth/SignupOtpCodeInput.tsx`: accessible six-box code entry, numeric paste/autofill.
- `components/auth/SignupPasswordStrength.tsx`: clean inline four-condition password strength and validation.
- `components/auth/EmailFirstSignup.tsx`: feature-flagged Step 2 code form; **legacy link flow remains the default**.
- `lib/signupEmailOtp.ts`: auth-only typed callables, session reload, no local code persistence.
- `functions/signupEmailOtpCore.js`: cryptographically random 6 digits; HMAC-SHA256 with secret pepper and per-request salt; ten-minute expiry; one-time use; five wrong attempts; per-UID 60-second resend cooldown/five sends per day; per-IP capped daily sends.
- `functions/signupEmailOtp.js`: Firebase callable adapters and transactional Resend API delivery, using Firebase Secret Manager.
- `functions/index.js`: **opt-in** exports, off by default.
- `functions/test-signup-email-otp.js`: no-network unit tests using fake Auth, Firestore and email sender.

OTP docs are kept server-side in `residentEmailOtpChallenges/{uid}` and `residentEmailOtpIpQuota/{hash_day}`, accessible only to Admin SDK. Firestore's existing explicit catch-all denies client reads/writes to unmatched collections. Do **not** add permissive Rules.

## Production-safe activation prerequisites
1. Use a separate Firebase **staging project** and staging domain. Never set the toggle against the production project for preliminary testing.
2. Verify a domain or subdomain you control with a transactional email sender (e.g. Resend), with SPF/DKIM, and configure `VOLUNSERVE_OTP_FROM_EMAIL` to a verified sender.
3. Set Firebase **Secret Manager** secrets `VOLUNSERVE_RESEND_API_KEY` and `VOLUNSERVE_EMAIL_OTP_PEPPER`. Generate a random, high-entropy pepper on the server; never place it in any frontend `EXPO_PUBLIC_` env variable, repository, or user browser.
4. Deploy **only the two reviewed callables** from isolated staging with `VOLUNSERVE_ENABLE_EMAIL_OTP=true`, and confirm the configured secrets and sender are available. Functions region: `us-central1`.
5. Validate real **Gmail and Yahoo inbox delivery**, invalid code, expiry, resend cooldown, simultaneous requests, password signup, existing-user login, emailVerified Firebase claim, Basic Resident profile access and mobile responsiveness.
6. Only after the functions, secrets, DNS and browser acceptance tests all succeed, build a protected **Hosting-only** staging revision with `EXPO_PUBLIC_VOLUNSERVE_EMAIL_OTP=true` and test the full flow.
7. For public release, review current LIVE revision, make a Hosting snapshot/rollback plan, verify stable function deployment and mail provider quotas, then enable the feature. Roll back the Hosting flag if delivery fails. Do not modify Firestore Rules, Functions unrelated exports, existing Auth users, database documents, or role permissions as part of an emergency UI cutover.

## Hard limits and cautions
- The current LIVE VolunServe signup uses a Firebase **verification link**. This staging branch does **not** change that or send real emails by itself.
- A six-digit OTP proves access to an inbox at that moment. **It does not detect disposable Gmail**; inboxes relayed by third-party temporary services may also receive a valid OTP. Keep the separate domain, shared-mailbox and abuse controls.
- Never send OTP codes in Firebase response bodies, logs, analytics or notifications. Never store plaintext codes. OTP attempts must not be incremented by the client.
- A user must have signed into the exact pending Firebase Auth UID; there is no unauthenticated endpoint that accepts arbitrary recipient addresses. Keep verified Auth UID and profile UID the same.
- The existing email verification link path remains in place as the fallback until production OTP acceptance tests pass.
- More robust deployment should also enable Firebase App Check and provider-specific abuse monitoring; these controls are separate from the functional OTP change.
