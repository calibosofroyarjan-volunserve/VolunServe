"use strict";
/** Offline tests: no real ID, face image, provider request or user data. */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const source=fs.readFileSync(path.join(__dirname,"../backend/lguStaffFaceScreening.js"),"utf8");
const server=fs.readFileSync(path.join(__dirname,"../backend/server.js"),"utf8");
const ui=fs.readFileSync(path.join(__dirname,"../components/admin/LguApplicantEvidencePanel.tsx"),"utf8");
const rules=fs.readFileSync(path.join(__dirname,"../firestore.rules"),"utf8");
const target={exports:{}};
vm.runInNewContext(source,{
  module:target,exports:target.exports,Buffer,
  require(name) {
    if(name==="firebase-admin/storage")return {getStorage(){throw Error("No live Storage allowed");}};
    if(name==="crypto")return require("node:crypto");
    throw Error("Unexpected dependency "+name);
  },
},{filename:"lguStaffFaceScreening.js"});
const {safeUid,evidenceFile,mediaMime,similaritySignal}=target.exports;
assert.equal(safeUid("safe-UID_2026"),"safe-UID_2026");
assert.equal(safeUid("../bad/path"),"");
assert.equal(safeUid("abc"),"");
assert.equal(evidenceFile("applicant_2026","front","lguStaffEvidence/applicant_2026/front.jpg").mime,"image/jpeg");
assert.equal(evidenceFile("applicant_2026","selfie","lguStaffEvidence/applicant_2026/selfie.png").mime,"image/png");
for(const path of [
  "lguStaffEvidence/unrelated/front.jpg",
  "lguStaffEvidence/applicant_2026/back.png",
  "https://public.example/photo.jpg",
  "lguStaffEvidence/applicant_2026/front.exe",
])assert.equal(evidenceFile("applicant_2026","front",path),null);
assert.equal(mediaMime(Buffer.from([255,216,255,...new Array(18).fill(0)])),"image/jpeg");
assert.equal(mediaMime(Buffer.from([137,80,78,71,13,10,26,10,...new Array(12).fill(0)])),"image/png");
assert.equal(mediaMime(Buffer.from("RIFF0000WEBPxxxxxxxx")),"image/webp");
assert.equal(mediaMime(Buffer.from("not an image at all")),"");
assert.equal(similaritySignal("manual_review",0.93,0.85,"pending"),"similarity_signal_present");
assert.equal(similaritySignal("manual_review",0.75,0.85,"pending"),"inconclusive_manual_review");
assert.equal(similaritySignal("verified",0.93,0.85,"pending"),"inconclusive_manual_review");
assert.equal(similaritySignal("manual_review",0.93,null,"pending"),"inconclusive_manual_review");
assert.equal(similaritySignal("manual_review",0.93,0.85,"failed"),"inconclusive_manual_review");
assert.equal(similaritySignal("manual_review",Number.NaN,0.85,"pending"),"inconclusive_manual_review");
for(const fragment of [
  '"/api/lgu-staff/face-screen"',
  'reviewer.role!=="superadmin"',
  'applicant.role!=="applicant"',
  'evidence.reviewStatus!=="pending_manual_review"',
  'metadata.contentType!==item.mime',
  'mediaMime(bytes)!==item.mime',
  'tries>=3',
  'new FormData()',
  'identityDecision:"manual_review_required"',
  'livenessImplemented:false',
  'documentAuthenticityVerified:false',
  'FieldValue.delete()',
])assert(source.includes(fragment),"Missing security requirement: "+fragment);
assert(server.includes("mountLguStaffFaceScreening(app"),"Backend must register restricted reviewer route");
assert(ui.includes("Run AI-assisted face comparison (review only)") &&
  ui.includes("auth.currentUser") &&
  ui.includes("usingFirebaseEmulators") &&
  ui.includes('identityDecision')===false &&
  ui.includes("Active liveness, ID authenticity and LGU employment were not verified."),
  "Super Admin must only display optional informational similarity, not ID verification");
assert(rules.includes("match /lguApplicantFaceScreenings/{uid}") &&
  rules.includes("allow create, update, delete: if false;"),
  "Biometric screening metadata must not allow forged client writes");
assert(!source.includes("identityVerified:true")&&!source.includes('role:"admin"'),
  "AI comparison is never an Admin role grant");
console.log("PASS Super Admin-only AI-assisted similarity screening security contract and offline media validation");
