"use strict";
/** Regression: the Super Admin pending queue cannot let proof images for one
 * applicant satisfy the Approve confirmation of any other applicant. */
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const page=fs.readFileSync("app/(superadmin)/admin-accounts.tsx","utf8");
const viewer=fs.readFileSync("components/admin/LguPrivateProofPreview.tsx","utf8");
const img=fs.readFileSync("lib/lguCredentialImages.ts","utf8");
test("credential readiness is keyed by exact UID, not last loaded card",()=>{
  assert.match(page,/useState<Record<string, boolean>>\(\{\}\)/);
  assert.match(page,/current\[uid\] === complete/);
  assert.match(page,/\{ \.\.\.current, \[uid\]: complete \}/);
  assert.match(page,/proofReadyByUid\[actionTarget\.id\] === true/);
  assert.doesNotMatch(page,/proofReady\?\.uid/);
  let results={};
  const put=(uid,ready)=>{results=results[uid]===ready?results:{...results,[uid]:ready}};
  put("pending-lgustaff-a",true);
  put("pending-lgustaff-b",false);
  assert.equal(results["pending-lgustaff-a"],true);
  assert.equal(results["pending-lgustaff-b"],false);
  put("pending-lgustaff-b",true);
  assert.equal(results["pending-lgustaff-a"],true);
  put("pending-lgustaff-a",false);
  assert.equal(results["pending-lgustaff-a"],false);
  assert.equal(results["pending-lgustaff-b"],true);
});
test("proof completion requires both ID and employment proof under same UID",()=>{
  assert.match(viewer,/loadLguProofForSuperAdmin\(uid, "staff-id"\)/);
  assert.match(viewer,/loadLguProofForSuperAdmin\(uid, "appointment-letter"\)/);
  assert.match(viewer,/onReady\?\.\(uid, !!idPhoto && !!appointment\)/);
  assert.match(viewer,/onReady\?\.\(uid, false\)/);
  assert.match(page,/!!actionTarget\?\.id && proofReadyByUid\[actionTarget.id\] === true/);
});
test("private images have no persistent public download tokens",()=>{
  assert.doesNotMatch(img,/getDownloadURL\s*\(/);
  assert.match(img,/getBytes\(r, LIMIT\)/);
  assert.match(img,/lguStaffProof\/.*uid.*kind/);
  assert.match(page,/LguPrivateProofPreview uid=\{account.id\}/);
});
