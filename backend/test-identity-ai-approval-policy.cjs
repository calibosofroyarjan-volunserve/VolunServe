"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const {requireAdminFinalApproval} = require("./identityAiApprovalPolicy");

test("AI success is PENDING for Admin, never a verified decision", () => {
  assert.equal(requireAdminFinalApproval("verified"), "manual_review");
  assert.equal(requireAdminFinalApproval("manual_review"), "manual_review");
  assert.equal(requireAdminFinalApproval(undefined), "manual_review");
});
test("failed AI attempt remains failed/retryable", () => {
  assert.equal(requireAdminFinalApproval("failed"), "failed");
});
test("production proxy uses Admin gate before writing Resident status", () => {
  const source = fs.readFileSync("backend/server.js", "utf8");
  assert.match(source, /const decision = requireAdminFinalApproval\(rawDecision\);/);
  assert.match(source, /if \(result\.status === "verified"\) \{/);
  assert.match(source, /const status = requiresManualReview \? "pending" : "failed";/);
});
