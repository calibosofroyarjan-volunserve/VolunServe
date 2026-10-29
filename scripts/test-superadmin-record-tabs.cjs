"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const source = fs.readFileSync(path.resolve(__dirname, "../app/(superadmin)/all-records.tsx"), "utf8");

test("Records are arranged under independent Residents, Volunteers, Events, Response, and LGU sections", () => {
  const structure = source.slice(source.indexOf("const recordSections:"), source.indexOf("function accountAudienceForRole"));
  const sectionNames = [...structure.matchAll(/^    id: "(residents|volunteers|events|operations|administration)", label: "([^"]+)"/gm)].map(m => m[1]);
  assert.deepEqual(sectionNames, ["residents", "volunteers", "events", "operations", "administration"]);
  const views = [...structure.matchAll(/\{ id: "([^"]+)", label: "([^"]+)", icon: "[^"]+", source: "([^"]+)"(?:, audience: "([^"]+)")? \}/g)];
  assert.equal(views.length, 16);
  assert.equal(new Set(views.map(m => m[1])).size, 16);
  assert.deepEqual(views.filter(m => m[3] === "users").map(m => m[4]), ["resident", "volunteer", "staff", "other"]);
  assert(!structure.includes('source: "donations"'), "Super Admin never includes private finance");
});

test("Account views filter actual role values; unknown roles remain separately visible", () => {
  assert.match(source, /function accountAudienceForRole\(role: unknown\): AccountAudience/);
  for(const role of ["resident","basic_resident","verified_resident","volunteer","admin","superadmin","applicant"]) {
    assert(source.includes('"' + role + '"'), "Missing supported role: " + role);
  }
  assert.match(source, /return "other";/);
  assert.match(source, /source\.filter\(item => accountAudienceForRole\(item\.role\) === activeView\.audience\)/);
  assert.match(source, /activeTab,\s*activeViewId,\s*search/);
});

test("Switching groups and child tabs resets search and 5-record pagination", () => {
  assert.match(source, /accessibilityLabel="System Records grouped sections"/);
  assert.match(source, /activeSection\.views\.map\(view =>/);
  assert.match(source, /showRecordSection\(section\)/);
  assert.match(source, /showRecordView\(view\)/);
  assert.match(source, /setActiveSectionId\(section\.id\);\s*showRecordView\(section\.views\[0\]\)/);
  assert.match(source, /setActiveTab\(view\.source\);\s*setSearch\("");\s*setPage\(1\)/);
  assert.match(source, /const PAGE_SIZE = 5/);
  assert.match(source, /<ListPagination page=\{activePage\} total=\{visibleRecords\.length\} onChange=\{setPage\} \/>/);
  assert.doesNotMatch(source, /CATEGORY_PAGE_SIZE|showsHorizontalScrollIndicator/);
});

test("Priority totals are actual Firestore record counts", () => {
  const start=source.indexOf("{/* Prioritize operational visibility");
  const end=source.indexOf("<View style={styles.tabHeadingRow}>",start);
  const summaries=[...source.slice(start,end).matchAll(/<SummaryCard label="([^"]+)" value=\{records\.([A-Za-z]+)\.length\}/g)].map(m=>[m[1],m[2]]);
  assert.deepEqual(summaries, [
    ["Emergency Reports","cases"],["Assistance Requests","assistance"],
    ["Users","users"],["Volunteer Applications","applications"],
    ["Verified Help","contributions"],["Certificates","certificates"]
  ]);
});
