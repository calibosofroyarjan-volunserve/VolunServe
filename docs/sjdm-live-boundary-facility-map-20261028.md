# SJDM-only Emergency Map: administrative outline and live facility pins

**Status:** Draft work for Friday Oct 30 revision, NOT DEPLOYED. Synthetic CI may pass without proving on-device GIS, CORS, Firestore writes or operational evacuation availability.

## What changed
- Web MapLibre and Android Google Maps now request the **real administrative boundary geometry** for San Jose del Monte from the PSA 2015 Municipal Boundary GIS layer served by the Philippine GeoRisk platform. The renderer draws an emerald GeoJSON **polygon**, NOT a fake rectangle. Its computed bounding rectangle restricts **map camera movement**, but the polygon itself is the actual geographic reference. Parts of bordering roads outside the city can remain visible in the rectangular viewport. This **cannot** be treated as legal cadastral adjudication; the SJDM LGU itself notes boundaries/disputes and differing land-area claims.
- The reference polygon ships with the app; if its geometry fails local validation the map explicitly says the border is unavailable. No fabricated substitute is shown. A city polygon and a map-camera bounding rectangle are **not** the same thing.
- Existing `evacuation_centers` Firestore listener remains real-time **database updates**. Only `status=active`, `verificationStatus=verified` and valid coordinate records become public shelter pins; capacity/occupied reflects the latest **human LGU update**, not a real-time occupancy sensor.
- New `lguMapFacilities` Firestore feed is for **fixed LGU buildings only**: city government, CDRRMO, fire, police, health and barangay offices. Distinct map icons identify their categories. Only LGU Admin can create/update verified records, guarded by Firestore rules. Status must be active and verified to be rendered. These records are **not** live vehicle locations and must never claim movement.
- Existing *case-authorized* LGU responder GPS pins and vehicle icons remain separately governed by prior security rules and fresh GPS time checks.

## Facility data publication (LGU only, no inventing locations)
The collection has deliberately **not been auto-seeded**. For each independently verified facility, an authorized LGU Admin publishes:
```json
{
  "name": "Name confirmed by LGU",
  "address": "Verified physical address, SJDM, Bulacan",
  "barangay": "Actual SJDM barangay",
  "facilityType": "cdrrmo",
  "latitude": 14.8,
  "longitude": 121.0,
  "status": "active",
  "verificationStatus": "verified",
  "verificationSource": "Official office source and verification reference",
  "updatedAt": "<server timestamp>",
  "updatedBy": "<current Admin UID>"
}
```
**The numeric coordinates above are *format examples* only, NOT a real LGU facility location.** Do not publish them. Firestore rules require allowed types/strings and plausibly located coordinates; the client also filters using the verified city polygon when available. The underlying data requires physical/official confirmation by Admin.

Useful source leads (not sources of live operational status):
- Bundled city boundary: geoBoundaries by William & Mary geoLab, CC BY 4.0. Source feature `City of San Jose del Monte` from https://github.com/yowmamasita/philippines-map-data/blob/main/data/admin/geoboundaries/geoBoundaries-PHL-ADM3_simplified.geojson ; original project https://www.geoboundaries.org/ ; license https://creativecommons.org/licenses/by/4.0/
- City government current public contact directory and New Government Center address: https://csjdm.gov.ph/contact-us/
- City government published evacuation inventory: https://csjdm.gov.ph/wp-content/uploads/2024/03/CSJDM-SEP-2022.pdf
- City geography disclaimer/boundaries: https://csjdm.gov.ph/socioeconomic-and-physical-profile/geophysical-sector/

## Checks required before calling this complete
1. Browser: confirm the bundled 134-point reference polygon renders in the expected shape (with geoBoundaries CC BY 4.0 attribution), then pan beyond the city to test camera restriction.
2. Android: verify map setMapBoundaries and Polygon support on an installed APK, ensure location permissions and map gestures work without crashes.
3. Add one **synthetic** LGU-owned verified facility in Firestore emulator; assert it appears as category icon with latest-updated label. Test pending/inactive/wrong-role create/update rejection. Repeat with an Admin-verified actual location only after official source review.
4. Evacuation center: verify a locally seeded *synthetic* location appears only when active and verified; reject wrong/out-of-polygon records; verify capacity date is not advertised as instantaneous.
5. Live operational LGU GPS remains scoped to its assigned emergency case; no cross-resident private movement leak.
6. When no facilities/center data exists, show honest empty state rather than filling map with fabricated pins. Add verified records and proper permissions before the Friday demonstration.
7. No deployment or production rules application has been done by this branch.

## Known limitations
- The bundled geoBoundaries polygon is a **simplified reference shape**, not an LGU-signed legal boundary or certified survey. It should be reviewed against the city's official planning maps and any known contested sections before a critical operations release. Attribution is included in the map and source.
- Camera bounding boxes constrain rectangular map views; only the polygon shows irregular geographic extent. Navigation to locations just outside city limits might show neighboring map areas. No guarantee that an emergency trip cannot cross geographic boundaries.
- The full LGU facility-maintenance UI and authoritative live shelter occupancy API have **not yet been built**. Firestore updates require independent LGU-authorized record management. No live occupancy is claimed.
