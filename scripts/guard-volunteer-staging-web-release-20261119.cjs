"use strict";
/**
 * NO DEPLOY, NO NETWORK, NO FIREBASE: fail-closed preflight for the isolated
 * Volunteer Admin/Volunteer web QA build. Run as an explicit build step
 * BEFORE "expo export", but ONLY for the dedicated staging site.
 *
 * This is not a production release switch. It never prints env var values.
 */
const fs=require("node:fs");
const path=require("node:path");
const ROOT=path.resolve(__dirname,"..");
const PROJECT="volunserve-volunteer-staging";
const SETTINGS={
  EXPO_PUBLIC_VOLUNSERVE_ENV:"staging",
  EXPO_PUBLIC_FIREBASE_PROJECT_ID:PROJECT,
  EXPO_PUBLIC_AUTO_VOLUNTEER_DISPATCH_ENABLED:"true",
  EXPO_PUBLIC_AUTO_VOLUNTEER_STAGING_ONLY:"true",
  EXPO_PUBLIC_AUTO_VOLUNTEER_MATCH_PROVIDER:"render",
  EXPO_PUBLIC_AUTO_VOLUNTEER_STAGING_PROJECT_ID:PROJECT,
};
const REQUIRED_PUBLIC_FIREBASE=[
  "EXPO_PUBLIC_FIREBASE_API_KEY","EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "EXPO_PUBLIC_FIREBASE_PROJECT_ID","EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID","EXPO_PUBLIC_FIREBASE_APP_ID",
];
const SOURCES=[
  ["lib/firebase.ts",[
    'process.env.EXPO_PUBLIC_VOLUNSERVE_ENV === "staging"',
    "Unsafe staging Firebase configuration"
  ]],
  ["lib/stagingBulkVolunteerClient.ts",[
    'STAGING_BULK_CASE_ID = "STAGING_E2E_002"',
    'STAGING_BULK_OFFER_MODE = "staging_bulk_all_eligible"',
    "assertIsolatedStaging(projectId)",
    "getIdToken()"
  ]],
  ["app/(admin)/admin-cases.tsx",[
    "ensureStagingBulkOffersAfterAdminValidation(",
    "incident.id === STAGING_BULK_CASE_ID"
  ]],
  ["app/(tabs)/volunteer.web.tsx",[
    "respondToStagingBulkOffer(",
    "if (isStagingBulkAssignment(assignment))",
    "isStagingBulkAssignment(assignment) ? ("
  ]],
  ["app/(tabs)/volunteer.tsx",[
    "respondToStagingBulkOffer(",
    "if (isStagingBulkAssignment(assignment))",
    "isStagingBulkAssignment(assignment) ? ("
  ]],
];
function verify(env, read=(file)=>fs.readFileSync(path.join(ROOT,file),"utf8")){
  const failures=[];
  for(const [key,expected] of Object.entries(SETTINGS)){
    if(env[key]!==expected) failures.push(key+"_invalid");
  }
  for(const key of REQUIRED_PUBLIC_FIREBASE){
    if(typeof env[key]!=="string"||!env[key].trim()){
      failures.push(key+"_missing");
    }
  }
  if(env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN!==PROJECT+".firebaseapp.com")
    failures.push("STAGING_AUTH_DOMAIN_INVALID");
  if(typeof env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET!=="string"||
     !env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET.startsWith(PROJECT+"."))
    failures.push("STAGING_STORAGE_BUCKET_INVALID");
  for(const [file,needles] of SOURCES){
    let source="";
    try{source=read(file);}catch{failures.push("SOURCE_UNAVAILABLE_"+file);continue;}
    for(const needle of needles){
      if(!source.includes(needle))failures.push("SOURCE_CONTRACT_CHANGED_"+file);
    }
  }
  return [...new Set(failures)];
}
if(require.main===module){
  const failures=verify(process.env);
  if(failures.length){
    console.error("BLOCKED: isolated Volunteer staging web preflight failed.");
    for(const code of failures)console.error("BLOCKED "+code);
    console.error("NO DEPLOYMENT authorized. Do not substitute production Firebase credentials.");
    process.exitCode=1;
  }else{
    console.log("PASS: staged web build config and fixed-002 source contracts verified.");
    console.log("NO DEPLOYMENT performed. Real Firebase multi-account QA and secret rotation still required.");
  }
}
module.exports={verify,PROJECT};
