"use strict";
/**
 * Synthetic, local emulator data only.
 * Mandatory environment prevents accidental production Firebase writes.
 */
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
async function main(){
 const project="demo-volunserve";
 if(process.env.FIREBASE_AUTH_EMULATOR_HOST!=="127.0.0.1:9099" ||
    process.env.FIRESTORE_EMULATOR_HOST!=="127.0.0.1:8080" ||
    process.env.GCLOUD_PROJECT!==project){
   throw Error("BLOCKED: emulators and demo project required");
 }
 initializeApp({projectId:project});
 const auth=getAuth(), db=getFirestore();
 const roles=[
  ["resident","Resident Preview",{role:"resident",residentAccess:true,volunteerAccess:false,activeMode:"resident",identityStatus:"verified",identityVerified:true}],
  ["volunteer","Volunteer Preview",{role:"volunteer",residentAccess:true,volunteerAccess:true,volunteerStatus:"approved",activeMode:"volunteer",identityStatus:"verified",identityVerified:true}],
  ["admin","Admin Preview",{role:"admin",adminStatus:"active",residentAccess:false,volunteerAccess:false}],
  ["superadmin","Super Admin Preview",{role:"superadmin",residentAccess:false,volunteerAccess:false}]
 ];
 for(const [role,name,attrs] of roles){
  const uid="qa-ui-"+role;
  const email="preview."+role+"@example.com";
  await auth.createUser({uid,email,emailVerified:true,password:"DemoOnlyPassword!2026",displayName:name});
  await db.doc("users/"+uid).set({
   uid, fullName:name,firstName:name.split(" ")[0],lastName:"Preview",
   email,phoneNumber:"09990000000",age:25,status:"approved",
   region:"Region III",province:"Bulacan",city:"City of San Jose del Monte",barangay:"Poblacion",
   createdAt:FieldValue.serverTimestamp(),isTestAccount:true,
   ...attrs,
  });
 }
 await db.collection("announcements").doc("qa-advisory").set({
   title:"Preview Public Service Advisory",
   message:"Synthetic staging announcement for visual layout verification only.",
   audience:"all",priority:"normal",createdBy:"qa-ui-admin",
   createdAt:FieldValue.serverTimestamp(),
   publishAt:FieldValue.serverTimestamp()
 });
 console.log("PASS: four synthetic users and announcement seeded to demo Firebase emulators only");
}
main().catch(err=>{console.error(err);process.exitCode=1;});
