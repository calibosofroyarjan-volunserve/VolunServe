"use strict";
// Uses a copied ACTIVE Firestore Rules source against the emulator ONLY.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const {initializeTestEnvironment, assertSucceeds, assertFails} =
  require("@firebase/rules-unit-testing");
const firebase = require("firebase/compat/app");
require("firebase/compat/firestore");
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw Error("Refuse to run without Firestore emulator");
}
const rules = fs.readFileSync(process.env.ACTIVE_RULES_PATH ||
  "firestore.rules", "utf8");

(async () => {
  const env = await initializeTestEnvironment({
    projectId: "demo-volunserve",
    firestore: {rules},
  });
  try {
    await env.clearFirestore();
    const published = firebase.firestore.Timestamp.fromMillis(Date.now()-30000);
    await env.withSecurityRulesDisabled(async (c) => {
      const db = c.firestore();
      await db.doc("users/resident-muzon").set({
        uid:"resident-muzon", role:"resident", status:"approved",
        residentAccess:true, barangay:"Muzon", identityStatus:"verified",
      });
      await db.doc("users/volunteer-tungko").set({
        uid:"volunteer-tungko", role:"volunteer", status:"approved",
        volunteerAccess:true, barangay:"Tungko", identityStatus:"verified",
      });
      for (const [id,audience] of [
        ["muzon-notice","Muzon"],
        ["tungko-notice","Tungko"],
        ["city-notice","all"],
      ]) await db.doc("announcements/"+id).set({
        title:"Official "+id, message:"Test bulletin for authorized members.",
        audience, priority:"normal", publishAt:published,
        createdAt:published, updatedAt:published,
        linkUrl:"", imageUrl:"", createdBy:"test-admin",
      });
    });
    const resident = env.authenticatedContext("resident-muzon").firestore();
    const volunteer = env.authenticatedContext("volunteer-tungko").firestore();
    const allowedResident = await assertSucceeds(
      resident.collection("announcements")
        .where("audience", "in", ["all", "Muzon"]).get());
    assert.deepEqual(allowedResident.docs.map(d=>d.id).sort(),
      ["city-notice", "muzon-notice"]);
    const allowedVolunteer = await assertSucceeds(
      volunteer.collection("announcements")
        .where("audience", "in", ["all", "Tungko"]).get());
    assert.deepEqual(allowedVolunteer.docs.map(d=>d.id).sort(),
      ["city-notice", "tungko-notice"]);
    await assertFails(volunteer.collection("announcements")
      .where("audience", "in", ["all", "Muzon"]).get());
    await assertFails(resident.collection("announcements").get());
    await assertFails(env.unauthenticatedContext().firestore()
      .collection("announcements").get());
    console.log("PASS ACTIVE Firebase Rules: resident/volunteer correct local+city announcements; cross-barangay/anonymous denied");
  } finally {
    await env.cleanup();
  }
})().catch(error => {console.error(error);process.exit(1);});
