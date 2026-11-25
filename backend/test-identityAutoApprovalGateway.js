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
    serverValidated:true,trustedProofReplayKey:"a".repeat(64),
    ...opts,
  });
}
function pad(opts={}) {
  return async ({uid,verificationId})=>({
    uid,verificationId,
    proofKind:"validated_presentation_attack_detection",
    signatureVerified:true,livePersonConfirmed:true,
    serverValidated:true,trustedProofReplayKey:"b".repeat(64),
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
test("independent provider attestations without one-time replay digests do not qualify",async()=>{
  const out=await assessAutomaticIdentityApproval({
    ...fixture(),
    issuerValidator:issuer({trustedProofReplayKey:undefined}),
    padValidator:pad(),
  });
  assert.equal(out.eligible,false);
  assert.equal(out.reason,"trusted_proof_replay_receipts_missing");
});
test("duplicate proof receipt values fail closed, even with matching user and face",async()=>{
  const out=await assessAutomaticIdentityApproval({
    ...fixture(),
    issuerValidator:issuer(),padValidator:pad({trustedProofReplayKey:"a".repeat(64)}),
  });
  assert.equal(out.eligible,false);
  assert.equal(out.reason,"trusted_proof_replay_receipts_missing");
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


test("real submission route grants auto access only through disabled-by-default trusted gateway",()=>{
 const fs=require("node:fs");
 const source=fs.readFileSync("backend/server.js","utf8");
 const start=source.indexOf('["/api/identity/verify", "/api/identity/verify-with-evidence", "/api/identity/verify-face-only"]');
 const end=source.indexOf("function identityAdminTimestampIso",start);
 assert.ok(start>0 && end>start, "actual identity submit boundary exists");
 const route=source.slice(start,end);
 assert.match(route,/await assessAutomaticIdentityApproval\(/);
 assert.match(route,/automaticVerificationEligible: automaticApproval\.eligible/);
 assert.match(route,/automaticVerificationReason: automaticApproval\.reason/);
 assert.match(route,/process\.env\.VOLUNSERVE_TRUSTED_AUTO_VERIFY_ENABLED === "true"/);
 assert.match(route,/resolveTrustedAutomaticCompletion\(/);
 assert.match(route,/identityVerified: autoCompletion\.eligible/);
 assert.match(route,/result: "not_validated"/);
 assert.match(route,/algorithmValidated: false/);
 assert.match(route,/freshCapture: false/);
 assert.match(route,/identityAutomationEvents/);
 assert.match(route,/requiresPrivateEvidence/);
 assert.match(route,/db\.runTransaction/);
 assert.doesNotMatch(route,/issuerValidator:\s*aiResult/);
 assert.doesNotMatch(route,/padValidator:\s*aiResult/);
});
