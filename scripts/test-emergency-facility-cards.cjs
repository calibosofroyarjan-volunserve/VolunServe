"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root,file), "utf8");
const places = read("lib/sjdmPublicMapPlaces.ts");
const web = read("components/tabs/MapTracking.web.tsx");
const native = read("components/tabs/MapTracking.native.tsx");
test("real mapped hospital locations remain in the Emergency Hub",()=>{
  for (const name of ["Healthway QualiMed Hospital","Skyline Hospital and Medical Center","Grace Medical Center"]) assert.ok(places.includes(name), name);
  assert.match(places, /Dulong Bayan Barangay Hall/);
  assert.match(places, /New Government Center/);
  assert.match(places, /City of San Jose del Monte CDRRMO/);
  assert.match(places, /photoCredit/);
});
test("existing premium photo layout and in-app facility detail panel stay intact",()=>{
  for (const feature of ["facility-photo-frame","facility-photo-fallback","facility-detail-panel","function openFacilityDetails","facility-body-content","item.photoUrl","image.onerror"]) assert.ok(web.includes(feature),feature);
  assert.match(web, /Verified photo of this exact building is not yet available/);
  assert.match(web,/photoWrap\.appendChild\(image\)/);
  assert.match(web,/Open named place in Google Maps/);
  assert.match(web,/Show road route here/);
});
test("hospital markers and source URLs retained",()=>{
  assert.match(places, /tanglawan.ph\/wp-content\/uploads\/2024\/01\//);
  assert.match(places, /cdn-healthcare.hellohealthgroup.com/);
  assert.match(web, /hospital: "Hospital \/ Emergency Care"/);
  assert.match(native, /SJDM_PUBLIC_MAP_PLACE_PINS/);
});
