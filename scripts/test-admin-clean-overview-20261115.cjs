"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const src = fs.readFileSync("app/(admin)/admin-cases.tsx", "utf8");
const panels = fs.readFileSync("components/admin/EmergencyFiveTabDesign.tsx","utf8");
for (const text of ["ReferenceOverview","ReferenceStatus","ReferenceHistory","ReferenceVolunteerMatching","Review & Validate","Request Evidence","Reject Report","Call Emergency 911","CASE PROGRESS","caseProgressRow","casePrimaryActionBar","caseListPagination","Volunteer Assignment","Case Status","History","Validate Report","Request More Evidence","styles.caseWorkspace","styles.caseListPane"]) {
  assert(src.includes(text), "Expected Admin workflow content: " + text);
}
assert(!src.includes('src: "/admin-live-map?caseId="'), "Nested full-site map would duplicate sidebar");
assert(!src.includes('["map", "Map & Route"]'), "Map should be accessible via dedicated button");
assert(panels.includes("Incident Summary") && panels.includes("Resident Information") && panels.includes("Case Status & Response"), "Reference Overview cards missing");
assert(src.includes("encodeURIComponent(incident.id)"), "Exact case ID must be passed to dedicated map");
assert(src.includes("encodeURIComponent(incident.id)") && panels.includes("onMap={") === false, "Map must use saved case ID, not inferred coordinates");
assert(src.includes('setDetailTab("evidence")'), "Action shortcuts must open existing review rather than silently mutate case status");
assert(src.includes('awaitingAdminVerification'), "No dangerous shortcut on already-processed cases");
assert(src.includes('reviewVerification(incident, "validate")'), "Preserve original explicit validation handler");
assert(src.includes('reviewVerification(incident, "reject")'), "Preserve original rejection handler");
assert(src.includes('onPress={() => setSelectedCaseId(item.id)}'), "Case switch preserved");
assert(src.includes('pageSize={5}'), "Keep five-case pagination");
console.log("PASS complete Admin workspace, dedicated response map and explicit evidence review.");
