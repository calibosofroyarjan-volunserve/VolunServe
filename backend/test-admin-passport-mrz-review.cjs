"use strict";
/** No real user/ID/biometric data. Run backend's actual sanitizer and policy. */
const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const {selectedIdRecognized} = require("./selectedIdPolicy");

const server = fs.readFileSync("backend/server.js", "utf8");
const ui = fs.readFileSync("app/(admin)/identity-reviews.tsx", "utf8");
const shared = fs.readFileSync("components/identity/DocumentScreeningSummary.tsx", "utf8");
const client = fs.readFileSync("lib/identityVerification.ts", "utf8");

const start = server.indexOf("function normalizeIdDocumentScreening(value) {");
const end = server.indexOf("\nfunction numberOrNull(", start);
assert(start >= 0 && end > start, "actual Node sanitizer function must exist");
const sanitizer = vm.runInNewContext(
  server.slice(start,end) + "\nnormalizeIdDocumentScreening",
  Object.create(null),
);

function input(overrides={}) {
  return {
    declaredIdType: "passport", detectedIdType:"passport",
    status:"text_consistent_unverified", imageQualityStatus:"adequate",
    profileBirthDateCheck:"possible_match",
    backSideProvided:false, backSideScreened:false, warningCodes:[],
    passportMrzCheck:"checksum_consistent_unverified",
    passportMrzBirthDateCheck:"possible_match",
    passportMrzCheckDigitsConsistent:true,
    ...overrides,
  };
}
test("only recognized sanitized MRZ clue fields cross backend to Admin",()=>{
  const data=sanitizer(input({
    rawMrz:"PRIVATE PASSPORT 44 CHARACTER SENSITIVE STRING",
    ocrText:"SENSITIVE IDENTIFICATION STRING",
    holderName:"SENSITIVE NAME",
    documentNumber:"P12345",
    fullDateOfBirth:"1980-01-01",
    passportIssuerAuthenticityVerified:true,
    issuerAuthenticityStatus:"verified",
    presentationAttackStatus:"validated",
  }));
  assert.equal(data.passportMrzCheck,"checksum_consistent_unverified");
  assert.equal(data.passportMrzBirthDateCheck,"possible_match");
  assert.equal(data.passportMrzCheckDigitsConsistent,true);
  assert.equal(data.passportIssuerAuthenticityVerified,false);
  assert.equal(data.passportMrzManualReviewRequired,true);
  assert.equal(data.authenticityVerified,false);
  assert.equal(data.livenessVerified,false);
  assert.equal(data.manualReviewRequired,true);
  const json=JSON.stringify(data);
  for(const personal of ["P12345","PRIVATE PASSPORT","SENSITIVE",
                         "1980-01-01","rawMrz","documentNumber","fullDateOfBirth"]){
    assert(!json.includes(personal),personal+" was leaked");
  }
});
test("malicious or contradictory MRZ claims cannot be converted into approval",()=>{
  for(const overrides of [
    {passportMrzCheck:"checksum_inconsistent_or_ocr_error"},
    {passportMrzCheck:"multiple_candidates"},
    {passportMrzBirthDateCheck:"possible_conflict"},
    {profileBirthDateCheck:"possible_conflict"},
    {warningCodes:["passport_mrz_profile_birth_date_conflict"]},
    {warningCodes:["passport_mrz_review_required"]},
  ]){
    const evidence=sanitizer(input(overrides));
    assert.equal(selectedIdRecognized(evidence),false,JSON.stringify(overrides));
  }
});
test("unknown ML fields and forged issuer claims always fail closed",()=>{
  const evidence=sanitizer(input({
    passportMrzCheck:"VERIFIED_BY_ISSUER",
    passportMrzBirthDateCheck:"IDENTITY_VERIFIED",
    passportMrzCheckDigitsConsistent:true,
    passportIssuerAuthenticityVerified:true,
  }));
  assert.equal(evidence.passportMrzCheck,"not_detected");
  assert.equal(evidence.passportMrzBirthDateCheck,"not_checked");
  assert.equal(evidence.passportMrzCheckDigitsConsistent,false);
  assert.equal(evidence.passportIssuerAuthenticityVerified,false);
});
test("no MRZ checker is forced onto other four allowed IDs",()=>{
  const valid={
    national_id:"national_id", drivers_license:"drivers_license",
    umid:"umid", prc_id:"prc_id"
  };
  for(const id of Object.values(valid)){
    const doc=sanitizer(input({
      declaredIdType:id,detectedIdType:id,backSideProvided:true,backSideScreened:true,
      backImageQualityStatus:"adequate",
      passportMrzCheck:"checksum_inconsistent_or_ocr_error",
    }));
    assert.equal("passportMrzCheck" in doc,false);
    assert.equal(selectedIdRecognized(doc),true);
  }
});
test("authenticated operational Admin route and transactional self-approval block retained",()=>{
  const range = server.slice(
    server.indexOf('"/api/admin/identity/reviews/:uid/decision"'),
    server.indexOf('const commonReviewFields =', server.indexOf('"/api/admin/identity/reviews/:uid/decision"')),
  );
  for(const token of [
    "requireFirebaseUser","requireOperationalAdmin",
    "targetUid === adminUid","db.runTransaction",
    "reviewIssuerEvidence","identity_document_evidence_conflict",
    "selectedIdRecognized"
  ])assert(range.includes(token),"missing guard: "+token);
  assert(server.includes("const STAGING_IDENTITY_MEDIA_UPLOADS_ENABLED = false;"));
});
test("staging Admin points to isolated Node and shows MRZ without PII",()=>{
  assert(ui.includes('process.env.EXPO_PUBLIC_VOLUNSERVE_ENV === "staging"'));
  assert(ui.includes("https://volunserve-backend-staging.onrender.com"));
  assert(ui.includes("unresolvedEvidence"));
  assert(ui.includes("disabled={!canVerify}"));
  assert(shared.includes("Passport MRZ checksum"));
  assert(shared.includes("MRZ birthday vs profile"));
  assert(client.includes("passportMrzCheck"));
  assert(client.includes("passportMrzBirthDateCheck"));
  assert(!shared.includes("rawMrz"));
  assert(!ui.includes("passportNumber"));
});
