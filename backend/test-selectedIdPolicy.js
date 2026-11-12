"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {selectedIdRecognized, enforceSelectedIdDecision, blurryNationalIdNeedsReview, classifyIdentityReviewTrack} = require("./selectedIdPolicy");
const valid = type => ({
  status:"text_consistent_unverified", declaredIdType:type,
  detectedIdType:type, authenticityVerified:false,
  backSideProvided:type!=="passport", backSideScreened:type!=="passport",
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
test("non-passport cannot bypass missing-back screening even with matching ID text",()=>{
  for (const type of ["national_id", "drivers_license", "umid", "prc_id"]) {
    const incomplete={...valid(type),backSideProvided:false,backSideScreened:false};
    assert.equal(selectedIdRecognized(incomplete),false);
    assert.equal(enforceSelectedIdDecision("verified",incomplete,true),"failed");
  }
  assert.equal(selectedIdRecognized(valid("passport")),true);
});
test("duplicate side OCR warning cannot pass as a recognized government ID",()=>{
  const candidate={...valid("national_id"),warningCodes:["document_duplicate_side_text"]};
  assert.equal(selectedIdRecognized(candidate),false);
  assert.equal(enforceSelectedIdDecision("verified",candidate,true),"failed");
});

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
test("priority review requires confirmed OCR name, birthday and barangay, never auto-verification",()=>{
 const good={status:"text_consistent_unverified",declaredIdType:"national_id",detectedIdType:"national_id",
   profileNameCheck:"possible_match",profileBirthDateCheck:"possible_match",profileAddressCheck:"possible_match",
   imageQualityStatus:"adequate",authenticityVerified:false,
   backSideProvided:true,backSideScreened:true};
 assert.equal(selectedIdRecognized(good),true);
 assert.equal(enforceSelectedIdDecision("verified",good,false),"manual_review");
 assert.equal(classifyIdentityReviewTrack({screening:good,decision:"manual_review",idImageQualityScore:.87}),"priority_admin_review");
 assert.equal(classifyIdentityReviewTrack({screening:{...good,profileNameCheck:"inconclusive"},decision:"manual_review",idImageQualityScore:.87}),"standard_admin_review");
 assert.equal(classifyIdentityReviewTrack({screening:{...good,profileBirthDateCheck:"not_checked"},decision:"manual_review",idImageQualityScore:.87}),"standard_admin_review");
 assert.equal(classifyIdentityReviewTrack({screening:{...good,profileAddressCheck:"inconclusive"},decision:"manual_review",idImageQualityScore:.87}),"standard_admin_review");
 assert.equal(classifyIdentityReviewTrack({screening:good,decision:"manual_review",idImageQualityScore:.2}),"standard_admin_review");
});


test("AI side mismatch cannot be bypassed by an otherwise recognized ID or face match",()=>{
 for(const warning of [
   "document_front_back_swapped",
   "document_front_side_conflict",
   "document_back_looks_like_front",
 ]) {
   const result={...valid("national_id"),warningCodes:[warning]};
   assert.equal(selectedIdRecognized(result),false);
   assert.equal(enforceSelectedIdDecision("verified",result,true),"failed");
   assert.equal(enforceSelectedIdDecision("manual_review",result,false),"failed");
 }
});

test("back/front orientation warnings cannot take blurry National ID review exception",()=>{
 for(const warning of [
   "document_front_back_swapped",
   "document_front_side_conflict",
   "document_back_looks_like_front",
 ]) {
   const result={...blur,warningCodes:["low_document_image_quality",warning]};
   assert.equal(blurryNationalIdNeedsReview(result),false);
   assert.equal(enforceSelectedIdDecision("manual_review",result,false),"failed");
 }
});


test("birthday OCR possible conflict prevents priority review and auto-grant",()=>{
 const screening={
   ...valid("national_id"),
   profileBirthDateCheck:"possible_conflict",
   profileNameCheck:"possible_match",
   imageQualityStatus:"adequate",
 };
 assert.equal(selectedIdRecognized(screening),false); // Unresolved DOB blocks approval.
 assert.equal(enforceSelectedIdDecision("verified",screening,true),"manual_review");
 assert.equal(enforceSelectedIdDecision("manual_review",screening,true),"manual_review");
 assert.equal(classifyIdentityReviewTrack({screening,decision:"manual_review",idImageQualityScore:.95}),
   "standard_admin_review");
});

test("even malicious perfect issuer/liveness claims cannot auto-verify without approved integration",()=>{
 const screening={
   ...valid("national_id"),
   authenticityVerified:true,
   issuerAuthenticityStatus:"verified",
   presentationAttackStatus:"validated",
 };
 assert.equal(enforceSelectedIdDecision("verified",screening,true),"manual_review");
});

test("older profile with no saved birthday does not count as birthday mismatch",()=>{
 const screening={...valid("national_id"),profileBirthDateCheck:"not_checked"};
 assert.equal(enforceSelectedIdDecision("manual_review",screening,false),"manual_review");
});

test("contradictory positive OCR plus warning is never treated as a recognized government ID",()=>{
  const contradictoryWarnings=[
    "school_id_not_supported",
    "document_back_type_conflict",
    "selected_id_type_conflicts_with_ocr",
    "multiple_document_type_signals",
    "ocr_unavailable",
    "document_front_type_inconclusive",
    "document_back_required",
    "document_duplicate_side_text",
    "low_document_image_quality",
    "unexpected_untrusted_warning",
  ];
  for (const type of ["national_id","drivers_license","passport","umid","prc_id"]) {
    for (const warning of contradictoryWarnings) {
      const forged={...valid(type),warningCodes:[warning]};
      assert.equal(selectedIdRecognized(forged),false,`${type} should reject ${warning}`);
      assert.equal(enforceSelectedIdDecision("verified",forged,true),"failed");
      assert.equal(enforceSelectedIdDecision("manual_review",forged,false),"failed");
    }
  }
});

test("malformed AI warning values never become a valid government ID",()=>{
  for (const warnings of ["school_id_not_supported",{0:"school_id_not_supported"},null,42]) {
    const forged={...valid("national_id"),warningCodes:warnings};
    assert.equal(selectedIdRecognized(forged),false);
    assert.equal(enforceSelectedIdDecision("verified",forged,true),"failed");
  }
});

test("blurry National ID human-review exception refuses any conflicting or unknown warning",()=>{
  const contradicting=[
    "school_id_not_supported",
    "document_back_type_conflict",
    "document_back_required",
    "multiple_document_type_signals",
    "selected_id_type_conflicts_with_ocr",
    "ocr_unavailable",
    "document_front_back_swapped",
    "document_front_side_conflict",
    "document_back_looks_like_front",
    "unexpected_untrusted_warning",
  ];
  for(const warning of contradicting){
    const forged={...blur,warningCodes:[...blur.warningCodes,warning]};
    assert.equal(blurryNationalIdNeedsReview(forged),false,warning);
    assert.equal(enforceSelectedIdDecision("manual_review",forged,false),"failed");
  }
  // Allow only documented blur/uncertain OCR hints for human review;
  // this NEVER means that an issuer or a face was authenticated.
  const accepted={...blur,warningCodes:[
    "low_document_image_quality","document_front_type_inconclusive",
    "document_back_ocr_inconclusive",
  ]};
  assert.equal(blurryNationalIdNeedsReview(accepted),true);
  assert.equal(enforceSelectedIdDecision("manual_review",accepted,false),"manual_review");
  assert.equal(enforceSelectedIdDecision("verified",accepted,true),"failed");
});
