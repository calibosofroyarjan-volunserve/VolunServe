"use strict";
/**
 * Strict Verified Resident authority parity across ACTUAL React Native helper,
 * ACTUAL Node authorization gate, and ACTUAL Firestore security rules.
 *
 * Tests only synthetic accounts against local Firebase Firestore Emulator.
 * NO real IDs, selfies, credentials, signed-in services, staging writes,
 * Render deployments or production network access.
 */
const {test,before,after} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const {initializeTestEnvironment,assertFails,assertSucceeds} =
  require("@firebase/rules-unit-testing");
const {doc,setDoc,updateDoc,Timestamp} = require("firebase/firestore");
const PROJECT="demo-volunserve-verified-guard";

function enforceIsolation(){
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST,"127.0.0.1:8080",
    "REFUSED: local Firestore emulator only");
  assert.equal(process.env.GCLOUD_PROJECT,PROJECT,
    "REFUSED: only demo project permitted");
  assert.equal(process.env.FIREBASE_SERVICE_ACCOUNT_JSON,undefined,
    "REFUSED: no cloud service-account credentials");
  assert.equal(process.env.GOOGLE_APPLICATION_CREDENTIALS,undefined,
    "REFUSED: no application cloud credentials");
}
enforceIsolation();

const nodeSource=fs.readFileSync("backend/server.js","utf8");
const start=nodeSource.indexOf("function isVerifiedResidentProfile(");
const end=nodeSource.indexOf("async function loadUserProfile(",start);
assert.ok(start>=0 && end>start,"Actual Node gate could not be located");
const backendGate=vm.runInNewContext(nodeSource.slice(start,end)+
  "\nisVerifiedResidentProfile",{
  isApprovedAccount:p=>p?.status==="approved",
  getProfileRole:p=>String(p?.role||"").toLowerCase(),
});

const frontendSource=fs.readFileSync("lib/firebaseAuth.ts","utf8");
const parsed=ts.createSourceFile("lib/firebaseAuth.ts",frontendSource,
  ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const target=new Set(["getIdentityStatus","isIdentityVerified"]);
const found=parsed.statements.filter(s=>
  ts.isVariableStatement(s)&&s.declarationList.declarations.some(d=>
    ts.isIdentifier(d.name)&&target.has(d.name.text)));
assert.equal(found.length,2,"Actual React Native identity status functions must be present");
const compiled=ts.transpileModule(found.map(n=>n.getText(parsed)).join("\n"),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020},
  reportDiagnostics:true,
});
assert.equal(compiled.diagnostics?.length||0,0);
const moduleMock={exports:{}};
vm.runInNewContext(compiled.outputText,{
  exports:moduleMock.exports,module:moduleMock,
  isApprovedProfile:p=>p?.status==="approved" &&
    ["resident","volunteer"].includes(p?.role),
},{timeout:4000});
const {getIdentityStatus,isIdentityVerified}=moduleMock.exports;

const rules=fs.readFileSync("firestore.rules","utf8");
let env;
const UID="resident_verified_guard_demo_01";
const email="resident.guard@example.invalid";
const baseProfile={
  uid:UID,role:"resident",status:"approved",email,
  residentAccess:true,activeMode:"resident",
  volunteerAccess:false,volunteerStatus:"not_applied",
  identityStatus:"verified",identityVerified:false,
};
const application=()=>{
  const when=Timestamp.now();
  return {
    uid:UID,
    source:"profile_application",
    applicantType:"existing_resident",
    requestedRole:"volunteer",
    fullName:"Synthetic Resident",
    email,
    barangay:"Synthetic Barangay",
    phone:"",
    phoneNumber:"09123456789",
    occupationCategory:"student",
    occupationSpecialization:"",
    occupationOther:"",
    skills:["community support"],
    availability:["weekend"],
    experienceTraining:"Training information placeholder.",
    preferredActivity:"Community services",
    emergencyContact:"",
    motivation:"Synthetic volunteer interest for testing.",
    status:"pending",
    createdAt:when,
    updatedAt:when,
  };
};
let residentDb;
async function seedProfile(profile){
  await env.withSecurityRulesDisabled(async ctx=>{
    await setDoc(doc(ctx.firestore(),"users",UID),profile);
  });
}

before(async()=>{
  env=await initializeTestEnvironment({
    projectId:PROJECT,
    firestore:{host:"127.0.0.1",port:8080,rules}
  });
  const user=env.authenticatedContext(UID,{
    email, email_verified:true
  });
  residentDb=user.firestore();
  await seedProfile(baseProfile);
});
after(async()=>{if(env) await env.cleanup();});

test("Real UI and Node never trust 'verified' status text without Admin-owned flag",()=>{
  for(const profile of [
    baseProfile,
    {...baseProfile,identityVerified:undefined},
    {...baseProfile,identityVerified:"true"},
    {...baseProfile,identityVerified:0},
  ]){
    assert.notEqual(getIdentityStatus(profile),"verified");
    assert.equal(isIdentityVerified(profile),false);
    assert.equal(backendGate(profile),false);
  }
  const approved={...baseProfile,identityVerified:true,identityStatus:"verified"};
  assert.equal(getIdentityStatus(approved),"verified");
  assert.equal(isIdentityVerified(approved),true);
  assert.equal(backendGate(approved),true);
  const unrelated={...approved,role:"admin"};
  assert.equal(backendGate(unrelated),false);
});

test("Real Firestore rules block forged verified status for Volunteer application",async()=>{
  const path=doc(residentDb,"volunteerApplications",UID);
  await assertFails(setDoc(path,application()));
  // A true Admin-owned flag is required. The same valid payload must pass.
  await seedProfile({...baseProfile,identityVerified:true});
  await assertSucceeds(setDoc(path,application()));
});

test("Real Firestore rules deny verified access again when the flag is revoked",async()=>{
  await seedProfile({...baseProfile,identityVerified:false,identityStatus:"verified"});
  const path=doc(residentDb,"volunteerApplications",UID);
  const updated=application();
  updated.updatedAt=Timestamp.now();
  await assertFails(updateDoc(path,{motivation:updated.motivation,updatedAt:updated.updatedAt}));
});

test("No source contains the old status-text OR privilege grant",()=>{
  const rulePart=rules.slice(
    rules.indexOf("function hasVerifiedIdentity(data) {"),
    rules.indexOf("function isVerifiedResident()")
  );
  assert.match(rulePart,/data\.identityVerified == true/);
  assert.doesNotMatch(rulePart,/data\.identityStatus == 'verified'/);
  assert.doesNotMatch(nodeSource.slice(start,end),
    /identityVerified\s*===\s*true\s*\|\|/);
  assert.doesNotMatch(frontendSource.slice(
    frontendSource.indexOf("export const getIdentityStatus"),
    frontendSource.indexOf("export const isIdentityVerified")
  ),/identityStatus\s*===\s*"verified"\s*\)/);
});
