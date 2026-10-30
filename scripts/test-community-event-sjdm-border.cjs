"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

// Load only the existing attributed city-boundary reference and pure helpers.
require.extensions[".ts"] = (mod, filename) => {
  const code = fs.readFileSync(filename, "utf8");
  mod._compile(ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  }).outputText, filename);
};
const zone = require(path.resolve("lib/sjdmEventPinBoundary.ts"));
const { SJDM_EVENT_BOUNDARY, SJDM_EVENT_BOUNDS, SJDM_EVENT_OUTSIDE_MASK, validSjdmEventPin } = zone;
const text = file => fs.readFileSync(file,"utf8");
assert.equal(SJDM_EVENT_BOUNDARY.properties.city, "City of San Jose del Monte");
assert.equal(SJDM_EVENT_BOUNDARY.geometry.coordinates[0].length >= 100, true,
  "Must reuse real simplified municipal polygon, not arbitrary rectangle");
assert(validSjdmEventPin(14.813, 121.045), "SJDM city interior rejected");
for (const [lat,lng] of [
  [14.84,121.15], // within rectangular extent but OUTSIDE actual city polygon
  [14.86,121.15], // within extent but outside city
  [14.75,121.04], [14.90,121.12], [14.84,120.93], // outside city
  [NaN,121.04], [14.82,Infinity],
]) assert(!validSjdmEventPin(lat,lng), "Out-of-city pin accepted: "+lat+","+lng);
assert(SJDM_EVENT_BOUNDS.south > 14.7 && SJDM_EVENT_BOUNDS.north < 14.9);
assert(SJDM_EVENT_BOUNDS.west > 121.0 && SJDM_EVENT_BOUNDS.east < 121.2);
assert(SJDM_EVENT_OUTSIDE_MASK.geometry.coordinates.length >= 2,
  "Outside mask must have an actual city-shaped cutout");
const parent = text("app/(tabs)/community-events.tsx");
const picker = text("components/CommunityEventPinPicker.web.tsx");
const native = text("components/CommunityEventPinPicker.native.tsx");
const fallback = text("components/InteractiveEventPinMap.web.tsx");
const lookup = text("lib/eventVenueLookup.ts");
assert(parent.includes("!validSjdmEventPin(form.latitude, form.longitude)"),
  "Proposal must reject out-of-city coordinates before any Firestore write");
assert(lookup.includes("const insideSJDM = validSjdmEventPin"),
  "Venue auto-lookup must reject boundary-exterior candidates");
assert(picker.includes("return validSjdmEventPin(lat, lng)") &&
  picker.includes("strictBounds: true") &&
  picker.includes("SJDM_EVENT_OUTSIDE_MASK") &&
  picker.includes("onChangeRef.current(null, null)"),
  "Google Maps and web picker must constrain camera, overlay city polygon, and clear stale exterior pins");
assert(fallback.includes("maxBounds:box") &&
  fallback.includes("insideCity(lat,lng)") &&
  fallback.includes('id:"sjdm-event-outside-mask"') &&
  fallback.includes('id:"sjdm-event-city-outline"'),
  "OpenStreetMap fallback must mask outside polygon and constrain panning/pin selection");
assert(native.includes("setMapBoundaries(") && native.includes("<Polygon") &&
  native.includes("holes={SJDM_EVENT_OUTSIDE_MASK.geometry.coordinates.slice(1).map(toNativeRing)}") &&
  native.includes("const valid = validSjdmEventPin"),
  "Android map must render and enforce city boundary");
assert(picker.includes("onChange(draft.latitude, draft.longitude)") &&
  native.includes("onChange(draft.latitude,draft.longitude)"),
  "Keep original confirmed meeting-point callback contract");
console.log("PASS: City polygon vs large SJDM rectangle; Google/MapLibre/Android map boundary, old-pin cleanup, geocoder and proposal checks");
