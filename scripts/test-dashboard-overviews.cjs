const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const get = name => fs.readFileSync(path.resolve(__dirname,"..",name),"utf8");
const superView = get("app/(superadmin)/index.tsx");
const adminView = get("app/(admin)/command-center.tsx");
const adminLayout = get("app/(admin)/_layout.tsx");
const rules = get("firestore.rules");

// The reference dashboard is a visual pattern, never sales statistics or demo counters.
for (const title of [
  "Admin Accounts", "Active LGU Admins", "Suspended Admins",
  "Recent LGU Admin Activity", "System & Access Changes",
  "Registered Accounts",
]) assert(superView.toLowerCase().includes(title.toLowerCase()),"Missing real Super Admin overview area: "+title);
assert(superView.includes('collection(db,source)') &&
  superView.includes('["adminLogs", "adminActivityLogs"]') &&
  superView.includes('adminUids.includes(item.actorUid)') &&
  superView.includes('millis(b.createdAt) - millis(a.createdAt)'),
  "Super Admin activity must use real signed-in authorized Firestore audit data ordered by recorded timestamp");
const superLayout = get("app/(superadmin)/_layout.tsx");
assert(superView.includes('onSnapshot(') &&
  superView.includes('orientation="vertical"') &&
  superView.includes('ListPagination') &&
  superLayout.includes('route: "/(superadmin)/admin-accounts"') &&
  superLayout.includes('route: "/(superadmin)/system-settings"') &&
  superView.includes('router.push("/(superadmin)/admin-logs"'),
  "Super Admin overview must use real live records, vertical chart, pagination and existing governance routes");
assert(!superView.includes("Pending LGU Applications"),
  "Do not restore removed LGU Staff onboarding panels into premium overview");
assert(!superView.includes("Market Revenue") && !superView.includes("Daily Sales"),
  "Do not copy fake Xacton commerce figures");
for(const title of [
  "Open emergencies", "Pending user profiles", "Volunteer approvals",
  "Verified evacuation centers", "Priority Actions", "AI identity reviews",
]) assert(adminView.includes(title),"Missing LGU Admin overview area: "+title);
assert(adminView.includes('"applicant", "admin", "superadmin", "lgu_personnel"') &&
  adminView.includes('setPendingUserIds') &&
  adminView.includes('pendingUserIds.length + pendingVolunteerIds.length'),
  "LGU applicants must stay in Super Admin queue and independent operational tasks should not be deduplicated by UID");
assert(adminView.includes('isVerifiedActiveCenter(center)') &&
  adminView.includes('!overviewReady ? "…"') &&
  adminView.includes('"volunteerApplications"') &&
  adminView.includes('"disasterCases"'),
  "LGU overview uses current authorized source states and must not initially invent zero totals");
assert(adminLayout.includes('profile?.adminStatus === "suspended"') &&
  rules.includes("p.get('adminStatus', 'active') != 'suspended'"),
  "Suspended LGU Admin must be denied in UI and Firestore");
console.log("PASS: Role-specific Xacton-inspired admin overview, true source counters, authorization and audit navigation");