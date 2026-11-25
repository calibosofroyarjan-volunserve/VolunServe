"use strict";
/**
 * Regression of the restored React Native original-AI precheck decision block.
 * Uses fabricated decision objects only. No camera, ID, Firebase, Cloudinary,
 * network, production backend, or third-party KYC.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const native = fs.readFileSync(path.join(__dirname, "../app/identity-verification.tsx"), "utf8");
const client = fs.readFileSync(path.join(__dirname, "../lib/identityVerification.ts"), "utf8");
const web = fs.readFileSync(path.join(__dirname, "../app/identity-verification.web.tsx"), "utf8");
const handlerStart = native.indexOf("const openFaceScan =");
const handlerEnd = native.indexOf("const captureFace =", handlerStart);
assert.ok(handlerStart >= 0 && handlerEnd > handlerStart, "Native precheck handler must exist");
const handler = native.slice(handlerStart, handlerEnd);
const decisionStart = handler.indexOf('if (result.outcome === "retry") return;');
const decisionEnd = handler.indexOf("// Only a recognized, passing ID precheck can enter face capture.", decisionStart);
assert.ok(decisionStart >= 0 && decisionEnd > decisionStart, "Decision boundary must include review guard before face capture");
const decisions = handler.slice(decisionStart, decisionEnd);
assert.match(handler.slice(decisionEnd), /setStep\(2\);[\s\S]*requestCameraPermission\(\)/);

// Execute the real, isolated decision block (not a recreated approximation).
const executeDecision = new Function(
  "result", "setSelfie", "setCameraReady", "setStatusResult",
  "setStep", "setDocumentPrecheckMessage",
  decisions + "\nreturn 'ready-for-face-stage';"
);
function simulate(result) {
  const calls = [];
  const make = name => data => calls.push({name, data});
  const flow = executeDecision(
    result, make("selfie"), make("camera"), make("status"),
    make("step"), make("message")
  );
  return {calls, flow};
}
const sample = {
  outcome: "review", status: "pending",
  verificationId: "synthetic_qa_id", decision: "pending_admin_review",
  documentScreening: {status:"inconclusive",declaredIdType:"national_id"},
  message: "This fabricated document needs Admin review.",
};

test("persisted OCR-only review becomes Pending, never a selfie-camera stage", () => {
  const {calls,flow} = simulate(sample);
  assert.equal(flow, undefined, "Must return before face-scan branch");
  assert.equal(calls.some(c=>c.name==="selfie" && c.data===null),true);
  assert.equal(calls.some(c=>c.name==="camera" && c.data===false),true);
  const pending = calls.find(c=>c.name==="status")?.data;
  assert.equal(pending.identityStatus,"pending");
  assert.equal(pending.identityVerified,false);
  assert.equal(pending.verificationId,sample.verificationId);
  assert.equal(calls.find(c=>c.name==="step")?.data,3);
  assert.ok(!calls.some(c=>c.name==="step" && c.data===2));
});
test("unconfirmed review never claims success or enters face capture", () => {
  const {calls,flow}=simulate({...sample,status:undefined,verificationId:undefined});
  assert.equal(flow,undefined);
  assert.ok(!calls.some(c=>c.name==="status"));
  assert.ok(!calls.some(c=>c.name==="step"));
  assert.match(calls.find(c=>c.name==="message")?.data||"",/pending record was not confirmed/);
});
test("retry never opens face capture or creates a Pending status", () => {
  const {calls,flow}=simulate({...sample,outcome:"retry",status:undefined});
  assert.equal(flow,undefined);
  assert.deepEqual(calls,[]);
});
test("passing ID precheck alone may continue to face capture, not Verified Resident", () => {
  const {calls,flow}=simulate({...sample,outcome:"pass",status:undefined});
  assert.equal(flow,"ready-for-face-stage");
  assert.deepEqual(calls,[]);
});
test("web and native both require authenticated private ID consent and keep Admin approval", () => {
  assert.ok(client.includes("/api/identity/document/precheck-with-evidence"));
  assert.ok(client.includes("/api/identity/verify-with-evidence"));
  assert.ok(client.includes('body.append("identityEvidenceConsent", "true")'));
  assert.ok(client.includes('formData.append("identityEvidenceConsent", "true")'));
  assert.ok(client.includes('"X-VolunServe-Document-Precheck-Consent": "true"'));
  assert.match(web,/if \(result\.outcome === "review"\) \{/);
  assert.match(web,/if \(result\.status === "pending"\)/);
  assert.match(native,/if \(result\.outcome === "review"\) \{/);
  assert.match(native,/if \(result\.status === "pending"\)/);
  assert.doesNotMatch(decisions,/identityVerified:\s*true/);
});
