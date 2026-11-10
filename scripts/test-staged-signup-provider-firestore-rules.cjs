"use strict";
// Strictly isolated emulator regression: NO Firebase production project access.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const {initializeTestEnvironment,assertSucceeds,assertFails} = require("@firebase/rules-unit-testing");
const {doc,setDoc,getDoc,serverTimestamp,Timestamp} = require("firebase/firestore");

async function main() {
  if (!process.env.FIRESTORE_EMULATOR_HOST ||
      !process.env.FIRESTORE_EMULATOR_HOST.includes(":")) {
    throw Error("REFUSED: FIRESTORE_EMULATOR_HOST required; never test against production.");
  }
  const env = await initializeTestEnvironment({
    projectId:"demo-volunserve-new-email-policy",
    firestore:{rules:fs.readFileSync("firestore.rules","utf8")},
  });
  try {
    const context = (uid,email,provider,verified=true) =>
      env.authenticatedContext(uid,{
        email,email_verified:verified,
        ...(provider===null ? {} : {firebase:{sign_in_provider:provider}}),
      }).firestore();

    const residentProfile=(uid,email)=>({
      uid,email,fullName:"Santos, Maria",firstName:"Maria",lastName:"Santos",
      middleName:"",age:23,phoneNumber:"",
      region:"Region III – Central Luzon",province:"Bulacan",
      city:"City of San Jose del Monte",barangay:"Muzon Proper",
      address:"Muzon Proper, City of San Jose del Monte, Bulacan",
      occupationCategory:"Student",occupationSpecialization:"College",
      occupationOther:"",occupation:"Student",skills:[],skillOther:"",
      availability:[],role:"resident",requestedRole:"resident",primaryRole:"resident",
      residentAccess:true,volunteerAccess:false,volunteerStatus:"not_applied",
      activeMode:"resident",status:"approved",identityStatus:"basic",
      identityVerified:false,profilePictureUrl:"",createdAt:Timestamp.now(),
    });
    let checks=0;
    async function newResident(email,provider,shouldPass,verified=true) {
      const uid="resident-case-"+(++checks);
      const request=setDoc(doc(context(uid,email,provider,verified),"users",uid),
        residentProfile(uid,email));
      if(shouldPass)await assertSucceeds(request);else await assertFails(request);
    }

    // Prove receiving a valid Gmail verification link is insufficient.
    await newResident("smailpro-inbox@gmail.com","password",false);
    await newResident("m.a.i.l.b.o.x@gmail.com","password",false);
    await newResident("pooled@googlemail.com","password",false);
    await newResident("untrusted@gmail.com",null,false);
    await newResident("real.user@gmail.com","google.com",true);
    await newResident("real.user@googlemail.com","google.com",true);
    await newResident("alias+tag@gmail.com","google.com",false);
    await newResident("unverified@gmail.com","google.com",false,false);

    // Yahoo email+password registration continues to work, as requested.
    await newResident("user@yahoo.com","password",true);
    await newResident("user@yahoo.com.ph","password",true);
    await newResident("user@yahoo.co.uk","password",true);
    await newResident("user@yahoo.com","google.com",true);

    // Exact-domain allowlist, even if a direct Firebase Auth UID is verified.
    for(const email of [
      "blocked@en2ch.co","blocked@en2ch.com","blocked@ruutukf.co",
      "person@outlook.com","person@hotmail.com","user@school.edu.ph",
      "user@company.co","user@sub.gmail.com","user@gmail.com.evil.example",
      "user@yahoo.co","user@another.co.uk"
    ])await newResident(email,"google.com",false);

    const applicant=(uid,email)=>({
      uid,email,fullName:"Marilyn Test Applicant",age:24,phoneNumber:"",
      role:"applicant",status:"pending_review",residentAccess:false,
      volunteerAccess:false,region:"Region III – Central Luzon",
      province:"Bulacan",city:"City of San Jose del Monte",barangay:"Muzon Proper",
      lguOffice:"City Social Welfare Department",lguPosition:"Office Coordinator",
      appointmentReference:"LOCAL-STAFF-2026-001",createdAt:serverTimestamp(),
    });
    async function newApplicant(email,shouldPass) {
      const uid="lgu-applicant-"+(++checks);
      const promise=setDoc(doc(context(uid,email,"password",false),"users",uid),
        applicant(uid,email));
      if(shouldPass)await assertSucceeds(promise);else await assertFails(promise);
    }
    await newApplicant("person@yahoo.com",true);
    await newApplicant("person@yahoo.com.ph",true);
    await newApplicant("person@gmail.com",false);
    await newApplicant("person@company.co",false);
    await newApplicant("person@outlook.com",false);

    // Existing approved non-Yahoo/non-Gmail users must retain their access
    // without modifying or re-registering their documents.
    await env.withSecurityRulesDisabled(async admin=>{
      const db=admin.firestore();
      await setDoc(doc(db,"users","historical-resident"),{
        uid:"historical-resident",email:"existing@outlook.com",role:"resident",
        status:"approved",residentAccess:true,activeMode:"resident",
      });
      await setDoc(doc(db,"users","historical-admin"),{
        uid:"historical-admin",email:"staff@agency.gov.ph",role:"admin",
        status:"approved",adminStatus:"active",
      });
      await setDoc(doc(db,"announcements","existing"),{
        title:"Notice",publishAt:Timestamp.fromMillis(1),
      });
    });
    await assertSucceeds(getDoc(doc(
      context("historical-resident","existing@outlook.com","password",true),
      "announcements","existing")));
    await assertSucceeds(getDoc(doc(
      context("historical-admin","staff@agency.gov.ph","password",true),
      "users","historical-resident")));
    await assertFails(getDoc(doc(
      context("historical-resident","existing@outlook.com","password",false),
      "announcements","existing")));
    console.log("PASS "+checks+" direct-client CREATE cases + historical read/role compatibility.");
    console.log("IMPORTANT: Firebase Auth UID creation remains possible on Spark; these Rules only guard profile writes.");
  }finally {await env.cleanup();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
