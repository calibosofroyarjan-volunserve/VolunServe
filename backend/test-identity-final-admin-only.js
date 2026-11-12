"use strict";
// Tests the actual source function and the authenticated route boundaries.
// No Firebase credentials, user records, real images, or network requests.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const backend = fs.readFileSync("backend/server.js", "utf8");
const policy = require("./selectedIdPolicy");
const { reviewIssuerEvidence } = require("./identityIssuerReviewPolicy");

function currentAttemptOutcome() {
  const source = backend.match(/function identityAttemptOutcome\(decision, attempts\) \{[\s\S]*?\n\}/);
  assert.ok(source, "Identity attempt outcome function must exist");
  return vm.runInNewContext(source[0] + "\nidentityAttemptOutcome;", {
    MAX_IDENTITY_AI_ATTEMPTS: 3,
  });
}
function routeBody(start, end) {
  const from = backend.indexOf('"' + start + '"');
  const to = backend.indexOf('"' + end + '"', from + start.length);
  assert.ok(from > 0 && to > from, "Missing sequential route boundaries");
  return backend.slice(from, to);
}

test("Even a provider verified response cannot promote a Resident without Admin", () => {
  const decide = currentAttemptOutcome();
  assert.equal(decide("verified", 1).status, "pending");
  assert.equal(decide("verified", 1).requiresManualReview, true);
  assert.equal(decide("manual_review", 1).status, "pending");
  assert.equal(decide("failed", 1).status, "failed");
  assert.equal(decide("failed", 3).status, "pending");
  assert.equal(decide("failed", 3).requiresManualReview, true);
});
test("Identity submit route has no AI-only verified profile writer", () => {
  const source = routeBody("/api/identity/verify", "/api/admin/identity/reviews");
  assert.match(source, /requireFirebaseUser/);
  assert.match(source, /enforceSelectedIdDecision\(/);
  assert.match(source, /identityVerified:\s*false/);
  assert.doesNotMatch(source, /identityVerified:\s*true/);
  assert.doesNotMatch(source, /identityVerifiedBy:\s*["']volunserve_ai["']/);
  assert.doesNotMatch(source, /identityStatus:\s*["']verified["']/);
});
test("Admin decisions require privileged Firebase authentication and independent issuer check", () => {
  const source = routeBody("/api/admin/identity/reviews/:uid/decision", "/api/identity/");
  assert.match(source, /requireFirebaseUser/);
  assert.match(source, /requireOperationalAdmin/);
  assert.match(source, /self_identity_review_forbidden/);
  assert.match(source, /selectedIdRecognized\(/);
  assert.match(source, /reviewIssuerEvidence\(/);
  assert.match(source, /issuerReviewAttested/);
  assert.match(source, /independentAdminCheckAttested/);
});
test("All supported IDs route to review, spoofed authenticity flags never grant approval", () => {
  for (const id of ["national_id","drivers_license","passport","umid","prc_id"]) {
    const screening = {
      status: "text_consistent_unverified", declaredIdType: id, detectedIdType: id,
      imageQualityStatus: "adequate", warningCodes: [],
      backSideProvided: id !== "passport", backSideScreened: id !== "passport",
      authenticityVerified: true, livenessVerified: true,
    };
    assert.equal(policy.enforceSelectedIdDecision("verified", screening, true), "manual_review");
  }
});
test("An Admin cannot claim an independent ID check without a permitted method and notes", () => {
  assert.equal(reviewIssuerEvidence({
    declaredType:"national_id", validationMethod:"unapproved", confirmed:true, notes:"Checked independently",
  }).ok,false);
  assert.equal(reviewIssuerEvidence({
    declaredType:"national_id", validationMethod:"psa_national_id_qr_check",
    confirmed:false, notes:"Checked independently",
  }).ok,false);
  assert.equal(reviewIssuerEvidence({
    declaredType:"national_id", validationMethod:"psa_national_id_qr_check",
    confirmed:true, notes:"Checked independently",
  }).issuerAuthenticityAutomaticallyVerified,false);
});
