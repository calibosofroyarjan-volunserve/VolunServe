import {test} from "node:test";
import assert from "node:assert/strict";
import {
  availableMethods,reviewBucket,documentEligibleForAdminReview,
  canVerify,canRequireRetry,evidenceConflicts,screeningDescription,mrzDescription,
} from "./admin-review-guards.mjs";

const allowed=["national_id","drivers_license","passport","umid","prc_id"];
const base={
  status:"text_consistent_unverified",
  imageQualityStatus:"adequate",
  warningCodes:[],
  profileNameCheck:"possible_match",
  profileBirthDateCheck:"possible_match",
  passportMrzCheck:"checksum_consistent_unverified",
  passportMrzBirthDateCheck:"possible_match",
  backSideProvided:true,backSideScreened:true,
};
function screening(type="passport",extra={}) {
  return {
    ...base,declaredIdType:type,detectedIdType:type,...extra,
  };
}
function pending(doc=screening()) {
  return {uid:"synthetic_test_000001",status:"pending",requiresManualReview:true,
          identityVerified:false,documentScreening:doc};
}
const valid={review:pending(),method:"official_document_check",
             attested:true,notes:"I independently checked the official document.",busy:false};
test("only the five approved government types have issuer methods",()=>{
  for(const kind of allowed)assert(availableMethods(kind).length>0);
  for(const unknown of ["","school_id","employee_id","other_government_id","SCHOOL_ID",undefined]){
    assert.deepEqual(availableMethods(unknown),[]);
    // Passing undefined into a parameter with a default supplies passport,
    // so explicitly remove the type for this missing-evidence test.
    const doc=screening(unknown);
    if(unknown === undefined){doc.declaredIdType=undefined;doc.detectedIdType=undefined;}
    assert.equal(documentEligibleForAdminReview(doc),false);
  }
});
test("National ID requires independent PSA check; others must not use it",()=>{
  const nat=pending(screening("national_id"));
  assert.equal(canVerify({...valid,review:nat}),false);
  assert.equal(canVerify({...valid,review:nat,method:"psa_national_id_qr_check"}),true);
  for(const type of ["passport","drivers_license","umid","prc_id"]){
    assert.equal(canVerify({...valid,review:pending(screening(type)),
      method:"psa_national_id_qr_check"}),false);
  }
});
test("unresolved passport MRZ and birthday conflicts fail closed, including forged status",()=>{
  for(const data of [
    {passportMrzCheck:"checksum_inconsistent_or_ocr_error"},
    {passportMrzCheck:"multiple_candidates"},
    {passportMrzBirthDateCheck:"possible_conflict"},
    {profileBirthDateCheck:"possible_conflict"},
    {warningCodes:["passport_mrz_review_required"]},
    {warningCodes:["passport_mrz_profile_birth_date_conflict"]},
    {warningCodes:["school_id_not_supported"]},
  ]) {
    const doc=screening("passport",data);
    assert.equal(documentEligibleForAdminReview(doc),false,JSON.stringify(data));
    assert.equal(canVerify({...valid,review:pending(doc)}),false,JSON.stringify(data));
  }
});
test("nonpassport ID must supply both sides and clear quality",()=>{
  for(const type of ["national_id","drivers_license","umid","prc_id"]){
    assert.equal(documentEligibleForAdminReview(screening(type,{backSideProvided:false})),false);
    assert.equal(documentEligibleForAdminReview(screening(type,{backSideScreened:false})),false);
    assert.equal(documentEligibleForAdminReview(screening(type,{imageQualityStatus:"low"})),false);
  }
});
test("independent review attestation and notes are mandatory",()=>{
  assert.equal(canVerify(valid),true);
  for(const delta of [
    {attested:false},{method:""},{notes:"too short"},{notes:"x".repeat(1001)},
    {busy:true},{review:pending(screening("passport",{status:"inconclusive"}))},
    {review:{...pending(),status:"verified",identityVerified:true}},
  ])assert.equal(canVerify({...valid,...delta}),false);
});
test("Require Retry needs reason and a pending case, but not an issuer attestation",()=>{
  const doc=screening("passport",{passportMrzCheck:"multiple_candidates"});
  assert.equal(canRequireRetry({review:pending(doc),notes:"Retake passport bio page",busy:false}),true);
  assert.equal(canRequireRetry({review:pending(doc),notes:"bad",busy:false}),false);
  assert.equal(canRequireRetry({review:pending(doc),notes:"corrected scan",busy:true}),false);
  assert.equal(canRequireRetry({review:{status:"verified",identityVerified:true},notes:"corrected scan"}),false);
});
test("status filters and wording distinguish AI clues from authentication",()=>{
  assert.equal(reviewBucket(pending()),"pending");
  assert.equal(reviewBucket({status:"verified"}),"verified");
  assert.equal(reviewBucket({status:"failed"}),"retry_required");
  assert.equal(reviewBucket({status:"basic"}),"other");
  assert.match(screeningDescription(screening()),/unverified/i);
  assert.match(mrzDescription(screening()),/NOT authenticated/i);
  assert.match(screeningDescription(screening("passport",{passportMrzBirthDateCheck:"possible_conflict"})),/not proof of fraud/i);
  assert.equal(mrzDescription(screening("national_id")),null);
});
test("missing, unsupported or manipulated evidence never authorizes verify",()=>{
  for(const doc of [null,undefined,{},screening("school_id"),
    screening("passport",{status:"unsupported"}),
    screening("passport",{detectedIdType:"umid"}),
    screening("passport",{warningCodes:undefined})]){
    assert.equal(canVerify({...valid,review:{...pending(),documentScreening:doc}}),false);
  }
});
