"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {evaluateAutoApprovalReadiness}=require("./identityAutoApprovalPolicy");

const good={
  screening:{
    declaredIdType:"national_id",detectedIdType:"national_id",
    status:"text_consistent_unverified",imageQualityStatus:"adequate",
    profileNameCheck:"possible_match",profileBirthDateCheck:"possible_match",
    warningCodes:[],
  },
  faceMatchPassed:true, userIdentityConsistent:true,
  sessionBindingVerified:true,
  trustedIssuerEvidence:{
    issuerRegistryVerified:true,signatureValidated:true,boundToSession:true,
  },
  trustedPadEvidence:{
    presentationAttackPassed:true,independentlyValidated:true,
    signatureValidated:true,boundToSession:true,
  },
};
test("all synthetic positive clues still cannot enable production auto Verified",()=>{
  const r=evaluateAutoApprovalReadiness(good);
  assert.equal(r.eligible,false);
  assert.equal(r.automaticApprovalActive,false);
  assert.equal(r.decision,"admin_review");
  assert.equal(r.requirementsMet,true);
});
test("OCR+face only, without independent issuer and PAD, not eligible",()=>{
 const r=evaluateAutoApprovalReadiness({
  ...good,trustedIssuerEvidence:null,trustedPadEvidence:null,
 });
 assert.equal(r.eligible,false);
 assert.equal(r.missingRequirements.includes("governmentIssuerCheck"),true);
 assert.equal(r.missingRequirements.includes("independentValidatedAntiSpoofing"),true);
});
test("different account holder, fake ID type, and blurred images fail closed",()=>{
 for(const s of [
  {...good.screening,profileNameCheck:"possible_conflict"},
  {...good.screening,status:"unsupported"},
  {...good.screening,imageQualityStatus:"low"},
 ]){
  const r=evaluateAutoApprovalReadiness({...good,screening:s});
  assert.equal(r.eligible,false);
  assert.equal(r.requirementsMet,false);
 }
});
test("independent evidence must be session-bound and signed",()=>{
 for (const issuer of [
   {...good.trustedIssuerEvidence,signatureValidated:false},
   {...good.trustedIssuerEvidence,boundToSession:false},
 ]) assert.equal(evaluateAutoApprovalReadiness({...good,trustedIssuerEvidence:issuer}).requirementsMet,false);
 for (const pad of [
   {...good.trustedPadEvidence,signatureValidated:false},
   {...good.trustedPadEvidence,independentlyValidated:false},
 ])assert.equal(evaluateAutoApprovalReadiness({...good,trustedPadEvidence:pad}).requirementsMet,false);
});
test("no details or biometric fields are echoed by policy",()=>{
 const r=evaluateAutoApprovalReadiness({...good,governmentIdNumber:"sensitive test",faceTemplate:"secret"});
 assert.equal(JSON.stringify(r).includes("sensitive test"),false);
 assert.equal(JSON.stringify(r).includes("secret"),false);
});
