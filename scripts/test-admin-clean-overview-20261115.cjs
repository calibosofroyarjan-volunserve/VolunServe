"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const src = fs.readFileSync("app/(admin)/admin-cases.tsx", "utf8");
for (const text of ["Incident overview","Incident Summary","Resident Information","Open Response Map","Review Evidence  ›","View Assignment  ›","cleanOverviewGrid","cleanOverviewStatusBar","Volunteer Assignment","Case Status","History","Validate Report","Reject Report","Request More Evidence","styles.caseWorkspace","styles.caseListPane"]) {
  assert(src.includes(text), "Expected Admin workflow content: " + text);
}
assert(!src.includes('src: "/admin-live-map?caseId="'), "Nested full-site map would duplicate sidebar");
assert(!src.includes('["map", "Map & Route"]'), "Map should be accessible via dedicated button");
assert(!src.includes('<Text style={styles.overviewCardTitle}>Case Status</Text>'), "Old crowded Overview three-card grid should be removed");
assert(src.includes("encodeURIComponent(incident.id)"), "Exact case ID must be passed to dedicated map");
assert(src.includes('!Number.isFinite(incident.latitude)') && src.includes('!Number.isFinite(incident.longitude)'), "Map must not infer missing coordinates");
console.log("PASS clean Admin Overview, dedicated map and preserved case actions.");
