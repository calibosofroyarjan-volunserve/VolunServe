"use strict";
const fs = require("node:fs");
const assert = require("node:assert/strict");
const read = path => fs.readFileSync(path,"utf8");
const accounts = read("app/(admin)/account-approvals.tsx");
const identity = read("app/(admin)/identity-reviews.tsx");
const shell = read("app/(admin)/_layout.tsx");
const signup = read("app/signup.web.tsx");
const maps = read("app/(tabs)/disaster-response.tsx");
for (const [name, file] of [["Resident and Volunteer accounts",accounts],["Resident Identity Reviews",identity]]) {
  assert(file.includes('import ListPagination from "../../components/ui/ListPagination"'), name + ": shared pagination import missing");
  assert(file.includes("const PAGE_SIZE = 5") && file.includes("Math.max(1, Math.min(page, totalPages))"), name + ": five records with clamped pages required");
  assert(file.includes("pageSize={PAGE_SIZE}") && file.includes("onChange={setPage}"),name + ": numbered pages missing");
  assert(file.includes("setSearch(value); setPage(1);") || file.includes("setSearch(value); setPage(1);"),name+": search must reset page");
}
const dashboard = read("app/(admin)/command-center.tsx");
assert(dashboard.includes("<ResidentAccountsPanel />") && dashboard.includes("<DashboardVolunteerApprovals />") &&
  dashboard.includes('workspaceTab === "residents"') && dashboard.includes('workspaceTab === "volunteers"'),
  "Resident and Volunteer reviews must use separate functional tabs in Command Center");
assert(accounts.includes("pagedAccounts.map(") && identity.includes("pagedReviews.map("),
  "Queues must only render records from the current page");
assert(accounts.includes("visible={!!approvalCandidate}") &&
       accounts.includes("Applicant credentials") &&
       accounts.includes("Skills:") &&
       accounts.includes("Availability:") &&
       accounts.includes('accessibilityRole="checkbox"') &&
       accounts.includes('accessibilityState={{ checked: approveConfirmed }}') &&
       accounts.includes("disabled={!approveConfirmed") &&
       accounts.includes('onPress={async () => {') &&
       accounts.includes('reviewVolunteerApplication(approvalCandidate, "approved")'),
  "Volunteer must not gain access on first click; credential review and explicit consent required");
assert(accounts.includes('application?.status !== "pending"') &&
       accounts.includes('!isVerifiedResidentAccount(account)') &&
       accounts.includes("await batch.commit()") &&
       accounts.includes("createAdminLog") &&
       accounts.includes("volunteerReviewedBy"),
  "Keep eligibility, atomic Firestore update and audit history");
assert(identity.includes("setFilter(item.key); setPage(1); setSelected(null);") &&
       identity.includes("filtered.slice("),
  "Identity review must clear stale selected review when filter changes");
assert(shell.includes('label: "Resident Identity Reviews"') &&
       shell.includes('label: "Command Center"') &&
       !shell.includes('label: "User & Volunteer Approvals"'),
  "Keep Identity Reviews in sidebar and Resident/Volunteer reviews in Command Center");
assert(signup.includes("verification link") && maps.includes("MapTracking"),
  "Keep connected signup email verification and map entrypoint intact");
console.log("PASS LGU Resident/Volunteer and Identity reviews: five-row queues, credential confirmation, audit logging and protected adjacent modules");
