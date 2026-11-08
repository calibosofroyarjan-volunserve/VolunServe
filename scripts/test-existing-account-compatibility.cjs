"use strict";
// Read-only emulator verification of historical account access. Never touches
// production Auth/Firestore or migrates users; no credentials are required.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const {initializeTestEnvironment,assertSucceeds,assertFails} = require("@firebase/rules-unit-testing");
const {doc,setDoc,getDoc,getDocs,collection,Timestamp} = require("firebase/firestore");

async function main() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw Error("Production access refused: launch inside isolated Firebase Firestore emulator");
  }
  const env=await initializeTestEnvironment({
    projectId:"demo-volunserve-account-compatibility",
    firestore:{rules:fs.readFileSync("firestore.rules","utf8")},
  });
  const profiles=[
    ["admin", {role:"admin",status:"approved",adminStatus:"active"}],
    ["legacy-admin", {role:"admin"}],
    ["superadmin", {role:"superadmin",status:"approved"}],
    ["legacy-superadmin", {role:"superadmin"}],
    ["suspended-admin", {role:"admin",status:"approved",adminStatus:"suspended"}],
    ["pending-admin", {role:"admin",status:"pending_review"}],
    ["resident", {role:"resident",status:"approved",residentAccess:true,activeMode:"resident"}],
    ["legacy-resident", {role:"resident",status:"approved",residentAccess:true,activeMode:"resident"}],
    ["legacy-resident-no-email", {role:"resident",status:"approved",residentAccess:true,activeMode:"resident",email:null}],
    ["resident-pending", {role:"resident",status:"pending_review",residentAccess:true}],
    ["volunteer", {role:"resident",status:"approved",residentAccess:true,volunteerAccess:true,volunteerStatus:"approved",activeMode:"volunteer"}],
    ["volunteer-resident-mode", {role:"resident",status:"approved",residentAccess:true,volunteerAccess:true,volunteerStatus:"approved",activeMode:"resident"}],
    ["lgu", {role:"lgu_personnel",status:"approved",lguVerified:true,employmentStatus:"active"}],
    ["legacy-guest", {role:"guest",status:"approved",residentAccess:true,volunteerAccess:true}],
    ["applicant", {role:"applicant",status:"pending_review"}],
  ];
  try {
    await env.withSecurityRulesDisabled(async context=>{
      const db=context.firestore();
      for(const [uid,values] of profiles){
        const email=Object.prototype.hasOwnProperty.call(values,"email")?values.email:uid+"@gmail.com";
        const {email:ignore,...profile}=values;
        const record={uid,...profile};
        if(email!==null) record.email=email;
        await setDoc(doc(db,"users",uid),record);
      }
      await setDoc(doc(db,"announcements","published"),{
        title:"Safety update",publishAt:Timestamp.fromMillis(1),
      });
      await setDoc(doc(db,"communityEvents","published"),{
        title:"Community event",publicationStatus:"published",
      });
    });
    const as=(uid,verified=true,email=uid+"@gmail.com")=>
      env.authenticatedContext(uid,{email,email_verified:verified}).firestore();
    const ann=(uid,verified=true,email=uid+"@gmail.com")=>
      getDoc(doc(as(uid,verified,email),"announcements","published"));
    const event=(uid,verified=true,email=uid+"@gmail.com")=>
      getDoc(doc(as(uid,verified,email),"communityEvents","published"));
    const listUsers=(uid,verified=true)=>getDocs(collection(as(uid,verified),"users"));
    let checked=0;
    const succeeds=async promise=>{await assertSucceeds(promise);checked++;};
    const fails=async promise=>{await assertFails(promise);checked++;};

    for(const uid of ["admin","legacy-admin","superadmin","legacy-superadmin","resident",
      "legacy-resident","volunteer","volunteer-resident-mode","lgu"]) {
      await succeeds(ann(uid));
      await succeeds(event(uid));
      await fails(ann(uid,false));
      await fails(event(uid,false));
    }

    for(const uid of ["admin","legacy-admin","superadmin","legacy-superadmin"]){
      await succeeds(listUsers(uid));
      await fails(listUsers(uid,false));
    }
    for(const uid of ["resident","volunteer","lgu","legacy-guest","applicant",
      "pending-admin","suspended-admin","resident-pending"]){
      await fails(listUsers(uid));
    }
    for(const uid of ["legacy-guest","applicant","resident-pending","pending-admin","suspended-admin"]){
      await fails(ann(uid));
      await fails(event(uid));
    }
    await fails(ann("resident",true,"someone-else@gmail.com"));
    await fails(event("volunteer",true,"someone-else@gmail.com"));
    // A historical Resident without an email field CANNOT pass the new
    // email/token equality condition, even when Firebase Auth is verified.
    await fails(ann("legacy-resident-no-email"));
    // The own-profile read is intentionally allowed while verification is
    // pending, to recover signup; this is NOT access to protected modules.
    await succeeds(getDoc(doc(as("resident",false),"users","resident")));
    assert(checked>=58, "expected coverage of all role/verification combinations");
    console.log("PASS: "+checked+" emulator account-compatibility assertions.");
    console.log("RELEASE BLOCKERS: audit live unverified Auth users and resident profiles with missing/mismatched emails.");
    console.log("Production accounts were NOT read, modified or deleted.");
  } finally {await env.cleanup();}
}
main().catch(err=>{console.error(err);process.exitCode=1;});
