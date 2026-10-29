"use strict";
const fs = require("node:fs");
const assert = require("node:assert/strict");
const load = path => fs.readFileSync(path, "utf8");
const overview = load("app/(superadmin)/index.tsx");
const layout = load("app/(superadmin)/_layout.tsx");
const directory = load("app/(superadmin)/admin-accounts.tsx");
const pager = load("components/ui/ListPagination.tsx");

for (const key of ["styles.hero", "heroLeafRight", "heroQuote", "orientation=\"vertical\"",
                   "OverviewAuditTable", "Recent LGU Admin Activity", "System & Access Changes",
                   "ListPagination", "PAGE_SIZE = 5", "safeActivityPage", "safeChangesPage"]) {
  assert(overview.includes(key), "Premium overview feature missing: " + key);
}
for (const metric of ["Registered Accounts", "Active LGU Admins", "Admin Accounts", "Suspended Admins"]) {
  assert(overview.includes('label:"' + metric + '"'), "Approved overview KPI missing: " + metric);
}
assert(!overview.includes("Pending LGU Applications"), "Old LGU Staff onboarding metric should not reappear");
assert(overview.includes("onSnapshot(collection(db,source)") &&
       overview.includes('["adminLogs", "adminActivityLogs"]') &&
       overview.includes('collection(db, key)'),
       "Dashboard must retain real authorized Firestore analytics and audit feeds");
assert(overview.includes("Math.min(adminActivityPage") &&
       overview.includes("Math.min(systemChangesPage"), "Pagination must clamp to available data");
assert(pager.includes("Showing") && pager.includes("pageSize = 5") && pager.includes("Previous"),
       "Restore functional five-row pagination controls");
assert(layout.includes('label: "Admin Accounts"') &&
       layout.includes('label: "System Records (Read Only)"') &&
       layout.includes('label: "System Settings"') &&
       layout.includes("SUPER ADMIN PORTAL") &&
       layout.includes("activeSection"),
       "Preserve approved five governance modules and premium sidebar/breadcrumb");
assert(directory.includes("Administrator Directory") &&
       directory.includes("const ADMIN_PAGE_SIZE = 5"),
       "Recent approved Admin Accounts layout must remain intact");
assert(!layout.includes("LGU Staff & Admin Accounts"), "Do not revert removed LGU Staff navigation");
console.log("PASS premium Super Admin restoration, true Firestore metrics, functional pagination and locked governance scope");
