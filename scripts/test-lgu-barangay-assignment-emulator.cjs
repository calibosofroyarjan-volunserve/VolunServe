"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const {initializeTestEnvironment,assertFails,assertSucceeds}=require("@firebase/rules-unit-testing");
const firebase=require("firebase/compat/app");
require("firebase/compat/firestore");
if(!process.env.FIRESTORE_EMULATOR_HOST || !process.env.LGU_ASSIGNMENT_RULES_FILE)
  throw Error("Refusing non-emulator LGU barangay authorization test");
const stamp=()=>firebase.firestore.FieldValue.serverTimestamp();
(async()=>{
const env=await initializeTestEnvironment({projectId:"demo-volunserve",firestore:{
  rules:fs.readFileSync(process.env.LGU_ASSIGNMENT_RULES_FILE,"utf8")
}});
try{
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async ctx=>{
   const db=ctx.firestore();
   await db.doc("users/system").set({uid:"system",role:"superadmin",status:"approved",fullName:"DEMO Super Admin"});
   await db.doc("users/staff").set({uid:"staff",role:"admin",status:"approved",adminStatus:"active",
     fullName:"DEMO LGU Admin",email:"staff@example.test",barangay:"",phoneNumber:""});
   await db.doc("users/super2").set({uid:"super2",role:"superadmin",status:"approved",barangay:""});
   await db.doc("users/resident").set({uid:"resident",role:"resident",status:"approved",barangay:"Muzon East"});
 });
 const superDb=env.authenticatedContext("system").firestore();
 const adminDb=env.authenticatedContext("staff").firestore();
 const residentDb=env.authenticatedContext("resident").firestore();
 const super2Db=env.authenticatedContext("super2").firestore();
 await assertSucceeds(adminDb.doc("users/staff").update({phoneNumber:"09120000000"}));
 await assertFails(adminDb.doc("users/staff").update({barangay:"Muzon East"}));
 await assertFails(super2Db.doc("users/super2").update({barangay:"Muzon East"}));
 await assertFails(residentDb.doc("users/staff").update({barangay:"Muzon East"}));
 await assertFails(superDb.doc("users/staff").update({
   barangay:"not a legitimate barangay",adminUpdatedBy:"system",adminUpdatedAt:stamp()
 }));
 await assertFails(superDb.doc("users/staff").update({
   barangay:"Muzon East",adminUpdatedBy:"staff",adminUpdatedAt:stamp()
 }));
 await assertFails(superDb.doc("users/staff").update({
   barangay:"Muzon East",role:"superadmin",adminUpdatedBy:"system",adminUpdatedAt:stamp()
 }));
 await assertFails(superDb.doc("users/staff").update({
   barangay:"Muzon East",adminUpdatedBy:"system"
 }));
 const batch=superDb.batch();
 batch.update(superDb.doc("users/staff"),{
   barangay:"Muzon East",adminUpdatedBy:"system",adminUpdatedAt:stamp()
 });
 batch.set(superDb.collection("adminLogs").doc("demo-audit"),{
   actionType:"admin_barangay_assigned",targetType:"user",targetId:"staff",adminUid:"system",
   adminName:"DEMO Super Admin",description:"DEMO verified LGU assignment",createdAt:stamp()
 });
 await assertSucceeds(batch.commit());
 const after=await assertSucceeds(adminDb.doc("users/staff").get());
 assert.equal(after.data().barangay,"Muzon East");
 let log;
 await env.withSecurityRulesDisabled(async ctx=>{log=await ctx.firestore().doc("adminLogs/demo-audit").get();});
 assert.equal(log?.data()?.actionType,"admin_barangay_assigned");
 await assertFails(adminDb.doc("users/staff").update({barangay:"Tungkong Mangga"}));
 console.log("PASS: Super Admin may assign verified SJDM LGU barangay with audit; self, resident, spoofed and invalid assignment blocked.");
}finally{await env.cleanup();}
})().catch(error=>{console.error(error);process.exitCode=1;});
