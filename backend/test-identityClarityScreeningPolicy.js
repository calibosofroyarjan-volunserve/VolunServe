"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const {assessIdentityClarityScreening:triage}=require("./identityClarityScreeningPolicy");
const valid=()=>({
  declaredIdType:"national_id",detectedIdType:"national_id",
  status:"text_consistent_unverified",imageQualityStatus:"adequate",
  warningCodes:[],profileNameCheck:"possible_match",
  profileBirthDateCheck:"possible_match"
});
const run=(override={},decision="verified",faceOnly=false)=>
 triage({screening:{...valid(),...override},rawDecision:decision,faceOnly});
test("clear recognized govt ID + clear face match AUTO-PASSES photo screening only",()=>{
  assert.deepEqual(run(),{status:"auto_passed",reason:"clear_id_and_face_match"});
});
for(const type of ["national_id","drivers_license","passport","umid","prc_id"]){
  test(type+" recognized with clear match",()=>{
    assert.equal(run({declaredIdType:type,detectedIdType:type}).status,"auto_passed");
  });
}
for(const [description,fields,reason] of [
 ["blurry National ID",{imageQualityStatus:"low"},"blurry_id"],
 ["blurry driver license",{declaredIdType:"drivers_license",detectedIdType:"drivers_license",warningCodes:["low_document_image_quality"]},"blurry_id"],
 ["unknown quality",{imageQualityStatus:"unknown"},"quality_unconfirmed"],
 ["school ID",{status:"unsupported",warningCodes:["school_id_not_supported"]},"unsupported_document"],
 ["mismatched govt ID",{status:"mismatch"},"id_unrecognized_or_inconsistent"],
 ["front/back conflict",{warningCodes:["document_front_back_swapped"]},"document_warnings"],
 ["missing OCR recognition",{detectedIdType:null},"id_unrecognized_or_inconsistent"],
 ["DOB inconclusive",{profileBirthDateCheck:"not_checked"},"profile_consistency_unconfirmed"],
 ["name conflict",{profileNameCheck:"possible_conflict"},"profile_consistency_unconfirmed"],
]){
 test(description+" is never auto-passed",()=>{
  const out=run(fields);assert.notEqual(out.status,"auto_passed");assert.equal(out.reason,reason);
 });
}
test("face mismatch or uncertain AI face result requires human review",()=>{
 assert.equal(run({},"failed").status,"manual_review");
 assert.equal(run({},"manual_review").status,"manual_review");
});
test("original face-only no OCR/quality cannot claim clear ID even if face matches",()=>{
 const out=run({},"verified",true);
 assert.deepEqual(out,{status:"manual_review",reason:"original_face_only_lacks_id_quality"});
});
test("regression: clear scan cannot set Verified status, and blurry scan enters review",()=>{
 const code=fs.readFileSync("backend/server.js","utf8");
 assert.match(code,/const clarityScreening = assessIdentityClarityScreening\(/);
 assert.match(code,/documentScreening\.clarityScreeningStatus = clarityScreening\.status/);
 assert.match(code,/clarityScreening\.reason === "blurry_id"\s*\? "manual_review"/);
 assert.match(code,/clarityScreening\.status === "auto_passed"/);
 assert.match(code,/identityVerified: autoCompletion\.eligible/);
 assert.match(code,/enabled: process\.env\.VOLUNSERVE_TRUSTED_AUTO_VERIFY_ENABLED === "true"/);
 assert.doesNotMatch(code,/identityVerified: clarityScreening/);
});
