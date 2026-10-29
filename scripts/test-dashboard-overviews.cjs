"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const get = name => fs.readFileSync(path.resolve(__dirname, "..", name), "utf8");
const superView = get("app/(superadmin)/index.tsx");
const superLayout = get("app/(superadmin)/_layout.tsx");
const adminView = get("app/(admin)/command-center.tsx");
const adminLayout = get("app/(admin)/_layout.tsx");
const rules = get("firestore.rules");

// Verify the approved five-module emerald Super Admin experience, not the retired dashboard copy.
for (const title of [
  "Registered Accounts", "Active LGU Admins", "Pending LGU Applications",
  "Suspended Admins", "Recent LGU Admin Activity", "System & Access Changes",
  "System Records by Service Area",
]) assert(superView.includes(title), "Missing real Super Admin overview area: " + title);

const expectedNav = [
  ["System Overview", "/(superadmin)"],
  ["LGU Staff & Admin Accounts", "/(superadmin)/admin-accounts"],
  ["System Records", "/(superadmin)/all-records"],
  ["Audit Logs", "/(superadmin)/admin-logs"],
  ["System Settings", "/(superadmin)/system-settings"],
];
const navLines = superLayout.split("\n").filter(line => /\{ label: "(System Overview|LGU Staff & Admin Accounts|System Records|Audit Logs|System Settings)"/.test(line));
assert.deepEqual(navLines.map(line => {
  const match = line.match(/label: "([^"]+)"[^\n]*route: "([^"]+)"/);
  assert(match, "Super Admin navigation entry missing its route");
  return [match[1], match[2]];
}), expectedNav, "Super Admin must expose only the five approved modules in order");
assert(superLayout.includes("onNavigate(item.route)"), "Super Admin sidebar navigation must remain functional");

// Real Firestore counts, audited activity and navigation (no fabricated dashboard values).
assert(superView.includes("collection(db,source)") &&
  superView.includes('["adminLogs", "adminActivityLogs"]') &&
  superView.includes("adminUids.includes(item.actorUid)") &&
  superView.includes("millis(b.createdAt) - millis(a.createdAt)"),
  "Super Admin activity must use authorized Firestore audit records ordered by timestamp");
assert(superView.includes("onSnapshot(") &&
  superView.includes('item.role === "applicant" && item.status === "pending_review"') &&
  superView.includes('router.push("/(superadmin)/admin-logs"') &&
  superView.includes("ListPagination") &&
  superView.includes("errors[key] || !loaded[key] ? null"),
  "Super Admin overview must use live counts, audited records, pagination and truthful loading states");
assert(!superView.includes("Market Revenue") && !superView.includes("Daily Sales"),
  "Do not copy commerce demo figures into governance reporting");

for (const title of [
  "Open emergencies", "Pending user profiles", "Volunteer approvals",
  "Verified evacuation centers", "Priority Actions", "AI identity reviews",
]) assert(adminView.includes(title), "Missing LGU Admin overview area: " + title);
assert(adminView.includes('"applicant", "admin", "superadmin", "lgu_personnel"') &&
  adminView.includes("setPendingUserIds") &&
  adminView.includes("pendingUserIds.length + pendingVolunteerIds.length"),
  "LGU applicants must stay in Super Admin queue and operational tasks must remain distinct");
assert(adminView.includes("isVerifiedActiveCenter(center)") &&
  adminView.includes('!overviewReady ? "…"') &&
  adminView.includes('"volunteerApplications"') &&
  adminView.includes('"disasterCases"'),
  "LGU overview uses current authorized source states without inventing zero totals");
assert(adminLayout.includes('profile?.adminStatus === "suspended"') &&
  rules.includes("p.get('adminStatus', 'active') != 'suspended'"),
  "Suspended LGU Admin must be denied in UI and Firestore");

console.log("PASS: Approved five-module Super Admin, live role-specific dashboards, audited records and authorization checks");
