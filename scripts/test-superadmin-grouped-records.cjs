#!/usr/bin/env node
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const source = fs.readFileSync("app/(superadmin)/all-records.tsx", "utf8");
const pager = fs.readFileSync("components/ui/ListPagination.tsx", "utf8");
const layout = fs.readFileSync("app/(superadmin)/_layout.tsx", "utf8");
const dashboard = fs.readFileSync("app/(superadmin)/index.tsx", "utf8");
const settings = fs.readFileSync("app/(superadmin)/system-settings.tsx", "utf8");
const login = fs.readFileSync("app/login.web.tsx", "utf8");
const adminLogin = fs.readFileSync("app/admin-login.tsx", "utf8");

for (const section of ['id: "residents", label: "Residents"', 'id: "volunteers", label: "Volunteers"',
  'id: "events", label: "Community Events"', 'id: "operations", label: "Response & Outcomes"',
  'id: "administration", label: "LGU & Other Accounts"']) {
  assert(source.includes(section), "Missing previous grouped record section: " + section);
}
assert(source.includes('id: "residentAccounts"') && source.includes('id: "volunteerAccounts"'),
  "Separate resident and volunteer account views must remain");
assert(source.includes('accountAudienceForUser(item) === view.audience') &&
       source.includes('activeViewId,') &&
       source.includes('const scopedRecords = activeTab === "users"'),
  "User records must be scoped to the selected service-area audience");
assert(source.includes('accessibilityLabel="Choose record section"') &&
       source.includes('accessibilityLabel="Record service areas"') &&
       source.includes('activeSection.views.map(') &&
       source.includes('showRecordSection(section)') &&
       source.includes('showRecordView(view)'),
  "Restore accessible grouped dropdown and in-section view selector");
assert(source.includes("const PAGE_SIZE = 5") &&
       source.includes("pagedRecords = visibleRecords.slice(") &&
       source.includes("pagedRecords.map(renderRecord)") &&
       source.includes("<ListPagination page={activePage} total={visibleRecords.length} pageSize={PAGE_SIZE} onChange={setPage} />") &&
       pager.includes("pageSize = 5"),
  "Preserve the already working five-record pagination, Previous/Next and counts");
assert(source.includes("setSearch(value); setPage(1);") &&
       source.includes('setPage(1);') &&
       source.includes("const activePage = Math.max(1, Math.min(page, totalPages))"),
  "Search and section changes must reset page and clamp to valid page after updates");
assert(source.includes('collectionName: "volunteerApplications"') &&
       source.includes('collectionName: "disasterCases"') &&
       !source.includes('collectionName: "communityEventParticipants"') &&
       !source.includes('collectionName: "lguAdminCredentialReviews"'),
  "Do not introduce new Firestore subscriptions or privacy/perms risks in a UI-only restore");
assert(!source.includes('label: "Donations"') && !source.includes('label="Donations"'),
  "Programmer Super Admin must have no financial donation management");
assert(layout.includes('accessibilityLabel="Super Admin profile dropdown"') &&
       layout.includes('router.push("/(superadmin)/system-settings"') &&
       settings.includes("System Settings") &&
       dashboard.includes('orientation="vertical"'),
  "Preserve premium Super Admin Overview and profile dropdown Settings");
assert(login.includes("<PasswordResetDialog") && adminLogin.includes("<PasswordResetDialog"),
  "Do not regress either login forgot-password popup");
console.log("PASS restored service-area System Records, resident/volunteer grouping and 5-row pagination; protected adjacent features");
