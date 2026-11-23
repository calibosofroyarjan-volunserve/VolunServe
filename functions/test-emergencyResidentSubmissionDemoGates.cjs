"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {demoEnabled,demoIncidentAllowed}=require("./emergencyResidentSubmissionDemo");
const normal={reporterUid:"fictional_resident",status:"reported",
 verificationStatus:"pending_verification",
 title:"TEST ONLY - Fictional report",severity:"low",
 source:"resident_emergency_assistance",requestKind:"emergency_assistance"};
const env=project=>({
 GCLOUD_PROJECT:project,GOOGLE_CLOUD_PROJECT:project,
 VOLUNSERVE_SIMPLE_AUTO_INVITES_PROJECT_ID:project,
 VOLUNSERVE_SIMPLE_AUTO_INVITES_ENABLED:"true",
 VOLUNSERVE_RESIDENT_SUBMISSION_DEMO_ENABLED:"true"
});
test("production project is DENIED even with every demo flag enabled",()=>{
 const p="volunserve-3aa5b";
 assert.equal(demoEnabled({...env(p),VOLUNSERVE_RESIDENT_DEMO_STAGING_APPROVED:"true",
   VOLUNSERVE_SIMPLE_AUTO_INVITES_PRODUCTION_APPROVED:"true"}),false);
 assert.equal(demoEnabled({}),false);
});
test("Firebase emulator accepts the unchanged real Resident form shape",()=>{
 const e=env("demo-volunserve-simple-invites");
 assert.equal(demoEnabled(e),true);
 assert.equal(demoIncidentAllowed(normal,e),true);
 assert.equal(demoIncidentAllowed({...normal,status:"validated"},e),false);
});
test("staging requires explicit approval and test-only LOW-SEVERITY Resident title",()=>{
 const project="volunserve-volunteer-staging";
 const e=env(project);
 assert.equal(demoEnabled(e),false);
 const approved={...e,VOLUNSERVE_RESIDENT_DEMO_STAGING_APPROVED:"true"};
 assert.equal(demoEnabled(approved),true);
 assert.equal(demoIncidentAllowed(normal,approved),true);
 assert.equal(demoIncidentAllowed({...normal,title:"Real emergency report"},approved),false);
 assert.equal(demoIncidentAllowed({...normal,severity:"critical"},approved),false);
 assert.equal(demoIncidentAllowed({...normal,source:"untrusted_source"},approved),false);
 assert.equal(demoIncidentAllowed({...normal,dispatchBlocked:false},approved),false);
});
