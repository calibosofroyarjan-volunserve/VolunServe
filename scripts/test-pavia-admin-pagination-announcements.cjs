"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const read = path => fs.readFileSync(path, "utf8");
const checks = [
  ["app/(admin)/command-center.tsx", "DashboardVolunteerApprovals", "ListPagination"],
  ["app/(admin)/account-approvals.tsx", "pagedAccounts", "ListPagination"],
  ["app/(admin)/identity-reviews.tsx", "pagedReviews", "ListPagination"],
  ["app/(admin)/admin-cases.tsx", "pagedCases", "ListPagination"],
  ["app/(admin)/assistance-requests.tsx", "pagedRequests", "ListPagination"],
  ["app/(admin)/community-events.tsx", "pagedProposals", "ListPagination"],
  ["app/(admin)/community-attendance.tsx", "pagedEvents", "pagedVolunteers"],
  ["app/(admin)/lgu-members.tsx", "pagedPersonnel", "ListPagination"],
  ["app/(admin)/admin-disputes.tsx", "pagedDisputes", "ListPagination"],
  ["app/(admin)/lgu-attendance.tsx", "pagedDutyRows", "pagedHistoryRows"],
  ["app/(admin)/admin-events.tsx", "pagedEvents", "pagedParticipants"],
  ["app/(admin)/donation-list.tsx", "pagedCampaigns", "pagedPending"],
  ["app/(admin)/donation-list.tsx", "pagedHistory", "ListPagination"],
  ["app/(admin)/relief-operations.tsx", "pagedNeeds", "ListPagination"],
  ["app/(admin)/admin-certificates.tsx", "volunteerSummaries.slice(", "certificates.slice("],
];
for (const [path, ...tokens] of checks) {
 const src = read(path);
 for (const token of tokens) assert(src.includes(token), `${path}: missing ${token}`);
 assert(src.includes("pageSize={5}") || src.includes("PAGE_SIZE") || src.includes("CENTER_PAGE_SIZE"),
   path + ": list must have five record page size");
}
const attendance = read("app/(admin)/lgu-attendance.tsx");
assert(attendance.includes("onChange={setPersonnelPage}") && attendance.includes("onChange={setHistoryPage}"), "Duty & history independently paginated");
const donation = read("app/(admin)/donation-list.tsx");
for (const token of ["onChange={setCampaignPage}", "onChange={setPendingPage}", "onChange={setHistoryPage}"]) assert(donation.includes(token));
const events = read("app/(admin)/admin-events.tsx");
assert(events.includes("Past event dates cannot be scheduled.") && events.includes("Math.ceil(participants.length / 5)") &&
  events.includes("setParticipantPage(1)"), "Legacy event date and participant paging protected");
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
