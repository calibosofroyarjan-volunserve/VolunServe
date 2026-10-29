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
for (const [path, src] of [
  ["Resident and Volunteer Accounts", accounts],
  ["Resident Identity Reviews", identities],
]) {
  assert(src.includes('import AdminReviewHero from "../../components/admin/AdminReviewHero"') &&
         src.includes("<AdminReviewHero") && src.includes("LGU OPERATIONS / PEOPLE & VERIFICATION"),
    path + " must use the premium admin-only branded header");
  assert(src.includes("ListPagination") &&
         src.includes("pageSize={PAGE_SIZE}") &&
         src.includes("onChange={setPage}") &&
         src.includes("setPage(1)"),
    path + " must preserve five-row pagination and filter/search resets");
}
assert(accounts.includes("styles.metricsRow") && accounts.includes("pendingVolunteerCount") &&
       accounts.includes("verifiedResidentCount") && accounts.includes("accounts.length") &&
       accounts.includes("Account Review Workspace"),
  "Resident/Volunteer UI should retain live KPI data and separate review tabs");
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
assert(dashboard.includes("<DashboardVolunteerApprovals />") &&
       adminNav.includes('label: "User & Volunteer Approvals"'),
  "Command Center Volunteer Approvals and existing Admin navigation must stay intact");
assert(signup.includes("verification link") && map.includes("MapTracking"),
  "Resident signup verification and SJDM map entrypoint must not regress");
console.log("PASS admin-only premium Resident/Volunteer review UI, pagination and existing approval/identity workflows");
