"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const read = p => fs.readFileSync(path.join(root, p), "utf8");

test("resident and volunteer desktop and mobile menus have no standalone Response Map tab", () => {
  const src = read("app/(tabs)/_layout.tsx");
  for (const menu of ["residentDesktopTabs", "volunteerDesktopTabs", "residentMobileTabs", "volunteerMobileTabs"]) {
    const re = new RegExp("const " + menu + ":[^\\n]*= \\[([\\s\\S]*?)\\];");
    const match = src.match(re);
    assert.ok(match, "Missing " + menu);
    assert.doesNotMatch(match[1], /name:\s*"map-tracking"/, menu);
    assert.match(match[1], /name:\s*"community-events"/, menu);
  }
});

test("Emergency Reports owns Report Emergency and case-aware Live Response Map", () => {
  const hub = read("app/(tabs)/disaster-response.tsx");
  assert.match(hub, /import DisasterResponse from/);
  assert.match(hub, /import MapTracking from/);
  assert.match(hub, /params\.view === "tracking"/);
  assert.match(hub, /!!params\.caseId/);
  assert.match(hub, /Live response map inside Emergency Reports/);
  assert.match(hub, /\{active \? <MapTracking \/> : <DisasterResponse \/>\}/);
});

test("Community Events still has its OWN map in event details, not a standalone sidebar module", () => {
  const events = read("app/(tabs)/community-events.tsx");
  assert.match(events, /import CommunityEventRoadMap from/);
  assert.ok((events.match(/<CommunityEventRoadMap/g) || []).length >= 2, "Event detail maps missing");
  assert.match(events, /Event map belongs to the expanded event details/);
});

test("hospital location/photo data and original premium hospital cards survive navigation fix", () => {
  const places = read("lib/sjdmPublicMapPlaces.ts");
  const map = read("components/tabs/MapTracking.web.tsx");
  for (const name of ["Healthway QualiMed Hospital", "Skyline Hospital and Medical Center", "Grace Medical Center", "Dulong Bayan Barangay Hall", "CDRRMO"]) {
    assert.ok(places.includes(name), "Missing facility " + name);
  }
  assert.match(map, /facility-photo-frame/);
  assert.match(map, /facility-detail-panel/);
  assert.match(map, /function openFacilityDetails/);
});
