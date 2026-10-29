"use strict";
const fs = require("node:fs");
const assert = require("node:assert/strict");
const read = path => fs.readFileSync(path,"utf8");
const dashboard = read("app/(admin)/command-center.tsx");
const pager = read("components/ui/ListPagination.tsx");
const hero = read("components/admin/AdminReviewHero.tsx");
const emergency = read("app/(admin)/admin-cases.tsx");
const attendance = read("app/(admin)/community-attendance.tsx");
const nav = read("app/(admin)/_layout.tsx");
for (const t of ["overview", "identity", "residents", "volunteers", "insights"]) {
  assert(dashboard.includes('id: "' + t + '"'), "Missing compact workspace destination: "+t);
  assert(dashboard.includes('workspaceTab === "' + t + '"'), "Workspace tab must actually control visible content: "+t);
}
assert(dashboard.includes('accessibilityRole="tab"') && dashboard.includes('accessibilityState={{ selected: workspaceTab === tab.id }}'),
  "Active workspace tab must be keyboard/screen reader accessible");
assert(dashboard.includes("total={6} pageSize={5} onChange={setPriorityPage}") &&
  dashboard.includes(".slice((priorityPage - 1) * 5, priorityPage * 5).map(action"),
  "Even the priority action list must cap at five items without hiding the last item");
for(const value of ["<DashboardPendingIdentityReviews />", "<DashboardVolunteerApprovals />",
  "<DashboardOperationalInsights />", "<ResidentAccountsPanel />", "<DashboardRecentActivities />", "pageSize={5}"]) {
  assert(dashboard.includes(value), "Real dashboard workflows must remain reachable: " + value);
}
assert(!dashboard.includes("evacuation_centers") && !nav.includes('label: "Volunteer Events"') &&
  !nav.includes('label: "Analytics"'),"Retired Admin modules must not return");
assert(pager.includes('flexDirection: "row"') && pager.includes('minHeight: 34') &&
  pager.includes("pageSize = 5") && pager.includes("onChange(safePage + 1)") &&
  pager.includes("onChange(safePage - 1)") && pager.includes("visiblePages.map"),
  "Pagination must remain functional, compact and accessible");
assert(hero.includes('minHeight: 118') && hero.includes('backgroundColor: "#E5F5ED"') &&
  hero.includes('name="leaf-outline"'),
  "Shared LGU headers must retain identity but avoid oversized whitespace");
for(const t of ["pagedCases", "pageFive(onDutyPersonnel", "pageFive(volunteerCandidates",
  "pageFive(activeAssignments", "pageFive(incidentAssignments", "pageFive(imageEvidence",
  "pageFive(videoEvidence"]) assert(emergency.includes(t),"Emergency nested pagination missing: "+t);
assert(attendance.includes("pagedEvents.map") && attendance.includes("pagedVolunteers.map") &&
  attendance.includes("page={activeEventPage}") && attendance.includes("page={activeRosterPage}"),
  "Both events and roster records must have separate paging");
assert(read("components/admin/DashboardVolunteerApprovals.tsx").includes("await batch.commit()") &&
  read("app/(tabs)/disaster-response.tsx").includes("MapTracking"),
  "Must not break authorized approval workflow or Resident GPS map");
console.log("PASS compact five-tab Admin workspace, responsive one-row pager, and retained five-record functional lists");
