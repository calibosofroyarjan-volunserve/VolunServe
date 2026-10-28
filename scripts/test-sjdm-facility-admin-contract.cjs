"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root,file), "utf8");

test("LGU Admin has a single facility registry within Emergency & Relief", () => {
  const admin = read("app/(admin)/_layout.tsx");
  assert.match(admin, /"SJDM Facilities", icon: "map-outline", route: "\/\(admin\)\/sjdm-facilities"/);
  assert.match(admin, /labels: \["Emergency Reports", "SJDM Facilities", "Relief Operations"\]/);
  const editor = read("app/(admin)/sjdm-facilities.tsx");
  assert.match(editor, /profile\?\.role === "admin"/);
  assert.match(editor, /profile\?\.adminStatus !== "suspended"/);
  assert.match(editor, /insideSjdmBoundary\(boundary, lat, lng\)/);
  assert.match(editor, /SJDM_BARANGAYS\.includes\(form\.barangay\)/);
  assert.match(editor, /PAGE_SIZE = 5/);
});

test("LGU facility and evacuation data are published only with independent verification", () => {
  const code = read("app/(admin)/sjdm-facilities.tsx");
  assert.match(code,/verificationSource\.trim\(\)\.length < 10/);
  assert.match(code,/publishing && form\.verificationStatus !== "verified"/);
  assert.match(code,/form\.verificationStatus === "verified" && !confirmed/);
  assert.match(code,/status: form\.status/);
  assert.match(code,/lastVerifiedAt: serverTimestamp\(\)/);
  assert.match(code,/collection\(db, "evacuation_centers"\)/);
  assert.match(code,/collection\(db, "lguMapFacilities"\)/);
  const rules=read("firestore.rules");
  assert.match(rules,/match \/lguMapFacilities\/\{facilityId\}/);
  assert.match(rules,/allow create, update: if isAdmin\(\) && validOfficialFacility\(\)/);
  assert.match(rules,/d\.status != 'active' \|\| \(/);
  assert.match(rules,/match \/evacuation_centers\/\{centerId\}/);
  assert.match(rules,/rd\.latitude > 14\.74 && rd\.latitude < 14\.90/);
  assert.match(rules,/rd\.longitude > 120\.99 && rd\.longitude < 121\.20/);
});

test("Map shows verified fixed LGU facilities independently of assigned vehicle GPS", () => {
  const web=read("components/tabs/MapTracking.web.tsx");
  const native=read("components/tabs/MapTracking.native.tsx");
  for (const code of [web,native]) {
    assert.match(code,/lguMapFacilities/);
    assert.match(code,/LGU_FACILITY_ICONS/);
    assert.match(code,/insideSjdmBoundary/);
  }
  assert.match(web,/setMaxBounds/);
  assert.match(native,/setMapBoundaries/);
  assert.match(native,/lguResponseLocations/);
  assert.match(native,/active.*verified|verified.*active|isVerifiedActiveCenter/);
});

test("Official city source references are address-only, never auto-published as live emergency pins", () => {
  const source = read("constants/sjdmOfficialFacilityReview.ts");
  const admin = read("app/(admin)/sjdm-facilities.tsx");
  assert.match(source, /https:\/\/csjdm\.gov\.ph\/contact-us\//);
  assert.match(source, /https:\/\/csjdm\.gov\.ph\/city-disaster-risk-reduction-and-management-office\//);
  assert.match(source, /Ecological-ProfileP-2018\.pdf/);
  assert.doesNotMatch(source, /latitude\s*:/);
  assert.doesNotMatch(source, /longitude\s*:/);
  assert.match(admin, /loadOfficialReference/);
  assert.match(admin, /verificationStatus: "pending"/);
  assert.match(admin, /latitude: ""/);
  assert.match(admin, /longitude: ""/);
  assert.match(admin, /Official city references for verification/);
});
