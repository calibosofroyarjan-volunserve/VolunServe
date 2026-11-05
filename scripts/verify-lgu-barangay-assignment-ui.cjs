"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const accounts=fs.readFileSync("app/(superadmin)/admin-accounts.tsx","utf8");
const announce=fs.readFileSync("app/(admin)/create-announcement.tsx","utf8");
const application=fs.readFileSync("app/admin-request.tsx","utf8");
const policy=fs.readFileSync("scripts/prepare-lgu-barangay-assignment-live-rules.py","utf8");
for(const part of [
  'doc(db, "lguBarangayRequests", user.uid)',
  'Submit for Official Verification',
  'SJDM_BARANGAYS.includes(requestedBarangay)',
  'requestedBarangay',
  'requestStatus === "pending"',
  'validOfficialBarangay ? barangay : ""'
]) assert(announce.includes(part),"missing staff-originated area UI: "+part);
for(const part of [
  "pendingAreaRequestFor(account)",
  "getDoc(requestRef)",
  'actionType: approve ? "admin_barangay_verified"',
  'Approve Verified Area',
  'Reject Request',
  "batch.update(requestRef",
  "batch.update(userRef",
  "batch.commit()",
  'SJDM_BARANGAYS.includes(actionTarget?.barangay || "")'
]) assert(accounts.includes(part),"missing verification control: "+part);
assert(!accounts.includes("Assign Official LGU Barangay"));
assert(!accounts.includes("setChosenOfficialBarangay"));
assert(!accounts.includes("Change Barangay"));
assert(!announce.includes("Assign Barangay"));
assert(application.includes("barangay:form.barangay"));
assert(policy.includes("getAfter(__REQUEST_PATH__).data.status == 'approved'"));
assert(policy.includes("get(__REQUEST_PATH__).data.desiredBarangay == request.resource.data.barangay"));
assert(policy.includes("profile().get('barangay','') == ''"));
console.log("PASS: official barangay comes from LGU submission; programmer only approves/rejects; missing-area publishing remains guarded.");
