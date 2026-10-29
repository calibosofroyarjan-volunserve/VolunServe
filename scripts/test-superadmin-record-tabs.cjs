"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const source = fs.readFileSync(path.resolve(__dirname, "../app/(superadmin)/all-records.tsx"), "utf8");

test("System Records categories follow real onboarding, response, events, outcomes and archive flow", () => {
  const start = source.indexOf("const tabs: {");
  const end = source.indexOf("const renderRecord = (", start);
  assert(start >= 0 && end > start);
  const tabBlock = source.slice(start, end);
  const keys = [...tabBlock.matchAll(/\{\s*key:\s*"([^"]+)",\s*label:\s*"([^"]+)"/g)];
  assert.deepEqual(keys.map(x => x[1]), [
    "users", "credentialReviews", "applications", "cases", "assistance",
    "assignments", "contributions", "disputes", "eventProposals",
    "communityEvents", "eventParticipants", "certificates", "events",
  ]);
  assert.equal(new Set(keys.map(x => x[1])).size, 13, "No duplicate categories");
  assert(!keys.some(x => x[1] === "donations"), "No confidential donation transactions for Super Admin");
});

test("Prioritized summary cards use actual collection counts and no fabricated metrics", () => {
  const start = source.indexOf("{/* Prioritize operational visibility");
  const end = source.indexOf("<View style={styles.tabHeadingRow}>", start);
  assert(start >= 0 && end > start);
  const summary = source.slice(start, end);
  const metrics = [...summary.matchAll(/<SummaryCard label="([^"]+)" value=\{records\.([A-Za-z]+)\.length\}/g)];
  assert.deepEqual(metrics.map(m => [m[1], m[2]]), [
    ["Emergency Reports", "cases"],
    ["Assistance Requests", "assistance"],
    ["Users", "users"],
    ["Volunteer Applications", "applications"],
    ["Verified Help", "contributions"],
    ["Certificates", "certificates"],
  ]);
});

test("All 13 categories paginate five at a time with accessible controls", () => {
  assert.match(source, /const \[categoryPage, setCategoryPage\] = useState\(1\)/);
  assert.match(source, /const CATEGORY_PAGE_SIZE = 5/);
  assert.match(source, /Math\.ceil\(tabs\.length \/ CATEGORY_PAGE_SIZE\)/);
  assert.match(source, /const visibleCategoryTabs = tabs\.slice\(/);
  assert.match(source, /visibleCategoryTabs\.map\(\(tab\) =>/);
  assert.match(source, /accessibilityLabel="Previous category page"/);
  assert.match(source, /accessibilityLabel="Next category page"/);
  assert.match(source, /disabled=\{categoryPage === 1\}/);
  assert.match(source, /disabled=\{categoryPage === categoryPageCount\}/);
  assert.match(source, /accessibilityRole="tab"/);
  assert.match(source, /accessibilityState=\{\{ selected \}\}/);
  assert.match(source, /tabs:\s*\{\s*width: "100%",\s*flexDirection: "row",\s*alignItems: "center",\s*flexWrap: "wrap"/);
  assert.doesNotMatch(source, /showsHorizontalScrollIndicator|styles\.tabsScroll/);
});

test("Category page switching selects the first visible tab and resets record search and paging", () => {
  assert.match(source, /setCategoryPage\(safeNext\)/);
  assert.match(source, /setActiveTab\(tabs\[\(safeNext - 1\) \* CATEGORY_PAGE_SIZE\]\.key\)/);
  assert.match(source, /setSearch\(""\);\s*setPage\(1\)/);
  assert.match(source, /setActiveTab\(tab\.key\);\s*setSearch\(""\);\s*setPage\(1\)/);
  assert.match(source, /const PAGE_SIZE = 5/);
  assert.match(source, /<ListPagination page=\{activePage\} total=\{visibleRecords\.length\} onChange=\{setPage\} \/>/);
  assert.match(source, /recordSources: Array/);
  assert.match(source, /collectionName: "volunteerApplications"/);
});
