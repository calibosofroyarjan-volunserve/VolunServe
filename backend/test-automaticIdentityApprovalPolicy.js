"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {decideAutomaticIdentityApproval}=require("./automaticIdentityApprovalPolicy");

function completeProofs() {
  const verificationId="synthetic-test-attempt-123";
  return {
    screening:{
      status:"text_consistent_unverified",
      declaredIdType:"national_id",
      detectedIdType:"national_id",
      imageQualityStatus:"adequate",
      profileNameCheck:"possible_match",
      profileBirthDateCheck:"possible_match",
      backSideScreened:true,
      warningCodes:[],
    },
    face:{
      result:"match",algorithmValidated:true,calibrationValidated:true,
      samePersonAssertion:true,verificationId,
    },
    attempt:{freshCapture:true,consentedEvidenceAvailable:true,verificationId},
    issuerAttestation:{
      proofKind:"trusted_independent_issuer",signatureVerified:true,
      documentGenuine:true,verificationId,
    },
    padAttestation:{
      proofKind:"validated_presentation_attack_detection",
      signatureVerified:true,livePersonConfirmed:true,verificationId,
    },
    serverVerifiedProofs:true,
  };
}

test("existing production AI-only result NEVER grants automatic identity",()=>{
  const result=decideAutomaticIdentityApproval({
    screening:completeProofs().screening,
    face:{matchScore:0.99,decision:"manual_review",livenessImplemented:false},
  });
  assert.equal(result.eligible,false);
  assert.equal(result.decision,"pending_admin_review");
});

test("ID scan plus user-supplied AI authenticity/liveness flags NEVER passes",()=>{
  const proofs=completeProofs();
  delete proofs.issuerAttestation;
  delete proofs.padAttestation;
  proofs.aiResult={authenticityVerified:true,livenessImplemented:true,matchScore:0.99};
  assert.equal(decideAutomaticIdentityApproval(proofs).eligible,false);
});

test("even complete-looking attestations are rejected without server-side validation",()=>{
  const proofs=completeProofs();
  proofs.serverVerifiedProofs=false;
  assert.equal(decideAutomaticIdentityApproval(proofs).eligible,false);
});

test("clear face match without issuer check cannot auto-verify",()=>{
  const proofs=completeProofs();
  delete proofs.issuerAttestation;
  assert.equal(decideAutomaticIdentityApproval(proofs).reason,"independent_issuer_proof_missing");
});

test("clear face match without independent PAD cannot auto-verify",()=>{
  const proofs=completeProofs();
  delete proofs.padAttestation;
  assert.equal(decideAutomaticIdentityApproval(proofs).reason,"validated_liveness_missing");
});

test("matching OCR plus full proofs but name, DOB, or document conflict cannot auto-verify",()=>{
  for(const screeningChange of [
    {profileNameCheck:"inconclusive"},
    {profileNameCheck:"possible_conflict"},
    {profileBirthDateCheck:"possible_conflict"},
    {profileBirthDateCheck:"not_checked"},
    {status:"mismatch"},
    {detectedIdType:"school_id"},
    {backSideScreened:false},
    {warningCodes:["document_front_back_swapped"]},
    {imageQualityStatus:"low"},
  ]){
    const proofs=completeProofs();
    Object.assign(proofs.screening,screeningChange);
    assert.equal(decideAutomaticIdentityApproval(proofs).eligible,false,
      JSON.stringify(screeningChange));
  }
});

test("unsigned or attempt-mismatched document and PAD attestations cannot pass",()=>{
  for(const prop of ["issuerAttestation","padAttestation"]){
    for(const change of [{signatureVerified:false},{verificationId:"other-attempt"}]){
      const proofs=completeProofs();
      Object.assign(proofs[prop],change);
      assert.equal(decideAutomaticIdentityApproval(proofs).eligible,false);
    }
  }
});

test("unvalidated model or stale capture cannot pass even with full issuer proof",()=>{
  for(const change of [
    {key:"face",data:{calibrationValidated:false}},
    {key:"face",data:{algorithmValidated:false}},
    {key:"face",data:{samePersonAssertion:false}},
    {key:"attempt",data:{freshCapture:false}},
    {key:"attempt",data:{consentedEvidenceAvailable:false}},
  ]){
    const proofs=completeProofs();
    Object.assign(proofs[change.key],change.data);
    assert.equal(decideAutomaticIdentityApproval(proofs).eligible,false);
  }
});

test("with independently validated, same-attempt evidence only: auto approval eligible",()=>{
  const result=decideAutomaticIdentityApproval(completeProofs());
  assert.deepEqual(result,{
    eligible:true,
    decision:"auto_verified",
    reason:"all_independent_proofs_validated",
  });
});
