"use strict";
const fs = require("node:fs");
const assert = require("node:assert/strict");
const read = p => fs.readFileSync(p,"utf8");
const hero = read("components/admin/PeopleWorkspaceHero.tsx");
const accounts = read("app/(admin)/account-approvals.tsx");
const identity = read("app/(admin)/identity-reviews.tsx");
const dashboard = read("app/(admin)/command-center.tsx");
const nav = read("app/(admin)/_layout.tsx");

assert(hero.includes('LinearGradient') && hero.includes('leaf-outline') &&
  hero.includes("metrics.map(") && hero.includes('colors={["#EFFBF5", "#E0F5EB", "#F7FDF9"]}'),
  "People UI must use a shared mint botanical visual identity, not copied Super Admin content");
assert(accounts.includes('<PeopleWorkspaceHero') && identity.includes('<PeopleWorkspaceHero'),
  "Resident/Volunteer Accounts and Resident Identity need consistent premium UI");
assert(accounts.includes('type Filter = "residents" | "pending" | "volunteers"') &&
  accounts.includes('"Resident Accounts"') &&
  accounts.includes('"Volunteer Applications"') &&
  accounts.includes('"Active Volunteers"'),
  "LGU must have 3 distinct views for Residents, pending applications and approved Volunteers");
assert(accounts.includes('!["admin", "superadmin", "applicant", "lgu_personnel"].includes') &&
  accounts.includes('const communityAccounts = useMemo') &&
  accounts.includes('const activeVolunteerCount'),
  "LGU community directory must never include privileged Admin or applicant accounts");
assert(accounts.includes('ACCOUNT JOURNEY') && accounts.includes('"01", label: "Resident account"') &&
  accounts.includes('"02", label: "Identity verification"') &&
  accounts.includes('"03", label: "Volunteer application"') &&
  accounts.includes('"04", label: "LGU decision"'),
  "Explain the real application/verification workflow using original role behavior");
assert(accounts.includes('expandedAccountId === account.id') &&
  accounts.includes('styles.detailsArea') &&
  accounts.includes('accessibilityState={{ expanded: expandedAccountId === account.id }}'),
  "Five-row Resident/Volunteer records should be compact with accessible expandable details");
assert(accounts.includes('pageSize={PAGE_SIZE}') && accounts.includes('const PAGE_SIZE = 5') &&
  accounts.includes('pagedAccounts.map('),
  "Keep working five-record pagination");
assert(accounts.includes('reviewVolunteerApplication(approvalCandidate, "approved")') &&
  accounts.includes('reviewVolunteerApplication(selected, "rejected"') &&
  accounts.includes('writeBatch(db)') && accounts.includes('createAdminLog'),
  "Retain volunteer approve/reject logic, atomic updates and audit");
assert(accounts.includes('!isVerifiedResidentAccount(account)') &&
  accounts.includes('accessibilityRole="checkbox"'),
  "Retain identity verification and deliberate approval confirmation");
assert(identity.includes('const pagedReviews = filtered.slice(') &&
  identity.includes('pageSize={PAGE_SIZE}') &&
  identity.includes('const first = pagedReviews[0]') &&
  identity.includes('setValidationMethod(first.manualValidationMethod || "")') &&
  identity.includes('saveDecision("verify")') && identity.includes('saveDecision("require_retry")'),
  "Keep manual verification actions and preselect first visible review");
assert(identity.includes('Privacy-preserving manual fallback') &&
  identity.includes('does not retain or') &&
  identity.includes('independent LGU-approved validation method'),
  "Private ID photos must not be retained/displayed in the LGU review queue");
assert(dashboard.includes('<DashboardVolunteerApprovals />') &&
  nav.includes('"Resident Identity Reviews"') &&
  nav.includes('"User & Volunteer Approvals"'),
  "Preserve Admin dashboard approvals and original navigation routes");
assert(read("app/signup.web.tsx").includes("verification link") &&
  read("app/(tabs)/disaster-response.tsx").includes("MapTracking") &&
  read("app/(superadmin)/_layout.tsx").includes('Super Admin'),
  "Do not regress original signup, emergency map or Super Admin");
console.log("PASS Premium LGU Resident & Volunteer review UI, flow, roles, guarded approval actions and pagination");
