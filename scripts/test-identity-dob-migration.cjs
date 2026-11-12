"use strict";
// DOB-only policy migration. No production SDK credentials, Firestore or Hosting writes.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const cp=require("node:child_process");

const old=cp.execFileSync("git",["show","origin/live-protected:firestore.rules"],{encoding:"utf8"});
const next=fs.readFileSync("firestore.rules","utf8");
const start=old.indexOf("match /users/{uid} {");
const begin=old.indexOf("allow create: if signedIn()",start);
const end=old.indexOf("// Staff applications never receive",begin);
assert(start>=0&&begin>start&&end>begin,"Resident create rule not isolated");
const left=old.slice(begin,end);
const whitelist="          'age',\n          'email',";
const anchor="        && request.resource.data.role == 'resident'";
assert(left.includes(whitelist)&&left.includes(anchor),"Original live rule shape has changed; review before proceeding");
const addition=`        // Optional date at registration only; never mutable through owner updates.
        && (
          !('dateOfBirth' in request.resource.data)
          || (
            request.resource.data.dateOfBirth is string
            && request.resource.data.dateOfBirth.matches('^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
          )
        )
`;
const transformed=left.replace(whitelist,()=>"          'age',\n          'dateOfBirth',\n          'email',")
  .replace(anchor,()=>addition+anchor);
const expected=old.slice(0,begin)+transformed+old.slice(end);
assert.equal(next,expected,"BLOCKED: migration changes other Firebase permissions or formatting");
assert(!/affectedKeys\(\)[\s\S]{0,160}dateOfBirth/.test(next.slice(end,end+160)),"DOB must not be client-updateable");
console.log("PASS exact reviewed DOB-only policy delta; no non-Resident fields or permission statements modified.");

async function emulator(){
  assert(process.env.FIRESTORE_EMULATOR_HOST,"BLOCKED: run only in demo-project Firestore Emulator");
  const {initializeTestEnvironment,assertSucceeds,assertFails}=require("@firebase/rules-unit-testing");
  const {doc,setDoc,updateDoc,Timestamp}=require("firebase/firestore");
  const env=await initializeTestEnvironment({
    projectId:"demo-volunserve-identity-dob-review-20261112",
    firestore:{rules:next},
  });
  const profile=uid=>({
    uid, email:uid+"@gmail.com", fullName:"DELA CRUZ, MARIA",
    firstName:"Maria", lastName:"Dela Cruz", middleName:"",
    age:26, phoneNumber:"", region:"Region III - Central Luzon",
    province:"Bulacan", city:"City of San Jose del Monte", barangay:"Muzon Proper",
    address:"Muzon Proper, City of San Jose del Monte, Bulacan",
    occupationCategory:"Unemployed",occupationSpecialization:"",occupationOther:"",
    occupation:"Unemployed",skills:[],skillOther:"",availability:[],
    role:"resident",requestedRole:"resident",primaryRole:"resident",
    residentAccess:true,volunteerAccess:false,volunteerStatus:"not_applied",
    activeMode:"resident",status:"approved",identityStatus:"basic",identityVerified:false,
    profilePictureUrl:"",createdAt:Timestamp.now(),
  });
  const client=uid=>env.authenticatedContext(uid,{email:uid+"@gmail.com",email_verified:true}).firestore();
  try{
    const newUid="maria-dob-1";
    await assertSucceeds(setDoc(doc(client(newUid),"users",newUid),{
      ...profile(newUid),dateOfBirth:"2000-09-05"
    }));
    const oldUid="maria-legacy-2";
    await assertSucceeds(setDoc(doc(client(oldUid),"users",oldUid),profile(oldUid)));
    const badUid="maria-invalid-3";
    await assertFails(setDoc(doc(client(badUid),"users",badUid),{
      ...profile(badUid),dateOfBirth:"September 5 2000"
    }));
    await assertFails(updateDoc(doc(client(newUid),"users",newUid),{
      dateOfBirth:"2000-09-06"
    }));
    await assertFails(updateDoc(doc(client(oldUid),"users",oldUid),{
      dateOfBirth:"2000-09-05"
    }));
    console.log("PASS emulator DOB create/legacy/malformed/immutable assertions (5 tests, no production).");
  }finally{await env.cleanup();}
}
if(process.argv.includes("--emulator"))emulator().catch(e=>{console.error(e);process.exitCode=1});
