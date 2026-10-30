"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = p => fs.readFileSync(path.join(__dirname, "..", p), "utf8");
const home = read("components/home/QuickStartActions.tsx");
const web = read("components/home/Home.web.tsx");
const native = read("components/home/Home.native.tsx");
test("simple Resident choices resolve to existing routes", () => {
  for (const t of ["Report an Emergency", "Request Assistance", "Track My Requests", 'route: "/disaster-response"', 'route: "/resident"', 'route: "/my-cases"']) assert.ok(home.includes(t), t);
});
test("Volunteer first choices preserve assignments, events, progress", () => {
  for (const t of ["Emergency Tasks", "Community Events", "My Progress", 'route: "/volunteer"', 'route: "/(tabs)/community-events"', 'route: "/profile?tab=progress"']) assert.ok(home.includes(t), t);
});
test("secondary services require an explicit More Services action", () => {
  assert.ok(home.includes('expanded ? <View style={styles.moreActions}>'));
  assert.ok(home.includes("Make a Donation"));
  assert.ok(home.includes("Become a Volunteer"));
  assert.ok(!home.includes('route: "/map-tracking"'));
});
test("both platform home screens use the same task-first component", () => {
  for(const s of [web, native]) {
    assert.ok(s.includes("<QuickStartActions"));
    assert.ok(!s.includes("<ServiceCard\n"), "Legacy native cards must not remain mounted");
    assert.ok(!s.includes("<View style={[styles.journeyBar"), "Old journey ribbon must be hidden");
  }
});
test("accessibility and emergency safety context are visible", () => {
  assert.ok(home.includes('accessibilityRole="button"'));
  assert.ok(home.includes("In immediate danger, call 911."));
  assert.ok(home.includes("Online reports do not replace an emergency call."));
});
