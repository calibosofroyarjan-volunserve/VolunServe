# Combined live Super Admin and premium Signup — REVIEW ONLY

Base: latest successfully deployed Super Admin Contextual View All Hosting source `08ff6d0a2e1c9d72a84a8216e6413bd42e4aeb01`.

Auth source: tested Signup/Login integration `d583e881fc49bc6b3d7a533cea0cd7588bcc9176`, selectively ported to the preserved live source.

This candidate retains **exact bytes** of `app/(superadmin)/`, `app/(admin)/`, `components/admin/`, `firestore.rules`, `firebase.json`, `.firebaserc`, `storage.rules`, `functions/`, and `backend/` from the latest deployed base.

Source ports: app/_layout.tsx, app/login.tsx, app/login.web.tsx, app/signup.tsx, app/signup.web.tsx, components/auth/AuthFeedback.tsx, components/auth/EmailFirstSignup.tsx, lib/firebaseAuth.ts, lib/disposableEmailDomains.generated.ts, lib/emailFirstSignupAuth.ts, lib/loginInputValidation.ts, lib/registrationEmailPolicy.ts, lib/signupFeature.ts, lib/signupMessages.ts, lib/signupRegistration.ts, lib/useSignupGoogle.ts, lib/useSignupGoogle.web.ts, third_party/disposable-email-domains-LICENSE.txt, scripts/test-signup-prod.cjs, scripts/test-signup-google-oauth.cjs, scripts/test-login-field-validation.cjs.

**Explicit policy decision for preview:** keep deployed production Firestore Rules unchanged. This preserves old-client enrollment behavior and does **not** enforce verified email creation for every user at the Firestore boundary. Client-side new-flow validation alone is not a server security boundary. The stricter rule changes from the standalone Signup release are NOT included. Do not represent this as the completed verified-only security migration.

The new premium Signup is enabled only at web export with `EXPO_PUBLIC_EMAIL_FIRST_SIGNUP=true`. The source flag remains OFF by default, and installed Android binaries do not update through Hosting.

## Mandatory before live release
- Confirm exact current live fingerprint still matches this base; release may be stale if another Admin deploy occurs.
- Complete CI plus **preview only** on a Hosting preview channel.
- Visual regression for updated Super Admin View All, Audit Logs, LGU Admin, Resident, Volunteer, Maps, Events and Donations. Never assume automated build alone confirms real permissions.
- Test real email verification, Gmail/Yahoo/Outlook, resume, and Google login with authorized synthetic nonproduction accounts where possible. The web preview uses the live Firebase project unless specially isolated.
- Confirm old Android/web compatibility, feature-flag rollout and rollback; do not deploy stricter rules before a separate migration decision.
- Back up the current live Hosting version before any later manual promotion.
- Do not push this branch into production automatically: this branch/workflow has no deploy steps.

Rollback of Hosting to prior live version does not roll back Firebase users or Firestore data. Rollback of old permissive Firestore Rules is not a remedy for verification enforcement.
