"use strict";
// All writes in this file target FIRESTORE_EMULATOR_HOST. There are zero writes to production.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const {initializeTestEnvironment, assertSucceeds, assertFails} = require("@firebase/rules-unit-testing");
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.ACTIVE_RULES_FILE) {
  throw Error("STOP: LIVE notification audit requires local Firestore emulator and fetched published rules");
}
const rules = fs.readFileSync(process.env.ACTIVE_RULES_FILE,"utf8");
if (!rules.includes("match /notifications/{notificationId}")) throw Error("STOP active notifications block not found");

(async () => {
  const env = await initializeTestEnvironment({
    projectId:"demo-volunserve", firestore:{rules}
  });
  try {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async ctx => {
      const db=ctx.firestore();
      await db.doc("users/resident-audit").set({
        uid:"resident-audit", role:"resident",status:"approved",barangay:"Francisco Homes-Narra"
      });
      await db.doc("users/volunteer-audit").set({
        uid:"volunteer-audit",role:"volunteer",status:"approved",barangay:"Francisco Homes-Narra"
      });
      await db.doc("users/unapproved-audit").set({
        uid:"unapproved-audit",role:"resident",status:"pending",barangay:"Francisco Homes-Narra"
      });
      await db.doc("notifications/resident-alert").set({
        userId:"resident-audit",type:"emergency",
        title:"Emergency report validated",message:"Report verified by LGU",read:false,
        createdAt:new Date("2026-11-05T12:30:00Z")
      });
      await db.doc("notifications/volunteer-alert").set({
        userId:"volunteer-audit",type:"emergency",
        title:"New VolunServe Volunteer invitation",message:"Open Emergency Tasks",read:false,
        createdAt:new Date("2026-11-05T12:30:00Z")
      });
    });
    const resident = env.authenticatedContext("resident-audit").firestore();
    const volunteer = env.authenticatedContext("volunteer-audit").firestore();
    const pending = env.authenticatedContext("unapproved-audit").firestore();
    const anon = env.unauthenticatedContext().firestore();

    // Query shape exactly matches current published browser Notifications UI.
    const reader = ctx=>ctx.collection("notifications").where("userId","==","resident-audit");
    const first = await assertSucceeds(reader(resident).get());
    assert.equal(first.size,1,"resident should read exactly one owned alert");
    assert.equal(first.docs[0].data().read,false);
    await assertSucceeds(resident.doc("notifications/resident-alert").update({read:true}));
    const saved = await assertSucceeds(resident.doc("notifications/resident-alert").get());
    assert.equal(saved.data().read,true,"read:true must persist to Firestore");
    await assertFails(resident.doc("notifications/volunteer-alert").update({read:true}));
    await assertFails(resident.collection("notifications").get());
    await assertFails(pending.collection("notifications").where("userId","==","resident-audit").get());
    await assertFails(anon.collection("notifications").where("userId","==","resident-audit").get());
    const volunteerAlert=await assertSucceeds(
      volunteer.collection("notifications").where("userId","==","volunteer-audit").get()
    );
    assert.equal(volunteerAlert.size,1,"Volunteer should read own invitation");
    await assertSucceeds(volunteer.doc("notifications/volunteer-alert").update({read:true}));
    console.log("PASS exact production Firestore policy in EMULATOR: 2 user inbox queries, read:true persisted, anonymous/pending/cross-user blocked.");

    // Diagnostic only. Test whether current published rules allow rewriting message.
    // Do not attempt any content mutation on production.
    try {
      await resident.doc("notifications/resident-alert").update({message:"Altered by recipient in emulator"});
      console.log("SECURITY_FINDING: Current published Firestore Rules permit a recipient to edit notification MESSAGE. This is a separate hardening issue; never claim tamper-proof.");
    } catch {
      console.log("PASS recipient cannot rewrite notification message.");
    }
  } finally {
    await env.cleanup();
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
