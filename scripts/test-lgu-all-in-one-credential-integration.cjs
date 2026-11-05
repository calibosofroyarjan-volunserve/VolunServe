"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { initializeTestEnvironment, assertFails, assertSucceeds } = require("@firebase/rules-unit-testing");
const { doc, setDoc, updateDoc, getDoc, writeBatch, serverTimestamp } = require("firebase/firestore");
const { ref, uploadBytes, getBytes, getMetadata } = require("firebase/storage");

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
  throw Error("FIREBASE_EMULATORS_REQUIRED: refusing to run against production");
}
async function main() {
  const fsRules = fs.readFileSync("firestore.rules", "utf8");
  const storageRules = fs.readFileSync("storage.rules", "utf8");
  assert.match(fsRules, /hasFreshLguCredentialReview/);
  assert.match(fsRules, /lguAdminCredentialReviews/);
  assert.match(storageRules, /lguStaffProof/);
  const env = await initializeTestEnvironment({
    projectId: "demo-volunserve",
    firestore: { rules: fsRules },
    storage: { rules: storageRules },
  });
  try {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async ctx => {
      const db = ctx.firestore();
      for (const [uid, fields] of [
        ["lgu-super-integrated", { role: "superadmin", status: "approved" }],
        ["lgu-admin-unrelated", { role: "admin", status: "approved", adminStatus: "active" }],
        ["lgu-resident-unrelated", { role: "resident", status: "approved", residentAccess: true }],
      ]) await setDoc(doc(db, "users", uid), { uid, ...fields });
    });
    const uid = "lgu-proof-integration-01";
    const email = "lgu-integration-01@example.gov.ph";
    const app = env.authenticatedContext(uid, { email });
    const superCtx = env.authenticatedContext("lgu-super-integrated");
    const otherAdmin = env.authenticatedContext("lgu-admin-unrelated");
    const resident = env.authenticatedContext("lgu-resident-unrelated");
    const anon = env.unauthenticatedContext();
    const application = {
      uid, email, fullName: "Verified LGU Staff Integrated", age: 0, phoneNumber: "",
      role: "applicant", status: "pending_review", residentAccess: false, volunteerAccess: false,
      region: "Region III – Central Luzon", province: "Bulacan",
      city: "City of San Jose del Monte", barangay: "Poblacion",
      lguOffice: "Office of Public Safety", lguPosition: "Emergency Coordinator",
      appointmentReference: "SJDM-2026-INTEGRATED", createdAt: serverTimestamp(),
    };
    await assertSucceeds(setDoc(doc(app.firestore(), "users", uid), application));
    const photo = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9]);
    const id = "lguStaffProof/" + uid + "/staff-id";
    const letter = "lguStaffProof/" + uid + "/appointment-letter";
    await assertSucceeds(uploadBytes(ref(app.storage(), id), photo, { contentType: "image/jpeg" }));
    await assertSucceeds(uploadBytes(ref(app.storage(), letter), photo, { contentType: "image/jpeg" }));
    await assertFails(getMetadata(ref(anon.storage(), id)));
    await assertFails(getMetadata(ref(app.storage(), id)));
    await assertFails(getMetadata(ref(otherAdmin.storage(), id)));
    await assertFails(getMetadata(ref(resident.storage(), id)));
    await assertSucceeds(getBytes(ref(superCtx.storage(), id)));
    await assertSucceeds(getBytes(ref(superCtx.storage(), letter)));
    console.log("PASS applicant creates pending profile + required private ID and appointment images");
    console.log("PASS Super Admin sees both images, anonymous/Resident/LGU Admin/applicant access denied");
    const grant = {
      previousRole: "applicant", previousPrimaryRole: "applicant",
      role: "admin", status: "approved", adminStatus: "active",
      adminCreatedAt: serverTimestamp(), adminCreatedBy: "lgu-super-integrated",
      adminUpdatedAt: serverTimestamp(), adminUpdatedBy: "lgu-super-integrated",
    };
    const review = {
      targetUid: uid, accountEmail: email, reviewStatus: "verified",
      office: "Office of Public Safety", position: "Emergency Coordinator",
      credentialReference: "SJDM-INTEGRATED-APPROVAL",
      verificationMethod: "Official LGU Human Resources office confirmation",
      verifiedBy: "lgu-super-integrated", verifiedAt: serverTimestamp(),
    };
    await assertFails(updateDoc(doc(otherAdmin.firestore(), "users", uid), grant));
    await assertFails(updateDoc(doc(app.firestore(), "users", uid), grant));
    await assertFails(updateDoc(doc(superCtx.firestore(), "users", uid), grant));
    const approval = writeBatch(superCtx.firestore());
    approval.set(doc(superCtx.firestore(), "lguAdminCredentialReviews", uid), review);
    approval.update(doc(superCtx.firestore(), "users", uid), grant);
    approval.set(doc(superCtx.firestore(), "adminLogs", "lguproof-integrated-approved"), {
      actionType: "admin_account_created", targetType: "user", targetId: uid,
      adminUid: "lgu-super-integrated", adminName: "Test Super Admin",
      description: "Granted Admin after independently verifying official LGU employment.",
      createdAt: serverTimestamp(),
    });
    await assertSucceeds(approval.commit());
    const data = (await getDoc(doc(superCtx.firestore(), "users", uid))).data();
    assert.equal(data.role, "admin");
    assert.equal(data.status, "approved");
    await assertFails(uploadBytes(ref(app.storage(), id), photo, { contentType: "image/jpeg" }));
    await assertSucceeds(getMetadata(ref(superCtx.storage(), letter)));
    console.log("PASS verified same-batch Super Admin approval and audit");
    console.log("PASS approved applicant cannot replace credential photos after approval");
    const rejectUid = "lgu-proof-rejected-01";
    const rejectEmail = "lgu-rejection-01@example.gov.ph";
    const rejected = env.authenticatedContext(rejectUid, { email: rejectEmail });
    await assertSucceeds(setDoc(doc(rejected.firestore(), "users", rejectUid),
      { ...application, uid: rejectUid, email: rejectEmail }));
    const reject = writeBatch(superCtx.firestore());
    reject.update(doc(superCtx.firestore(), "users", rejectUid), {
      status: "rejected", rejectedReason: "Official LGU employment could not be verified.",
      reviewedAt: serverTimestamp(), reviewedBy: "lgu-super-integrated",
    });
    reject.set(doc(superCtx.firestore(), "adminLogs", "lguproof-integrated-rejected"), {
      actionType: "lgu_admin_application_rejected", targetType: "user", targetId: rejectUid,
      adminUid: "lgu-super-integrated", adminName: "Test Super Admin",
      description: "Rejected unverified LGU staff request.", createdAt: serverTimestamp(),
    });
    await assertSucceeds(reject.commit());
    const denied = (await getDoc(doc(superCtx.firestore(), "users", rejectUid))).data();
    assert.equal(denied.role, "applicant");
    assert.equal(denied.status, "rejected");
    console.log("PASS pending LGU rejection recorded and privileges remain denied");
    console.log("PASS integrated Firestore + Storage LGU credential security (emulator only, zero production writes)");
  } finally {
    await env.cleanup();
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
