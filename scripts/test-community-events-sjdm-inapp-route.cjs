"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const read = path => fs.readFileSync(path, "utf8");

const backend = require("../backend/sjdmEventBoundary");
const canonicalSource = read("constants/sjdmBoundaryReference.ts");
const polygonMatch = canonicalSource.match(/export const SJDM_REFERENCE_GEOMETRY = (\{.*\}) as const;/);
assert(polygonMatch, "SJDM reference polygon must remain available");
const canonical = JSON.parse(polygonMatch[1]);
assert.deepEqual(backend.SJDM_EVENT_GEOMETRY, canonical,
  "Backend event polygon must match the canonical UI polygon exactly");

const { insideSjdmEventArea } = backend;
assert.equal(insideSjdmEventArea(14.8139, 121.0453), true,
  "SJDM center venue should be valid");
assert.equal(insideSjdmEventArea(14.95, 121.10), false,
  "Coordinates within the old broad bounding box but outside the city must fail");
assert.equal(insideSjdmEventArea(14.6, 121.10), false,
  "Out-of-city venue must fail");
assert.equal(insideSjdmEventArea(NaN, 121.10), false);
assert.equal(insideSjdmEventArea(14.8139, Infinity), false);

const app = read("app/(tabs)/community-events.tsx");
const admin = read("app/(admin)/community-events.tsx");
const server = read("backend/server.js");
const picker = read("components/CommunityEventPinPicker.web.tsx");
const nativePicker = read("components/CommunityEventPinPicker.native.tsx");
const mapPicker = read("components/InteractiveEventPinMap.web.tsx");
const webMap = read("components/CommunityEventRoadMap.web.tsx");
const nativeMap = read("components/CommunityEventRoadMap.native.tsx");
const shared = read("lib/communityEventSjdmScope.ts");

assert(server.includes("insideSjdmEventArea(latitude, longitude)"),
  "Backend must validate new proposal coordinates against city polygon");
assert(admin.includes("!isSjdmEventPoint(proposedLatitude, proposedLongitude)"),
  "Admin must refuse to publish legacy out-of-city proposals");
assert(app.includes("return isSjdmEventPoint(lat, lng);"),
  "Only confirmed SJDM pins may render a Community Event map");
assert(app.includes("!isSjdmEventPoint(form.latitude, form.longitude)"),
  "Resident event proposals must be constrained to SJDM");
assert(picker.includes("return isSjdmEventPoint(lat, lng);") &&
  nativePicker.includes("isSjdmEventPoint(a,b)") &&
  mapPicker.includes("insideCity(lat,lng)"),
  "Pin pickers must validate against real SJDM polygon");
assert(shared.includes("SJDM_REFERENCE_GEOMETRY") && shared.includes("routeStaysInSjdm"),
  "Both venue and routed road coordinates must use canonical boundary");
assert(webMap.includes("isSjdmEventRoute(points.map(") &&
  webMap.includes('maxBounds: [[data.bounds.west'),
  "Web road geometry must remain in SJDM and map bounds must be constrained");
assert(nativeMap.includes("<Polyline coordinates={route.coordinates}") &&
  nativeMap.includes("isSjdmEventRoute(road)"),
  "Native map must draw only verified within-city road polylines");
assert(app.includes("Location.requestForegroundPermissionsAsync()") &&
  app.includes("geolocation.getCurrentPosition"),
  "Native/web in-app GPS requires a voluntary Show Route action");
assert(app.includes("showRouteInVolunServe(event)") &&
  !app.includes("googleMapsNavigationUrl") &&
  !app.includes("googleMapsDirectionsUrl") &&
  !app.includes("Navigate to GPS Pin") &&
  !app.includes("Open Directions in Google Maps") &&
  !app.includes("Open in Google Maps"),
  "Community Events must only use an in-app Show Route action");
assert(!picker.includes("Open Google Maps ↗") &&
  !nativePicker.includes("Find Venue in Google Maps ↗"),
  "Venue pickers must not open outside map applications");
assert(app.includes("communityEventParticipants") &&
  app.includes("checkedInAt") &&
  app.includes("checkedOutAt"),
  "Existing attendance and participant tracking must remain");
console.log("PASS Community Events polygon, internal maps, routing and existing attendance contracts");
