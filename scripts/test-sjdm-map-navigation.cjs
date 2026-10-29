"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = p => fs.readFileSync(path.resolve(__dirname, "..", p), "utf8");

const layout = read("app/(tabs)/_layout.tsx");
const modulePage = read("app/(tabs)/disaster-response.tsx");
const map = read("components/tabs/MapTracking.web.tsx");
const webReport = read("components/DisasterResponse.web.tsx");
const cases = read("app/(tabs)/my-cases.tsx");
const events = read("app/(tabs)/community-events.tsx");
const eventMap = read("components/CommunityEventRoadMap.web.tsx");

assert(!layout.includes('name: "map-tracking"'), "Live map cannot be a standalone Resident/Volunteer nav item");
assert(modulePage.includes('active ? <MapTracking /> : <DisasterResponse />'), "Live map must live in Emergency Reports");
assert(modulePage.includes('accessibilityLabel="Live response map inside Emergency Reports"'));
assert(modulePage.includes('params.caseId'), "Selected case deep links must open integrated tracking");
assert(webReport.includes('/disaster-response?view=tracking&caseId='));
assert(cases.includes('pathname:') && cases.includes('"/disaster-response" as any') &&
  cases.includes('view: "tracking"'), "My Reports tracking must remain inside Emergency Reports");
assert(events.includes("CommunityEventRoadMap") && events.includes("CommunityEventLiveLocation"),
  "Event venue and consent-based organizer map remain inside Community Events");
assert(eventMap.includes("router.project-osrm.org"),"Road navigation remains an actual route, not a static image");

const native = read("components/tabs/MapTracking.native.tsx");
const boundary = read("lib/sjdmMapBoundary.ts");
const geometry = read("constants/sjdmBoundaryReference.ts");
const places = read("lib/sjdmPublicMapPlaces.ts");
const facilities = read("lib/lguMapFacilities.ts");
assert(map.includes("loadSjdmBoundary") && map.includes("sjdmOutsideMask(sjdmBoundary)"),
  "Restore actual bundled SJDM geometry and the city-only map mask");
assert(map.includes("sjdm-exterior-blocked") && map.includes("sjdm-city-outline") &&
  map.includes("withinCity"), "Strict city mask and polygon geofence must remain");
assert(geometry.includes("30758251B35007836972970") &&
  boundary.includes("insideSjdmBoundary"), "Attributed real GeoBoundaries reference required");
assert(map.includes("SJDM_PUBLIC_MAP_PLACE_PINS") &&
  map.includes("makePublicPlacePopup") && map.includes("payload.publicPlaces"),
  "Restore mapped SJDM permanent public-building reference icons");
assert(places.includes("San Jose del Monte New Government Center") &&
  places.includes("Dulong Bayan Barangay Hall") &&
  places.includes("CDRRMO") &&
  places.includes("third_party_approximate"),
  "CDRRMO must be clearly approximate and mapped government buildings referenced");
assert(map.includes('collection(db, "lguMapFacilities")') &&
  map.includes("verifiedLguMapFacility") &&
  facilities.includes('data.verificationStatus !== "verified"'),
  "Only active LGU-verified facility records may become operational markers");
assert(map.includes("const visibleCenters = useMemo") &&
  !map.includes("missionMode || adminMissionMode || !showCenters") &&
  map.includes("Show road route here"),
  "Case-view shelters must remain visible where verified; restore on-demand in-map road routing");
assert(map.includes("navigator.geolocation.getCurrentPosition") &&
  map.includes("routeStaysInSjdm") && map.includes("router.project-osrm.org"),
  "No external-city routes, fabricated ETAs or non-consensual GPS routing");
assert(map.includes("LGU_FACILITY_ICONS") &&
  map.includes("SJDM_PUBLIC_PLACE_ICON") &&
  map.includes("isVerifiedActiveCenter") &&
  map.includes("activeLguResponderUid"),
  "Distinct icon classes, active shelters and authorized responder-only GPS remain");
assert(native.includes("SJDM_MASK_EXTERIOR") &&
  native.includes("LGU_FACILITY_ICONS") && native.includes("lguMapFacilities"),
  "Restore geo-fenced native categorized markers");
console.log("PASS restored Oct28 SJDM city geofence, sourced building icons, active LGU facilities and case-view shelters");
