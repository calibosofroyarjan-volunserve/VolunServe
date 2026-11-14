"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const cases = fs.readFileSync("app/(admin)/admin-cases.tsx","utf8");
const map = fs.readFileSync("components/tabs/MapTracking.web.tsx","utf8");

assert(cases.includes('Open Response Map'), "Case workspace must have a dedicated map button");
assert(cases.includes('detailTab !== "overview" && styles.hiddenSection'), "Show the location shortcut only in Overview");
assert(!cases.includes('src: "/admin-live-map?caseId="'), "Never embed full Admin navigation within itself");
assert(!cases.includes('["map", "Map & Route"]'), "No redundant embedded map tab");
assert(cases.includes('/(admin)/admin-live-map?caseId='), "Focused route must keep the exact Admin case ID");
for (const essential of ["Overview","Case Status","Volunteer Assignment","History","Request More Evidence","Reject Report","Validate Report"]) {
  assert(cases.includes(essential), "Existing review flow removed: "+essential);
}
assert(map.includes("admin-focused-map"), "Focused map mode missing");
assert(map.includes("admin-map-back"), "Back to Emergency Reports navigation missing");
assert(map.includes("focused-response-panel"), "Compact Admin status panel missing");
assert(map.includes("adminMissionMode && isAdministrator && adminCase"), "Only Admin case mode should get focused controls");
assert(map.includes("adminVolunteerPins.filter("), "Use authorized Volunteer response GPS feed");
assert(map.includes('["responding", "on_site"].includes(normalize(point.status))'),
  "Volunteer must have started responding before GPS is shown in focused Admin mode");
assert(map.includes("focusedActiveVolunteer"), "No active Volunteer GPS gating");
assert(map.includes("const mapIncidentCases = useMemo"), "Incident pin selection preserved");
assert(map.includes("insideSjdmBoundary"), "SJDM boundary verification must remain");
assert(map.includes("routeStaysInSjdm"), "In-city route enforcement must remain");
assert(map.includes('router.push("/(admin)/admin-cases"'), "Must navigate back to case review");
assert(map.includes("No estimated arrival time is shown without a verified route"), "No fabricated ETA");
console.log("PASS: focused Admin case map is separate, navigable, SJDM-only and volunteer-start-gated; original review actions preserved.");
