"use strict";
const {test} = require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const {classifyHybridDocumentPrecheck}=require("./identityHybridPrecheckDecision");

function screening(overrides={}) {
 return {declaredIdType:"national_id",detectedIdType:"national_id",
  status:"text_consistent_unverified",imageQualityStatus:"adequate",
  profileNameCheck:"possible_match",profileBirthDateCheck:"not_checked",
  warningCodes:[],backSideProvided:true,backSideScreened:true,...overrides};
}
test("clear selected National ID and matching name allows face only, never Verified",()=>{
 assert.deepEqual(classifyHybridDocumentPrecheck({screening:screening(),aiOutcome:"pass"}),
   {outcome:"pass",decision:"ready_for_face_scan",reviewTrack:"none"});
});
test("blurred unknown National ID with both sides queues Admin rescan",()=>{
 const s=screening({status:"inconclusive",detectedIdType:null,imageQualityStatus:"low",
  profileNameCheck:"inconclusive",warningCodes:["low_document_image_quality"]});
 assert.deepEqual(classifyHybridDocumentPrecheck({screening:s,aiOutcome:"review"}),
   {outcome:"review",decision:"pending_admin_review",reviewTrack:"blurry_id_review"});
});
test("unsupported or wrong document never queues or progresses",()=>{
 for(const s of [
  screening({status:"unsupported",detectedIdType:null,warningCodes:["school_id_not_supported"]}),
  screening({status:"mismatch",detectedIdType:"drivers_license"}),
  screening({warningCodes:["document_front_back_swapped"]}),
 ]) for(const o of ["pass","review"]){
  assert.equal(classifyHybridDocumentPrecheck({screening:s,aiOutcome:o}).outcome,"retry");
 }
});
test("DOB OCR mismatch is advisory for face stage, never auto Verified",()=>{
 const s=screening({profileBirthDateCheck:"possible_conflict"});
 assert.deepEqual(classifyHybridDocumentPrecheck({screening:s,aiOutcome:"pass"}),
  {outcome:"pass",decision:"ready_for_face_scan",reviewTrack:"none"});
 assert.equal(classifyHybridDocumentPrecheck({screening:s,aiOutcome:"retry"}).outcome,"retry");
});
test("explicit different account name never queues",()=>{
 const s=screening({profileNameCheck:"possible_conflict",imageQualityStatus:"low",
   warningCodes:["low_document_image_quality"]});
 assert.equal(classifyHybridDocumentPrecheck({screening:s,aiOutcome:"review"}).decision,"profile_mismatch");
 assert.equal(classifyHybridDocumentPrecheck({screening:s,aiOutcome:"pass"}).outcome,"retry");
});
test("missing account name cannot pass directly to face",()=>{
 const s=screening({profileNameCheck:"inconclusive"});
 assert.equal(classifyHybridDocumentPrecheck({screening:s,aiOutcome:"pass"}).outcome,"retry");
});
test("unreadable reverse or no back cannot queue manual review",()=>{
 for(const s of [
  screening({status:"inconclusive",imageQualityStatus:"low",detectedIdType:null,
    backSideScreened:false,warningCodes:["low_document_image_quality"]}),
  screening({status:"inconclusive",imageQualityStatus:"low",detectedIdType:null,
    warningCodes:["low_document_image_quality","document_back_ocr_inconclusive"]}),
 ])assert.equal(classifyHybridDocumentPrecheck({screening:s,aiOutcome:"review"}).outcome,"retry");
});
test("OCR result pass without detected government ID cannot grant face stage",()=>{
 const s=screening({status:"inconclusive",detectedIdType:null});
 assert.equal(classifyHybridDocumentPrecheck({screening:s,aiOutcome:"pass"}).outcome,"retry");
});
test("backend precheck route stays authenticated and uses Firestore atomically",()=>{
 const source=fs.readFileSync("server.js","utf8");
 const start=source.indexOf('"/api/identity/document/precheck"');
 const end=source.indexOf('"/api/identity/status"',start);
 assert.ok(start>0&&end>start);
 const route=source.slice(start,end);
 assert.match(route,/requireFirebaseUser/);
 assert.match(route,/x-volunserve-document-precheck-consent/);
 assert.match(route,/classifyHybridDocumentPrecheck/);
 assert.match(route,/db\.runTransaction/);
 assert.match(route,/verificationRef = db\.collection\("identityVerifications"\)\.doc\(uid\)/);
 assert.match(route,/verification\.requiresManualReview|existing\.requiresManualReview/);
 assert.match(route,/current\.requiresManualReview === true/);
 assert.match(route,/identityAttemptCount\(current\.aiAttemptCount\) >= MAX_IDENTITY_AI_ATTEMPTS/);
 assert.match(route,/current\.processingRequestId/);
 assert.match(route,/verificationMethod: "volunserve_ai_ocr_manual_review"/);
 assert.match(route,/status: "pending"/);
 assert.match(route,/identityVerified: false/);
 assert.doesNotMatch(route,/identityVerified:\s*true/);
 assert.doesNotMatch(route,/transaction\.create\(\s*db\.collection\("identityVerificationAttempts"\)/);
 assert.match(source,/if \(verification\.verificationMethod === "volunserve_ai_ocr_manual_review"\)/);
});
