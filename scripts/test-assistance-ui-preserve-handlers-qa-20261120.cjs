"use strict";
const assert = require("node:assert/strict");
const cp = require("node:child_process");
const fs = require("node:fs");
const ts = require("typescript");

const base = "02e9a77efc9cb5e0c580cb4e815c93cff7548359";
const file = "app/(admin)/assistance-requests.tsx";
const original = cp.execFileSync("git", ["show", base + ":" + file], { encoding: "utf8" });
const current = fs.readFileSync(file, "utf8");

const changedAppFiles = cp.execFileSync("git", ["diff", "--name-only", base, "HEAD", "--", "app", "components", "lib", "services", "utils", "functions"], { encoding:"utf8" }).trim().split("\n").filter(Boolean);
assert.deepEqual(changedAppFiles, [file], "QA candidate changed app/functionality files outside Assistance Requests");

function parse(source) {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert.equal(sf.parseDiagnostics.length, 0, "TSX parser reported a syntax diagnostic");
  return sf;
}
const sourceOld = parse(original), sourceNew = parse(current);

function handlerBody(sf, name) {
  const matches=[];
  function walk(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(sf) === name && node.initializer) matches.push(node.initializer.getText(sf));
    ts.forEachChild(node, walk);
  }
  walk(sf);
  assert.equal(matches.length, 1, "Expected exactly one protected function: " + name);
  return matches[0];
}

const handlers = [
  "verifyNeed",
  "rejectRequest",
  "requestMoreInformation",
  "continueToDonationCampaign",
  "saveSimpleSupportChoice",
  "startReview",
  "saveVerificationDraft",
  "markAssistanceProvided"
];
for (const name of handlers) assert.equal(handlerBody(sourceNew, name), handlerBody(sourceOld, name), "Protected action handler changed: "+name);

const required = [
  "referenceFullPage",
  "referenceStatusTabs",
  "referenceTableHeader",
  "referenceTwoCards",
  "referenceReviewColumns",
  "referenceSupportOptions",
  "referencePublishPanel",
  'screenMode === "queue" || !selected',
  "pageSize={5}"
];
for (const token of required) assert(current.includes(token), "Missing reference UI element: " + token);
assert(!current.includes("const visibleSelected = pagedRequests.some"), "Old split-pane auto-selection was reintroduced");

console.log("PASS: 8 protected review/donation handlers byte-for-byte unchanged");
console.log("PASS: Only Assistance Requests frontend file changed within application/runtime trees");
console.log("PASS: Four reference layouts, five-record pagination and explicit queue navigation remain present");
console.log("NO DEPLOY: read-only validation complete");
