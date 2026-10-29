"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const read = file => fs.readFileSync(file, "utf8");
const dashboard = read("app/(admin)/command-center.tsx");
const analytics = read("components/admin/DashboardOperationalInsights.tsx");
const activities = read("components/admin/DashboardRecentActivities.tsx");
const layout = read("app/(admin)/_layout.tsx");
assert(analytics.includes("Published Events") && analytics.includes("Completed Events") &&
  analytics.includes("Certificates Issued") && analytics.includes("Volunteer Hours Served"),
  "Operational KPIs must center on real LGU event and service delivery");
for (const item of ["Achievements unlocked", "Points earned", "Leaderboard", "badges",
  'watch("users", "users"']) {
  assert(!analytics.toLowerCase().includes(item.toLowerCase()),
    "LGU analytics must never show Resident/Volunteer gamification: " + item);
}
assert(analytics.includes('watch("communityEvents"') &&
  analytics.includes('watch("volunteerStats"') &&
  analytics.includes('watch("certificates"') &&
  analytics.includes("ListPagination") &&
  analytics.includes("pageSize={PAGE_SIZE}") &&
  analytics.includes("visible.map(event") &&
  analytics.includes("recent.slice("),
  "Live services and published events must retain five-row pagination");
assert(analytics.includes("<WorkspaceBarChart") && analytics.includes('orientation="vertical"') &&
  dashboard.includes("<DashboardOperationalInsights workload={{") &&
  dashboard.includes("metrics.activeCases") && dashboard.includes("metrics.pendingReviews") &&
  dashboard.includes("metrics.openBarangayNeeds"),
  "Move real workload comparison to Analytics without inventing results");
assert(dashboard.includes("<DashboardRecentActivities />") &&
  activities.includes("visible.map(item =>") &&
  dashboard.includes("Priority Actions"),
  "Overview must show priority actions next to independently paginated real recent activity");
assert(!dashboard.includes("<WorkspaceBarChart") &&
  !dashboard.includes('overflowY: "scroll"') &&
  dashboard.includes('overflowY: "auto"') &&
  dashboard.includes('scrollbarWidth: "none"'),
  "Desktop workspace must avoid forced vertical scrollbar while preserving content access");
for (const panel of ["<ResidentAccountsPanel />", "<DashboardVolunteerApprovals />",
  "<DashboardPendingIdentityReviews />"]) {
  assert(dashboard.includes(panel), "Existing protected account workflow removed: " + panel);
}
assert(!layout.includes('label: "Analytics"') &&
  !layout.includes('label: "Volunteer Events"') &&
  !layout.includes('label: "User & Volunteer Approvals"'),
  "Remove redundant LGU sidebar destinations");
console.log("PASS LGU-focused operational analytics, 5-record paging and compact no-forced-scroll Command Center");
