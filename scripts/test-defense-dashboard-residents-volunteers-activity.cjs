"use strict";
const fs = require("node:fs");
const assert = require("node:assert/strict");
const read = file => fs.readFileSync(file, "utf8");
const dashboard = read("app/(admin)/command-center.tsx");
const accounts = read("app/(admin)/account-approvals.tsx");
const sidebar = read("app/(admin)/_layout.tsx");
const volunteer = read("components/admin/DashboardVolunteerApprovals.tsx");
const activity = read("components/admin/DashboardRecentActivities.tsx");
const rules = read("firestore.rules");
assert(!sidebar.includes('label: "User & Volunteer Approvals"') &&
  !sidebar.includes('route: "/(admin)/account-approvals"'),
  "Remove redundant standalone account review sidebar item");
assert(dashboard.includes('<ResidentAccountsPanel />') &&
  dashboard.includes('workspaceTab === "residents"') &&
  dashboard.includes('workspaceTab === "volunteers"') &&
  dashboard.includes("<DashboardVolunteerApprovals />"),
  "Dashboard must own separate Resident directory and pending Volunteer applications");
assert(accounts.includes("export function ResidentAccountsPanel()") &&
  accounts.includes("pagedAccounts.map(account") &&
  accounts.includes("PAGE_SIZE = 5") &&
  accounts.includes("total={visibleAccounts.length} pageSize={PAGE_SIZE}") &&
  accounts.includes('item.role !== "lgu_personnel"'),
  "Resident directory must preserve searchable five-per-page records, exclude LGU personnel");
assert(accounts.includes('moderateCommunityAccount(account, "suspended")') &&
  accounts.includes('moderateCommunityAccount(account, "approved")') &&
  accounts.includes("writeAdminLogSafely") &&
  accounts.includes('await batch.commit()') &&
  accounts.includes('<Redirect href="/(admin)/command-center?section=residents" />'),
  "Resident moderation and audit remain in dashboard, legacy route redirects");
assert(volunteer.includes("pageSize={PAGE_SIZE}") && volunteer.includes("await batch.commit()") &&
  volunteer.includes("latestApplication.status !== \"pending\""),
  "Volunteer pending queue retains confirmed, atomic eligibility-checked approvals");
assert(dashboard.includes("<DashboardRecentActivities />") &&
  activity.includes("Recent Operational Activity") &&
  activity.includes('collection(db, source.key)') &&
  activity.includes("pageSize={PAGE_SIZE}") &&
  activity.includes("visible.map(item =>"),
  "Overview shows 5-record live recent operational activity");
assert(activity.includes('disasterCases') && activity.includes('volunteerApplications') &&
  activity.includes('communityEvents') && activity.includes("dateLabel(item.millis)") &&
  !activity.includes('collection(db,"adminLogs")'),
  "Show real LGU records, never expose restricted programmer audit logs");
assert(rules.includes("allow read: if isSuperAdmin();") &&
  !dashboard.includes("adminLogs"),
  "Do not broaden existing Super Admin audit permissions");
assert(!dashboard.includes("pendingResidents") &&
  !dashboard.includes('route:"/(admin)/account-approvals"'),
  "No duplicate pending-only Resident preview or stale dashboard links");
assert(read("app/(tabs)/disaster-response.tsx").includes("MapTracking"),
  "Resident emergency GPS map must remain intact");
console.log("PASS defense dashboard resident directory, pending Volunteer approvals, recent LGU activity, five-row pagination and scope");
