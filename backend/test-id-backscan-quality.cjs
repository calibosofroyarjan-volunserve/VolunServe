"use strict";
/** Fully synthetic tests. Extract and exercise actual backend sanitizer. */
const { test }=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const {selectedIdRecognized,enforceSelectedIdDecision}=require("./selectedIdPolicy");

const src=fs.readFileSync("backend/server.js","utf8");
const start=src.indexOf("function normalizeIdDocumentScreening(value) {");
const end=src.indexOf("\nfunction numberOrNull(",start);
assert(start>=0&&end>start,"Sanitizer function not found");
const sanitizer=vm.runInNewContext(src.slice(start,end)+"\nnormalizeIdDocumentScreening",{});

const valid={
  status:"text_consistent_unverified",declaredIdType:"national_id",
  detectedIdType:"national_id",warningCodes:[],
  backSideProvided:true,backSideScreened:true,
  imageQualityStatus:"adequate",backImageQualityStatus:"adequate",
};
test("only independently adequately checked back is eligible for Admin consideration",()=>{
  assert.equal(selectedIdRecognized(sanitizer(valid)),true);
  for(const quality of ["low","unknown","not_checked",null]){
    const candidate=sanitizer({...valid,backImageQualityStatus:quality});
    assert.equal(selectedIdRecognized(candidate),false,String(quality));
    assert.notEqual(enforceSelectedIdDecision("verified",candidate,true),"verified");
  }
});
test("new OCR back evidence and image-quality warnings survive sanitization",()=>{
  for(const reason of [
    "document_back_evidence_inconclusive",
    "document_back_layout_inconclusive",
    "low_document_back_image_quality",
    "document_back_image_quality_unavailable",
    "document_image_quality_unavailable",
  ]){
    const candidate=sanitizer({...valid,warningCodes:[reason]});
    assert(candidate.warningCodes.includes(reason),"lost "+reason);
    assert.equal(selectedIdRecognized(candidate),false);
  }
});
test("unknown front image quality is not recognized for Admin verification",()=>{
  for(const quality of ["unknown","low"]) {
    const candidate=sanitizer({...valid,imageQualityStatus:quality});
    assert.equal(selectedIdRecognized(candidate),false,quality);
  }
});
test("untrusted OCR/media fields never reach resident or Admin-visible report",()=>{
  const doc=sanitizer({...valid,
    idNumber:"0123456789",ocrText:"SYNTHETIC PRIVATE PERSON",
    backOcrText:"PHYSICAL CARD DATA",imageBase64:"SYNTHETICIMGDATA",
    faceTemplate:"SYNTHETICFACE",address:"SECRET STREET",
  });
  const json=JSON.stringify(doc);
  for(const secret of ["0123456789","SYNTHETIC PRIVATE PERSON","PHYSICAL CARD DATA",
      "SYNTHETICIMGDATA","SYNTHETICFACE","SECRET STREET"]){
    assert(!json.includes(secret),"Leaked "+secret);
  }
  assert.equal(doc.authenticityVerified,false);
  assert.equal(doc.livenessVerified,false);
  assert.equal(doc.manualReviewRequired,true);
});
test("passports need no reverse-side photo and retain independent issuer check",()=>{
  const doc=sanitizer({...valid,declaredIdType:"passport",
    detectedIdType:"passport",backSideProvided:false,backSideScreened:false,
    backImageQualityStatus:"not_required"});
  assert.equal(selectedIdRecognized(doc),true);
  assert.equal(enforceSelectedIdDecision("verified",doc,true),"manual_review");
});
