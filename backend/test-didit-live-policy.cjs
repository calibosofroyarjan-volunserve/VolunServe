"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const {
  evaluateDiditDecision, classifyLiveDocument, diditEnabled,
  liveProjectAllowed, canonicalizeJson, validWebhookSignature,
} = require("./diditLiveIdentityRoutes");

const profile = { firstName: "Marilyn", lastName: "Caliboso", dateOfBirth: "2000-01-01" };
const valid = () => ({
  session_kind: "user", environment: "live", status: "Approved",
  id_verifications: [{
    status: "Approved", issuing_state: "PHL", document_type: "ID Card",
    document_subtype: "Philippine National ID", full_name: "Marilyn Caliboso",
    date_of_birth: "2000-01-01", warnings: [],
  }],
  liveness_checks: [{ status: "Approved" }],
  face_matches: [{ status: "Approved" }],
});
test("Live candidate rejects Sandbox workflow and missing credentials", () => {
  const base = { DIDIT_LIVE_ENABLED: "true", DIDIT_INTEGRATION_ENABLED: "true",
    DIDIT_ENVIRONMENT: "live", DIDIT_API_KEY: "fake-do-not-use", DIDIT_WEBHOOK_SECRET: "fake-do-not-use" };
  assert.equal(diditEnabled({ ...base, DIDIT_WORKFLOW_ID: "9fd6c419-790b-45bf-be09-4892216eb155" }), false);
  assert.equal(diditEnabled({ ...base, DIDIT_WORKFLOW_ID: "live_test_workflow_12345", DIDIT_LIVE_ENABLED: "false" }), false);
  assert.equal(diditEnabled({ ...base, DIDIT_WORKFLOW_ID: "live_test_workflow_12345", DIDIT_ENVIRONMENT: "sandbox" }), false);
  assert.equal(diditEnabled({ ...base, DIDIT_WORKFLOW_ID: "live_test_workflow_12345" }), true);
});
test("Production Firebase gate refuses QA and mismatched service accounts", () => {
  const env = { DIDIT_ENVIRONMENT: "live", RENDER: "true", RENDER_SERVICE_NAME: "VolunServe",
    FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ type: "service_account", project_id: "volunserve-3aa5b" }) };
  assert.equal(liveProjectAllowed("volunserve-didit-qa", env), false);
  assert.equal(liveProjectAllowed("volunserve-3aa5b", { ...env, RENDER_SERVICE_NAME: "volunserve-didit-qa-backend" }), false);
  assert.equal(liveProjectAllowed("volunserve-3aa5b", { ...env, FIREBASE_SERVICE_ACCOUNT_JSON: "{}" }), false);
  assert.equal(liveProjectAllowed("volunserve-3aa5b", env), true);
});
test("Only actual Philippines government document classifications are accepted", () => {
  assert.equal(classifyLiveDocument({ issuing_state:"PHL", document_type:"ID Card", document_subtype:"School ID" }), "reject");
  assert.equal(classifyLiveDocument({ issuing_state:"PHL", document_type:"ID Card", document_subtype:"ID Card" }), "review");
  assert.equal(classifyLiveDocument({ issuing_state:"PHL", document_type:"ID Card", document_subtype:"Philippine National ID" }), "allowed");
  assert.equal(classifyLiveDocument({ issuing_state:"PHL", document_type:"Passport" }), "allowed");
  assert.equal(classifyLiveDocument({ issuing_state:"PHL", document_type:"Drivers License" }), "allowed");
});
test("Approves only complete matching ID, liveness and face check; all uncertainty routes to review", () => {
  assert.equal(evaluateDiditDecision(valid(), profile).decision, "approved");
  const school = valid(); school.id_verifications[0].document_subtype = "School ID";
  assert.equal(evaluateDiditDecision(school, profile).decision, "declined");
  const wrongName = valid(); wrongName.id_verifications[0].full_name = "Different Person";
  assert.equal(evaluateDiditDecision(wrongName, profile).decision, "review");
  const wrongBirth = valid(); wrongBirth.id_verifications[0].date_of_birth = "1990-01-01";
  assert.equal(evaluateDiditDecision(wrongBirth, profile).decision, "review");
  const spoof = valid(); spoof.liveness_checks[0].status = "Declined";
  assert.equal(evaluateDiditDecision(spoof, profile).decision, "declined");
  const missingFace = valid(); missingFace.face_matches = [];
  assert.equal(evaluateDiditDecision(missingFace, profile).decision, "review");
  const warning = valid(); warning.id_verifications[0].warnings = [{risk:"DOCUMENT_TAMPERING"}];
  assert.equal(evaluateDiditDecision(warning, profile).decision, "review");
});
test("Webhook signature requires current v2 full-payload HMAC, not unsigned test events", () => {
  const previous = process.env.DIDIT_WEBHOOK_SECRET;
  process.env.DIDIT_WEBHOOK_SECRET = "synthetic_webhook_secret";
  try {
    const timestamp = Math.floor(Date.now()/1000);
    const body = { timestamp, webhook_type:"status.updated", vendor_data:"uid", status:"Approved", session_id:"12345678" };
    const signature = crypto.createHmac("sha256", "synthetic_webhook_secret")
      .update(JSON.stringify(canonicalizeJson(body))).digest("hex");
    assert.equal(validWebhookSignature({body,headers:{"x-timestamp":String(timestamp),"x-signature-v2":signature}}), true);
    assert.equal(validWebhookSignature({body:{...body, status:"Declined"},headers:{"x-timestamp":String(timestamp),"x-signature-v2":signature}}), false);
    assert.equal(validWebhookSignature({body,headers:{"x-timestamp":String(timestamp-400),"x-signature-v2":signature}}), false);
  } finally {
    if (previous === undefined) delete process.env.DIDIT_WEBHOOK_SECRET;
    else process.env.DIDIT_WEBHOOK_SECRET = previous;
  }
});
