# VolunServe emergency GPS and evacuation map — release checklist

## What currently runs
- **Web emergency map:** OpenFreeMap vector basemap rendered by MapLibre; OSRM road routing; web geolocation `watchPosition` updates while permission is granted and the page is active.
- **Live responder GPS:** Private Firestore `lguResponseLocations/{caseId}` and `responseLocations/{uid}`, `onSnapshot` for authorized Admin, case owner Resident, and assigned Volunteer/Personnel. Location markers only move when a real device publishes GPS; readings over 30 seconds old display stale.
- **Admin vehicle assignment metadata:** `disasterCases/{caseId}.responseVehicleType`; choices are ambulance, fire truck, rescue vehicle, service/repair vehicle, other vehicle, or on foot. This does **not** dispatch physical units by itself.
- **Shelters:** `evacuation_centers` documents update live via `onSnapshot`. Only records with `status=active`, `verificationStatus=verified` and valid coordinates appear as published open shelters. Facility occupancy is based on LGU entry, not a sensor.
- **Google Maps:** Verified shelters expose a standard Google Maps directions link. Web map **inside** VolunServe is currently MapLibre, not Google Maps JavaScript API. Native maps use `react-native-maps`. Google Maps browser SDK integration requires an authorized, correctly restricted Google Maps Platform browser key with billing.
- **Privacy:** Only an assigned mission can expose resident/responder exact coordinates. Guests see shelter locations, never emergency-case or responder GPS. Do not share GPS continuously without the device owner's consent.

## Government records for LGU verification, not proof of current opening
- CSJDM 2018 Ecological Profile: https://csjdm.gov.ph/wp-content/uploads/2021/03/Ecological-ProfileP-2018.pdf (central evacuation site at Sapang Palay Proper and historically designated barangay evacuation areas).
- CSJDM 2016–2025 CLUP Evacuation Centers Location Map: https://csjdm.gov.ph/wp-content/uploads/2024/03/CSJDM-CLUP-2016-2025.pdf
- SJDM CDRRMO official city contact page: https://csjdm.gov.ph/contact-us/
These are **historical reference sources**. They do not verify today's exact availability, shelter capacity or map coordinates. No public historical facility should be auto-published as ACTIVE.

## Remock acceptance tests (use test accounts, never fake production GPS)
1. **LGU center creation:** Add known facility with official coordinates, name, barangay, occupancy/capacity. Leave confirmation unchecked. Check saved as pending and hidden from Resident/Public active map.
2. **LGU verification:** Independently verify address, coordinates, center status and capacity with CDRRMO. Add a non-sensitive official reference and tick confirmation. Save; check it appears on Resident/Public map with a Google Maps direction link and last update time.
3. **Permissions:** Resident may view the center but may not edit its metadata. Attempting a direct Firestore write should be rejected.
4. **Dispatch vehicle:** LGU Admin opens a test emergency case, selects Fire Truck. Confirm database value changes, and no firetruck marker appears without an assigned LGU responder GPS reading.
5. **Real GPS sharing:** Assigned LGU Personnel grants foreground geolocation permission and enables location sharing for the case. On a separate Resident test account viewing that case, confirm a firetruck marker appears **at the transmitting device's actual location**. Do not fabricate movement.
6. **Stale/permission denial:** Stop sharing or deny location permission. Confirm location is no longer labeled as fresh. Test GPS off and lost connectivity.
7. **Other vehicles:** Repeat for ambulance, rescue vehicle and service/repair vehicle, checking the same real position protocol and permissions.
8. **Map navigation:** Verify the public shelter location against Google Maps and city records. Test the external route; no estimated arrival time should be treated as guaranteed.
9. **Mobile:** Test Android Expo/native and web/mobile separately. Browser foreground location sharing is not background GPS tracking.
10. **Release:** Check GitHub CI: emulator rules, TypeScript, production web export. Deploy **Firestore rules first**, then Hosting. Verify emergency admin/resident/volunteer flows with real test accounts. Only then mark feature deployed and E2E verified.

## Operational caveats
Google map tiles and Google Places are not automatically updated into Firestore by this change. Availability requires LGU staff to confirm and update center records. `onSnapshot` provides low-latency delivery of **changes to Firestore**, not an external live sensor feed. Avoid exposing private coordinates on public pages or dashboards.
