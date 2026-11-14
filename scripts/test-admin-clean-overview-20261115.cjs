"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const src = fs.readFileSync("app/(admin)/admin-cases.tsx", "utf8");
for (const text of ["Emergency Overview","Incident Details","Resident Information","Case Status & Priority","Open Response Map","Review & Validate","Request Evidence","Reject Report","Call Emergency 911","CASE PROGRESS","cleanOverviewGrid","caseProgressRow","casePrimaryActionBar","caseListPagination","Volunteer Assignment","Case Status","History","Validate Report","Request More Evidence","styles.caseWorkspace","styles.caseListPane"]) {
  assert(src.includes(text), "Expected Admin workflow content: " + text);
}
assert(!src.includes('src: "/admin-live-map?caseId="'), "Nested full-site map would duplicate sidebar");
assert(!src.includes('["map", "Map & Route"]'), "Map should be accessible via dedicated button");
assert(!src.includes('<Text style={styles.overviewCardTitle}>Case Status</Text>'), "Old crowded Overview three-card grid should be removed");
assert(src.includes("encodeURIComponent(incident.id)"), "Exact case ID must be passed to dedicated map");
assert(src.includes('!Number.isFinite(incident.latitude)') && src.includes('!Number.isFinite(incident.longitude)'), "Map must not infer missing coordinates");
assert(src.includes('onPress={() => setDetailTab("evidence")}'), "Action shortcuts must open existing review rather than silently mutate case status");
assert(src.includes('awaitingAdminVerification'), "No dangerous shortcut on already-processed cases");
assert(src.includes('reviewVerification(incident, "validate")'), "Preserve original explicit validation handler");
assert(src.includes('reviewVerification(incident, "reject")'), "Preserve original rejection handler");
assert(src.includes('onPress={() => setSelectedCaseId(item.id)}'), "Case switch preserved");
assert(src.includes('pageSize={5}'), "Keep five-case pagination");
console.log("PASS complete Admin workspace, dedicated response map and explicit evidence review.");
