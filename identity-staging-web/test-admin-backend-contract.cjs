"use strict";
/**
 * NO DEPLOY: compare the dedicated preview's *real client decision guards*
 * against the actual SHA-pinned staging Node backend currently deployed.
 * The CI job checks out the staging Node source to a separate directory.
 * NO Firebase tokens, private profiles, networks, credentials or real ID media.
 */
const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const stagingRoot = process.env.STAGING_NODE_CHECKOUT || "staging-node-contract";
const backendDir = path.resolve(stagingRoot,"backend");
const serverFile = path.join(backendDir,"server.js");
assert(fs.existsSync(serverFile),"Expected separate pinned staging Node checkout");
const src = fs.readFileSync(serverFile,"utf8");
const {selectedIdRecognized}=require(path.join(backendDir,"selectedIdPolicy.js"));
const {reviewIssuerEvidence}=require(path.join(backendDir,"identityIssuerReviewPolicy.js"));
const guardsPromise=import("./admin-review-guards.mjs");

const ids=["national_id","drivers_license","passport","umid","prc_id"];
const sample={
  declaredIdType:"national_id",detectedIdType:"national_id",
  status:"text_consistent_unverified",imageQualityStatus:"adequate",
  warningCodes:[],backSideProvided:true,backSideScreened:true,
  backImageQualityStatus:"adequate",profileNameCheck:"possible_match",
  profileBirthDateCheck:"possible_match",profileAddressCheck:"possible_match",
};
function docFor(type,extra={}){
  const passport=type==="passport" ? {
    backSideProvided:false,backSideScreened:false,backImageQualityStatus:"not_required",
    passportMrzCheck:"checksum_consistent_unverified",
    passportMrzBirthDateCheck:"possible_match",
  } : {};
  return {...sample,declaredIdType:type,detectedIdType:type,...passport,...extra};
}
function pending(documentScreening) {
  return {
    uid:"synthetic_demo_001",status:"pending",identityStatus:"pending",
    requiresManualReview:true,identityVerified:false,
    aiDecision:"manual_review",manualReviewDecision:"",
    documentScreening,
  };
}
test("all five supported IDs: client UI and actual Node selectedId policy agree",async()=>{
  const {availableMethods,documentEligibleForAdminReview,canVerify}=await guardsPromise;
  for(const id of ids) {
    const doc=docFor(id);
    assert.equal(selectedIdRecognized(doc),true,id+" Node");
    assert.equal(documentEligibleForAdminReview(doc),true,id+" preview");
    for(const method of availableMethods(id)){
      const notes="I independently checked the synthetic presentation.";
      const server=reviewIssuerEvidence({
        declaredType:id,validationMethod:method,confirmed:true,notes,
      });
      assert.equal(server.ok,true,id+" issuer rule");
      assert.equal(canVerify({
        review:pending(doc),method,attested:true,notes,busy:false,
      }),true,id+" client gate");
    }
  }
});
test("unresolved OCR, unsupported school IDs and blurry/wrong back images are not authorized",async()=>{
  const {documentEligibleForAdminReview,canVerify}=await guardsPromise;
  for(const variant of [
    docFor("national_id",{warningCodes:["school_id_not_supported"]}),
    docFor("passport",{passportMrzCheck:"checksum_inconsistent_or_ocr_error"}),
    docFor("passport",{passportMrzBirthDateCheck:"possible_conflict"}),
    docFor("prc_id",{backSideScreened:false}),
    docFor("umid",{backImageQualityStatus:"low"}),
    docFor("drivers_license",{detectedIdType:"school_id"}),
    docFor("national_id",{imageQualityStatus:"unknown"}),
    docFor("national_id",{warningCodes:undefined}),
    docFor("school_id"),
  ]) {
    assert.equal(documentEligibleForAdminReview(variant),false);
    assert.equal(canVerify({
      review:pending(variant),method:"official_document_check",
      attested:true,notes:"This is an independent check.",busy:false,
    }),false);
    // Backend has more tolerant handling of some older incomplete
    // historical records; the browser intentionally remains fail-closed.
    if(Array.isArray(variant.warningCodes) && variant.warningCodes.length)
      assert.equal(selectedIdRecognized(variant),false);
  }
});
test("final state wins over any stale pending snapshot; no repeat actions",async()=>{
  const {reviewBucket,canVerify,canRequireRetry}=await guardsPromise;
  const row=pending(docFor("passport"));
  const staleRetry={...row,manualReviewDecision:"retry_required"};
  assert.equal(reviewBucket(staleRetry),"retry_required");
  assert.equal(canVerify({
    review:staleRetry,method:"official_document_check",attested:true,
    notes:"Validated with synthetic independent review",busy:false,
  }),false);
  assert.equal(canRequireRetry({
    review:staleRetry,notes:"Retake the document",
  }),false);
  assert.equal(reviewBucket({...row,identityVerified:true}),"verified");
  assert.equal(reviewBucket({...row,identityStatus:"verified"}),"verified");
});
test("actual staging Node exposes exactly the preview's authenticated JSON API",()=>{
  const js=fs.readFileSync("identity-staging-web/admin-reviews.js","utf8");
  const queueIndex=src.indexOf('"/api/admin/identity/reviews"');
  const decisionIndex=src.indexOf('"/api/admin/identity/reviews/:uid/decision"');
  assert(queueIndex>0&&decisionIndex>queueIndex);
  const queue=src.slice(queueIndex-45,decisionIndex);
  const action=src.slice(decisionIndex-55,src.indexOf(
    '"/api/admin/assistance/requests/:requestId/start-review"',decisionIndex));
  for(const protectedBody of [queue,action]){
    assert.match(protectedBody,/requireFirebaseUser/);
    assert.match(protectedBody,/requireOperationalAdmin/);
  }
  assert.match(queue,/items,/);
  assert.match(action,/const action = cleanText\(request\.body\?\.action/);
  assert.match(action,/request\.body\?\.validationMethod/);
  assert.match(action,/request\.body\?\.issuerReviewAttested/);
  assert.match(action,/request\.body\?\.notes/);
  assert.match(action,/db\.runTransaction/);
  assert.match(action,/self_identity_review_forbidden/);
  assert.match(action,/adminActivityLogs/);
  assert.match(src,/const STAGING_IDENTITY_MEDIA_UPLOADS_ENABLED = false;/);
  assert.match(src,/volunserve-identity-test-staging\.onrender\.com/);
  for(const str of [
    "getIdToken(true)","Authorization:","Bearer ",
    "body.items","validationMethod:action","issuerReviewAttested:action","notes,",
    '"/api/admin/identity/reviews/"',
  ])assert(js.includes(str),"Missing browser→Node contract: "+str);
  assert(!js.includes("firebase-admin"));
  assert(!js.includes("volunserve-3aa5b"));
  assert(!js.includes("https://volunserve.com"));
});
test("backend queue exposes the status fields and sanitized evidence expected by browser",()=>{
  const start=src.indexOf("function identityAdminReviewPayload(");
  const end=src.indexOf("app.get(\n  \"/api/admin/identity/reviews\"",start);
  assert(start>=0&&end>start);
  const result=src.slice(start,end);
  for(const field of [
    "verificationId:","identityStatus:","identityVerified:",
    "documentScreening:","requiresManualReview:","manualReviewDecision:",
    "manualValidationMethod:","reviewedAt:","resident:",
    "fullName:","barangay:","reviewedByName:",
  ])assert(result.includes(field),"Missing Node response field "+field);
  assert(!result.includes("base64"));
  assert(!result.includes("selfieBytes"));
});
test("staging Resident status uses final Admin decision, not stale provisional AI result",()=>{
  const start=src.indexOf('"/api/identity/status"');
  const end=src.indexOf('"/api/identity/verify"',start);
  assert(start>0&&end>start);
  const status=src.slice(start,end);
  assert.match(status,/verification\.manualReviewDecision === "retry_required"/);
  assert.match(status,/identityStatus === "verified"/);
  assert.match(status,/profile\.identityVerified === true/);
  assert.match(status,/verification\.decision \|\| verification\.aiDecision/);
  assert.match(status,/padValidated: false/);
});
