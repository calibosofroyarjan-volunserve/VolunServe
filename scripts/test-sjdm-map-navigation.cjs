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
assert(map.includes('id: "sjdm-city-outline"') && map.includes('id: "sjdm-city-fill"'),
  "Draw actual sourced GeoJSON city outline; never a made-up rectangle");
assert(map.includes("cityBoundaryUrl") && map.includes("Nominatim"),
  "Boundary must be obtained from a named data provider");
assert(map.includes("cityBoundaryBounds") && map.includes("lastNavigationView"),
  "Default city camera must not expand to out-of-city resident GPS");
assert(map.includes('label.textContent = "CDRRMO"') && map.includes("Approximate map pin, not real-time"),
  "CDRRMO pin is explicitly informational, not impersonating a tracked response vehicle");
assert(map.includes("isVerifiedActiveCenter") && map.includes("activeLguResponderUid"),
  "Shelter and responder privacy controls must remain");
console.log("PASS SJDM map scope, sourced outline, CDRRMO informational icon and embedded emergency/event navigation");
