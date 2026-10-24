# Community Events — Google Maps venue and navigation flow

## What changed
The old Resident location picker used **https://{s}.tile.openstreetmap.org**, causing 403 Access Blocked due to tile-usage policies. It has been replaced on web with:

1. **Google Maps JavaScript API** interactive click/drag picker **when** `EXPO_PUBLIC_GOOGLE_MAPS_JS_API_KEY` is set and the key is authorized for the deployed website.
2. **Google Maps embedded preview** (never claim it is click-to-pin) when there is no authorized JavaScript API key. In this fallback, Resident may **Use My Current GPS** (only if standing at the venue) or paste **latitude, longitude** / a full Google Maps coordinate-bearing URL and press **Set Pin**. Shortened Google Maps URLs without coordinates cannot be parsed in browser without resolving the redirect.
3. **Confirm Event Pin** button. Selecting/changing a candidate pin invalidates any previously confirmed coordinates; the form is not submittable until the new point is confirmed.
4. A general SJDM service-area bound consistent with the backend: latitude 14.65–15.0, longitude 120.88–121.30.
5. Admin event review displays Google Maps preview of the Resident-confirmed venue, coordinates and an Open Google Maps link. Approval copies those coordinates into the published event; Volunteer map navigation uses those coordinates, not inferred resident/device coordinates.

## Recommended Google Maps JavaScript API setup for clickable pins

- In Google Cloud, link an appropriate billing account and **enable Maps JavaScript API**.
- Create a **browser API key** restricted by **HTTP website referrers** and by API: Maps JavaScript API. Add your actual Firebase Hosting preview and production origins/domains. Do **not** use a server-only API key or expose a private key.
- On the Expo web build machine, set in the root `.env.local`:
  ```ini
  EXPO_PUBLIC_GOOGLE_MAPS_JS_API_KEY=YOUR_RESTRICTED_BROWSER_KEY
  ```
- For an official iframe preview, separately enable **Maps Embed API** and set `EXPO_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY` to a browser-restricted key authorized for that API; this is optional, as the no-key Google Maps preview URL is a fallback.
- Restart/re-export Expo web **after** changing an `EXPO_PUBLIC_...` variable. These variables are embedded in the public JavaScript bundle; only public, referrer-restricted keys belong there.
- Google's official docs: https://developers.google.com/maps/documentation/javascript/get-api-key and https://developers.google.com/maps/documentation/embed/quickstart

## Resident → Admin → Volunteer verification

**Resident**: Select barangay and venue → choose date, start and end time → Google map click/drag (if configured) or GPS/manual coordinates → Confirm Event Pin → add description, volunteer skills, required site photo → Submit Proposal. If changing the pin, reconfirm first.

**Admin**: Community Event Proposals → open pending proposal → verify schedule, site evidence and pinned GPS preview → approve/publish. The published event retains verified venue coordinates. Do not approve when the submitted coordinates point to the wrong location.

**Volunteer**: Community Events → event details → Location & Map → View Map / Navigate to GPS Pin. Google Maps driving navigation opens with the **event venue** as the destination; user's location is only used on demand, for navigation origin.

## Build and rollout

1. Pull main; keep a backup or stash any uncommitted work.
2. The change is frontend-only; no new Render backend, Firebase rules, Firebase functions, or storage deployment is required.
3. In the `VolunServe-Latest` root:
   ```powershell
   $env:NODE_OPTIONS="--max-old-space-size=4096"
   npx expo export --platform web --clear --max-workers 2
   Test-Path .\dist\index.html
   ```
4. Only if `True` and export succeeds, upload to preview:
   ```powershell
   npx --yes firebase-tools@latest hosting:channel:deploy mock-defense-oct24 --project volunserve-3aa5b
   ```
5. Test on browser and Android/iOS phone: no OpenStreetMap 403 tiles, changing pin clears confirmation, cannot submit without confirmation, Admin pin aligns with venue, Volunteer route uses exact same coordinate.
6. Earlier pending/published events keep previously saved coordinates; there is no retroactive remapping.

## Limitations

- Without a Google Maps JavaScript API browser key and billing, the fallback iframe **cannot report map clicks**; use manual coordinates or device GPS. Do not claim otherwise.
- Map preview relies on Google Maps being reachable and iframe permissions of the browser. A new window link is always available.
- No indoor routing or turn-by-turn navigation implemented in VolunServe; Google Maps provides real-world directions outside the app.
- This change has been reviewed in GitHub, but not yet build- or live-tested in the user's Firebase preview environment.
