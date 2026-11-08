#!/usr/bin/env node
"use strict";
/**
 * Staff-scope regression tests against Firestore Emulator ONLY.
 * Confirms localizing Admin/Super Admin helpers preserves verified sign-in,
 * suspension checks, private audit logs and admin announcement reads.
 */
const fs=require("node:fs");
const {initializeTestEnvironment,assertSucceeds,assertFails}=
 require("@firebase/rules-unit-testing");
const {doc,setDoc,getDoc,Timestamp}=require("firebase/firestore");
async function main(){
 if(!process.env.FIRESTORE_EMULATOR_HOST){
  throw Error("BLOCKED: Firestore emulator required. Production access is forbidden.");
 }
 const env=await initializeTestEnvironment({
  projectId:"demo-volunserve-staff-helper-scope-20261109",
  firestore:{rules:fs.readFileSync("firestore.rules","utf8")}
 });
 try{
  await env.withSecurityRulesDisabled(async ctx=>{
   const db=ctx.firestore();
   for(const [uid,role,adminStatus] of [
    ["root","superadmin","active"],
    ["manager","admin","active"],
    ["suspended-root","superadmin","suspended"],
    ["resident","resident","active"]]){
    await setDoc(doc(db,"users",uid),{
     uid,role,email:uid+"@example.com",status:"approved",adminStatus,
     residentAccess:role==="resident"
    });
   }
   await setDoc(doc(db,"announcements","public"),{
    title:"Public update",publishAt:Timestamp.fromMillis(1)
   });
   await setDoc(doc(db,"lguAdminCredentialReviews","account1"),{
    reviewStatus:"verified",targetUid:"account1"
   });
   await setDoc(doc(db,"adminLogs","existing"),{action:"existing"});
  });
  const db=(uid,emailVerified=true)=>
   env.authenticatedContext(uid,{
    email:uid+"@example.com",email_verified:emailVerified
   }).firestore();
  const root=db("root"),manager=db("manager"),resident=db("resident");
  const suspended=db("suspended-root"),unverifiedRoot=db("root",false);
  let count=0;
  const ok=async x=>{await assertSucceeds(x);count++;};
  const denied=async x=>{await assertFails(x);count++;};

  // Exact Super Admin only: never broaden these operations to ordinary Admin.
  await ok(setDoc(doc(root,"address_regions","region1"),{name:"Region 1"}));
  await denied(setDoc(doc(manager,"address_regions","region2"),{name:"Region 2"}));
  await denied(setDoc(doc(unverifiedRoot,"address_regions","region3"),{name:"Region 3"}));
  const settings={
   cityName:"San Jose del Monte",emergencyHotline:"911",
   supportEmail:"support@example.com",
   publicServiceNotice:"Public information for residents.",
   liveLocationRetentionHours:24,
   updatedAt:Timestamp.now(),updatedBy:"root"
  };
  await ok(setDoc(doc(root,"systemSettings","public"),settings));
  await denied(setDoc(doc(manager,"systemSettings","public"),{...settings,updatedBy:"manager"}));
  await denied(setDoc(doc(suspended,"systemSettings","public"),{
   ...settings,updatedBy:"suspended-root"
  }));
  await denied(setDoc(doc(unverifiedRoot,"systemSettings","public"),settings));

  await ok(getDoc(doc(root,"lguAdminCredentialReviews","account1")));
  await denied(getDoc(doc(manager,"lguAdminCredentialReviews","account1")));
  await denied(getDoc(doc(unverifiedRoot,"lguAdminCredentialReviews","account1")));

  // Admin OR Super Admin creation; only Super Admin reads audit logs.
  await ok(setDoc(doc(manager,"adminLogs","new"),{action:"admin action"}));
  await ok(setDoc(doc(root,"adminActivityLogs","new"),{action:"super action"}));
  await ok(getDoc(doc(root,"adminLogs","new")));
  await ok(getDoc(doc(root,"adminActivityLogs","new")));
  await denied(getDoc(doc(manager,"adminLogs","new")));
  await denied(getDoc(doc(resident,"adminActivityLogs","new")));
  await denied(setDoc(doc(suspended,"adminActivityLogs","bad"),{action:"suspended"}));
  await denied(setDoc(doc(unverifiedRoot,"adminLogs","bad"),{action:"unverified"}));

  for(const context of [root,manager,resident]){
   await ok(getDoc(doc(context,"announcements","public")));
  }
  await denied(getDoc(doc(unverifiedRoot,"announcements","public")));
  await denied(getDoc(doc(suspended,"announcements","public")));
  if(count<20)throw Error("Expected comprehensive staff permission matrix");
  console.log("PASS: "+count+" Firestore emulator assertions for scoped staff roles, private logs, verified email and suspended accounts.");
 }finally{await env.cleanup();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
