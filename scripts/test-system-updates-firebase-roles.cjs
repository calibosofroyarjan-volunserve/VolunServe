"use strict";
/**
 * Emulator-only permissions regression for the role-separated announcements.
 * Production Firebase writes are explicitly forbidden.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { initializeTestEnvironment, assertFails, assertSucceeds } = require("@firebase/rules-unit-testing");
const firebase = require("firebase/compat/app");
require("firebase/compat/firestore");

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.REVIEWED_RULES_FILE) {
  throw Error("Run only in Firebase Firestore emulator with REVIEWED_RULES_FILE; refusing production.");
}

const past = firebase.firestore.Timestamp.fromDate(new Date(Date.now() - 3600000));
const future = firebase.firestore.Timestamp.fromDate(new Date(Date.now() + 3600000));
const now = firebase.firestore.Timestamp.now();
const stamped = () => firebase.firestore.FieldValue.serverTimestamp();
const payload = (uid, area = "all", title = "Platform Maintenance Update", message = "VolunServe system services will undergo maintenance at a confirmed scheduled time.") => ({
  title, message, audience: area, priority: "normal",
  publishAt: stamped(), createdAt: stamped(), updatedAt: stamped(),
  createdBy: uid, imageUrl: "", linkUrl: "",
});
const existing = (uid, area) => ({
  title: "Published Test Notice", message: "Only a test announcement for audience isolation testing.",
  audience: area, priority: "normal", publishAt: past,
  createdAt: past, updatedAt: past, createdBy: uid, linkUrl: "", imageUrl: "",
});

(async()=>{
 const env = await initializeTestEnvironment({
   projectId: "demo-volunserve",
   firestore: { rules: fs.readFileSync(process.env.REVIEWED_RULES_FILE, "utf8") },
 });
 try {
   await env.clearFirestore();
   await env.withSecurityRulesDisabled(async ctx => {
     const db = ctx.firestore();
     const users = [
       ["super", { role: "superadmin", status: "approved", fullName: "DEMO Programmer" }],
       ["admin", { role: "admin", status: "approved", adminStatus: "active", barangay: "Muzon East" }],
       ["suspended", { role: "admin", status: "approved", adminStatus: "suspended", barangay: "Muzon East" }],
       ["muzon", { role: "resident", status: "approved", barangay: "Muzon East" }],
       ["tungko", { role: "volunteer", status: "approved", barangay: "Tungko" }],
       ["pending", { role: "resident", status: "pending", barangay: "Muzon East" }],
     ];
     await Promise.all(users.map(([uid,data])=>db.doc("users/"+uid).set({uid,...data})));
     await db.doc("announcements/system").set(existing("super","all"));
     await db.doc("announcements/local").set(existing("admin","Muzon East"));
     await db.doc("announcements/tungko").set(existing("admin","Tungko"));
     await db.doc("announcements/future").set({...existing("admin","Muzon East"),publishAt:future});
   });
   const auth = name=>env.authenticatedContext(name).firestore();
   const superadmin=auth("super"), admin=auth("admin"),suspended=auth("suspended");
   const muzon=auth("muzon"),tungko=auth("tungko"),pending=auth("pending");
   const guest=env.unauthenticatedContext().firestore();
   await assertSucceeds(superadmin.collection("announcements").add(payload("super","all")));
   await assertFails(superadmin.collection("announcements").add(payload("super","Muzon East")));
   await assertFails(superadmin.collection("announcements").add(payload("super","all","X")));
   await assertFails(superadmin.collection("announcements").add(payload("super","all","Good","Short")));
   await assertFails(superadmin.collection("announcements").add({...payload("super"),createdBy:"admin"}));
   await assertFails(superadmin.collection("announcements").add({...payload("super"),priority:"invalid"}));
   await assertFails(superadmin.collection("announcements").add({...payload("super"),untrusted:"field"}));
   await assertFails(admin.collection("announcements").add(payload("admin","all")));
   await assertSucceeds(admin.collection("announcements").add(payload("admin","Muzon East")));
   await assertFails(suspended.collection("announcements").add(payload("suspended","Muzon East")));
   await assertFails(muzon.collection("announcements").add(payload("muzon","all")));
   const published = (db,area)=>db.collection("announcements")
     .where("audience","==",area).where("publishAt","<=",now).orderBy("publishAt","desc");
   const global = await assertSucceeds(published(muzon,"all").get());
   assert(global.docs.some(d=>d.id==="system"));
   await assertSucceeds(published(muzon,"Muzon East").get());
   await assertSucceeds(published(tungko,"Tungko").get());
   await assertFails(published(muzon,"Tungko").get());
   await assertFails(published(tungko,"Muzon East").get());
   await assertFails(muzon.doc("announcements/tungko").get());
   await assertFails(muzon.doc("announcements/future").get());
   await assertFails(pending.doc("announcements/system").get());
   await assertFails(guest.doc("announcements/system").get());
   await assertFails(muzon.collection("announcements").get());
   console.log("PASS role-separated system/area notice publishing, validation and audience isolation");
 } finally {
   await env.cleanup();
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
