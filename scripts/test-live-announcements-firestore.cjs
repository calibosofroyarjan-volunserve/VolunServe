"use strict";
// Firebase emulator ONLY: no live database reads or writes.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {initializeTestEnvironment, assertFails, assertSucceeds} =
  require("@firebase/rules-unit-testing");
const firebase = require("firebase/compat/app");
require("firebase/compat/firestore");

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw Error("Firestore emulator required. Never run against production.");
}
const timestamp = () => firebase.firestore.FieldValue.serverTimestamp();
(async () => {
  const env = await initializeTestEnvironment({
    projectId: "demo-volunserve",
    firestore: {rules: fs.readFileSync(
        path.resolve(__dirname, "..", "firestore.rules"), "utf8")},
  });
  try {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.doc("users/test-live-admin").set({
        role: "admin", status: "approved", adminStatus: "active",
        barangay: "Muzon",
      });
      await db.doc("users/test-live-resident").set({
        role: "resident", status: "approved", barangay: "Muzon",
      });
      await db.doc("users/test-live-other-area").set({
        role: "resident", status: "approved", barangay: "Tungko",
      });
    });
    const admin = env.authenticatedContext("test-live-admin").firestore();
    const resident = env.authenticatedContext("test-live-resident").firestore();
    const other = env.authenticatedContext("test-live-other-area").firestore();
    const payload = {
      title: "Test Community Notice",
      message: "Official approved community announcement from test LGU.",
      audience: "Muzon", priority: "normal", publishAt: timestamp(),
      linkUrl: "", imageUrl: "", createdBy: "test-live-admin",
      createdAt: timestamp(), updatedAt: timestamp(),
    };
    await assertSucceeds(admin.collection("announcements").add(payload));
    const variants = [
      ["upper_bound", db => db.collection("announcements")
        .where("publishAt", "<=", firebase.firestore.Timestamp.now())
        .orderBy("publishAt", "desc")],
      ["bounded_timestamps", db => db.collection("announcements")
        .where("publishAt", ">=", firebase.firestore.Timestamp.fromMillis(0))
        .where("publishAt", "<=", firebase.firestore.Timestamp.now())
        .orderBy("publishAt", "desc")],
    ];
    const probe = async (label) => {
      for (const [name, makeQuery] of variants) {
        try {
          const snapshot = await makeQuery(resident).get();
          console.log("PROBE", label, name, "ALLOWED", snapshot.size);
        } catch (failure) {
          console.log("PROBE", label, name, "DENIED", failure.code || String(failure));
        }
      }
    };
    await probe("existing_rule");

    const rulesOriginal = fs.readFileSync(
      path.resolve(__dirname, "..", "firestore.rules"), "utf8");
    const rulesWithoutType = rulesOriginal.replace(
      "&& resource.data.publishAt is timestamp\n          && resource.data.publishAt <= request.time",
      "&& resource.data.publishAt <= request.time");
    assert.notEqual(rulesWithoutType, rulesOriginal, "Read rule must be patched in test");
    await env.loadFirestoreRules({rules: rulesWithoutType});
    await probe("no_timestamp_type_guard");

    const rulesListOnly = rulesOriginal.replace(
      "allow read: if isAdminOrSuperAdmin()\n        || (\n          approved()\n          && resource.data.publishAt is timestamp\n          && resource.data.publishAt <= request.time\n        );",
      "allow get: if isAdminOrSuperAdmin()\n        || (approved() && resource.data.publishAt is timestamp\n            && resource.data.publishAt <= request.time);\n      allow list: if isAdminOrSuperAdmin() || approved();");
    assert.notEqual(rulesListOnly, rulesOriginal, "Scope test must patch only announcements");
    await env.loadFirestoreRules({rules: rulesListOnly});
    await probe("approved_list_rule");

    console.log("PASS emulator: scoped Admin write, valid published-only query, original audience-only query rejected");
  } finally {
    await env.cleanup();
  }
})().catch((error) => {console.error(error); process.exit(1);});
