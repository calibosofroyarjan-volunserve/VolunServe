"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const source = fs.readFileSync(path.resolve(__dirname, "../app/(superadmin)/all-records.tsx"), "utf8");
const structure = source.slice(source.indexOf("const recordSections:"), source.indexOf("function accountAudienceForRole"));
const lines = structure.split("\n");
const groupNames = lines.filter(line => line.startsWith("    id: ")).map(line => line.split('"')[1]);
const viewLines = lines.filter(line => line.trimStart().startsWith('{ id: "'));
const assertHas = (text, fragment) => assert(text.includes(fragment), "Expected source: " + fragment);

test("System Records are grouped into five distinct operational areas", () => {
  assert.deepEqual(groupNames, ["residents", "volunteers", "events", "operations", "administration"]);
  assert.equal(viewLines.length, 16, "Account role views plus one home per operational collection");
  const viewIds = viewLines.map(line => line.split('"')[1]);
  assert.equal(new Set(viewIds).size, 16, "No duplicate views");
  assert.deepEqual(["residentAccounts", "volunteerAccounts", "staffAccounts", "otherAccounts"].filter(id => viewIds.includes(id)),
    ["residentAccounts", "volunteerAccounts", "staffAccounts", "otherAccounts"]);
  assert(!structure.includes('source: "donations"'), "Financial receipts cannot be exposed to Super Admin");
});

test("Recorded account roles isolate resident, volunteer and staff user lists without hiding unknown roles", () => {
  assertHas(source, "function accountAudienceForRole(role: unknown): AccountAudience");
  for (const role of ["resident","basic_resident","verified_resident","volunteer","admin","superadmin","applicant"]) {
    assertHas(source, '"' + role + '"');
  }
  assertHas(source, 'return "other";');
  assertHas(source, "source.filter(item => accountAudienceForRole(item.role) === activeView.audience)");
  assertHas(source, "activeViewId,");
});

test("Switching sections and child tabs resets search and five-record paging", () => {
  assertHas(source, 'accessibilityLabel="System Records grouped sections"');
  assertHas(source, "activeSection.views.map(view =>");
  assertHas(source, "showRecordSection(section)");
  assertHas(source, "showRecordView(view)");
  assertHas(source, "setActiveSectionId(section.id);");
  assertHas(source, "showRecordView(section.views[0]);");
  assertHas(source, "setActiveTab(view.source);");
  assertHas(source, 'setSearch("");');
  assertHas(source, "setPage(1);");
  assertHas(source, "const PAGE_SIZE = 5;");
  assertHas(source, "<ListPagination page={activePage} total={visibleRecords.length} onChange={setPage} />");
  assert(!source.includes("CATEGORY_PAGE_SIZE"), "Flat category pagination was retired");
});

test("Summary counters remain grounded in authorized Firestore collection counts", () => {
  for (const field of ["cases","assistance","users","applications","contributions","certificates"]) {
    assertHas(source, "value={records." + field + ".length}");
  }
});
