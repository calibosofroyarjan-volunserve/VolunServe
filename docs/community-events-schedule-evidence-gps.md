# Community Event: Schedule, Evidence, and GPS venue (2026-10-24)

## Resident proposal

- Enter future **Start Time** and **End Time** on the same date (end after start).
- Select the venue and **tap the map to pin the exact meeting point**. Native app uses react-native-maps; web uses a sandboxed Leaflet/OpenStreetMap iframe and requests browser GPS only after a click.
- Upload **at least one** site/event-evidence photo. Up to three images can be selected (JPG, PNG, WebP, max 5 MB); the existing authenticated Cloudinary upload supports file submissions, with HTTPS photo links as fallback. Never upload government IDs in public event photo slots.
- Credentials / supervision textbox is replaced by an **optional professional credential image**. This is uploaded using authenticated Cloudinary delivery to `communityEventCredentialAssets` rather than publicly readable event media. A signed private-access URL is available only to authorized Admin reviewers.
- Proposals stay `pending` until Admin approval.

## Admin approval

- Review submitted evidence photo(s), saved venue GPS and any optional private credentials.
- Approve & Publish copies start/end times and the exact saved event location coordinates to `communityEvents`.
- Firestore rules allow copied coordinates/end time on Admin create only when identical to the source proposal, maintaining transaction approval restrictions.

## Volunteer navigation

- Published Community Event details show the Start–End schedule.
- In **Location & Map**, map uses saved `latitude` and `longitude`; `Navigate to GPS Pin` opens Google Maps driving directions. The existing optional embedded driving route requests volunteers' device geolocation only when clicked; location is not persisted.
- Older events without GPS preserve the approximate text address fallback and a warning.

## Deployment sequence

1. Merge changes. Render **VolunServe** Node backend → Manual Deploy → Deploy latest commit → Live (new proposal API + protected credential upload).
2. From root of `VolunServe-Latest`, deploy rules:
   ```powershell
   npx --yes firebase-tools@latest deploy --only firestore:rules --project volunserve-3aa5b
   ```
3. Export web on sufficient-memory machine:
   ```powershell
   $env:NODE_OPTIONS="--max-old-space-size=4096"
   npx expo export --platform web --clear --max-workers 2
   Test-Path .\dist\index.html
   ```
4. Only if build is successful, deploy Firebase preview channel:
   ```powershell
   npx --yes firebase-tools@latest hosting:channel:deploy mock-defense-oct24 --project volunserve-3aa5b
   ```
5. In a fresh Basic/Verified Resident session with eligibility to propose, submit a valid *future* event. Required evidence, end time and GPS should all be enforced; professional credentials are optional. Confirm `pending` in Resident My Proposals and Admin queue.
6. Admin review: view evidence, private credential only if provided, click **View Resident GPS Event Pin**, then approve/publish. Confirm no Firestore permission-denied.
7. Volunteer: open published event → Location & Map → Navigate to GPS Pin (external Google Maps). Test web Show Route Here only if Maps Embed API key and location permissions available.
8. Never upload personal government IDs to publicly accessible Event Photo slots. Manage credential lifecycle and retention before broad production rollout.

## Rollout scope / caveats

- Existing proposals/events created before this revision have no endTime or precise GPS; legacy records are not retroactively changed.
- Real navigation is delegated to Google Maps; this release does not implement a full embedded turn-by-turn navigation engine.
- Web map loads Leaflet and OpenStreetMap tiles from third-party hosts. If blocked, the user can attempt device GPS, but successful pin placement requires network access.
- Changes have been code-reviewed for field propagation; they **have not been built or tested live** in Render/Firebase from this tool environment.
