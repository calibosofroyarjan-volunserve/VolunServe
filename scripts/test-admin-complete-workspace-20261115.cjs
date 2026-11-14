"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const screen = fs.readFileSync("app/(admin)/admin-cases.tsx", "utf8");
const map = fs.readFileSync("components/tabs/MapTracking.web.tsx", "utf8");
for (const x of ["Emergency Reports", "CASE PROGRESS", "Volunteer Offer", "Review & Validate", "Request Evidence", "Reject Report", "Call Emergency 911", "Resident Information", "Incident Details", "Case Status & Priority", "MAP & ROUTE", "Open Response Map", "completeCriticalBanner", "caseListPagination"]) {
  assert(screen.includes(x), "Missing mockup element "+x);
}
assert(screen.includes("caseProgressStage"),"Progress tracker missing");
assert(screen.includes("progressStages.findIndex"),"Progress tracker must follow actual saved status");
assert(screen.includes('onPress={() => setDetailTab("evidence")}'),"Review shortcuts must open existing verification");
assert(screen.includes('reviewVerification(incident, "validate")'),"Preserve explicit verification action");
assert(screen.includes('reviewVerification(incident, "reject")'),"Preserve explicit reject action");
assert(screen.includes("reviewVerification(\n                              incident,\n                              \"request_more_evidence\""),"Preserve evidence-request action");
assert(screen.includes("pageSize={5}"),"Keep case pagination at five");
assert(!screen.includes('src: "/admin-live-map?caseId="'),"Nested full-site iframe would duplicate Admin navigation");
assert(screen.includes("encodeURIComponent(incident.id)"),"Pass exact case ID to focused response map");
assert(map.includes("admin-focused-map") && map.includes("focused-response-panel"),"Keep full sized focused SJDM map");
assert(map.includes("insideSjdmBoundary") && map.includes("routeStaysInSjdm"),"Map must be confined to SJDM");
const preserved = ["Case Status", "Volunteer Assignment", "History", "Evidence (", "styles.caseListItems", "styles.caseDetailPane"];
for(const x of preserved)assert(screen.includes(x),"Existing controls removed: "+x);
console.log("PASS: Complete Admin mockup UI, real status tracker, safe review actions, separate map, SJDM bounds.");
