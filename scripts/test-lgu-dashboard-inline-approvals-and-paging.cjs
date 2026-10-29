"use strict";
const fs = require("node:fs");
const assert = require("node:assert/strict");
const read = p => fs.readFileSync(p, "utf8");
const dashboard = read("app/(admin)/command-center.tsx");
const approval = read("components/admin/DashboardVolunteerApprovals.tsx");
const accountPage = read("app/(admin)/account-approvals.tsx");
const identity = read("app/(admin)/identity-reviews.tsx");
const map = read("app/(tabs)/disaster-response.tsx");
const signup = read("app/signup.web.tsx");

assert(dashboard.includes("<DashboardVolunteerApprovals />") &&
  dashboard.includes('import DashboardVolunteerApprovals from "../../components/admin/DashboardVolunteerApprovals";'),
  "Dashboard must embed real Volunteer Account Approvals, not just a card redirect");
assert(approval.includes('onSnapshot(query(collection(db, "volunteerApplications"), where("status", "==", "pending"))') &&
       approval.includes('onSnapshot(collection(db, "users")') &&
       approval.includes('pageSize={PAGE_SIZE}') &&
       approval.includes("PAGE_SIZE = 5") &&
       approval.includes("paged.map("),
  "Dashboard volunteer approvals must list real applications with five-row pagination");
assert(approval.includes('await Promise.all([') &&
       approval.includes('getDoc(doc(db, "users", uid))') &&
       approval.includes('getDoc(doc(db, "volunteerApplications", selected.application.id))') &&
       approval.includes('latestApplication.status !== "pending"') &&
       approval.includes('if (decision === "approved" && !eligible(latestAccount, latestApplication))') &&
       approval.includes('const batch = writeBatch(db)') &&
       approval.includes('await batch.commit()') &&
       approval.includes('createAdminLog'),
  "Approval/decline must perform fresh eligibility check, atomic update and audit");
assert(approval.includes('accessibilityRole="checkbox"') &&
       approval.includes("!confirmed") &&
       approval.includes('reason.trim().length < 5') &&
       approval.includes('void submit("approved")') &&
       approval.includes('void submit("rejected")'),
  "LGU Admin must explicitly review and confirm before any approval/decline");
assert(!dashboard.includes("pagedCenters.map(") && !dashboard.includes("evacuation_centers"),
  "Command Center must not load removed Evacuation Center management records");

// Separate page lists preserve their existing action/detail implementations.
for(const [file, variable, list] of [
  ["app/(admin)/account-approvals.tsx","pagedAccounts","pageSize={PAGE_SIZE}"],
  ["app/(admin)/identity-reviews.tsx","pagedReviews","pageSize={PAGE_SIZE}"],
  ["app/(admin)/admin-cases.tsx","pagedCases","pageSize={5}"],
  ["app/(admin)/assistance-requests.tsx","pagedRequests","pageSize={5}"],
  ["app/(admin)/community-events.tsx","pagedProposals","pageSize={5}"],
  ["app/(admin)/community-attendance.tsx","pagedEvents","pageSize={5}"],
  ["app/(admin)/lgu-members.tsx","pagedPersonnel","pageSize={5}"],
  ["app/(admin)/admin-disputes.tsx","pagedDisputes","pageSize={5}"],
]) {
  const src = read(file);
  assert(src.includes('ListPagination') && src.includes(variable) &&
    src.includes(list) && src.includes("Math.max(1, Math.min("),
    file + " should show only five entries with clamped pagination");
}
assert(read("app/(admin)/community-attendance.tsx").includes("pagedVolunteers.map("),
  "Attendance volunteer roster must be paginated on both desktop and mobile");
assert(read("app/(admin)/community-attendance.tsx").includes('page={activeRosterPage}'),
  "Attendance roster must have independent pagination controls");
assert(accountPage.includes("Confirm Approval") && identity.includes("pagedReviews.map("),
  "Existing Resident/Volunteer approval review and Identity verification cannot regress");
assert(map.includes("MapTracking") && signup.includes("verification link"),
  "Existing SJDM Emergency Map and signup UI must not regress");
console.log("PASS LGU Command Center inline Volunteer review and 5-row admin lists; maps/signup preserved");
