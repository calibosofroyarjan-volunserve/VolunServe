"use strict";
/** Test only with the local Firestore emulator and synthetic staff accounts. */
const fs=require("node:fs"),path=require("node:path");
const {initializeTestEnvironment,assertSucceeds,assertFails}=require("@firebase/rules-unit-testing");
const firebase=require("firebase/compat/app");require("firebase/compat/firestore");
if(!process.env.FIRESTORE_EMULATOR_HOST) throw Error("FIRESTORE_EMULATOR_HOST required");
const stamp=()=>firebase.firestore.FieldValue.serverTimestamp();
const notice=(uid,barangay)=>({
  title:"Official Test Advisory",
  message:"Synthetic LGU notice; not an actual emergency advisory.",
  linkUrl:"",imageUrl:"",audience:barangay,priority:"normal",
  publishAt:stamp(),createdBy:uid,createdAt:stamp(),updatedAt:stamp(),
});
async function main(){
 const env=await initializeTestEnvironment({projectId:"demo-volunserve",
  firestore:{rules:fs.readFileSync(path.resolve(__dirname,"../firestore.rules"),"utf8")}});
 try{
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx=>{
   const db=ctx.firestore();
   await db.doc("users/lgu-city-A").set({uid:"lgu-city-A",role:"admin",
     status:"approved",adminStatus:"active",barangay:"Dulong Bayan"});
   await db.doc("users/lgu-city-B").set({uid:"lgu-city-B",role:"admin",
     status:"approved",adminStatus:"active",barangay:"Assumption"});
   await db.doc("users/pavia-resident").set({uid:"pavia-resident",role:"resident",
     status:"approved",residentAccess:true,activeMode:"resident",barangay:"Dulong Bayan"});
   await db.doc("users/pavia-super").set({uid:"pavia-super",role:"superadmin",status:"approved"});
  });
  const first=env.authenticatedContext("lgu-city-A").firestore();
  const other=env.authenticatedContext("lgu-city-B").firestore();
  const resident=env.authenticatedContext("pavia-resident").firestore();
  const programmer=env.authenticatedContext("pavia-super").firestore();
  await assertSucceeds(first.doc("announcements/pavia-city").set(notice("lgu-city-A","Assumption")));
  await assertFails(first.doc("announcements/pavia-invalid").set(notice("lgu-city-A","Quezon City")));
  await assertFails(resident.doc("announcements/pavia-resident").set(notice("pavia-resident","Assumption")));
  await assertFails(programmer.doc("announcements/pavia-super").set(notice("pavia-super","Assumption")));
  await assertFails(other.doc("announcements/pavia-city").update({message:"Impersonated announcement text"}));
  await assertFails(first.doc("announcements/pavia-city").update({audience:"Citrus"}));
  await assertSucceeds(first.doc("announcements/pavia-city").update({message:"Edited and verified official sample announcement."}));
  console.log("PASS: LGU Admin can select official SJDM barangay, residents/superadmin excluded, and creators own edits");
 }finally{await env.cleanup()}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
