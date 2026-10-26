# Community Events — venue pin selection and directions

## Resident: proposal workflow (web)
1. Select barangay, venue, event date and capacity.
2. On **Event Meeting Point**, tap the actual venue on the interactive map (or drag the marker).
3. Review the selected coordinates and press **Confirm Meeting Point**. The proposal cannot use an unconfirmed location.
4. Submit the proposal and supporting evidence for LGU Admin review. Approval is distinct from Resident pin confirmation.

The web picker supports two honest modes:
- If `EXPO_PUBLIC_GOOGLE_MAPS_JS_API_KEY` is configured and the Maps JavaScript API is authorized, use the Google Maps interactive click-and-drag map.
- Otherwise use the **interactive OpenFreeMap / OpenStreetMap vector map rendered with MapLibre**, without a Google Maps browser key. This is NOT branded or described as Google Maps. Users can tap or drag an actual map pin.
- If map tiles/WebGL are unavailable, **Use Current GPS** or optional **Enter Coordinates** still works. Location permission is opt-in. Google Maps external search stays available.

The existing proposal API's broad San Jose del Monte service-area coordinate bounds are unchanged: latitude 14.65–15.0, longitude 120.88–121.30. Those are bounds, not proof that a place is a real event venue. LGU independently verifies the submitted pinned location.

**Never use the user's current GPS when the person is not standing at the venue.** Device GPS is not automatically written to Firestore. A user must explicitly confirm a chosen meeting point, which is then submitted as proposal data.

## Admin and Volunteer
- Admin reviews the submitted place name, barangay, supporting evidence, coordinates and map pin before approval/publication.
- Published events retain the authorized location pin.
- Residents/Volunteers see the event venue location. On web, **Show Road Route** requests current device GPS on click and uses OpenFreeMap/MapLibre and OSRM; the displayed distance and ETA are routing estimates, **not live traffic**.
- **Open in Google Maps** remains an external directions option. On native mobile, native map venue pin and Google Maps external directions remain available.
- Organizer live GPS is private and available only to eligible joined Volunteers while sharing is enabled; it must not be mixed into the public meeting point.

## Security and testing
- The interactive fallback is in a sandboxed iframe with script permission only. The parent validates the iframe window and a per-instance token before accepting map coordinates.
- Both click/drag and manual input enforce the app's service-area coordinate guard.
- Moving the pin invalidates any previously saved confirmation. Only **Confirm Meeting Point** propagates final coordinates into the proposal.
- No Firestore rules, backend or LGU roles are modified by this UI change.

## Release
1. Review PR checks: `node scripts/test-event-pin-picker.cjs`, TypeScript, Firebase emulator rules, Expo web export.
2. In the repo with a clean Git working tree, update `main`, compile and export.
3. Deploy Firebase Hosting (no new Firestore rules are required for this specific pin-picker change).
4. On HTTPS production desktop and mobile browsers, test **map tap, pin drag, GPS denied, outside SJDM click, manual coordinates, confirmation reset, proposal submission and LGU review**.
5. If tiles are blocked or web WebGL fails, use the explicit manual/GPS fallback; don't claim interactive map testing passed.
6. Production / mobile E2E status is separate from passing CI.

Google Maps documentation for optional Maps JavaScript API:
https://developers.google.com/maps/documentation/javascript/get-api-key
