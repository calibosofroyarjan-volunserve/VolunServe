"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const {initializeTestEnvironment,assertSucceeds,assertFails}=require("@firebase/rules-unit-testing");
const {doc,setDoc,getDoc,updateDoc,deleteDoc,serverTimestamp}=require("firebase/firestore");
async function run(){
 if(!process.env.FIRESTORE_EMULATOR_HOST)throw Error("Firebase Firestore emulator required; never run against production");
 const env=await initializeTestEnvironment({
  projectId:"demo-volunserve-preserve-volunteer-invitations",
  firestore:{rules:fs.readFileSync("firestore.rules","utf8")}
 });
 try{
  await env.withSecurityRulesDisabled(async c=>{
   const db=c.firestore();
   await Promise.all([
    setDoc(doc(db,"users","staff"),{
      uid:"staff",role:"admin",email:"staff@example.com",status:"approved",adminStatus:"active"
    }),
    setDoc(doc(db,"users","volunteer"),{
      uid:"volunteer",role:"volunteer",email:"volunteer@example.com",
      status:"approved",volunteerAccess:true,volunteerStatus:"approved",activeMode:"volunteer"
    }),
    setDoc(doc(db,"users","resident"),{
      uid:"resident",role:"resident",email:"resident@example.com",
      status:"approved",residentAccess:true,activeMode:"resident"
    }),
    setDoc(doc(db,"users","other"),{
      uid:"other",role:"resident",email:"other@example.com",status:"approved",
      residentAccess:true,activeMode:"resident"
    }),
    setDoc(doc(db,"disasterCases","case1"),{
      reporterUid:"resident",status:"validated",verificationStatus:"approved"
    }),
    setDoc(doc(db,"disasterCases","closed"),{
      reporterUid:"resident",status:"closed",verificationStatus:"approved"
    })
   ]);
  });
  const as=(uid)=>env.authenticatedContext(uid,{
   email:uid==="staff"?"staff@example.com":uid+"@example.com",
   email_verified:true
  }).firestore();
  const blockedUnverified=env.authenticatedContext("volunteer",{
   email:"volunteer@example.com",email_verified:false
  }).firestore();
  const admin=as("staff"),volunteer=as("volunteer"),other=as("other");
  const id="case1_volunteer";
  const path=db=>doc(db,"volunteerInvitations",id);
  const invitation={
   caseId:"case1",caseTitle:"Test case",volunteerId:"volunteer",
   volunteerName:"Test Volunteer",status:"invited",createdBy:"staff",
   createdAt:serverTimestamp(),updatedAt:serverTimestamp()
  };
  await assertSucceeds(setDoc(path(admin),invitation));
  await assertSucceeds(getDoc(path(volunteer)));
  await assertFails(getDoc(path(other)));
  await assertFails(getDoc(path(blockedUnverified)));
  await assertFails(setDoc(doc(volunteer,"volunteerInvitations","case1_other"),{
    ...invitation,volunteerId:"other"
  }));
  await assertFails(setDoc(doc(admin,"volunteerInvitations","closed_volunteer"),{
    ...invitation,caseId:"closed"
  }));
  await assertFails(setDoc(doc(admin,"volunteerInvitations","case1_resident"),{
    ...invitation,volunteerId:"resident",volunteerName:"Reporter"
  }));
  await assertSucceeds(updateDoc(path(volunteer),{
    status:"accepted",updatedAt:serverTimestamp()
  }));
  await assertFails(updateDoc(path(other),{
    status:"declined",updatedAt:serverTimestamp()
  }));
  await assertFails(deleteDoc(path(admin)));
  assert.equal((await getDoc(path(admin))).data().status,"accepted");
  console.log("PASS: existing live volunteer invitation flow retained: admin creates, volunteer accepts, invalid/closed/unverified cases denied; no production writes");
 }finally{await env.cleanup();}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
