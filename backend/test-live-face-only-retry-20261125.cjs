"use strict";
// Offline regression tests for live face-only scan decision and retry policy.
// No Firebase SDK, Cloudinary, images, credentials, network or production writes.
const test=require("node:test");
const assert=require("node:assert/strict");
const vm=require("node:vm");
const fs=require("node:fs");
const source=fs.readFileSync(require.resolve("./server.js"),"utf8");
const start=source.indexOf("      const decision = faceOnly");
const end=source.indexOf("      const reviewTrack =",start);
assert.ok(start>0&&end>start,"Cannot find the exact production decision boundary");
const decisionCode=source.slice(start,end);
const check=(faceOnly,faceComparisonPassed,rawDecision)=>
  vm.runInNewContext(
    "(faceOnly,faceComparisonPassed,rawDecision)=>{"+
    "const aiResult={livenessImplemented:false}; const documentScreening={};"+
    "const enforceSelectedIdDecision=(decision)=>decision;"+
    decisionCode+"return decision;}",
    {},{timeout:2000}
  )(faceOnly,faceComparisonPassed,rawDecision);
const a=source.indexOf("function identityAttemptOutcome(");
const b=source.indexOf("const ASSISTANCE_EVIDENCE_UPLOAD_LIMIT",a);
assert.ok(a>0&&b>a,"Cannot find exact original 3-attempt policy");
const outcome=vm.runInNewContext(
  "const MAX_IDENTITY_AI_ATTEMPTS=3;"+source.slice(a,b)+
  "identityAttemptOutcome;",{},{timeout:2000}
);
test("positive original face match stays pending authorized Admin review",()=>{
  const decision=check(true,true,"manual_review");
  assert.equal(decision,"manual_review");
  const result=outcome(decision,1);
  assert.equal(result.status,"pending");
  assert.equal(result.requiresManualReview,true);
});
test("uncertain result is retriable until the third attempt",()=>{
  for(let attempts=1;attempts<=2;attempts++){
    const decision=check(true,false,"manual_review");
    const result=outcome(decision,attempts);
    assert.equal(decision,"failed");
    assert.equal(result.status,"failed");
    assert.equal(result.requiresManualReview,false);
  }
});
test("third unsuccessful face comparison enters Admin review, not auto approval",()=>{
  const decision=check(true,false,"manual_review");
  const result=outcome(decision,3);
  assert.equal(result.status,"pending");
  assert.equal(result.requiresManualReview,true);
  assert.match(source,/verification\.faceComparisonPassed !== true/);
  assert.match(source,/issuerReviewAttested/);
});
test("missing/false face flag fails closed even if private Python returns manual_review",()=>{
  assert.match(source,/aiResult\?\.faceComparisonPassed === true/);
  for(const score of [false,null,undefined]){
    const derived = true && "manual_review"==="manual_review" && score===true;
    assert.equal(check(true,derived,"manual_review"),"failed");
  }
});
test("attempted provider verified/failed outcome cannot force face-only approval",()=>{
  for(const d of ["verified","failed","unknown"]){
    assert.equal(check(true,false,d),"failed");
  }
  assert.match(source,/faceComparisonPassed = faceOnly && rawDecision === "manual_review"/);
});
test("non face-only OCR route has unchanged original provider decision policy",()=>{
  assert.equal(check(false,false,"manual_review"),"manual_review");
  assert.equal(check(false,true,"verified"),"verified");
  assert.equal(check(false,false,"failed"),"failed");
});
test("privacy, Cloudinary and Resident profile gates stay separate from retry logic",()=>{
  assert.match(source,/uploadIdentityEvidence\(/);
  assert.match(source,/parseConsentedIdentityEvidence\(request, \{allowMissingBack: faceOnly\}\)/);
  assert.match(source,/identityVerified: false/);
  assert.match(source,/if \(faceOnly && String\(process\.env\.VOLUNSERVE_FACE_ONLY_ENABLED/);
  assert.match(source,/faceOnly \? "volunserve_ai_face_only" : "volunserve_ai"/);
  assert.match(source,/Three original face comparisons were unsuccessful or inconclusive/);
});
