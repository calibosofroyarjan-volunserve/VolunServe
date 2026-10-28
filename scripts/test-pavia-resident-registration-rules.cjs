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
  await assertFails(good.doc("users/pavia-adult").update({age:12}));
  console.log("PASS Pavia: adult signup, own Auth email, SJDM scope, no self-admin and no age downgrade");
 }finally{await env.cleanup()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
