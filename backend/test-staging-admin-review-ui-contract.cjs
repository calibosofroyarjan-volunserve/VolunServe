"use strict";
/** Synthetic, no-deploy contract for REAL Expo Admin screen + Node ID policy.
 * No accounts, ID media, Firebase, passwords, URLs, or browser requests.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const { selectedIdRecognized } = require("./selectedIdPolicy");

const src = fs.readFileSync("lib/identityAdminReviewGate.ts", "utf8");
const compiled = ts.transpileModule(src, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS,
  },
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.length || 0, 0, "Gate should transpile cleanly");
const moduleMock = {exports:{}};
vm.runInNewContext(compiled.outputText, {
  exports:moduleMock.exports, module:moduleMock,
  require:()=>{throw new Error("The pure UI guard must have no runtime imports");},
}, {filename:"identityAdminReviewGate.transpiled.js"});
const {adminReviewDocumentEligible, adminReviewStatusBucket} = moduleMock.exports;

const base = Object.freeze({
 declaredIdType:"national_id",
 detectedIdType:"national_id",
 status:"text_consistent_unverified",
 warningCodes:[],
 imageQualityStatus:"adequate",
 backImageQualityStatus:"adequate",
 backSideProvided:true,backSideScreened:true,
 profileBirthDateCheck:"possible_match",
 profileAddressCheck:"possible_match",
 profileNameCheck:"possible_match",
});

test("every supported recognized, legible no-warning ID is eligible for *manual* Admin UI review",()=>{
 for(const id of ["national_id","drivers_license","passport","umid","prc_id"]){
   const data={...base,declaredIdType:id,detectedIdType:id};
   if(id==="passport"){
     data.backSideProvided=false;
     data.backSideScreened=false;
     data.backImageQualityStatus="not_required";
     data.passportMrzCheck="checksum_consistent_unverified";
   }
   assert.equal(selectedIdRecognized(data),true,id+" server policy");
   assert.equal(adminReviewDocumentEligible(data),true,id+" Expo UI");
 }
});
test("unsupported, school or declared/detected mismatch can never enable client Verify",()=>{
 for(const candidate of [
   {...base,declaredIdType:"school_id",detectedIdType:"school_id"},
   {...base,detectedIdType:"school_id"},
   {...base,detectedIdType:"passport"},
   {...base,declaredIdType:null},
   {...base,status:"mismatch"},
   {...base,status:"inconclusive"},
 ]){
   assert.equal(adminReviewDocumentEligible(candidate),false,JSON.stringify(candidate));
 }
});
test("blurred, unknown, unmeasured, wrong or incomplete reverse evidence blocks Verify",()=>{
 for(const field of ["imageQualityStatus","backImageQualityStatus"]){
   for(const val of ["low","unknown","not_checked",null,undefined]){
     const data={...base,[field]:val};
     assert.equal(adminReviewDocumentEligible(data),false,
       field+"="+String(val));
   }
 }
 for(const pair of [{backSideProvided:false},{backSideScreened:false}]){
   assert.equal(adminReviewDocumentEligible({...base,...pair}),false);
 }
});
test("any warning disqualifies, even when AI status reports text consistent",()=>{
 for(const code of [
  "document_front_back_swapped","document_back_evidence_inconclusive",
  "document_back_layout_inconclusive","low_document_back_image_quality",
  "school_id_not_supported","document_type_not_recognized",
 ]){
   const data={...base,warningCodes:[code]};
   assert.equal(adminReviewDocumentEligible(data),false,code);
   assert.equal(selectedIdRecognized(data),false,code+" server policy");
 }
 assert.equal(adminReviewDocumentEligible({...base,warningCodes:undefined}),false);
});
test("DOB and passport MRZ contradictions prevent UI eligibility",()=>{
 for(const fields of [
  {profileBirthDateCheck:"possible_conflict"},
  {passportMrzBirthDateCheck:"possible_conflict"},
  {passportMrzCheck:"checksum_inconsistent_or_ocr_error"},
  {passportMrzCheck:"multiple_candidates"},
 ]){
  const data={...base,...fields};
  assert.equal(adminReviewDocumentEligible(data),false);
  assert.equal(selectedIdRecognized(data),false);
 }
});
test("stale pending snapshots always show verified/retry before pending",()=>{
 for(const row of [
   {status:"pending",identityVerified:true,requiresManualReview:true},
   {status:"pending",identityStatus:"verified",requiresManualReview:true},
   {status:"pending",manualReviewDecision:"verified",requiresManualReview:true},
 ]){
    assert.equal(adminReviewStatusBucket(row),"verified");
 }
 assert.equal(adminReviewStatusBucket({
  status:"pending",manualReviewDecision:"retry_required",requiresManualReview:true
 }),"retry_required");
 assert.equal(adminReviewStatusBucket({
  status:"pending",requiresManualReview:true
 }),"pending");
});
test("real Expo Admin component uses the pure gate in button AND submission path",()=>{
 const admin = fs.readFileSync("app/(admin)/identity-reviews.tsx","utf8");
 assert.match(admin,/import\s*\{[^}]*adminReviewDocumentEligible,[\s\S]*?adminReviewStatusBucket[^}]*\}/);
 assert.match(admin,/function reviewBucket\(item: IdentityReview\): ReviewFilter \{\s*return adminReviewStatusBucket\(item\)/);
 assert.match(admin,/!adminReviewDocumentEligible\(selected\.documentScreening\)/);
 assert.match(admin,/const documentEligible = adminReviewDocumentEligible\(item\.documentScreening\)/);
 assert.match(admin,/const canVerify = pending && documentEligible/);
 assert.match(admin,/reviewBucket\(selected\) !== "pending"/);
 assert.match(admin,/Require Retry/);
});
test("transactional Node permission gate and disabled media uploads remain authoritative",()=>{
 const server=fs.readFileSync("backend/server.js","utf8");
 assert.match(server,/const STAGING_IDENTITY_MEDIA_UPLOADS_ENABLED = false;/);
 assert.match(server,/identity_review_target_not_eligible/);
 assert.match(server,/self_identity_review_forbidden/);
 assert.match(server,/issuerReviewAttested/);
 const adminRoute=server.slice(server.indexOf('"/api/admin/identity/reviews/:uid/decision"'),
    server.indexOf('"/api/admin/assistance/requests/:requestId/start-review"'));
 assert.match(adminRoute,/requireFirebaseUser/);
 assert.match(adminRoute,/requireOperationalAdmin/);
 assert.match(adminRoute,/db\.runTransaction/);
 assert.match(adminRoute,/identityVerified:\s*true/);
 assert.match(adminRoute,/adminActivityLogs/);
});
