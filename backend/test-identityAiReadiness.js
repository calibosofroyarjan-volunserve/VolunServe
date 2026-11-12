"use strict";
const assert = require("node:assert/strict");
const {test} = require("node:test");
const {probeIdentityAiReadiness} = require("./identityAiReadiness");
const endpoint = "https://volunserve-identity-ai.onrender.com/verify";
const health = {ok: true, verificationEngineReady: true, internalAuthConfigured: true, documentOcrReady: true, profileComparisonReady: true, documentPrecheckReady: true, livenessImplemented: false, passivePadShadow:{shadowEnabled:true,modelLoaded:true,independentPadValidated:false,faceDetectorShadow:{modelLoaded:true,independentPadValidated:false}}};
const response = (status, body) => ({status, ok: status >= 200 && status < 300, async json() {return body;}});
const okHealth = () => response(200, health);
const okAuth = () => response(200, {authenticated: true});
const options = (fetchImpl) => ({endpoint, internalKey: "unit-test-secret", fetchImpl, wait: async () => {}, healthTimeoutsMs: [100, 100], authTimeoutsMs: [100, 100]});

test("successful check verifies both readiness and private authentication", async () => {
  const calls = [];
  const result = await probeIdentityAiReadiness(options(async (url, init) => {
    calls.push({url, method: init.method, hasSecret: !!init.headers?.["X-VolunServe-Internal-Key"], body: init.body});
    return url.endsWith("/health") ? okHealth() : okAuth();
  }));
  assert.equal(result.statusCode, 200); assert.equal(result.body.ready, true);
  assert.equal(result.body.documentOcrReady, true);
  assert.equal(result.body.profileComparisonReady, true);
  assert.equal(result.body.documentPrecheckReady, true);
  assert.equal(result.body.livenessImplemented, false);
  assert.deepEqual(result.body.passivePadShadow,{modelLoaded:true,shadowEnabled:true,independentPadValidated:false,identityDecisionUse:"none"});
  assert.deepEqual(result.body.faceDetectorShadow,{modelLoaded:true,independentPadValidated:false,identityDecisionUse:"none"});
  assert.equal(result.body.mediaSubmissionEnabled,false);
  assert.equal(result.body.biometricAccuracyMeasured,false);
  assert.ok(!("model" in result.body.passivePadShadow),"Do not relay third-party model metadata to client");
  assert.equal(calls.length, 2); assert(calls.every(c => c.method === "GET" && c.body === undefined));
  assert.equal(calls[0].hasSecret, false); assert.equal(calls[1].hasSecret, true);
});

test("transient 503 during AI cold start is retried without POST", async () => {
  let count = 0;
  const result = await probeIdentityAiReadiness(options(async url => {
    if (url.endsWith("/health")) return ++count === 1 ? response(503, {}) : okHealth();
    return okAuth();
  }));
  assert.equal(result.body.ready, true); assert.equal(count, 2);
});

test("temporary Python network failure is retried", async () => {
  let n = 0;
  const result = await probeIdentityAiReadiness(options(async url => {
    if (url.endsWith("/health") && n++ === 0) throw new Error("cold start disconnect");
    return url.endsWith("/health") ? okHealth() : okAuth();
  }));
  assert.equal(result.body.ready, true);
});

test("AI internal key missing fails closed", async () => {
  let calls = 0;
  const result = await probeIdentityAiReadiness(options(async () => {calls++; return response(200, {...health,internalAuthConfigured:false});}));
  assert.equal(result.body.ready, false); assert.equal(result.body.error, "identity_ai_key_missing_on_ai"); assert.equal(calls, 1);
});

test("matching-key validation still blocks 401, without retry", async () => {
  let authCalls = 0;
  const result = await probeIdentityAiReadiness(options(async url => url.endsWith("/health") ? okHealth() : (authCalls++, response(401, {}))));
  assert.equal(result.body.ready, false); assert.equal(result.body.error, "identity_ai_auth_mismatch"); assert.equal(authCalls, 1);
});

test("temporary auth-check 503 is retried", async () => {
  let n = 0;
  const result = await probeIdentityAiReadiness(options(async url => url.endsWith("/health") ? okHealth() : (++n === 1 ? response(503,{}) : okAuth())));
  assert.equal(result.body.ready, true); assert.equal(n, 2);
});

test("missing FaceMesh API fails closed after bounded retries", async () => {
  let n = 0;
  const result = await probeIdentityAiReadiness(options(async () => {n++; return response(200, {...health,verificationEngineReady:false});}));
  assert.equal(result.body.ready, false); assert.equal(result.body.error, "identity_ai_not_ready"); assert.equal(n, 2);
});

test("missing private auth endpoint cannot pass", async () => {
  const result = await probeIdentityAiReadiness(options(async url => url.endsWith("/health") ? okHealth() : response(404,{})));
  assert.equal(result.body.ready, false); assert.equal(result.body.error, "identity_ai_auth_check_missing");
});

test("incorrect private auth response cannot pass", async () => {
  const result = await probeIdentityAiReadiness(options(async url => url.endsWith("/health") ? okHealth() : response(200,{authenticated:false})));
  assert.equal(result.body.ready, false); assert.equal(result.body.error, "identity_ai_auth_check_invalid");
});

test("AI stays unreachable: bounded retries, no fake ready", async () => {
  let n = 0;
  const result = await probeIdentityAiReadiness(options(async () => {n++; throw new Error("offline");}));
  assert.equal(result.body.ready, false); assert.equal(result.body.error, "identity_ai_unreachable"); assert.equal(n, 2);
});

test("missing OCR, profile comparison or precheck readiness blocks camera submission", async () => {
  for(const key of ["documentOcrReady","profileComparisonReady","documentPrecheckReady"]){
    const result = await probeIdentityAiReadiness(options(async url => {
      return url.endsWith("/health") ? response(200,{...health,[key]:false}) : okAuth();
    }));
    assert.equal(result.statusCode,503);
    assert.equal(result.body.ready,false);
    assert.equal(result.body.error,"identity_ai_not_ready");
  }
});

test("missing readiness flags must not silently enable identity uploads", async () => {
  const result = await probeIdentityAiReadiness(options(async url =>
    url.endsWith("/health") ? response(200,{ok:true,verificationEngineReady:true,internalAuthConfigured:true}) : okAuth()
  ));
  assert.equal(result.statusCode,503);
  assert.equal(result.body.ready,false);
});

test("shadow models missing or vendor falsely claiming PAD cannot flip verified, uploads or readiness",async()=>{
  for(const pad of [undefined,{}, {modelLoaded:true,shadowEnabled:true,independentPadValidated:true,
    faceDetectorShadow:{modelLoaded:true,independentPadValidated:true}}]){
    const result=await probeIdentityAiReadiness(options(async url=>
      url.endsWith("/health")?response(200,{...health,passivePadShadow:pad}):okAuth()));
    assert.equal(result.statusCode,200,"Missing optional model must not break core OCR auth");
    assert.equal(result.body.livenessImplemented,false);
    assert.equal(result.body.mediaSubmissionEnabled,false);
    assert.equal(result.body.biometricAccuracyMeasured,false);
    assert.equal(result.body.passivePadShadow.independentPadValidated,false);
    assert.equal(result.body.faceDetectorShadow.independentPadValidated,false);
    assert.equal(result.body.passivePadShadow.identityDecisionUse,"none");
    assert.equal(result.body.faceDetectorShadow.identityDecisionUse,"none");
    assert.equal(result.body.passivePadShadow.modelLoaded,pad?.modelLoaded===true);
  }
});
