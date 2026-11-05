"use strict";
/* Emulated authorization only. Never connect to a production Firebase project. */
const fs = require("node:fs");
const path = require("node:path");
const { initializeTestEnvironment, assertFails, assertSucceeds } = require("@firebase/rules-unit-testing");
const firebase = require("firebase/compat/app");
require("firebase/compat/firestore");

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("Run this test against the Firestore emulator, never production.");
  process.exit(1);
}

const publishedAt = firebase.firestore.Timestamp.fromDate(new Date(Date.now() - 3600000));
const futureAt = firebase.firestore.Timestamp.fromDate(new Date(Date.now() + 3600000));
const cutoff = firebase.firestore.Timestamp.now();
const makeNotice = (audience, publishAt = publishedAt) => ({
  audience, publishAt,
  title: "Demo Community Update",
  message: "This is a simulated announcement for Firestore access testing.",
  createdBy: "pavia-admin",
  createdAt: publishedAt,
  updatedAt: publishedAt,
  priority: "normal",
  linkUrl: "",
  imageUrl: "",
});

(async () => {
  const env = await initializeTestEnvironment({
    projectId: "demo-volunserve",
    firestore: { rules: fs.readFileSync(path.resolve(__dirname, "..", "firestore.rules"), "utf8") },
  });
  try {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async ctx => {
      const db = ctx.firestore();
      await db.doc("users/demo-admin").set({
        uid: "demo-admin", role: "admin", status: "approved",
        adminStatus: "active", barangay: "Muzon East",
      });
      await db.doc("users/demo-muzon").set({
        uid: "demo-muzon", role: "resident", status: "approved",
        barangay: "Muzon East",
      });
      await db.doc("users/demo-tungko").set({
        uid: "demo-tungko", role: "resident", status: "approved",
        barangay: "Tungko",
      });
      await db.doc("users/demo-pending").set({
        uid: "demo-pending", role: "resident", status: "pending",
        barangay: "Muzon East",
      });
      await Promise.all([
        db.doc("announcements/local-muzon").set(makeNotice("Muzon East")),
        db.doc("announcements/local-tungko").set(makeNotice("Tungko")),
        db.doc("announcements/citywide").set(makeNotice("all")),
        db.doc("announcements/scheduled").set(makeNotice("Muzon East", futureAt)),
      ]);
    });

    const admin = env.authenticatedContext("demo-admin").firestore();
    const muzon = env.authenticatedContext("demo-muzon").firestore();
    const tungko = env.authenticatedContext("demo-tungko").firestore();
    const pending = env.authenticatedContext("demo-pending").firestore();
    const unauthenticated = env.unauthenticatedContext().firestore();

    const permittedQuery = (db, audience) => db.collection("announcements")
      .where("audience", "==", audience)
      .where("publishAt", "<=", cutoff)
      .orderBy("publishAt", "desc");

    await assertSucceeds(muzon.doc("announcements/local-muzon").get());
    await assertSucceeds(muzon.doc("announcements/citywide").get());
    await assertSucceeds(tungko.doc("announcements/local-tungko").get());
    await assertSucceeds(tungko.doc("announcements/citywide").get());
    await assertFails(muzon.doc("announcements/local-tungko").get());
    await assertFails(tungko.doc("announcements/local-muzon").get());
    await assertFails(muzon.doc("announcements/scheduled").get());
    await assertFails(pending.doc("announcements/local-muzon").get());
    await assertFails(unauthenticated.doc("announcements/citywide").get());

    console.log('Testing scoped Muzon list...');
    await assertSucceeds(permittedQuery(muzon, "Muzon East").get());
    console.log('Testing scoped global list...');
    await assertSucceeds(permittedQuery(muzon, "all").get());
    await assertSucceeds(permittedQuery(tungko, "Tungko").get());
    await assertFails(permittedQuery(muzon, "Tungko").get());
    await assertFails(permittedQuery(tungko, "Muzon East").get());
    await assertFails(muzon.collection("announcements").get());
    await assertFails(pending.collection("announcements").get());
    await assertSucceeds(admin.collection("announcements").get());

    console.log("PASS Firestore announcement access: published city-wide + own barangay only");
  } finally {
    await env.cleanup();
  }
})().catch(error => { console.error(error); process.exit(1); });
