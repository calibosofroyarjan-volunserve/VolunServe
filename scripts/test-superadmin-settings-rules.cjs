"use strict";
/**
 * Firestore emulator ONLY. Synthetic identities and records, no real accounts,
 * production data, dispatch, payments, or Firebase project configuration changes.
 */
const fs = require("node:fs");
const path = require("node:path");
const { initializeTestEnvironment, assertSucceeds, assertFails } =
  require("@firebase/rules-unit-testing");
const firebase = require("firebase/compat/app");
require("firebase/compat/firestore");

if (!process.env.FIRESTORE_EMULATOR_HOST ||
    process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT !== "demo-volunserve") {
  throw Error("Only the demo-volunserve Firestore emulator is supported");
}
const stamp = () => firebase.firestore.FieldValue.serverTimestamp();
const payload = (uid) => ({
  cityName: "City of San Jose del Monte",
  emergencyHotline: "911",
  supportEmail: "",
  publicServiceNotice: "VolunServe requires internet access and does not replace 911.",
  liveLocationRetentionHours: 24,
  updatedAt: stamp(),
  updatedBy: uid,
});
function saveSettingsAndLog(db, uid, id) {
  const batch = db.batch();
  batch.set(db.doc("systemSettings/public"), payload(uid));
  batch.set(db.doc("adminLogs/" + id), {
    actionType: "system_settings_updated",
    targetType: "system_settings",
    targetId: "public",
    adminUid: uid,
    adminName: "Emulator Governance Actor",
    description: "Synthetic settings update for authorization regression.",
    createdAt: stamp(),
  });
  return batch.commit();
}
async function main() {
  const env = await initializeTestEnvironment({
    projectId: "demo-volunserve",
    firestore: { rules: fs.readFileSync(
      path.resolve(__dirname, "../firestore.rules"), "utf8") },
  });
  try {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.doc("users/governance-super").set({
        role: "superadmin", status: "approved",
      });
      await db.doc("users/governance-admin").set({
        role: "admin", status: "approved", adminStatus: "active",
      });
      await db.doc("users/governance-suspended").set({
        role: "admin", status: "approved", adminStatus: "suspended",
      });
      await db.doc("users/governance-resident").set({
        role: "resident", status: "approved", residentAccess: true,
      });
    });

    const superDb = env.authenticatedContext("governance-super").firestore();
    const adminDb = env.authenticatedContext("governance-admin").firestore();
    const suspendedDb = env.authenticatedContext("governance-suspended").firestore();
    const residentDb = env.authenticatedContext("governance-resident").firestore();
    const anonymousDb = env.unauthenticatedContext().firestore();

    await assertSucceeds(saveSettingsAndLog(superDb, "governance-super", "accepted"));
    const settings = await assertSucceeds(anonymousDb.doc("systemSettings/public").get());
    if (settings.data().updatedBy !== "governance-super") {
      throw Error("Authorized system settings update was not persisted");
    }
    await assertSucceeds(superDb.doc("adminLogs/accepted").get());
    await assertFails(adminDb.doc("adminLogs/accepted").get());
    await assertFails(residentDb.collection("adminLogs").get());

    // Even though operational Admin can create its own audit events, a
    // mixed unauthorized batch MUST roll back the audit event as well.
    await assertFails(saveSettingsAndLog(adminDb, "governance-admin", "rejected-admin"));
    await assertFails(saveSettingsAndLog(suspendedDb, "governance-suspended", "rejected-suspended"));
    await assertFails(saveSettingsAndLog(residentDb, "governance-resident", "rejected-resident"));
    await assertFails(saveSettingsAndLog(anonymousDb, "anonymous", "rejected-anonymous"));

    const current = await superDb.doc("systemSettings/public").get();
    if (current.data().updatedBy !== "governance-super") {
      throw Error("A rejected settings write changed authorized settings");
    }
    for (const id of ["rejected-admin", "rejected-suspended",
                       "rejected-resident", "rejected-anonymous"]) {
      const entry = await superDb.doc("adminLogs/" + id).get();
      if (entry.exists) throw Error("Rejected batch left an audit record: " + id);
    }
    console.log("PASS: only Super Admin can write settings with audit event; rejected batches roll back");
  } finally {
    await env.cleanup();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
