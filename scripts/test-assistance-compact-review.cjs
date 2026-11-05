"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

const queuePath = "lib/assistanceReviewQueue.ts";
const screenPath = "app/(admin)/assistance-requests.tsx";
const source = fs.readFileSync(queuePath, "utf8");
const screen = fs.readFileSync(screenPath, "utf8");

// Execute the real pure TypeScript queue helper, not a rewritten test-only clone.
const result = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  fileName: queuePath,
  reportDiagnostics: true,
});
assert.equal(result.diagnostics?.length || 0, 0, "Queue helper should transpile");
const moduleObj = { exports: {} };
new Function("module", "exports", result.outputText)(moduleObj, moduleObj.exports);
const filter = moduleObj.exports.filterAndSortAssistanceQueue;
assert.equal(typeof filter, "function");

const toMillis = value => Number(value?.ms ?? 0);
const item = (id, requesterName, title, status, category, ms) => ({
  id, requestId: "REF-" + id, requesterName, title, status, category,
  createdAt: { ms },
});
const records = [
  item("3", "Zoë", "Hospital Bills", "pending", "medical_health", 300),
  item("1", "Ana", "Food Support", "pending", "homeless_basic_needs", 100),
  item("2", "Ben", "Medical Consultation", "under_review", "medical_health", 200),
  item("4", "Carlos", "Shelter Support", "verified", "disaster_recovery", 400),
  item("5", "Dana", "Water Assistance", "rejected", "disaster_recovery", 500),
  item("6", "Eli", "Donation Support", "campaign_created", "medical_health", 600),
  item("7", "Fran", "Assistance Provided", "assistance_provided", "medical_health", 700),
  item("8", "Grace", "Closed Case", "closed", "medical_health", 800),
];
const options = { status: "all", category: "all", sort: "newest", search: "" };
const run = (changes, input = records) => filter(input, { ...options, ...changes }, toMillis);
const ids = arr => arr.map(item => item.id);
assert.deepEqual(ids(run({ sort: "newest" })), ["8", "7", "6", "5", "4", "3", "2", "1"]);
assert.deepEqual(ids(run({ sort: "oldest" })), ["1", "2", "3", "4", "5", "6", "7", "8"]);
assert.deepEqual(ids(run({ sort: "resident_az" })), ["1", "2", "4", "5", "6", "7", "8", "3"]);
assert.deepEqual(ids(run({ sort: "resident_za" })), ["3", "8", "7", "6", "5", "4", "2", "1"]);
assert.deepEqual(ids(run({ sort: "title_az" })), ["7", "8", "6", "1", "3", "2", "4", "5"]);
assert.deepEqual(ids(run({ sort: "title_za" })), ["5", "4", "2", "3", "1", "6", "8", "7"]);
assert.deepEqual(ids(run({ status: "pending" })), ["3", "1"]);
assert.deepEqual(ids(run({ status: "under_review" })), ["2"]);
assert.deepEqual(ids(run({ status: "verified" })), ["4"]);
assert.deepEqual(ids(run({ status: "rejected" })), ["5"]);
assert.deepEqual(ids(run({ status: "completed" })), ["8", "7", "6"]);
assert.deepEqual(ids(run({ category: "medical_health", status: "pending" })), ["3"]);
assert.deepEqual(ids(run({ category: "medical_health" })), ["8", "7", "6", "3", "2"]);
assert.deepEqual(ids(run({ search: "  hospITal " })), ["3"]);
assert.deepEqual(ids(run({ search: "ref-2" })), ["2"]);
assert.deepEqual(ids(run({ search: "zoË" })), ["3"]);
assert.deepEqual(ids(run({ search: "not-existing" })), []);
const before = ids(records);
run({ sort: "resident_za" });
assert.deepEqual(ids(records), before, "Filters must not mutate live snapshot order");

// Pagination must take place after sorting/filtering; no page may exceed 5 entries.
const firstPage = run({ sort: "resident_az" }).slice(0, 5);
const secondPage = run({ sort: "resident_az" }).slice(5, 10);
assert.deepEqual(ids(firstPage), ["1", "2", "4", "5", "6"]);
assert.deepEqual(ids(secondPage), ["7", "8"]);

// Source-level integration gates: these validate wiring and role/privacy conditions
// without making any production request or modifying real resident records.
for (const token of [
  "filterAndSortAssistanceQueue(",
  "pageSize={5}",
  "pagedRequests.map(",
  "setRecordPage(1)",
  "onSnapshot(",
  "PRIVATE_REVIEW_COLLECTION",
  "const verifyNeed = () =>",
  "reviewReadyForVerification(reviewDraft)",
  "const rejectRequest = () =>",
  "const requestMoreInformation = async () =>",
  "const openDocument = async",
  "getIdToken(true)",
  'role === "admin"',
  'profile.status === "approved"',
  'label="Summary"',
  'label="Verify & Decide"',
  'label="Resident A–Z"',
  'label="Resident Z–A"',
  'label="Request A–Z"',
  'label="Request Z–A"',
]) assert(screen.includes(token), "Missing Assistance UI/security integration: " + token);

console.log("PASS Assistance queue A-Z/Z-A, category/status/search filters, completed grouping, 5-per-page pagination, and secured review action wiring");
