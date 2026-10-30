"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const read = path => fs.readFileSync(path, "utf8");
const checks = [
  ["app/(admin)/account-approvals.tsx", "pagedAccounts", "ListPagination"],
  ["app/(admin)/identity-reviews.tsx", "pagedReviews", "ListPagination"],
  ["app/(admin)/admin-cases.tsx", "pagedCases", "ListPagination"],
  ["app/(admin)/assistance-requests.tsx", "pagedRequests", "ListPagination"],
  ["app/(admin)/community-events.tsx", "pagedProposals", "ListPagination"],
  ["app/(admin)/community-attendance.tsx", "pagedEvents", "pagedVolunteers"],
  ["app/(admin)/lgu-members.tsx", "pagedPersonnel", "ListPagination"],
  ["app/(admin)/admin-disputes.tsx", "pagedDisputes", "ListPagination"],
  ["app/(admin)/lgu-attendance.tsx", "pagedDutyRows", "pagedHistoryRows"],
  ["app/(admin)/donation-list.tsx", "pagedCampaigns", "pagedPending"],
  ["app/(admin)/donation-list.tsx", "pagedHistory", "ListPagination"],
  ["app/(admin)/admin-certificates.tsx", "volunteerSummaries.slice(", "certificates.slice("],
];
for (const [path, ...tokens] of checks) {
 const src = read(path);
 for (const token of tokens) assert(src.includes(token), `${path}: missing ${token}`);
 assert(src.includes("pageSize={5}") || src.includes("PAGE_SIZE") || src.includes("CENTER_PAGE_SIZE"),
   path + ": list must have five record page size");
}
const dashboard = read("app/(admin)/command-center.tsx");
const removedReliefRoute = read("app/(admin)/relief-operations.tsx");
assert(removedReliefRoute.includes('<Redirect href="/(admin)/command-center" />'),
  "Out-of-scope Relief Operations must redirect rather than expose an unsupported paginated screen");
const dashboardApprovals = read("components/admin/DashboardVolunteerApprovals.tsx");
assert(dashboard.includes("<DashboardVolunteerApprovals />") &&
       dashboardApprovals.includes("ListPagination") &&
       dashboardApprovals.includes("pageSize={PAGE_SIZE}"),
  "Command Center must retain real five-row Volunteer Approvals without the removed center list");
const onlineDonations = read("components/donations/DonationAdminDashboard.tsx");
assert(onlineDonations.includes("pagedAlerts.map(") &&
       onlineDonations.includes("pagedReviews.map(") &&
       onlineDonations.includes("page={currentAlertPage}") &&
       onlineDonations.includes("page={currentReviewPage}") &&
       onlineDonations.includes("pageSize={5}"),
  "Real online Donation Admin Dashboard needs paginated alerts and review items");
const certificateEntries = read("app/(admin)/community-certificates.tsx");
assert(certificateEntries.includes("eligible.slice(") &&
       certificateEntries.includes("onChange={setRecordPage}"),
  "Community Event certificates participants must be paged");
const attendance = read("app/(admin)/lgu-attendance.tsx");
assert(attendance.includes("onChange={setPersonnelPage}") && attendance.includes("onChange={setHistoryPage}"), "Duty & history independently paginated");
const eventAttendance = read("app/(admin)/community-attendance.tsx");
assert(eventAttendance.includes('const priorityEvent = events.find(event => event.status === "active")') &&
       eventAttendance.includes('setSelectedId(priorityEvent.id)') &&
       eventAttendance.includes('setRosterPage(1)'),
       "Admin Event Attendance should show an active/upcoming process immediately without changing attendance");
const donation = read("app/(admin)/donation-list.tsx");
for (const token of ["onChange={setCampaignPage}", "onChange={setPendingPage}", "onChange={setHistoryPage}"]) assert(donation.includes(token));
const legacyEvents = read("app/(admin)/admin-events.tsx");
assert(legacyEvents.includes('<Redirect href="/(admin)/community-attendance" />') && eventAttendance.includes("pagedEvents.map(") && eventAttendance.includes("pagedVolunteers.map("),
  "Retired Volunteer Events must route to functional, independently paginated Community Event Attendance");
const incident = read("app/(admin)/admin-cases.tsx");
assert(incident.includes('detailTab === "map" && Platform.OS === "web"') &&
       incident.includes('src: "/admin-live-map?caseId=" + encodeURIComponent(incident.id)') &&
       incident.includes('title: "Embedded authorized LGU live response map for selected emergency"'),
  "Emergency Report Map tab must embed the SAME existing authorized SJDM Live Map, scoped to the selected case");

const announce = read("app/(admin)/create-announcement.tsx");
const rules = read("firestore.rules");
assert(announce.includes('accessibilityLabel="Choose authorized announcement barangay"') &&
       announce.includes("cleanMessage.length < 10") &&
       announce.includes("audience: publishBarangay") &&
       announce.includes("publishBarangay !== barangay"),
       "LGU announcement selector must not grant cross-barangay publishing");
assert(rules.includes("request.resource.data.audience == profile().barangay") &&
       rules.includes("request.resource.data.message.size() >= 10"),
       "Announcement backend must match UI scope and validation");
const superAdmin = read("app/(superadmin)/_layout.tsx");
assert(superAdmin.includes('accessibilityLabel="Super Admin profile dropdown"'),"Keep approved Super Admin UI");
assert(read("app/signup.web.tsx").includes("verification link"),"Keep signup verification");
assert(read("app/(tabs)/disaster-response.tsx").includes("MapTracking"),"Keep SJDM emergency map");
console.log("PASS Sir Pavia Admin pagination, event-date and scoped-announcement regression audit");
