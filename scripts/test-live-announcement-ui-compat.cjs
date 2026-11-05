"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const {initializeTestEnvironment,assertFails,assertSucceeds}=require("@firebase/rules-unit-testing");
const firebase=require("firebase/compat/app");
require("firebase/compat/firestore");

if(!process.env.FIRESTORE_EMULATOR_HOST) throw Error("FIRESTORE_EMULATOR_HOST is required; refusing any non-emulator test");
const rulesPath=process.env.LIVE_FIRESTORE_RULES_FILE;
if(!rulesPath||!fs.existsSync(rulesPath)) throw Error("Actual published Firestore Rules source is required");
const now=firebase.firestore.Timestamp.now();
const past=firebase.firestore.Timestamp.fromDate(new Date(Date.now()-3600000));
const notice=(audience)=>({
  title:"DEMO Community Announcement",message:"Test-only published notice for a community.",
  audience,publishAt:past,createdAt:past,updatedAt:past,
  createdBy:"demo-admin",priority:"normal",imageUrl:"",linkUrl:""
});
(async()=>{
 const env=await initializeTestEnvironment({
   projectId:"demo-volunserve",
   firestore:{rules:fs.readFileSync(rulesPath,"utf8")}
 });
 try{
   await env.clearFirestore();
   await env.withSecurityRulesDisabled(async ctx=>{
     const db=ctx.firestore();
     await db.doc("users/demo-resident").set({
       uid:"demo-resident",role:"resident",status:"approved",barangay:"Muzon East",
       residentAccess:true,volunteerAccess:false
     });
     await db.doc("announcements/muzon").set(notice("Muzon East"));
     await db.doc("announcements/tungko").set(notice("Tungko"));
     await db.doc("announcements/citywide").set(notice("all"));
   });
   const db=env.authenticatedContext("demo-resident").firestore();
   const published=(audience)=>db.collection("announcements")
     .where("audience","==",audience)
     .where("publishAt","<=",now)
     .orderBy("publishAt","desc");
   const [local,citywide]=await Promise.all([
     assertSucceeds(published("Muzon East").get()),
     assertSucceeds(published("all").get())
   ]);
   assert.deepEqual(local.docs.map(d=>d.id),["muzon"]);
   assert.deepEqual(citywide.docs.map(d=>d.id),["citywide"]);
   // The old broad collection query was already permission-denied on the
   // old live Ruleset. The repaired policy intentionally requires audience.
   await assertFails(db.collection("announcements")
      .where("publishAt","<=",now)
      .orderBy("publishAt","desc").get());
   await assertFails(published("Tungko").get());
   await assertFails(db.doc("announcements/tungko").get());
   console.log("PASS: active live Rules allow own barangay + city-wide only");
   console.log("PASS: cross-barangay and unscoped reads denied at server");
 }finally{await env.cleanup();}
})().catch(e=>{console.error(e);process.exitCode=1;});
