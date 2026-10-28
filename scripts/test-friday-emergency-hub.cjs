// Friday defense regression guard: no duplicate response map in navigation.
// Run: node --test scripts/test-friday-emergency-hub.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = p => fs.readFileSync(path.join(root,p), "utf8");

test("Resident and Volunteer sidebar/mobile tabs have no duplicate Response Map", () => {
  const layout = read("app/(tabs)/_layout.tsx");
  assert.doesNotMatch(layout, /name: "map-tracking",\s*label:/);
  assert.match(layout, /name: "disaster-response",\s*label: "Emergency Reports"/);
  assert.match(layout, /name: "community-events",\s*label: "Community Events"/);
});

test("Emergency Reports owns the shared report and tracking views", () => {
  const hub = read("app/(tabs)/disaster-response.tsx");
  assert.match(hub, /params.view === "tracking"/);
  assert.match(hub, /params.caseId/);
  assert.match(hub, /<MapTracking\s*\/>/);
  assert.match(hub, /<DisasterResponse\s*\/>/);
  assert.match(hub, /router.replace\(/);
  assert.match(hub, /Track Response/);
});

test("Report success, duplicate report, quick action and history lead to correct case-specific tracking", () => {
  assert.match(read("components/DisasterResponse.web.tsx"), /\/disaster-response\?view=tracking&caseId=\$\{encodeURIComponent\(success\)\}/);
  assert.match(read("components/DisasterResponse.web.tsx"), /\/disaster-response\?view=tracking&caseId=\$\{encodeURIComponent\(duplicateBlock.caseId\)\}/);
  assert.match(read("components/DisasterResponse.native.tsx"), /\/disaster-response\?view=tracking&caseId=\$\{encodeURIComponent\(block!.caseId\)\}/);
  assert.match(read("components/EmergencyResponseQuickActions.tsx"), /pathname: "\/disaster-response", params: \{ view: "tracking", caseId: active.id \}/);
  assert.match(read("app/(tabs)/my-cases.tsx"), /pathname: "\/disaster-response" as any,\s*params: \{ view: "tracking", caseId \}/);
});

test("Existing tracking deep links and Volunteer Tasks remain available", () => {
  assert.match(read("app/(tabs)/map-tracking.tsx"), /MapTracking/);
  assert.match(read("app/(tabs)/map-tracking.web.tsx"), /MapTracking.web/);
  assert.match(read("app/(tabs)/volunteer.tsx"), /"\/map-tracking"/);
  assert.match(read("app/(tabs)/volunteer.web.tsx"), /"\/map-tracking"/);
});

test("Community Events retains in-module location and directions", () => {
  const events = read("app/(tabs)/community-events.tsx");
  assert.match(events, /Location & Map/);
  assert.match(events, /<CommunityEventRoadMap/);
  assert.match(events, /googleMapsDirectionsUrl\(event\)/);
});
