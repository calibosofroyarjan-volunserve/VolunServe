"use strict";
// Isolated Firestore emulator only: never connects to production.
const fs = require("node:fs");
const path = require("node:path");
const { initializeTestEnvironment, assertFails, assertSucceeds } = require("@firebase/rules-unit-testing");
const firebase = require("firebase/compat/app");
require("firebase/compat/firestore");

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("BLOCKED: Firestore emulator required. Do not run against production.");
  process.exit(1);
}

const stamp = () => firebase.firestore.FieldValue.serverTimestamp();
const validPost = uid => ({
  title: "Official VolunServe Advisory",
  message: "This community-wide notice is published immediately.",
  audience: "all",
  priority: "normal",
  linkUrl: "",
  imageUrl: "",
  publishAt: stamp(),
  createdBy: uid,
  createdAt: stamp(),
  updatedAt: stamp()
});

(async () => {
  const env = await initializeTestEnvironment({
    projectId: "demo-volunserve",
    firestore: { rules: fs.readFileSync(path.resolve(__dirname, "..", "firestore.rules"), "utf8") }
  });
  try {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async ctx => {
      const db = ctx.firestore();
      for (const user of [
        { id: "admin", email: "admin@example.test", role: "admin", status: "approved", adminStatus: "active" },
        { id: "resident", email: "resident@example.test", role: "resident", status: "approved" },
        { id: "volunteer", email: "volunteer@example.test", role: "volunteer", status: "approved" },
        { id: "suspended", email: "suspended@example.test", role: "resident", status: "suspended" },
        { id: "unverified", email: "unverified@example.test", role: "resident", status: "approved" }
      ]) {
        await db.doc("users/" + user.id).set({
          uid: user.id, email: user.email, role: user.role, status: user.status,
          adminStatus: user.adminStatus || "active"
        });
      }
      await db.doc("announcements/historical-public").set({
        title: "Older published advisory",
        message: "This previously published message must remain visible.",
        audience: "all", priority: "normal",
        publishAt: firebase.firestore.Timestamp.fromDate(new Date("2026-11-06T04:59:19Z")),
        createdBy: "admin", createdAt: firebase.firestore.Timestamp.fromDate(new Date("2026-11-06T04:59:19Z"))
      });
      await db.doc("announcements/local-only").set({
        title: "Local draft",
        message: "This is not a community-wide announcement.",
        audience: "Barangay A", priority: "normal",
        publishAt: firebase.firestore.Timestamp.fromDate(new Date("2026-11-06T04:59:19Z")),
        createdBy: "admin", createdAt: firebase.firestore.Timestamp.fromDate(new Date("2026-11-06T04:59:19Z"))
      });
    });
    const session = (uid, verified = true) => env.authenticatedContext(uid, {
      email: uid + "@example.test", email_verified: verified
    }).firestore();
    const admin = session("admin");
    const resident = session("resident");
    const volunteer = session("volunteer");
    const suspended = session("suspended");
    const unverified = session("unverified", false);
    const unauthenticated = env.unauthenticatedContext().firestore();

    await assertSucceeds(admin.collection("announcements").add(validPost("admin")));
    await assertFails(resident.collection("announcements").add(validPost("resident")));
    await assertFails(unverified.collection("announcements").where("audience", "==", "all").get());
    await assertFails(suspended.collection("announcements").where("audience", "==", "all").get());
    await assertFails(unauthenticated.collection("announcements").where("audience", "==", "all").get());
    await assertFails(resident.collection("announcements").get());
    await assertFails(volunteer.collection("announcements").where("audience", "==", "Barangay A").get());
    const resultResident = await assertSucceeds(resident.collection("announcements").where("audience", "==", "all").get());
    const resultVolunteer = await assertSucceeds(volunteer.collection("announcements").where("audience", "==", "all").get());
    if (!resultResident.docs.some(doc => doc.id === "historical-public") ||
        !resultVolunteer.docs.some(doc => doc.id === "historical-public") ||
        resultResident.docs.some(doc => doc.id === "local-only")) {
      throw Error("Announcements must preserve historical community-wide notices, without leaking local-only docs.");
    }
    await assertFails(admin.collection("announcements").add({
      ...validPost("admin"), publishAt: firebase.firestore.Timestamp.fromDate(new Date("2035-01-01T00:00:00Z"))
    }));
    console.log("PASS: approved Resident/Volunteer can read existing and new community-wide announcements; guest, unverified, suspended and non-admin writes denied.");
  } finally {
    await env.cleanup();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
