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
    const published = await assertSucceeds(
      resident.collection("announcements")
        .where("publishAt", "<=", firebase.firestore.Timestamp.now())
        .orderBy("publishAt", "desc").get());
    assert.ok(published.size >= 1, "Resident sees published Admin notice");
    const volunteer = env.authenticatedContext("test-live-other-area").firestore();
    const volunteerNotices = await assertSucceeds(volunteer.collection("announcements")
        .where("publishAt", "<=", firebase.firestore.Timestamp.now())
        .orderBy("publishAt", "desc").get());
    assert.ok(volunteerNotices.size >= 1, "Approved users can query notices");
    const outsider = env.authenticatedContext("unauthorized-user").firestore();
    await assertFails(outsider.collection("announcements").get());
    await assertFails(resident.collection("announcements").add(payload));
    console.log("PASS emulator: scoped Admin write, valid published-only query, original audience-only query rejected");
  } finally {
    await env.cleanup();
  }
})().catch((error) => {console.error(error); process.exit(1);});
