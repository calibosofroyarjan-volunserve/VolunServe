"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {selectedIdRecognized, enforceSelectedIdDecision, blurryNationalIdNeedsReview, classifyIdentityReviewTrack} = require("./selectedIdPolicy");
const valid = type => ({
  status:"text_consistent_unverified", declaredIdType:type,
  detectedIdType:type, authenticityVerified:false,
});
for (const type of ["national_id","drivers_license","passport","umid","prc_id"]) {
  test("recognizes selected "+type+" type without claiming authenticity", () => {
    assert.equal(selectedIdRecognized(valid(type)),true);
    assert.equal(enforceSelectedIdDecision("verified",valid(type),false),"manual_review");
    assert.equal(enforceSelectedIdDecision("manual_review",valid(type),false),"manual_review");
  });
}
for (const [label,screening] of [
  ["school ID",{status:"unsupported",declaredIdType:"national_id",detectedIdType:null}],
  ["wrong type",{status:"mismatch",declaredIdType:"national_id",detectedIdType:"drivers_license"}],
  ["unreadable",{status:"inconclusive",declaredIdType:"national_id",detectedIdType:null}],
  ["generic other",{status:"text_consistent_unverified",declaredIdType:"other_government_id",detectedIdType:"other_government_id"}],
  ["missing",null],
]) {
  test("rejects "+label+" even with perfect face match",()=> {
    assert.equal(selectedIdRecognized(screening),false);
    assert.equal(enforceSelectedIdDecision("verified",screening,true),"failed");
    assert.equal(enforceSelectedIdDecision("manual_review",screening,false),"failed");
  });
}

for (const type of ["national_id","drivers_license","passport","umid","prc_id"]) {
  for (const status of ["unsupported","inconclusive","mismatch"]) {
    test("selected "+type+" with "+status+" OCR status is always rejected",()=>{
      const bad={status,declaredIdType:type,detectedIdType:
        status==="mismatch"?"school_id":null,authenticityVerified:false};
      assert.equal(selectedIdRecognized(bad),false);
      assert.equal(enforceSelectedIdDecision("verified",bad,true),"failed");
      assert.equal(enforceSelectedIdDecision("manual_review",bad,false),"failed");
    });
  }
}
test("declared and detected government ID must be the same even if OCR claims consistency",()=>{
  const wrong={status:"text_consistent_unverified",declaredIdType:"national_id",detectedIdType:"passport",authenticityVerified:false};
  assert.equal(selectedIdRecognized(wrong),false);
  assert.equal(enforceSelectedIdDecision("verified",wrong,true),"failed");
});

const blur = {
  status:"inconclusive",declaredIdType:"national_id",detectedIdType:null,
  imageQualityStatus:"low",warningCodes:["document_type_not_recognized","low_document_image_quality"],
  profileNameCheck:"inconclusive",authenticityVerified:false
};
test("blurry claimed National ID routes to manual review but never verified",()=>{
 assert.equal(blurryNationalIdNeedsReview(blur),true);
 assert.equal(enforceSelectedIdDecision("manual_review",blur,false),"manual_review");
 assert.equal(enforceSelectedIdDecision("verified",blur,true),"failed");
 assert.equal(selectedIdRecognized(blur),false);
 assert.equal(classifyIdentityReviewTrack({screening:blur,decision:"manual_review"}),"blurry_id_review");
});
test("even readable National ID heading with low quality cannot be Admin approved",()=>{
 const blurryReadable={...blur,status:"text_consistent_unverified",detectedIdType:"national_id"};
 assert.equal(selectedIdRecognized(blurryReadable),false);
 assert.equal(enforceSelectedIdDecision("manual_review",blurryReadable,false),"manual_review");
 assert.equal(classifyIdentityReviewTrack({screening:blurryReadable,decision:"manual_review"}),"blurry_id_review");
});
test("unsupported ID cannot exploit blur route",()=>{
 for(const bad of [
   {...blur,status:"unsupported",warningCodes:["school_id_not_supported","low_document_image_quality"]},
   {...blur,status:"mismatch",detectedIdType:"drivers_license"},
   {...blur,declaredIdType:"passport"},
   {...blur,warningCodes:["low_document_image_quality","ocr_unavailable"]},
 ]){
   assert.equal(blurryNationalIdNeedsReview(bad),false);
   assert.equal(enforceSelectedIdDecision("manual_review",bad,false),"failed");
 }
});
test("clear selected National ID and possible profile name match gets PRIORITY not verification",()=>{
 const good={status:"text_consistent_unverified",declaredIdType:"national_id",detectedIdType:"national_id",
   profileNameCheck:"possible_match",imageQualityStatus:"adequate",authenticityVerified:false};
 assert.equal(selectedIdRecognized(good),true);
 assert.equal(enforceSelectedIdDecision("verified",good,false),"manual_review");
 assert.equal(classifyIdentityReviewTrack({screening:good,decision:"manual_review",idImageQualityScore:.87}),"priority_admin_review");
 assert.equal(classifyIdentityReviewTrack({screening:{...good,profileNameCheck:"inconclusive"},decision:"manual_review",idImageQualityScore:.87}),"standard_admin_review");
 assert.equal(classifyIdentityReviewTrack({screening:good,decision:"manual_review",idImageQualityScore:.2}),"standard_admin_review");
});
