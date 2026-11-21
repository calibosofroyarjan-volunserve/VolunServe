"use strict";
/**
 * Checks the EXACT deployed staging-backend source's AI readiness adapter
 * against the current public staging-AI /health payload (GET-only).
 * The private key check is STUBBED; this does NOT authenticate the two services.
 * No account, token, government ID, photograph, Firestore write or deployment.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const {probeIdentityAiReadiness} = require("../backend/identityAiReadiness");

const AI_BASE = "https://volunserve-identity-ai-staging.onrender.com";
const NODE_BASE = "https://volunserve-backend-staging.onrender.com";
const status = (code, body) => ({
  status: code, ok: code >= 200 && code < 300,
  json: async () => body,
});
async function main() {
  const [aiResponse, nodeResponse] = await Promise.all([
    fetch(AI_BASE + "/health", {method:"GET", signal:AbortSignal.timeout(120000)}),
    fetch(NODE_BASE + "/health", {method:"GET", signal:AbortSignal.timeout(120000)}),
  ]);
  assert.equal(aiResponse.status, 200, "staging AI health not 200");
  assert.equal(nodeResponse.status, 200, "staging backend health not 200");
  const health = await aiResponse.json();
  const nodeHealth = await nodeResponse.json();
  assert.equal(health.ok, true);
  assert.equal(health.service, "volunserve-identity-ai");
  assert.equal(nodeHealth.ok, true);
  assert.equal(nodeHealth.service, "volunserve-backend");
  const file = fs.readFileSync("backend/server.js", "utf8");
  assert(file.includes('"/api/identity/engine-health"'), "deployed backend missing private AI readiness route");
  assert(file.includes('"/api/identity/status"'), "deployed backend missing private Resident status route");
  assert(file.includes('"/api/admin/identity/reviews"'), "deployed backend missing private Admin queue");
  console.log("PASS: current staging backend and staging AI public health");
  let healthCalls=0, artificialPrivateCalls=0;
  const stubbedFetch = async (url, options) => {
    assert.equal(options.method, "GET");
    assert.equal(options.body, undefined);
    if(url === AI_BASE + "/health") {
      healthCalls++;
      assert.equal(options.headers, undefined);
      return status(200, health);
    }
    if(url === AI_BASE + "/api/internal/auth-check") {
      artificialPrivateCalls++;
      assert.equal(options.headers?.["X-VolunServe-Internal-Key"], "SYNTHETIC_TEST_ONLY_DO_NOT_USE");
      // Explicitly STUBBED to test Node parsing; not a genuine key handshake.
      return status(200, {authenticated:true});
    }
    throw new Error("Unexpected endpoint; test never sends an ID or selfie");
  };
  const result = await probeIdentityAiReadiness({
    endpoint:AI_BASE + "/verify",
    internalKey:"SYNTHETIC_TEST_ONLY_DO_NOT_USE",
    fetchImpl:stubbedFetch,
    wait:async()=>{},
    healthTimeoutsMs:[500],
    authTimeoutsMs:[500],
  });
  assert.equal(healthCalls,1);
  assert.equal(artificialPrivateCalls,1);
  assert.equal(result.statusCode,200);
  assert.equal(result.body.ready,true);
  assert.equal(result.body.documentOcrReady,true);
  assert.equal(result.body.profileComparisonReady,true);
  assert.equal(result.body.documentPrecheckReady,true);
  assert.equal(result.body.sFaceShadow.modelLoaded,true);
  assert.equal(result.body.faceDetectorShadow.modelLoaded,true);
  assert.equal(result.body.passivePadShadow.modelLoaded,true);
  assert.equal(result.body.sFaceShadow.independentFaceMatchValidated,false);
  assert.equal(result.body.sFaceShadow.identityDecisionUse,"none");
  assert.equal(result.body.passivePadShadow.independentPadValidated,false);
  assert.equal(result.body.mediaSubmissionEnabled,false);
  assert.equal(result.body.biometricAccuracyMeasured,false);
  assert.equal(result.body.livenessImplemented,false);
  console.log("PASS: deployed backend readiness parser accepts the actual new staging AI model-readiness contract");
  console.log("PASS: image uploads remain disabled and SFace/PAD cannot grant Verified Resident");
  console.log("LIMITATION: private Node-to-AI secret handshake was STUBBED; no real authenticated end-to-end test");
}
main().catch(error=>{
  console.error("FAIL: staging backend AI compatibility: " + String(error?.message||"unknown").replace(/https?:\/\/\S+/g,"[endpoint]"));
  process.exitCode=1;
});
