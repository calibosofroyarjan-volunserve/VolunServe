"use strict";
const assert = require("node:assert/strict");
const { evaluateDiditDecision, canonicalizeJson, validWebhookSignature } = require("./diditIdentityRoutes");
const crypto = require("node:crypto");

const approved = {
  session_kind: "user",
  status: "Approved",
  id_verifications: [{ status: "Approved", issuing_state: "PHL", document_type: "Identity Card" }],
  liveness_checks: [{ status: "Approved" }],
  face_matches: [{ status: "Approved" }],
};
assert.equal(evaluateDiditDecision(approved).decision, "approved", "all 3 checks must pass");
assert.equal(evaluateDiditDecision({
  ...approved, liveness_checks: [],
}).decision, "review", "no live face check must block automatic verification");
assert.equal(evaluateDiditDecision({
  ...approved, face_matches: [{ status: "Declined" }],
}).decision, "review", "mismatched face must block approval");
assert.equal(evaluateDiditDecision({
  ...approved, status: "In Review",
}).review, true, "review is not approval");
assert.equal(evaluateDiditDecision({
  ...approved, id_verifications: [{ status: "Approved", issuing_state: "PHL", document_type: "Other" }],
}).decision, "declined", "unsupported documents must not auto-verify");
assert.equal(evaluateDiditDecision({ status: "Declined" }).decision, "declined", "first decline should allow retries");
assert.equal(evaluateDiditDecision({ status: "In Progress" }).decision, "processing");
assert.equal(evaluateDiditDecision({ status: "Expired" }).decision, "failed");
assert.equal(JSON.stringify(canonicalizeJson({ b: 2, a: { z: 3, x: "José" } })),
  '{"a":{"x":"José","z":3},"b":2}', "sort JSON keys for signed events");

process.env.DIDIT_WEBHOOK_SECRET = "didit-secret-for-unit-test-only";
const body = { status: "Approved", event_id: "event-id", vendor_data: "abc", session_id: "session-id" };
const timestamp = String(Math.floor(Date.now() / 1000));
const signature = crypto.createHmac("sha256", process.env.DIDIT_WEBHOOK_SECRET)
  .update(JSON.stringify(canonicalizeJson(body))).digest("hex");
const request = { body, headers: { "x-timestamp": timestamp, "x-signature-v2": signature } };
assert.equal(validWebhookSignature(request), true);
assert.equal(validWebhookSignature({ ...request, body: { ...body, status: "Declined" } }), false);
assert.equal(validWebhookSignature({ ...request, headers: {
  ...request.headers, "x-timestamp": String(Number(timestamp) - 3600),
} }), false);
console.log("Didit decision and webhook security unit checks passed.");