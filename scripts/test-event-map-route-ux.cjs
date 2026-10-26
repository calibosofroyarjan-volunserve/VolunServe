/** CI guard: Public venue navigation remains independent of private event GPS. */
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
const read = p => fs.readFileSync(path.join(root, p), "utf8");
const screen = read("app/(tabs)/community-events.tsx");
const web = read("components/CommunityEventRoadMap.web.tsx");
const native = read("components/CommunityEventRoadMap.native.tsx");
const types = read("components/CommunityEventRoadMap.d.ts");
const shelters = read("components/tabs/MapTracking.web.tsx");
const location = read("components/CommunityEventLiveLocation.tsx");

assert(screen.includes("CommunityEventRoadMap"), "Existing Community Events screen must embed new map");
assert(screen.includes("showRouteInVolunServe(event)"), "Route preview must require an explicit click");
assert(screen.includes("geolocation.getCurrentPosition"), "Route origin must use consent-based device GPS");
assert(screen.includes("eventHasCoordinates(event)"), "Missing venue pins must not get false exact routes");
assert(!screen.includes("googleMapsEmbedKey"), "On-page route must not require billing-only Maps Embed key");
assert(web.includes("router.project-osrm.org/route/v1/driving/"), "Roads require real routing service");
assert(web.includes('overview=full&geometries=geojson'), "Route geometry must be road-following");
assert(web.includes("tiles.openfreemap.org/styles/liberty"), "Use real basemap, not hand-drawn lines");
assert(web.includes("MapLibre") && web.includes("OpenStreetMap"), "Map provider attribution required");
assert(web.includes("controller.abort()"), "Route requests must cancel on event change");
assert(web.includes("Math.abs(p[0]) <= 180") && web.includes("points.length > 20000"),
  "Untrusted remote route geometry must be bounded and validated");
assert(web.includes('sandbox: "allow-scripts"'), "Iframe must be script sandboxed");
assert(native.includes("react-native-maps") && native.includes("<Marker"),
  "Native app must render an actual geolocated event venue marker");
assert(types.includes("destination: Point"), "Cross-platform route map must have strict coordinate props");
assert(location.includes("communityEventLiveLocations") && location.includes("canView"),
  "Private organizer GPS permission model must not be removed");
assert(shelters.includes("isVerifiedActiveCenter") &&
  shelters.includes("🏠 Verified shelters ({visibleCenters.length})"),
  "Only LGU-verified shelters can be presented as open on live map");
const reportWeb = read("components/DisasterResponse.web.tsx");
const reportNative = read("components/DisasterResponse.native.tsx");
const shelterWeb = read("components/VerifiedEvacuationCenters.web.tsx");
const shelterNative = read("components/VerifiedEvacuationCenters.native.tsx");
const shelterHook = read("lib/useVerifiedEvacuationCenters.ts");
assert(reportWeb.includes("<VerifiedEvacuationCenters />") &&
  reportNative.includes("<VerifiedEvacuationCenters />"),
  "LGU verified shelter directory must live inside Emergency Reports on both platforms");
assert(shelterHook.includes('collection(db, "evacuation_centers")') &&
  shelterHook.includes("isVerifiedActiveCenter"),
  "Only actual LGU-verified active Firestore shelters can render");
assert(shelterWeb.includes("maplibre-gl") &&
  shelterWeb.includes('sandbox:"allow-scripts"') &&
  shelterNative.includes("<MapView") && shelterNative.includes("<Marker"),
  "Emergency Reports shelter pins require real web and native maps");
assert(shelterWeb.includes("mapsDirectionsUrl") && shelterNative.includes("mapsDirectionsUrl"),
  "Verified centers must offer Google Maps directions, not fake route distances");
assert(shelterHook.includes("Last reported:") && shelterHook.includes("LGU record updated"),
  "Capacity and update status must be sourced from LGU records and not called live");

console.log("PASS event venue markers, consent-based road route, native map and verified shelters");
