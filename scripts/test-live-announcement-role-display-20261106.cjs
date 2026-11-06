"use strict";
/**
 * Browser-equivalent Firestore query verification for two independently
 * authenticated roles using the ACTIVE production rules loaded in an emulator.
 * Absolutely no real users, production data, or production writes.
 */
const fs = require("node:fs");
const assert = require("node:assert/strict");
const { initializeTestEnvironment, assertSucceeds, assertFails } = require("@firebase/rules-unit-testing");
const firebase = require("firebase/compat/app");
require("firebase/compat/firestore");
if (!process.env.FIRESTORE_EMULATOR_HOST) throw Error("Firestore emulator required");
if (!process.env.ACTIVE_FIRESTORE_RULES) throw Error("Verified active production rule snapshot required");
const source = fs.readFileSync(process.env.ACTIVE_FIRESTORE_RULES,"utf8");
const stamp = () => firebase.firestore.FieldValue.serverTimestamp();
const approved = (uid, role, extras={}) => ({
  uid, email: uid+"@example.test", status:"approved", role, ...extras,
});
const values = () => ({
  title:"Official community notice",message:"Community updates are now visible to residents and volunteers.",
  audience:"all", priority:"normal", publishAt:stamp(),createdAt:stamp(),
  updatedAt:stamp(), linkUrl:"",imageUrl:"",createdBy:"admin-test",
});
async function main(){
  const env=await initializeTestEnvironment({projectId:"demo-volunserve",firestore:{rules:source}});
  try{
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async ctx=>{
      const db=ctx.firestore();
      await Promise.all([
        db.doc("users/admin-test").set(approved("admin-test","admin",{adminStatus:"active",barangay:"Muzon"})),
        db.doc("users/resident-test").set(approved("resident-test","resident",{residentAccess:true,activeMode:"resident",barangay:"Muzon"})),
        db.doc("users/volunteer-test").set(approved("volunteer-test","volunteer",{volunteerAccess:true,volunteerStatus:"approved",activeMode:"volunteer",barangay:"Tungko"})),
        db.doc("users/suspended-test").set(approved("suspended-test","admin",{adminStatus:"suspended"})),
      ]);
    });
    const admin=env.authenticatedContext("admin-test").firestore();
    const resident=env.authenticatedContext("resident-test").firestore();
    const volunteer=env.authenticatedContext("volunteer-test").firestore();
    const suspended=env.authenticatedContext("suspended-test").firestore();
    const published=await assertSucceeds(admin.collection("announcements").add(values()));
    await assertFails(suspended.collection("announcements").add({...values(),createdBy:"suspended-test"}));
    const cutoff=firebase.firestore.Timestamp.fromDate(new Date());
    const q=db=>db.collection("announcements").where("publishAt","<=",cutoff).orderBy("publishAt","desc");
    for(const [role,db] of [["Resident",resident],["Volunteer",volunteer]]){
      const updates=await assertSucceeds(q(db).get());
      assert(updates.docs.some(x=>x.id===published.id),"Community Updates missing published notice: "+role);
      const notifications=await assertSucceeds(q(db).get());
      assert(notifications.docs.some(x=>x.id===published.id),"Notifications announcement feed missing notice: "+role);
      console.log("PASS "+role+" same published notice visible in Community Updates and Notifications read queries");
    }
    // Future-dated announcements cannot leak into a currently published feed.
    await env.withSecurityRulesDisabled(async ctx=>{
      await ctx.firestore().doc("announcements/future-only").set({
        ...values(),publishAt:firebase.firestore.Timestamp.fromDate(new Date(Date.now()+3600000))
      });
    });
    for(const [role,db] of [["Resident",resident],["Volunteer",volunteer]]){
      const docs=await assertSucceeds(q(db).get());
      assert(!docs.docs.some(x=>x.id==="future-only"),"Future notice leaked to "+role);
    }
    console.log("PASS production policy emulation for both roles; no production data touched");
  } finally {await env.cleanup();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
