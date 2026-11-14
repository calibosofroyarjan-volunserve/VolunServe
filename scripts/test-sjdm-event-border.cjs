"use strict";
/* Regression of real SJDM city masking/valid pin on Propose Event.
 * Synthetic coordinate tests only; no geolocation, Google key, browser,
 * real user, Firebase, or production deployment.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const base = path.join(__dirname,"..");
const read = file => fs.readFileSync(path.join(base,file),"utf8");
const {isSjdmEventPoint} = require("../backend/sjdmEventBoundary.cjs");
const backendGeo = require("../backend/sjdmEventBoundaryGeometry.json");
const canonical = read("constants/sjdmBoundaryReference.ts");
const match = canonical.match(/export const SJDM_REFERENCE_GEOMETRY = (\{.*\}) as const;/s);
assert(match,"City reference geometry was removed");
assert.deepEqual(backendGeo,JSON.parse(match[1]),
  "Server pin guard must match exact Volunteer map polygon data");
assert.equal(backendGeo.coordinates[0].length,134,
  "The original attributed 134-point polygon must be retained");
for(const [name,lat,lng] of [
  ["SJDM city center",14.813,121.045],
  ["Gumaoc",14.807,121.08],
  ["SJDM East",14.821,121.13],
]){
  assert.equal(isSjdmEventPoint(lat,lng),true,
    name+" must remain selectable");
}
for(const [name,lat,lng] of [
  ["Santa Maria",14.82,120.96],
  ["Bocaue",14.797,120.937],
  // A point can be inside the old broad box but OUTSIDE the real city polygon.
  ["outside notch of city polygon",14.832,121.012],
  ["outside south edge",14.75,121.08],
  ["bogus lat",NaN,121.045],
  ["bogus longitude",14.813,Infinity],
]){
  assert.equal(isSjdmEventPoint(lat,lng),false,
    name+" must be rejected");
}
const picker=read("components/CommunityEventPinPicker.web.tsx");
const iframe=read("components/InteractiveEventPinMap.web.tsx");
const native=read("components/CommunityEventPinPicker.native.tsx");
const lookup=read("lib/eventVenueLookup.ts");
const api=read("backend/server.js");
const boundary=read("lib/sjdmMapBoundary.ts");

assert(picker.includes("loadSjdmBoundary()") &&
  picker.includes("insideSjdmBoundary(boundary, lat, lng)") &&
  picker.includes("boundaryBounds(cityBoundary)"),
  "Google map must load the exact shared city boundary");
assert(picker.includes("restriction: {") &&
  picker.includes("strictBounds: true") &&
  picker.includes("new g.maps.LatLngBounds"),
  "Google camera must remain limited to city bounding view");
assert(picker.includes("exterior.addGeoJson(sjdmOutsideMask(cityBoundary))") &&
  picker.includes('fillOpacity:1') &&
  picker.includes("outline.addGeoJson(cityBoundary)"),
  "Google map must mask neighboring towns and draw the actual city outline");
assert(picker.includes("validVenue(cityBoundary, draft.latitude,draft.longitude)"),
  "Pin confirmation must reject a draft outside the city polygon");
assert(!picker.includes("lat >= 14.65 && lat <= 15.0"),
  "Never rely on the old wide service-area rectangle");
assert(iframe.includes("sjdmOutsideMask(boundary)") &&
  iframe.includes("map.setMaxBounds(") &&
  iframe.includes('map.addSource("sjdm-outside-mask"') &&
  iframe.includes('map.addLayer({id:"sjdm-exterior-blocked"') &&
  iframe.includes('map.addLayer({id:"sjdm-city-outline"') &&
  iframe.includes("if (!withinCity(lat,lng))"),
  "OpenStreetMap/MapLibre fallback needs the same boundary mask and pin test");
assert(iframe.includes('marker.setLngLat(acceptedPoint)'),
  "Invalid drag must restore last in-city pin");
assert(native.includes("loadSjdmBoundary()") &&
  native.includes("setMapBoundaries(") &&
  native.includes("insideSjdmBoundary(boundary,a,b)") &&
  native.includes("holes={boundaryRings(cityBoundary).map(") &&
  native.includes("SJDM_MASK_EXTERIOR"),
  "Native meeting point picker must mask outside city and constrain camera");
assert(native.includes("if(!pick(next.latitude,next.longitude))") &&
  native.includes("setDraft({...last})"),
  "Native drag must roll back invalid coordinates");
assert(lookup.includes("insideSjdmBoundary(boundary, lat, lng)") &&
  lookup.includes("if (!boundary) return { status: \"unavailable\" }") &&
  lookup.includes("bounds.west,bounds.north,bounds.east,bounds.south"),
  "Venue geocoding cannot suggest out-of-polygon locations");
assert(api.includes('require("./sjdmEventBoundary.cjs")') &&
  api.includes("if (!isSjdmEventPoint(latitude, longitude))"),
  "Backend must independently enforce the same exact polygon on submissions");
assert(boundary.includes("geoBoundaries") &&
  canonical.includes("CC BY 4.0"),
  "Retain the Volunteer city's geodata source attribution");
assert(picker.includes("onChange(draft.latitude, draft.longitude)") &&
  picker.includes("onChangeRef.current(null, null)"),
  "Only explicit valid confirmation is submitted and stale confirmed pin invalidated");
console.log("PASS Propose Event Google, OSM, native picker, geocoder and server share exact SJDM city-only boundary");
