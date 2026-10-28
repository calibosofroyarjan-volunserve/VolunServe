# SJDM-only Emergency Map: administrative outline and live facility pins

**Status:** Draft work for Friday Oct 30 revision, NOT DEPLOYED. Synthetic CI may pass without proving on-device GIS, CORS, Firestore writes or operational evacuation availability.

## What changed
- Web MapLibre and Android Google Maps now request the **real administrative boundary geometry** for San Jose del Monte from the PSA 2015 Municipal Boundary GIS layer served by the Philippine GeoRisk platform. The renderer draws an emerald GeoJSON **polygon**, NOT a fake rectangle. Its computed bounding rectangle restricts **map camera movement**, but the polygon itself is the actual geographic reference. Parts of bordering roads outside the city can remain visible in the rectangular viewport. This **cannot** be treated as legal cadastral adjudication; the SJDM LGU itself notes boundaries/disputes and differing land-area claims.
- The reference polygon ships with the app; if its geometry fails local validation the map explicitly says the border is unavailable. No fabricated substitute is shown. A city polygon and a map-camera bounding rectangle are **not** the same thing.
- Existing `evacuation_centers` Firestore listener remains real-time **database updates**. Only `status=active`, `verificationStatus=verified` and valid coordinate records become public shelter pins; capacity/occupied reflects the latest **human LGU update**, not a real-time occupancy sensor.
- New `lguMapFacilities` Firestore feed is for **fixed LGU buildings only**: city government, CDRRMO, fire, police, health and barangay offices. Distinct map icons identify their categories. Only LGU Admin can create/update verified records, guarded by Firestore rules. Status must be active and verified to be rendered. These records are **not** live vehicle locations and must never claim movement.
- Existing *case-authorized* LGU responder GPS pins and vehicle icons remain separately governed by prior security rules and fresh GPS time checks.

## City government address references available in LGU Admin screen
The **Official city references for verification** panel links directly to city-published records. Its "Review draft" button copies an address and barangay suggestion **without coordinates, approval, current status or capacity**, and keeps verification pending. No Firestore record is auto-seeded. These are starting points for the authorized Admin's independent review:
- New Government Center — Barangay Dulong Bayan, from the official CSJDM Contact Us page (address confirmed, GPS unpublished by this feature).
- CDRRMO Building — Productivity Complex/Motorpool, Sapang Palay Proper, from the official CDRRMO page (canonical signup barangay dropdown says "Sapang Palay"; verify naming directly).
- Historical central evacuation site — Productivity Center, Sapang Palay Proper, from the City's **2018** Ecological Profile. This historical reference does **not** prove the site remains a designated or open evacuation center in 2026. Do not mark active solely based on this archival listing.

For the map popup, active means the **LGU-recorded status**, not that the site is confirmed open at this moment. Capacity, occupancy and available spaces are *last LGU-reported counts* with an update time, not IoT/live sensor feeds. Before using a shelter in a real emergency, verify with official LGU channels.

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
7. LGU Admin must enter an independently reviewed real location (no invented pins), source, barangay, coordinates, and verification state in `/(admin)/sjdm-facilities`. Test pending → verified → active, later closed/inactive, and actual Firestore `onSnapshot` map update.
8. Test security rules under Firestore emulator: unrelated Residents, pending applicants and Super Admin must not create official facility records; Approved LGU Admin can; a pending office cannot be published active; and both record types are geographically bounded at the rules layer (a coarse envelope only, while UI uses the actual polygon).
9. No deployment or production rules application has been done by this branch.

## Known limitations
- The bundled geoBoundaries polygon is a **simplified reference shape**, not an LGU-signed legal boundary or certified survey. It should be reviewed against the city's official planning maps and any known contested sections before a critical operations release. Attribution is included in the map and source.
- Camera bounding boxes constrain rectangular map views; only the polygon shows irregular geographic extent. Navigation to locations just outside city limits might show neighboring map areas. No guarantee that an emergency trip cannot cross geographic boundaries.
- An LGU Admin record-maintenance screen now exists at `/(admin)/sjdm-facilities`, with separate Evacuation Center and fixed LGU Facility editors, SJDM city polygon validation, barangay dropdown, per-record verification source, administrative status, capacity/occupancy controls, and 5-per-page review. **This is draft branch code, not deployed or acceptance-tested on actual accounts yet.** There is no authoritative live occupancy sensor/API; timestamps reflect the most recent authorized LGU record update. No live occupancy is claimed.
