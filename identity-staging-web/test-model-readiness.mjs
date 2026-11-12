import test from "node:test";
import assert from "node:assert/strict";
import {summarizeAiReadiness} from "./model-readiness.mjs";

test("read-only staging returns model loaded flags separately from core AI readiness",()=>{
 const data=summarizeAiReadiness({
  ready:true,provider:"volunserve-custom-ai",documentOcrReady:true,
  profileComparisonReady:true,documentPrecheckReady:true,
  passivePadShadow:{modelLoaded:true,shadowEnabled:true},
  faceDetectorShadow:{modelLoaded:true}
 });
 assert.equal(data.coreEngineReady,true);
 assert.equal(data.miniFasNetModelLoaded,true);
 assert.equal(data.miniFasNetShadowEnabled,true);
 assert.equal(data.yuNetModelLoaded,true);
 assert.equal(data.documentOcrReady,true);
 assert.equal(data.independentLivenessPadValidated,false);
 assert.equal(data.realDeviceAccuracyMeasured,false);
 assert.equal(data.biometricMediaSubmissionsEnabled,false);
 assert.equal(data.automaticVerifiedResidentApproval,false);
});
test("missing optional models should be shown as not loaded, never as passed liveness",()=>{
 const data=summarizeAiReadiness({ready:true,documentOcrReady:true});
 assert.equal(data.coreEngineReady,true);
 assert.equal(data.miniFasNetModelLoaded,false);
 assert.equal(data.yuNetModelLoaded,false);
 assert.equal(data.independentLivenessPadValidated,false);
});
test("malicious upstream booleans and user strings cannot modify security claims",()=>{
 const data=summarizeAiReadiness({
  provider:"fake-provider",ready:"true",
  passivePadShadow:{modelLoaded:"true",shadowEnabled:true,independentPadValidated:true},
  faceDetectorShadow:{modelLoaded:true,independentPadValidated:true},
  independentLivenessPadValidated:true,biometricMediaSubmissionsEnabled:true,
  automaticVerifiedResidentApproval:true,
  uid:"private-account", email:"someone@example.com", selfie:"binary-face"
 });
 assert.equal(data.coreEngineReady,false);
 assert.equal(data.provider,"unconfirmed");
 assert.equal(data.miniFasNetModelLoaded,false);
 assert.equal(data.yuNetModelLoaded,true);
 assert.equal(data.independentLivenessPadValidated,false);
 assert.equal(data.biometricMediaSubmissionsEnabled,false);
 assert.equal(data.automaticVerifiedResidentApproval,false);
 assert.equal(JSON.stringify(data).includes("someone@example.com"),false);
 assert.equal(JSON.stringify(data).includes("binary-face"),false);
});
test("null and malformed responses are safe",()=>{
 for(const d of [null,undefined,false,"ready",42]){
  const x=summarizeAiReadiness(d);
  assert.equal(x.coreEngineReady,false);
  assert.equal(x.miniFasNetModelLoaded,false);
  assert.equal(x.yuNetModelLoaded,false);
 }
});
