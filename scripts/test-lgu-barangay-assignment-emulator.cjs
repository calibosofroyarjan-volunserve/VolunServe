"use strict";
// Emulator-only: a legitimate LGU staff member proposes area, programmer reviews it.
// Verifies cross-document atomic approval: never freeform Super Admin assignment.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { initializeTestEnvironment, assertSucceeds, assertFails } = require("@firebase/rules-unit-testing");
const firebase = require("firebase/compat/app");
require("firebase/compat/firestore");
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.LGU_ASSIGNMENT_RULES_FILE)
  throw Error("Refusing non-emulator LGU area verification test");
const stamp = () => firebase.firestore.FieldValue.serverTimestamp();
const request = (uid, area) => ({
  uid, desiredBarangay: area, office: "Official SJDM LGU Office",
  position: "LGU Administrator", appointmentReference: "PUBLIC-MEMO-2026",
  status: "pending", submittedAt: stamp(), reviewedBy: "",
  reviewedAt: null, rejectionReason: "",
});
(async () => {
  const env = await initializeTestEnvironment({
    projectId: "demo-volunserve",
    firestore: {rules:fs.readFileSync(process.env.LGU_ASSIGNMENT_RULES_FILE, "utf8")}
  });
  try {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async ctx => {
      const db = ctx.firestore();
      await db.doc("users/system").set({uid:"system", role:"superadmin", status:"approved",fullName:"TEST Super Admin"});
      await db.doc("users/staff").set({uid:"staff",role:"admin",status:"approved",
        adminStatus:"active",fullName:"TEST LGU Admin",email:"staff@example.test",barangay:"",phoneNumber:""});
      await db.doc("users/other").set({uid:"other",role:"admin",status:"approved",
        adminStatus:"active",fullName:"TEST Other LGU",barangay:"Muzon Proper"});
      await db.doc("users/staff2").set({uid:"staff2",role:"admin",status:"approved",
        adminStatus:"active",fullName:"TEST LGU Admin 2",barangay:""});
      await db.doc("users/resident").set({uid:"resident",role:"resident",status:"approved",barangay:"Muzon East"});
    });
    const superDb=env.authenticatedContext("system").firestore();
    const adminDb=env.authenticatedContext("staff").firestore();
    const otherDb=env.authenticatedContext("other").firestore();
    const staff2Db=env.authenticatedContext("staff2").firestore();
    const residentDb=env.authenticatedContext("resident").firestore();

    // Existing regular profile updates remain; admin cannot quietly edit official area.
    await assertSucceeds(adminDb.doc("users/staff").update({phoneNumber:"09120000000"}));
    await assertFails(adminDb.doc("users/staff").update({barangay:"Muzon East"}));
    await assertFails(residentDb.doc("lguBarangayRequests/resident").set(request("resident","Muzon East")));
    await assertFails(otherDb.doc("lguBarangayRequests/staff").set(request("staff","Muzon East")));
    await assertFails(otherDb.doc("lguBarangayRequests/other").set(request("other","Muzon East")));
    await assertFails(adminDb.doc("lguBarangayRequests/staff").set(request("staff","Unlisted Area")));
    await assertSucceeds(adminDb.doc("lguBarangayRequests/staff").set(request("staff","Muzon East")));
    await assertSucceeds(superDb.collection("lguBarangayRequests").get());
    await assertFails(otherDb.collection("lguBarangayRequests").get());

    // A programmer cannot override the LGU's requested area or skip verification.
    await assertFails(superDb.doc("users/staff").update({
      barangay:"Muzon East",adminUpdatedBy:"system",adminUpdatedAt:stamp()
    }));
    await assertFails(superDb.doc("lguBarangayRequests/staff").update({
      status:"approved",reviewedBy:"system",reviewedAt:stamp(),rejectionReason:""
    }));
    let wrong=superDb.batch();
    wrong.update(superDb.doc("lguBarangayRequests/staff"),{
      status:"approved",reviewedBy:"system",reviewedAt:stamp(),rejectionReason:""
    });
    wrong.update(superDb.doc("users/staff"),{
      barangay:"Tungkong Mangga",adminUpdatedBy:"system",adminUpdatedAt:stamp()
    });
    await assertFails(wrong.commit());

    // One atomic operation approves the requested area + user profile + audit log.
    let approved=superDb.batch();
    approved.update(superDb.doc("lguBarangayRequests/staff"),{
      status:"approved",reviewedBy:"system",reviewedAt:stamp(),rejectionReason:""
    });
    approved.update(superDb.doc("users/staff"),{
      barangay:"Muzon East",adminUpdatedBy:"system",adminUpdatedAt:stamp()
    });
    approved.set(superDb.collection("adminLogs").doc("area-verification-demo"),{
      actionType:"admin_barangay_verified",targetType:"user",targetId:"staff",
      adminUid:"system",adminName:"TEST Super Admin",
      description:"Verified official LGU request",createdAt:stamp()
    });
    await assertSucceeds(approved.commit());
    const after=await assertSucceeds(adminDb.doc("users/staff").get());
    assert.equal(after.data().barangay,"Muzon East");
    await assertFails(adminDb.doc("users/staff").update({barangay:"Tungkong Mangga"}));
    await assertFails(adminDb.doc("lguBarangayRequests/staff").set(request("staff","Tungkong Mangga")));

    // Reject + corrected resubmission is allowed; rejection never grants a barangay.
    await assertSucceeds(staff2Db.doc("lguBarangayRequests/staff2").set(request("staff2","Gaya-gaya")));
    await assertSucceeds(superDb.doc("lguBarangayRequests/staff2").update({
      status:"rejected",reviewedBy:"system",reviewedAt:stamp(),rejectionReason:"No official appointment record"
    }));
    await assertSucceeds(staff2Db.doc("lguBarangayRequests/staff2").set(request("staff2","Citrus")));
    await assertFails(staff2Db.doc("users/staff2").update({barangay:"Citrus"}));
    console.log("PASS: staff-controlled barangay request, official Super Admin verification, atomic approval and rejection, no arbitrary assignment.");
  } finally {
    await env.cleanup();
  }
})().catch(error => {console.error(error);process.exitCode=1;});
