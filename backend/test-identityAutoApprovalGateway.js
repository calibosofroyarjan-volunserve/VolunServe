"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const {assessAutomaticIdentityApproval}=require("./identityAutoApprovalGateway");

const uid="synthetic-test-user", verificationId="synthetic-test-attempt";
function fixture() {
  return {
    screening: {
      status:"text_consistent_unverified",declaredIdType:"national_id",
      detectedIdType:"national_id",imageQualityStatus:"adequate",
      profileNameCheck:"possible_match",profileBirthDateCheck:"possible_match",
      backSideScreened:true,warningCodes:[],
    },
    face:{
      result:"match",algorithmValidated:true,calibrationValidated:true,
      samePersonAssertion:true,verificationId,
    },
    attempt:{
      uid,verificationId,freshCapture:true,consentedEvidenceAvailable:true,
    },
  };
}
function issuer(opts={}) {
  return async ({uid,verificationId})=>({
    uid,verificationId,
    proofKind:"trusted_independent_issuer",
    signatureVerified:true,documentGenuine:true,
    serverValidated:true,
    ...opts,
  });
}
function pad(opts={}) {
  return async ({uid,verificationId})=>({
    uid,verificationId,
    proofKind:"validated_presentation_attack_detection",
    signatureVerified:true,livePersonConfirmed:true,
    serverValidated:true,
    ...opts,
  });
}
test("current production: no issuer or PAD provider configured always queues Admin",async()=>{
 const out=await assessAutomaticIdentityApproval(fixture());
 assert.deepEqual(out,{eligible:false,decision:"pending_admin_review",
   reason:"independent_provider_validators_not_configured"});
});
test("issuer alone still queues, never Verified",async()=>{
 const out=await assessAutomaticIdentityApproval({...fixture(),issuerValidator:issuer()});
 assert.equal(out.eligible,false);
});
test("PAD alone still queues, never Verified",async()=>{
 const out=await assessAutomaticIdentityApproval({...fixture(),padValidator:pad()});
 assert.equal(out.eligible,false);
});
test("same-attempt validated independent proofs can become eligible",async()=>{
 const out=await assessAutomaticIdentityApproval({
  ...fixture(),issuerValidator:issuer(),padValidator:pad(),
 });
 assert.equal(out.eligible,true);
 assert.equal(out.decision,"auto_verified");
});
test("stale issuer proof cannot be used for another account/verification",async()=>{
 for(const patch of [{uid:"other-user"},{verificationId:"old-attempt"}]){
  const out=await assessAutomaticIdentityApproval({
    ...fixture(),issuerValidator:issuer(patch),padValidator:pad(),
  });
  assert.equal(out.eligible,false);
  assert.equal(out.reason,"provider_evidence_attempt_mismatch");
 }
});
test("unvalidated or unsigned providers never auto approve",async()=>{
 for(const opts of [
   {issuerValidator:issuer({serverValidated:false}),padValidator:pad()},
   {issuerValidator:issuer(),padValidator:pad({serverValidated:false})},
   {issuerValidator:issuer({signatureVerified:false}),padValidator:pad()},
   {issuerValidator:issuer(),padValidator:pad({signatureVerified:false})},
   {issuerValidator:issuer({documentGenuine:false}),padValidator:pad()},
   {issuerValidator:issuer(),padValidator:pad({livePersonConfirmed:false})},
 ]){
  const out=await assessAutomaticIdentityApproval({...fixture(),...opts});
  assert.equal(out.eligible,false);
  assert.equal(out.decision,"pending_admin_review");
 }
});
test("provider outages always queue Admin, never accidentally Verified",async()=>{
 const failing=async()=>{throw new Error("private auth / provider outage");};
 const out=await assessAutomaticIdentityApproval({
  ...fixture(),issuerValidator:issuer(),padValidator:failing,
 });
 assert.equal(out.eligible,false);
 assert.equal(out.decision,"pending_admin_review");
});
test("face-score-only submission cannot obtain Verified access",async()=>{
 const v=fixture();
 v.face={matchScore:0.999,verificationId};
 const out=await assessAutomaticIdentityApproval({
  ...v,issuerValidator:issuer(),padValidator:pad(),
 });
 assert.equal(out.eligible,false);
});
