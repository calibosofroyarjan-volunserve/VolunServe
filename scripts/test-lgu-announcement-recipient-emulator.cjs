"use strict";
// Firestore emulator only: no production data, Auth accounts or published rules.
const fs=require("node:fs");
const assert=require("node:assert/strict");
const {initializeTestEnvironment,assertSucceeds,assertFails}=require("@firebase/rules-unit-testing");
const firebase=require("firebase/compat/app");
require("firebase/compat/firestore");
if(!process.env.FIRESTORE_EMULATOR_HOST||!process.env.LGU_RECIPIENT_RULES_FILE)
  throw Error("Refusing non-emulator LGU announcement recipient validation");
const stamp=()=>firebase.firestore.FieldValue.serverTimestamp();
const notice=(creator,area)=>({
  title:"Verified LGU public advisory",message:"Official barangay notice for local residents and volunteers.",
  audience:area,priority:"normal",publishAt:stamp(),createdBy:creator,
  createdAt:stamp(),updatedAt:stamp(),linkUrl:"",imageUrl:""
});
(async()=>{
const env=await initializeTestEnvironment({
  projectId:"demo-volunserve",
  firestore:{rules:fs.readFileSync(process.env.LGU_RECIPIENT_RULES_FILE,"utf8")}
});
try{
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx=>{
    const db=ctx.firestore();
    await db.doc("users/active-no-area").set({uid:"active-no-area",role:"admin",status:"approved",
      adminStatus:"active",barangay:"",fullName:"Test authorized LGU Admin"});
    await db.doc("users/active-assigned").set({uid:"active-assigned",role:"admin",status:"approved",
      adminStatus:"active",barangay:"Citrus"});
    await db.doc("users/suspended").set({uid:"suspended",role:"admin",status:"approved",
      adminStatus:"suspended",barangay:""});
    await db.doc("users/resident").set({uid:"resident",role:"resident",status:"approved",barangay:"Citrus"});
    await db.doc("users/system").set({uid:"system",role:"superadmin",status:"approved"});
  });
  const empty=env.authenticatedContext("active-no-area").firestore();
  const assigned=env.authenticatedContext("active-assigned").firestore();
  const suspended=env.authenticatedContext("suspended").firestore();
  const resident=env.authenticatedContext("resident").firestore();
  const superDb=env.authenticatedContext("system").firestore();
  await assertSucceeds(empty.collection("announcements").add(notice("active-no-area","Muzon East")));
  await assertSucceeds(empty.collection("announcements").add(notice("active-no-area","Citrus")));
  await assertSucceeds(assigned.collection("announcements").add(notice("active-assigned","Muzon East")));
  await assertFails(empty.collection("announcements").add(notice("active-no-area","all")));
  await assertFails(empty.collection("announcements").add(notice("active-no-area","not-an-SJDM-barangay")));
  await assertFails(empty.collection("announcements").add(notice("other-user","Muzon East")));
  await assertFails(empty.collection("announcements").add({...notice("active-no-area","Citrus"),rogueRole:"superadmin"}));
  await assertFails(empty.collection("announcements").add({...notice("active-no-area","Citrus"),message:"short"}));
  await assertFails(suspended.collection("announcements").add(notice("suspended","Muzon East")));
  await assertFails(resident.collection("announcements").add(notice("resident","Muzon East")));
  await assertFails(superDb.collection("announcements").add(notice("system","Muzon East")));
  const profile=await assertSucceeds(empty.doc("users/active-no-area").get());
  assert.equal(profile.data().barangay,"");
  console.log("PASS: active LGU Admin can select a validated SJDM recipient with blank profile area; global/system, spoofing, invalid recipients and unauthorized roles rejected.");
}finally{await env.cleanup();}
})().catch(e=>{console.error(e);process.exitCode=1;});
