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
  assertHas(source, "function accountAudienceForUser(account: GenericRecord): AccountAudience");
  assertHas(source, "account.volunteerAccess === true");
  assertHas(source, 'account.volunteerStatus === "approved"');
  assertHas(source, "account.residentAccess === true");
  for (const role of ["resident","basic_resident","verified_resident","volunteer","admin","superadmin","applicant"]) {
    assertHas(source, '"' + role + '"');
  }
  assertHas(source, 'return "other";');
  assertHas(source, "source.filter(item => accountAudienceForUser(item) === activeView.audience)");
  assertHas(source, "activeViewId,");
});

test("Switching sections and child tabs resets search and five-record paging", () => {
  assertHas(source, 'accessibilityLabel="Choose record section"');
  assertHas(source, 'accessibilityLabel="Record service areas"');
  assertHas(source, 'accessibilityLabel={activeSection.label + " record types"}');
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

test("Browse Records uses one compact dropdown plus underline tabs, never stacked section cards", () => {
  assertHas(source, "const [sectionMenuOpen, setSectionMenuOpen] = useState(false);");
  assertHas(source, "onPress={() => setSectionMenuOpen(!sectionMenuOpen)}");
  assertHas(source, 'style={styles.sectionPickerMenu}');
  assertHas(source, "setSectionMenuOpen(false);");
  assertHas(source, "styles.recordTypeTabs");
  assertHas(source, "styles.recordTypeTabActive");
  assertHas(source, 'borderBottomColor: "#087A62"');
  assert(!source.includes("styles.sectionTabs") && !source.includes("styles.subSection"),
    "Remove two bulky rows and nested mint panel");
  assert(!source.includes("CATEGORY_PAGE_SIZE") && !source.includes("tabsScroll"),
    "Do not restore an unrelated category pager or horizontal scrollbar");
});

test("Resident volunteers with approved access appear under Volunteers, never in staff or ordinary residents", () => {
  const vm = require("node:vm"), ts = require("typescript");
  const start = source.indexOf("function accountAudienceForUser(account: GenericRecord)");
  const end = source.indexOf("export default function AllRecords()", start);
  assert(start >= 0 && end > start);
  const fragment = source.slice(start,end) + "\nmodule.exports = accountAudienceForUser;";
  const compiled = ts.transpileModule(fragment, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS }
  }).outputText;
  const sandbox = { module: { exports: null } };
  vm.runInNewContext(compiled, sandbox, { timeout: 1000 });
  const classify = sandbox.module.exports;
  assert.equal(classify({ role: "resident", residentAccess: true, volunteerAccess: true, volunteerStatus: "approved" }), "volunteer");
  assert.equal(classify({ role: "resident", volunteerStatus: "approved" }), "volunteer");
  assert.equal(classify({ role: "resident", volunteerAccess: false, volunteerStatus: "approved" }), "resident");
  assert.equal(classify({ role: "resident", residentAccess: true }), "resident");
  assert.equal(classify({ role: "volunteer" }), "volunteer");
  assert.equal(classify({ role: "admin", volunteerAccess: true }), "staff");
  assert.equal(classify({ role: null }), "other");
});
