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

test("Resident map case selection stays inside Emergency Reports", () => {
  const map = read("components/tabs/MapTracking.web.tsx");
  assert.match(map, /disaster-response\\?view=tracking&caseId=\\$\\{encodeURIComponent\\(caseId\\)\\}/);
  assert.match(map, /disaster-response\\?view=tracking&caseId=\\$\\{encodeURIComponent\\(onlyCase.id\\)\\}/);
  assert.match(map, /router\\.replace\\("\\/disaster-response\\?view=tracking"/);
  assert.doesNotMatch(map, /router\\.replace\\("\\/map-tracking"/);
  assert.match(map, /item\\.category \\|\\| item\\.title/);
});

test("Native case links focus on the selected emergency without invented travel times", () => {
  const map = read("components/tabs/MapTracking.native.tsx");
  assert.match(map, /useLocalSearchParams/);
  assert.match(map, /focusedIncident/);
  assert.match(map, /incident\\.id === focusedCaseId/);
  assert.match(map, /point\\.caseId === focusedCaseId/);
  assert.match(map, /Road directions are unavailable/);
  assert.doesNotMatch(map, /Math\\.ceil\\(\\(directDistance \\/ 25\\)/);
});

test("Hidden response map links keep the correct owning module highlighted", () => {
  const layout = read("app/(tabs)/_layout.tsx");
  assert.match(layout, /const owningModule/);
  assert.match(layout, /route === "map-tracking"/);
});

test("Emergency hub uses restrained typography and mobile-size accessible controls", () => {
  const hub = read("app/(tabs)/disaster-response.tsx");
  assert.match(hub, /minHeight: 48/);
  assert.match(hub, /compactActionGroup/);
  assert.match(hub, /accessibilityState=\\{\\{ selected: view === "tracking" \\}\\}/);
  assert.match(hub, /serviceTitle/);
});
