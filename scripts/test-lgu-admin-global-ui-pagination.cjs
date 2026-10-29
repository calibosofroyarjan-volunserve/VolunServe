"use strict";
const fs = require("node:fs");
const assert = require("node:assert/strict");
const source = p => fs.readFileSync(p, "utf8");
const app = name => source("app/(admin)/" + name + ".tsx");
const title = source("components/admin/AdminReviewHero.tsx");
const pager = source("components/ui/ListPagination.tsx");
const layout = app("_layout");

assert(title.includes('backgroundColor: "#E5F5ED"') &&
  title.includes('name="leaf-outline"') &&
  title.includes("compact"), "Common mint/emerald header must stay responsive");
assert(pager.includes("onChange") && pager.includes("pageSize"), "Shared paginated records navigation is functional");

for (const name of [
  "identity-reviews", "admin-cases",
  "assistance-requests", "relief-operations",
  "admin-disputes", "community-events",
  "community-attendance", "lgu-attendance", "lgu-members",
  "admin-certificates", "community-certificates", "donation-list",
]) {
  const code = app(name);
  assert(code.includes("AdminReviewHero") && code.includes("<AdminReviewHero"),
    name + " must use the shared premium LGU Admin workspace header");
  assert(code.includes("ListPagination") && code.includes("pageSize={5}") ||
    (["identity-reviews"].includes(name) &&
      code.includes("pageSize={PAGE_SIZE}")),
    name + " must paginate its Firestore-backed records in five-item pages");
}
for (const name of ["create-announcement", "admin-profile"]) {
  assert(app(name).includes("<AdminReviewHero"),
    name + " must match LGU branding even though it is a form/profile, not a list");
}
assert(!app("admin-profile").includes("Back to overview"),
  "Account Profile must not duplicate the parent Admin sidebar navigation");

const account = app("account-approvals");
assert(account.includes("export function ResidentAccountsPanel()") &&
  account.includes("pagedAccounts.map(account") &&
  account.includes("pageSize={PAGE_SIZE}") &&
  account.includes('<Redirect href="/(admin)/command-center?section=residents" />') &&
  app("command-center").includes("<ResidentAccountsPanel />"),
  "Resident Accounts must have one source of truth in the Command Center, not a duplicate full page");
const relief = app("relief-operations");
for (const segment of ["pagedNeeds", "pagedInventory", "pagedAllocations", "setNeedsPage", "setInventoryPage", "setAllocationPage"]) {
  assert(relief.includes(segment), "Relief inventory/allocations and needs must all be paginated: " + segment);
}
assert(relief.includes("runTransaction") && relief.includes("barangayReliefAllocations"),
  "Relief allocation and distribution functionality must remain intact");
const events = app("community-events");
assert(events.includes("pagedProposals") && events.includes("pagedParticipants") &&
  events.includes("setParticipantPage(1)") && events.includes("openProfile(participant.uid)"),
  "Community Events must paginate both proposal and joined volunteer reviews, retaining profile access");
const analytics = source("components/admin/DashboardOperationalInsights.tsx");
assert(app("admin-analytics").includes('<Redirect href="/(admin)/command-center" />') &&
  analytics.includes('title}>Service Analytics') && analytics.includes("ListPagination") &&
  analytics.includes("pageSize={PAGE_SIZE}") &&
  app("command-center").includes("<DashboardOperationalInsights workload={{"),
  "Dashboard must own paginated live analytics; standalone route must redirect");
assert(app("admin-events").includes('<Redirect href="/(admin)/community-attendance" />'),
  "Retired duplicate Volunteer Events route must redirect to Event Attendance");
const donation = source("components/donations/DonationAdminDashboard.tsx");
assert(donation.includes('mode === "admin" ? (') &&
  donation.includes("<AdminReviewHero") &&
  donation.includes("pagedTransactions") &&
  donation.includes("visibleCampaigns") &&
  donation.includes("pagedAlerts") &&
  donation.includes("pagedReviews"),
  "Operational Donations must preserve pagination and role-specific rendering");
const reconcile = source("components/donations/FundReconciliationPanel.tsx");
const payout = source("components/donations/FundReleaseControls.tsx");
assert(reconcile.includes("pagedSummaries.map") &&
  reconcile.includes("total={summaries.length} pageSize={5}") &&
  reconcile.includes("const totals = useMemo("),
  "Donation fund reconciliation must show five campaigns per page without changing full funding totals");
assert(payout.includes("pagedCampaigns.map") &&
  payout.includes("total={eligibleCampaigns.length} pageSize={5}") &&
  payout.includes("const selection = eligibleCampaigns.find"),
  "LGU fund release selector must paginate campaigns while retaining selected record and validations");
assert(layout.includes('label: "Emergency Reports"') &&
  layout.includes('label: "Event Attendance"') &&
  layout.includes('label: "Donation Management"'),
  "Sidebar names must remain consistent with module headers");
assert(app("command-center").includes("<DashboardVolunteerApprovals />"),
  "Dashboard inline approvals must remain intact");
console.log("PASS LGU Admin premium consistency, all main record lists, nested pagination, navigation and guarded workflows");
