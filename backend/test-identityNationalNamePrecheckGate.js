"use strict";
const fs=require("node:fs");
const assert=require("node:assert/strict");
const test=require("node:test");
const {classifyHybridDocumentPrecheck}=require("./identityHybridPrecheckDecision");
const source=fs.readFileSync("backend/server.js","utf8");

test("authenticated National ID precheck only allows matching account name to reach face stage",()=>{
  const i=source.indexOf('"/api/identity/document/precheck"');
  const j=source.indexOf('"/api/identity/status"',i+10);
  assert.ok(i>=0&&j>i,"Current authenticated OCR route must remain");
  const route=source.slice(i,j);
  assert.match(route,/requireFirebaseUser/);
  assert.match(route,/x-volunserve-document-precheck-consent/);
  assert.match(route,/classifyHybridDocumentPrecheck/);
  assert.match(route,/profile_mismatch/);
  assert.match(route,/pending_admin_review/);
  assert.match(route,/school_id_not_supported/);
  assert.match(route,/document_back_ocr_inconclusive/);
  assert.match(route,/authenticityVerified: false/);
  assert.match(route,/livenessVerified: false/);

  const good={declaredIdType:"national_id",detectedIdType:"national_id",
    status:"text_consistent_unverified",imageQualityStatus:"adequate",
    warningCodes:[],backSideProvided:true,backSideScreened:true,
    profileNameCheck:"possible_match",profileBirthDateCheck:"not_checked"};
  assert.equal(classifyHybridDocumentPrecheck({
    screening:good,aiOutcome:"pass",
  }).decision,"ready_for_face_scan");
  assert.equal(classifyHybridDocumentPrecheck({
    screening:{...good,profileNameCheck:"possible_conflict"},aiOutcome:"pass",
  }).decision,"profile_mismatch");
  assert.equal(classifyHybridDocumentPrecheck({
    screening:{...good,profileNameCheck:"inconclusive"},aiOutcome:"pass",
  }).decision,"rescan_required");
});
