"use strict";
// Verify the fetched-and-patched ACTIVE production rules in the emulator.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {initializeTestEnvironment, assertSucceeds, assertFails} =
  require("@firebase/rules-unit-testing");
const firebase = require("firebase/compat/app");
require("firebase/compat/firestore");
if (!process.env.FIRESTORE_EMULATOR_HOST) throw Error("Emulator required.");
(async () => {
  const env = await initializeTestEnvironment({
    projectId: "demo-volunserve",
    firestore: {rules:fs.readFileSync(path.resolve(__dirname,"..","firestore.rules"),"utf8")},
  });
  try {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async ctx => {
      const db=ctx.firestore();
      await db.doc("users/reader-test").set({
        role:"resident",status:"approved",barangay:"Muzon",
        residentAccess:true,identityStatus:"verified",
      });
      await db.doc("announcements/notice-test").set({
        title:"Official Community Notice",
        message:"Published announcement used for read-permission test",
        audience:"Muzon",
        publishAt:firebase.firestore.Timestamp.fromMillis(Date.now()-10000),
        createdAt:firebase.firestore.Timestamp.fromMillis(Date.now()-10000),
        createdBy:"admin-test",
      });
    });
    const resident = env.authenticatedContext("reader-test").firestore();
    const q = resident.collection("announcements")
      .where("publishAt","<=",firebase.firestore.Timestamp.now())
      .orderBy("publishAt","desc");
    const result = await assertSucceeds(q.get());
    assert.ok(result.docs.some(d=>d.id==="notice-test"),"Published notices must be readable");
    const anonymous = env.unauthenticatedContext().firestore();
    await assertFails(anonymous.collection("announcements").get());
    console.log("PASS active rules snapshot: approved resident reads published notice; anonymous denied.");
  } finally { await env.cleanup(); }
})().catch(e=>{console.error(e);process.exit(1);});
