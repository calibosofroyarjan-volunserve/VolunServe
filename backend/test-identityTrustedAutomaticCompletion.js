"use strict";

const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const {resolveTrustedAutomaticCompletion:complete}=require("./identityTrustedAutomaticCompletion");
const {assessAutomaticIdentityApproval:assess}=require("./identityAutoApprovalGateway");

const uid="syntheticResident123",requestId="syntheticRequest123",verificationId="syntheticVerification123";
const media=slot=>({
  publicId:`volunserve/identity-private/${uid}/${requestId}/${slot}`,
  deliveryType:"authenticated",resourceType:"image",format:"jpg"
});
const screening=()=>({
  status:"text_consistent_unverified",
  declaredIdType:"national_id", detectedIdType:"national_id",
  imageQualityStatus:"adequate", profileNameCheck:"possible_match",
  profileBirthDateCheck:"possible_match", backSideScreened:true,
  warningCodes:[],
});
const face=()=>({
  result:"match",algorithmValidated:true,calibrationValidated:true,
  samePersonAssertion:true,verificationId
});
const attempt=()=>({
  uid,verificationId,freshCapture:true,consentedEvidenceAvailable:true
});
const issuer=(patch={})=>async()=>({
  uid,verificationId,proofKind:"trusted_independent_issuer",
  serverValidated:true,signatureVerified:true,documentGenuine:true,
  trustedProofReplayKey:"a".repeat(64),...patch
});
const pad=(patch={})=>async()=>({
  uid,verificationId,proofKind:"validated_presentation_attack_detection",
  serverValidated:true,signatureVerified:true,livePersonConfirmed:true,
  trustedProofReplayKey:"b".repeat(64),...patch
});
const options=()=>({
  enabled:true,faceOnly:false,aiDecision:"manual_review",
  uid,requestId,verificationId,screening:screening(),
  assets:{front:media("front"),back:media("back"),selfie:media("selfie")}
});
async function assessment(){
  return assess({
    screening:screening(),face:face(),attempt:attempt(),
    issuerValidator:issuer(),padValidator:pad()
  });
}
test("explicitly validated issuer, PAD and calibrated face allow automatic completion only when enabled",async()=>{
  const verified=await assessment();
  assert.equal(verified.eligible,true);
  const result=complete({...options(),assessment:verified});
  assert.deepEqual(result,{
    eligible:true,reason:"trusted_issuer_pad_and_face_validated",
    trustedProofReplayKeys:{issuer:"a".repeat(64),pad:"b".repeat(64)},
  });
});
test("default OFF: full provider proofs do not automatically grant privileges",async()=>{
  const settings=options();delete settings.enabled;
  const result=complete({...settings,assessment:await assessment()});
  assert.deepEqual(result,{eligible:false,reason:"trusted_automatic_verification_disabled"});
});
test("face-only always requires independent Admin regardless of trusted mock provider",async()=>{
  const result=complete({...options(),faceOnly:true,assessment:await assessment()});
  assert.equal(result.eligible,false);
  assert.equal(result.reason,"face_only_requires_independent_admin_review");
});
test("same-person score alone does not promote an unvalidated Resident",()=>{
  const result=complete({...options(),assessment:{matchScore:0.999,faceComparisonPassed:true}});
  assert.equal(result.reason,"trusted_independent_provider_proofs_missing");
});
test("AI says verified but server has no attestations: stays Admin review",async()=>{
  const out=await assess({screening:screening(),face:face(),attempt:attempt()});
  assert.equal(out.eligible,false);
  assert.equal(complete({...options(),assessment:out,aiDecision:"verified"}).eligible,false);
});
test("expired, missing or invalid separate provider attestations always block",async()=>{
  for(const adapters of [
    {issuerValidator:issuer(),padValidator:pad({signatureVerified:false})},
    {issuerValidator:issuer({documentGenuine:false}),padValidator:pad()},
    {issuerValidator:issuer({verificationId:"oldAttempt"}),padValidator:pad()},
    {issuerValidator:issuer(),padValidator:pad({uid:"otherUser"})},
    {issuerValidator:issuer(),padValidator:async()=>{throw Error("provider offline")}},
  ]){
    const result=await assess({screening:screening(),face:face(),attempt:attempt(),...adapters});
    assert.equal(result.eligible,false);
    assert.equal(complete({...options(),assessment:result}).eligible,false);
  }
});
function blocked(name,patch,expected){
  test(name,async()=>{
    const fixture=options();
    patch(fixture);
    const result=complete({...fixture,assessment:await assessment()});
    assert.equal(result.eligible,false);
    if(expected)assert.equal(result.reason,expected);
  });
}
blocked("AI decision failed despite apparently valid proof",x=>x.aiDecision="failed","ai_comparison_failed_or_unsupported");
blocked("unrecognized government ID",x=>x.screening.status="mismatch","selected_government_id_not_recognized");
blocked("unsupported school ID",x=>x.screening.declaredIdType="school_id","selected_government_id_not_recognized");
blocked("missing evidence",x=>x.assets=null,"consented_private_evidence_missing");
blocked("missing front image",x=>delete x.assets.front,"missing_or_untrusted_private_front");
blocked("missing back image",x=>delete x.assets.back,"missing_or_untrusted_private_back");
blocked("missing selfie",x=>delete x.assets.selfie,"missing_or_untrusted_private_selfie");
blocked("public ID upload is not accepted",x=>x.assets.front.deliveryType="upload","missing_or_untrusted_private_front");
blocked("wrong account photos rejected",x=>x.assets.selfie.publicId="volunserve/identity-private/otherUser/stale/selfie","missing_or_untrusted_private_selfie");
blocked("wrong attempt photos rejected",x=>x.assets.back.publicId="volunserve/identity-private/syntheticResident123/previous/back","missing_or_untrusted_private_back");
blocked("invalid request identifier rejected",x=>x.requestId="../public","invalid_verification_identity");
blocked("unsupported SVG image format rejected",x=>x.assets.selfie.format="svg","missing_or_untrusted_private_selfie");
test("passport pathway does not require ID backside when valid independent proofs exist",async()=>{
  const fixture=options();
  fixture.screening.declaredIdType="passport";
  fixture.screening.detectedIdType="passport";
  delete fixture.assets.back;
  assert.equal(complete({...fixture,assessment:await assessment()}).eligible,true);
});
test("production route keeps existing issuer/PAD provider integrations disconnected and failed face proof",()=>{
  const src=fs.readFileSync("backend/server.js","utf8");
  const start=src.indexOf('["/api/identity/verify", "/api/identity/verify-with-evidence", "/api/identity/verify-face-only"]');
  const stop=src.indexOf('function identityAdminTimestampIso',start);
  assert(start>0 && stop>start);
  const route=src.slice(start,stop);
  assert(route.includes('result: "not_validated"'));
  assert(route.includes('algorithmValidated: false'));
  assert(route.includes('freshCapture: false'));
  assert(!route.includes('issuerValidator: aiResult'));
  assert(!route.includes('padValidator: aiResult'));
  assert(route.includes('VOLUNSERVE_TRUSTED_AUTO_VERIFY_ENABLED === "true"'));
  assert(route.includes('resolveTrustedAutomaticCompletion({'));
  assert(route.includes('identityVerified: autoCompletion.eligible'));
  assert(route.includes('identityAutomationEvents'));
  assert(route.includes('transaction.create('));
  assert(route.includes('identityVerifiedBy: autoCompletion.eligible'));
  // Verifying the actual provider integration is OUTSIDE this synthetic test.
  // With current backend adapter inputs the policy cannot produce eligibility.
});
