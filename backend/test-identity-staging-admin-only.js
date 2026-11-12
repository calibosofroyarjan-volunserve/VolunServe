"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync("backend/server.js", "utf8");

const outcomeCode = source.match(/function identityAttemptOutcome\(decision, attempts\) \{[\s\S]*?\n\}/);
assert.ok(outcomeCode, "Identity attempt policy must exist");
const decide = vm.runInNewContext(outcomeCode[0] + "\nidentityAttemptOutcome", {
  MAX_IDENTITY_AI_ATTEMPTS: 3,
});

test("No AI decision can directly promote a Basic Resident to Verified", () => {
  for (const [decision, attempts, wanted] of [
    ["verified", 1, "pending"],
    ["manual_review", 1, "pending"],
    ["failed", 1, "failed"],
    ["failed", 2, "failed"],
    ["failed", 3, "pending"],
  ]) {
    const result = decide(decision, attempts);
    assert.equal(result.status, wanted);
    assert.equal(result.requiresManualReview, wanted === "pending");
  }
});

test("Identity AI verification endpoint NEVER writes a Verified Resident profile", () => {
  const begin = source.indexOf('"/api/identity/verify"');
  const end = source.indexOf('"/api/admin/identity/reviews"', begin);
  assert.ok(begin > 0 && end > begin, "Verification route boundaries not found");
  const route = source.slice(begin, end);
  assert.match(route, /requireFirebaseUser/);
  assert.match(route, /enforceSelectedIdDecision\(/);
  assert.match(route, /identityVerified:\s*false/);
  assert.doesNotMatch(route, /identityVerified:\s*true/);
  assert.doesNotMatch(route, /identityStatus:\s*["']verified["']/);
  assert.doesNotMatch(route, /identityVerifiedBy:\s*["']volunserve_ai["']/);
});

test("Only the authenticated independent Admin route can grant verified status", () => {
  const begin = source.indexOf('"/api/admin/identity/reviews/:uid/decision"');
  const end = source.indexOf('"/api/admin/assistance/requests/:requestId/start-review"', begin);
  assert.ok(begin > 0 && end > begin, "Admin route boundaries not found");
  const route = source.slice(begin, end);
  assert.match(route, /requireFirebaseUser/);
  assert.match(route, /requireOperationalAdmin/);
  assert.match(route, /self_identity_review_forbidden/);
  assert.match(route, /selectedIdRecognized\(/);
  assert.match(route, /reviewIssuerEvidence\(/);
  assert.match(route, /issuerReviewAttested/);
  assert.match(route, /identityVerified:\s*true/);
});
