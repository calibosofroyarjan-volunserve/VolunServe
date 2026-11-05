# Combined current-live Super Admin + premium Signup preview (November 5, 2026)

**Preview only; not production-ready.**

Base exact most recently successful live Hosting update: `3c8186a120139ae0a09efbb6a2dfecc8bcc59220` (Super Admin Assistance Records; includes earlier Audit Logs, Filter & Sort, Contextual View All and LGU Admin improvements).

Ported only 21 targeted Signup/Login code and test files from `d583e881fc49bc6b3d7a533cea0cd7588bcc9176`. All current production `app/(superadmin)/`, `app/(admin)/`, `components/admin/`, `firestore.rules`, Firebase config, backend and functions are kept byte-identical to the live base.

The premium Signup build switch is `EXPO_PUBLIC_EMAIL_FIRST_SIGNUP=true` for the web preview. The feature flag remains off by default in checked-in source.

The existing Firestore Rules are intentionally unchanged to preserve old web/Android compatibility, but do NOT enforce verified-email-only profile creation at the server. The new client flow cannot substitute for a server rule. Any strict policy migration needs separate approval and coordination with obsolete clients.

The automation runs TypeScript, Signup, Google, Login checks and Expo Hosting export, verifies current live fingerprint and uses Firebase's preview channel. **Never promotes to live.** Rebuild candidate from a newer base if live changes again.

Verify Admin/Super Admin, Login, Signup, Resident, Volunteer, Events, Maps, Donations, verified email, Google OAuth and account permissions in a controlled test plan before requesting a production Hosting release. Firebase Hosting rollback does not undo data changes.
