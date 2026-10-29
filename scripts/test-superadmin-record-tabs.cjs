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

test("All 13 tabs use one horizontal scroll row without wrapping, and preserve filters and pagination", () => {
  assert.match(source, /<ScrollView\s+horizontal\s+nestedScrollEnabled\s+showsHorizontalScrollIndicator/);
  assert.match(source, /accessibilityLabel="System record categories in workflow order"/);
  assert.match(source, /accessibilityRole="tab"/);
  assert.match(source, /accessibilityState=\{\{ selected \}\}/);
  assert.match(source, /tabs:\s*\{\s*flexDirection: "row",\s*alignItems: "center",\s*flexWrap: "nowrap"/);
  assert.match(source, /tabsScroll:\s*\{\s*width: "100%",/);
  assert.match(source, /setActiveTab\(tab\.key\);\s*setSearch\(""\);\s*setPage\(1\)/);
  assert.match(source, /const PAGE_SIZE = 5/);
  assert.match(source, /<ListPagination page=\{activePage\} total=\{visibleRecords\.length\} onChange=\{setPage\} \/>/);
  assert.match(source, /recordSources: Array/);
  assert.match(source, /collectionName: "volunteerApplications"/);
});
