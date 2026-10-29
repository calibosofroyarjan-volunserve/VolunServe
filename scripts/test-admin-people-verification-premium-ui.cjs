"use strict";
const fs = require("node:fs");
const assert = require("node:assert/strict");
const read = path => fs.readFileSync(path, "utf8");
const hero = read("components/admin/AdminReviewHero.tsx");
const accounts = read("app/(admin)/account-approvals.tsx");
const identities = read("app/(admin)/identity-reviews.tsx");
const dashboard = read("app/(admin)/command-center.tsx");
const adminNav = read("app/(admin)/_layout.tsx");
const signup = read("app/signup.web.tsx");
const map = read("app/(tabs)/disaster-response.tsx");

assert(hero.includes('backgroundColor: "#E5F5ED"') &&
       hero.includes('name="leaf-outline"') &&
       hero.includes("title") && hero.includes("subtitle") &&
       hero.includes("eyebrow"),
  "LGU Admin pages must share the premium emerald/mint botanical visual identity");
assert(identities.includes("<AdminReviewHero") && identities.includes("LGU OPERATIONS / PEOPLE & VERIFICATION") &&
  identities.includes("pageSize={PAGE_SIZE}") && identities.includes("setPage(1)"),
  "Secure Resident Identity Reviews must retain branded header and five-row pagination");
assert(dashboard.includes("<ResidentAccountsPanel />") && dashboard.includes("<DashboardVolunteerApprovals />") &&
  accounts.includes("export function ResidentAccountsPanel()") && accounts.includes("pagedAccounts.map(account") &&
  accounts.includes("pageSize={PAGE_SIZE}") && accounts.includes("moderateCommunityAccount"),
  "Full Resident directory and Volunteer approvals must exist in branded Command Center");
assert(!adminNav.includes("label: \"User & Volunteer Approvals\"") &&
  accounts.includes("<Redirect href=\"/(admin)/command-center?section=residents\" />"),
  "Legacy standalone Account Reviews must redirect instead of duplicating controls");
assert(accounts.includes("reviewVolunteerApplication(") &&
       accounts.includes('reviewVolunteerApplication(approvalCandidate, "approved")') &&
       accounts.includes("approveConfirmed") &&
       accounts.includes("volunteerReviewedBy") &&
       accounts.includes("await batch.commit()"),
  "Existing approval validation, confirmation, Firestore batch and review audit must be preserved");
assert(identities.includes("styles.summaryMetrics") &&
       identities.includes("counts.pending") &&
       identities.includes("counts.verified") &&
       identities.includes("counts.retry_required") &&
       identities.includes("styles.queueHeading") &&
       identities.includes("manualValidationMethod"),
  "Identity review must retain actual live counts and independent manual verification workflow");
assert(dashboard.includes("<DashboardVolunteerApprovals />") && adminNav.includes('label: "Command Center"'),
  "Command Center Volunteer Approvals and secure Admin navigation must remain accessible");
assert(signup.includes("verification link") && map.includes("MapTracking"),
  "Resident signup verification and SJDM map entrypoint must not regress");
console.log("PASS admin-only premium Resident/Volunteer review UI, pagination and existing approval/identity workflows");
