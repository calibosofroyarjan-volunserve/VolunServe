"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const layout = fs.readFileSync("app/(superadmin)/_layout.tsx", "utf8");
const records = fs.readFileSync("app/(superadmin)/all-records.tsx", "utf8");
const overview = fs.readFileSync("app/(superadmin)/index.tsx", "utf8");
const admin = fs.readFileSync("app/(superadmin)/admin-accounts.tsx", "utf8");
const reset = fs.readFileSync("components/auth/PasswordResetDialog.tsx", "utf8");
const login = fs.readFileSync("app/admin-login.tsx", "utf8");
const profile = fs.readFileSync("app/(superadmin)/profile.tsx", "utf8");
assert(layout.includes('accessibilityLabel="Open Super Admin profile dropdown"') &&
  layout.includes('accessibilityLabel="Super Admin profile dropdown"') &&
  layout.includes('router.push("/(superadmin)/system-settings"') &&
  layout.includes('router.push("/(superadmin)/profile"') &&
  layout.includes('accessibilityLabel="View Profile"') &&
  layout.includes('accessibilityLabel="Sign Out"'),
  "Super Admin account dropdown must open System Settings and secure Sign Out");
assert(profile.includes("isSuperAdminProfile(profile)") && profile.includes("This profile is read-only"),
  "Restore the approved, protected read-only Super Admin profile page");
assert(!layout.includes('label: "System Settings"') &&
  layout.includes('label: "System Records (Read Only)"'),
  "System Settings must live under the profile menu, not be duplicated in the sidebar");
assert(records.includes('import ListPagination from "../../components/ui/ListPagination"') &&
  records.includes("const PAGE_SIZE = 5") &&
  records.includes("pagedRecords = visibleRecords.slice") &&
  records.includes("pagedRecords.map(renderRecord)") &&
  records.includes("setSearch(value); setPage(1);") &&
  records.includes("setPage(1);"),
  "System Records must page live, searched results five at a time and reset page on filter/tab changes");
assert(overview.includes("orientation=\"vertical\"") && overview.includes("ListPagination") &&
  admin.includes("const ADMIN_PAGE_SIZE = 5"),
  "Restored premium Overview and current Admin Accounts must stay unchanged");
assert(login.includes('audience="admin"') &&
  reset.includes('styles.webOverlay') &&
  reset.includes('Send reset link'),
  "Keep both login Forgot Password modal fixes in the same release");
console.log("PASS Super Admin dropdown Settings, System Records pagination and previous approved features");
