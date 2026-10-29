"use strict";
const fs = require("node:fs");
const assert = require("node:assert/strict");
const read = path => fs.readFileSync(path, "utf8");
const dashboard = read("app/(admin)/command-center.tsx");
const sidebar = read("app/(admin)/_layout.tsx");
const map = read("app/(tabs)/disaster-response.tsx");
const approvals = read("components/admin/DashboardVolunteerApprovals.tsx");

// The removal is restricted to the LGU Admin dashboard; no Firestore deletes,
// rules, maps, or Resident/Volunteer components are changed by this patch.
for (const removed of [
  "evacuation_centers", "Evacuation Centers", "Evacuation center management",
  "Verified evacuation centers", "Evacuation capacity", "activeCenters",
  "pagedCenters", "CenterStat", "CenterInput", "saveEvacuationCenter",
  "removeEvacuationCenter", "showCenterManagement", "centerModalVisible",
  "CENTER_PAGE_SIZE",
]) {
  assert(!dashboard.toLowerCase().includes(removed.toLowerCase()),
    "Evacuation Center dashboard UI or data dependency remains: " + removed);
}
assert(dashboard.includes("ListPagination") && dashboard.includes("total={pendingResidents.length} pageSize={5}"),
  "New Resident dashboard queue must retain 5-record paging even though the center list was removed");
assert(dashboard.includes('cases:false,needs:false,users:false,volunteers:false'),
  "Dashboard loading should not wait for removed center Firestore snapshot");
for (const preserved of [
  "<DashboardVolunteerApprovals />", "Open emergencies", "Pending user profiles",
  "Volunteer approvals", "Priority Actions", "AI identity reviews",
  "Open relief needs", "WorkspaceBarChart", 'orientation="vertical"',
  "setPendingUserIds", "setPendingVolunteerIds", "setNeedAssessments",
  'onSnapshot(', '"disasterCases"', '"barangayNeedAssessments"',
]) assert(dashboard.includes(preserved), "Active Admin workflow lost: " + preserved);
assert(sidebar.includes('label: "Command Center"') &&
  !sidebar.includes('label: "Evacuation Centers"'),
  "Sidebar should retain the Admin Command Center without an Evacuation Centers module");
assert(map.includes("MapTracking"),
  "Existing emergency map entrypoint must not be removed");
assert(approvals.includes("ListPagination") &&
  approvals.includes("await batch.commit()"),
  "Five-row Admin volunteer approval queue and atomic Firestore approvals must remain");
console.log("PASS: Admin Evacuation Centers removed with emergency workflows, maps and approvals retained");
