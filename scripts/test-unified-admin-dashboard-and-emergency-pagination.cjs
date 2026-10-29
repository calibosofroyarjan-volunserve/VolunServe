"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const src = p => fs.readFileSync(p, "utf8");
const nav = src("app/(admin)/_layout.tsx");
const dash = src("app/(admin)/command-center.tsx");
const analytics = src("components/admin/DashboardOperationalInsights.tsx");
const caseSrc = src("app/(admin)/admin-cases.tsx");
const attendance = src("app/(admin)/community-attendance.tsx");
const approvals = src("components/admin/DashboardVolunteerApprovals.tsx");
const residents = src("app/(admin)/account-approvals.tsx");
const identity = src("app/(admin)/identity-reviews.tsx");

// Single visible navigation path for each operational responsibility.
for (const removed of ['label: "Volunteer Events"', 'label: "Analytics"', '"/(admin)/admin-events"', '"/(admin)/admin-analytics"']) {
  assert(!nav.includes(removed), "Duplicate sidebar destination remains: " + removed);
}
for (const name of ['label: "Command Center"', 'label: "Community Events"', 'label: "Event Attendance"', 'label: "Certificates"', 'label: "Emergency Reports"']) {
  assert(nav.includes(name), "Necessary Admin workflow destination removed: " + name);
}
assert(src("app/(admin)/admin-events.tsx").includes('<Redirect href="/(admin)/community-attendance" />'));
assert(src("app/(admin)/admin-analytics.tsx").includes('<Redirect href="/(admin)/command-center" />'));

// The overview must show actual Resident AND Volunteer queues; never approve identity without full review.
const identityQueue = src("components/admin/DashboardPendingIdentityReviews.tsx");
assert(dash.includes("<DashboardPendingIdentityReviews />") &&
  identityQueue.includes("/api/admin/identity/reviews") &&
  identityQueue.includes("Authorization:") &&
  identityQueue.includes("ListPagination") &&
  identityQueue.includes("pageSize={PAGE_SIZE}") &&
  identityQueue.includes("params: { uid: item.uid }"),
  "Real pending identity submissions must appear in Command Center with protected review and paging");
assert(dash.includes("<ResidentAccountsPanel />") &&
  residents.includes("export function ResidentAccountsPanel()") &&
  residents.includes("pagedAccounts.map(account") &&
  residents.includes("total={visibleAccounts.length} pageSize={PAGE_SIZE}") &&
  residents.includes("moderateCommunityAccount") &&
  residents.includes('<Redirect href="/(admin)/command-center?section=residents" />'),
  "Full authorized Resident directory and moderation must move into dashboard with existing 5-row pagination");
assert(dash.includes("<DashboardRecentActivities />") &&
  !dash.includes("pendingResidents") &&
  !nav.includes('label: "User & Volunteer Approvals"'),
  "No redundant pending-only Resident queue or duplicate Admin sidebar module");
assert(dash.includes("<DashboardVolunteerApprovals />") &&
  approvals.includes("pageSize={PAGE_SIZE}") && approvals.includes("await batch.commit()") &&
  residents.includes("pagedAccounts") && identity.includes("pagedReviews"),
  "Volunteer approvals and protected full Resident identity reviews must be retained");
assert(dash.includes("<DashboardOperationalInsights />") &&
  analytics.includes('watch("communityEvents"') &&
  analytics.includes('watch("certificates"') &&
  analytics.includes('watch("volunteerStats"') &&
  analytics.includes("ListPagination") && analytics.includes("pageSize={PAGE_SIZE}") &&
  analytics.includes("visible.map(event"),
  "Live operational analytics and five-row approved-event list must live inside Command Center");

// The existing GPS, response and assignment decision code cannot be removed.
assert(caseSrc.includes("pagedCases") && caseSrc.includes("pageSize={5}") &&
  caseSrc.includes("caseSearch") && caseSrc.includes("detailTab === \"map\"") &&
  caseSrc.includes("assignLguPersonnelToCase") && caseSrc.includes("cancelAssignment"),
  "Original Emergency Reports queue, GPS and authorized response actions must remain");
for (const name of ["personnelPage", "volunteerPage", "activeAssignmentPage", "historyAssignmentPage"]) {
  assert(caseSrc.includes("set" + name[0].toUpperCase() + name.slice(1)) &&
    caseSrc.includes("pageSize={5}"),
    "Emergency secondary queue must have five-row pagination: " + name);
}
assert(caseSrc.includes("pageFive(imageEvidence, photoPage)") &&
  caseSrc.includes("pageFive(videoEvidence, videoPage)") &&
  caseSrc.includes("onChange={setPhotoPage}") && caseSrc.includes("onChange={setVideoPage}"),
  "Emergency photo and video evidence must retain every item with independent 5-record pages");
for (const name of ["onDutyPersonnel", "volunteerCandidates", "activeAssignments", "incidentAssignments"]) {
  assert(caseSrc.includes("pageFive(" + name + ", "),
    "Emergency " + name + " records must render only five at a time");
}
assert(attendance.includes("pagedEvents.map") &&
  attendance.includes("pagedVolunteers.map") &&
  attendance.includes("page={activeEventPage}") &&
  attendance.includes("page={activeRosterPage}"),
  "Event Attendance must retain separate event and volunteer pagination");
assert(src("app/(tabs)/disaster-response.tsx").includes("MapTracking"),
  "Resident real-time emergency map must be unchanged");
console.log("PASS unified LGU navigation, embedded analytics, pending Resident/Volunteer review, paged emergency response");
