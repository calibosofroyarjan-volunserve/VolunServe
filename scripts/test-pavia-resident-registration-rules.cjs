"use strict";
/** Emulator-only identity boundary test. Never writes to real residents. */
const fs=require("node:fs"),path=require("node:path");
const {initializeTestEnvironment,assertSucceeds,assertFails}=require("@firebase/rules-unit-testing");
const firebase=require("firebase/compat/app");
require("firebase/compat/firestore");
if(!process.env.FIRESTORE_EMULATOR_HOST) throw Error("Refusing real Firestore: emulator required");
const profile=(uid,email,overrides={})=>({
  uid, fullName:"Demo, Resident",lastName:"Demo",firstName:"Resident",middleName:"",
  age:24,email,phoneNumber:"+639123456789",region:"Region III",province:"Bulacan",
  city:"City of San Jose del Monte",barangay:"Dulong Bayan",
  address:"Dulong Bayan, City of San Jose del Monte, Bulacan",
  occupationCategory:"Student",occupationSpecialization:"",occupationOther:"",
  occupation:"Student",skills:[],skillOther:"",availability:[],role:"resident",
  requestedRole:"resident",primaryRole:"resident",residentAccess:true,
  volunteerAccess:false,volunteerStatus:"not_applied",activeMode:"resident",
  status:"approved",identityStatus:"basic",identityVerified:false,
  emailVerificationRequired:true,
  profilePictureUrl:"",createdAt:firebase.firestore.FieldValue.serverTimestamp(),...overrides
});
async function main(){
 const env=await initializeTestEnvironment({projectId:"demo-volunserve",
   firestore:{rules:fs.readFileSync(path.join(__dirname,"../firestore.rules"),"utf8")}});
 try{
  await env.clearFirestore();
  const db=(uid,email)=>env.authenticatedContext(uid,{email}).firestore();
  const good=db("pavia-adult","adult@example.com");
  await assertSucceeds(good.doc("users/pavia-adult").set(profile("pavia-adult","adult@example.com")));
  await assertFails(db("pavia-minor","minor@example.com").doc("users/pavia-minor")
    .set(profile("pavia-minor","minor@example.com",{age:16})));
  await assertFails(db("pavia-spoof","real@example.com").doc("users/pavia-spoof")
    .set(profile("pavia-spoof","pretend@example.com")));
  await assertFails(db("pavia-outside","outside@example.com").doc("users/pavia-outside")
    .set(profile("pavia-outside","outside@example.com",{city:"Quezon City"})));
  await assertFails(db("pavia-admin","admin@example.com").doc("users/pavia-admin")
    .set(profile("pavia-admin","admin@example.com",{role:"admin"})));
  await assertFails(db("pavia-no-proof","noproof@example.com").doc("users/pavia-no-proof")
    .set(profile("pavia-no-proof","noproof@example.com",{emailVerificationRequired:false})));
  // A direct Firebase Auth SDK account cannot bypass the high-confidence
  // disposable-domain profile gate by skipping the signup form entirely.
  for(const [idx,address] of [
    "person@mailinator.com",
    "person@nested.mailinator.com",
    "person@YOPMAIL.COM",
    "person@sharklasers.com",
    "person@10minutemail.com",
  ].entries()){
    const uid="pavia-disposable-"+idx;
    await assertFails(db(uid,address).doc("users/"+uid).set(profile(uid,address)));
  }
  // Staff applicants are separate from Residents but cannot bypass the same
  // profile-creation rule by registering directly against the Auth API.
  const staffProfile=(uid,email)=>({
    uid,email,fullName:"Demo LGU Staff",role:"applicant",status:"pending_review",
     emailVerificationRequired:true,
    residentAccess:false,volunteerAccess:false,region:"Region III",
    province:"Bulacan",city:"City of San Jose del Monte",barangay:"Dulong Bayan",
    lguOffice:"City Government",lguPosition:"Applicant",
    appointmentReference:"DEMO-SYNTHETIC-REF-999",
    createdAt:firebase.firestore.FieldValue.serverTimestamp(),
  });
  await assertSucceeds(db("pavia-staff-ok","staff@gmail.com").doc("users/pavia-staff-ok")
    .set(staffProfile("pavia-staff-ok","staff@gmail.com")));
  await assertFails(db("pavia-staff-unverified","unverified@gmail.com")
     .doc("users/pavia-staff-unverified")
     .set({...staffProfile("pavia-staff-unverified","unverified@gmail.com"),emailVerificationRequired:false}));
   await assertFails(db("pavia-staff-disposable","staff@mailinator.com")
    .doc("users/pavia-staff-disposable")
    .set(staffProfile("pavia-staff-disposable","staff@mailinator.com")));
  await assertFails(good.doc("users/pavia-adult").update({age:12}));
  console.log("PASS Pavia: adult signup, own Auth email, SJDM scope, no self-admin and no age downgrade");
 }finally{await env.cleanup()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
