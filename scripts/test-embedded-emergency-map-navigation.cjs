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


test("Resident tracking shows the case map without requiring an LGU Personnel response", () => {
  const map = read("components/tabs/MapTracking.web.tsx");
  const admin = read("app/(admin)/admin-cases.tsx");
  const volunteer = read("app/(tabs)/volunteer.web.tsx");

  const pinsStart = map.indexOf("const mapResponderPins = isAdministrator");
  const pinsEnd = map.indexOf("const residentShareMode:", pinsStart);
  assert.ok(pinsStart >= 0 && pinsEnd > pinsStart, "Missing role-scoped responder map logic");
  const responderMap = map.slice(pinsStart, pinsEnd);
  assert.match(responderMap, /isResidentMode\s*\?\s*residentActiveVolunteerPins/);
  assert.doesNotMatch(responderMap, /residentLguPin/, "Resident must not depend on LGU Personnel GPS");

  assert.match(map, /incidents:\s*mapIncidentCases\.map/, "Saved incidents must be visible without responder GPS");
  assert.match(map, /No valid in-city GPS coordinate is saved/, "Do not invent a precise pin from an address");
  assert.match(map, /VOLUNTEER GPS LIVE/);
  assert.match(map, /const residentVolunteerStatus = normalize\(residentPrimaryAssignment\?\.status\)/);
  assert.match(map, /const residentShareCanPublish =\s*isResidentMode &&\s*!!residentShareAssignment/);
  assert.match(map, /const residentCanStartShare =\s*isResidentMode &&\s*!!residentShareAssignment/);

  assert.match(admin, /const assignVolunteerToCase = async/);
  assert.match(admin, /Volunteer Response Progress/);
  assert.match(admin, /Volunteer Completion Reports/);
  assert.doesNotMatch(admin, /<Text style=\{styles\.personnelCleanTitle\}>LGU Primary Responder<\/Text>/);
  for (const transition of ['"accepted"', '"responding"', '"on_site"', '"completed"']) {
    assert.ok(volunteer.includes(transition), "Missing Volunteer task state " + transition);
  }
});

