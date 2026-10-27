# LOCKED — VolunServe Unified Notifications and Push Delivery
Date: 2026-10-27. Preserve Super Admin / LGU Admin onboarding priority and do not destabilize tomorrow's release.

## Single notification architecture
- Source of truth: private Firestore `notifications` collection, using the current schema and existing backend event producers where possible; no duplicate inbox collections for the same recipient.
- Notification event: unique idempotency key, recipientUid, eventType, actorUid or sourceId (if appropriate), safe title and summary, link target, timestamp, read status, delivery status/attempts, expiry. Reconcile this with existing Firestore schema and rules before migration. Do not place personal ID numbers, biometrics, private evidence or financial secrets in pushes.
- Privileged backend only creates authoritative operational notifications and sends pushes; NEVER trust client-supplied recipient lists or permit arbitrary app users to send push notifications to others.
- Notifications must be user-private with read-only/mark-read limited to the intended recipient, and per-role authorized navigation. Super Admin gets governance/application security alerts; LGU Admin gets operational alerts (including emergency/assistance/donation review). No Super Admin operational disbursement actions.
- Read/unread, unread badge, Mark All Read, filter by type, deep-link navigation, search when useful, and pagination 5/page for long admin queues. Empty/loading/error states, retry/backoff, deduplication and throttling required.

## Push platforms
- Android APK: install and configure expo-notifications plus a supported EAS-built Android native push delivery pipeline, and appropriate FCM credentials. Request notification permission at a contextual point; get unique device token and securely associate with signed-in UID in a private token registry. Revoke on logout/account disable or token invalidation.
- iOS PWA distributed by website: Apple-supported Web Push requires install to Home Screen, applicable iOS version, permission on a direct user interaction, valid HTTPS and a service worker, Web Push subscription/VAPID server push. This is NOT Android APK push, not necessarily Expo native push, and may be unavailable in browsers/contexts. Gracefully fall back to in-app Firestore inbox.
- Desktop web: opt-in browser web push if supported; never prompt aggressively. All platforms must have in-app inbox.
- Do not claim Apple iOS native app push unless there is an actual signed and distributed native iOS build with credentials. An iOS PWA remains web app.

## Event-to-recipient contracts
- LGU staff submitted -> Super Admin; request-more-documents/decision -> applicant; promoted/suspended -> respective staff; suspicious access -> system governance.
- Emergency reported/assigned/status -> specific authorized LGU Admin/responders and reporting resident; high priority but never promise instant delivery.
- Assistance application/status -> relevant Admin/owner; donation campaign/update/receipt/release/acknowledgement -> authorized appropriate accounts; no private payment or banking details inside push.
- Community Event approval, registration, assignment, attendance verification, completion, certificate -> corresponding applicant, volunteers and Admin.
- Profile verification and announcements -> respective recipient scopes. Public guest feed can be accessed without a token.

## Security and operational release gates
- Minimal privacy-safe message text on lock screens; avoid publishing GPS coordinates, full names of emergency complainants, ID scans, verification images and sensitive information.
- Backend event -> Firestore inbox creation -> push attempt with retries/idempotency; push delivery is best-effort, never authoritative evidence of task completion. Persist important events in app for missed/offline pushes.
- Rate limit and time-bound tokens; handle permission denied, logged-out user, duplicate devices, token rotation, and expired subscriptions.
- Must test two real Android devices with APK background/killed/foreground state, role-scoped accounts, expired token, security rules; iPhone Safari Home Screen PWA permission and actual push on supported iOS device; web reload/permission and invalid deep links.
- No production credentials in repo. Do not deploy push backend/Firestore rules/storage changes without explicit review.
- Existing repo has a Firestore notification inbox and backend notification records, but verified end-to-end push integration is NOT complete at this time.
