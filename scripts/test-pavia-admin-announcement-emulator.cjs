"use strict";
/* Local-only end-to-end Firebase Rules test: actual LGU announcement writes. */
const fs = require("node:fs");
const path = require("node:path");
const {initializeTestEnvironment, assertFails, assertSucceeds} = require("@firebase/rules-unit-testing");
const firebase = require("firebase/compat/app");
require("firebase/compat/firestore");
if (!process.env.FIRESTORE_EMULATOR_HOST) {
 console.error("Firestore emulator required. No production writes allowed.");
 process.exit(1);
}
const stamp = () => firebase.firestore.FieldValue.serverTimestamp();
const doc = (adminUid, area, message = "Official barangay advisory confirmed for public residents.") => ({
  title: "Community Advisory",
  message, audience: area, priority: "normal",
  publishAt: stamp(), linkUrl: "", imageUrl: "",
  createdBy: adminUid, createdAt: stamp(), updatedAt: stamp(),
});
(async () => {
 const env = await initializeTestEnvironment({
  projectId: "demo-volunserve",
  firestore: {rules:fs.readFileSync(path.resolve(__dirname,"..","firestore.rules"),"utf8")},
 });
 try {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx=>{
   const db=ctx.firestore();
   await db.doc("users/pavia-admin").set({uid:"pavia-admin",email:"admin@example.test",role:"admin",status:"approved",adminStatus:"active",barangay:"Muzon"});
   await db.doc("users/pavia-suspended").set({uid:"pavia-suspended",email:"suspended@example.test",role:"admin",status:"approved",adminStatus:"suspended",barangay:"Muzon"});
   await db.doc("users/pavia-resident").set({uid:"pavia-resident",email:"resident@example.test",role:"resident",status:"approved",barangay:"Muzon"});
   await db.doc("users/pavia-unassigned").set({uid:"pavia-unassigned",email:"no-area@example.test",role:"admin",status:"approved",adminStatus:"active",barangay:""});
  });
  const valid = env.authenticatedContext("pavia-admin").firestore();
  const suspended=env.authenticatedContext("pavia-suspended").firestore();
  const resident=env.authenticatedContext("pavia-resident").firestore();
  const missing=env.authenticatedContext("pavia-unassigned").firestore();
  await assertSucceeds(valid.collection("announcements").add(doc("pavia-admin","Muzon")));
  await assertFails(valid.collection("announcements").add(doc("pavia-admin","Tungko")));
  await assertFails(valid.collection("announcements").add(doc("pavia-admin","Muzon","Too short")));
  await assertFails(suspended.collection("announcements").add(doc("pavia-suspended","Muzon")));
  await assertFails(resident.collection("announcements").add(doc("pavia-resident","Muzon")));
  await assertFails(missing.collection("announcements").add(doc("pavia-unassigned","Muzon")));
  await assertSucceeds(valid.collection("announcements").get());
  console.log("PASS actual Firestore announcement publishing: assigned barangay only, min length, admin access");
 }finally {await env.cleanup();}
})().catch(e=>{console.error(e);process.exit(1)});
