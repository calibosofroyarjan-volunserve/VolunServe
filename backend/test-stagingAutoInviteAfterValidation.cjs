"use strict";
/**
 * Regression gates for automatically inviting ALL eligible fictional
 * Volunteers after approved Admin validation. Offline only: no Firebase
 * credentials, no network, no assignment/notification writes.
 */
const test=require("node:test");
const assert=require("node:assert/strict");
const {
  shouldStartFictionalBulkAfterValidation
}=require("./emergencyAutoDispatchStagingServer");
const {chooseAllEligibleWave}=
  require("../functions/emergencyAllEligibleWavePlanner");
const known=require("../functions/sjdmBarangays.json");

const incident={
  id:"STAGING_E2E_002",title:"TEST ONLY - Fresh Volunteer E2E 002",
  status:"validated",verificationStatus:"validated",dispatchBlocked:false,
  incidentBarangay:"Bagong Buhay I",reporterUid:"fictional_reporter",
  requiredSkills:["First Aid"]
};
function v(uid,barangay="Bagong Buhay I",options={}){
  return {uid,
    application:{uid,status:"approved",skills:["First Aid"]},
    user:{role:"volunteer",status:"approved",volunteerAccess:true,
      volunteerStatus:"approved",identityVerified:true,barangay,
      skills:["First Aid"],...options}
  };
}
const roster=[
  v("fictional_a"),v("fictional_b"),v("fictional_c","Citrus"),
  v("fictional_blocked","Bagong Buhay I",{volunteerAccess:false}),
  v("fictional_reporter"),
  v("fictional_busy")
];
const approved={autoAfterValidationEnabled:true,isolatedStagingVerified:true};

test("ONLY authenticated fictional validation permits auto-invites",()=>{
  for(const validationStatus of ["validated","already_validated"]){
    assert.equal(shouldStartFictionalBulkAfterValidation({
      action:"validate",validationStatus,...approved
    }),true);
  }
  for(const status of [
    "reported","created","already_exists","blocked","rejected",
    "assigned","pending_review","pending_verification",undefined
  ]){
    assert.equal(shouldStartFictionalBulkAfterValidation({
      action:"validate",validationStatus:status,...approved
    }),false,String(status));
  }
  for(const action of ["create","start","reissue","cancel","",undefined]){
    assert.equal(shouldStartFictionalBulkAfterValidation({
      action,validationStatus:"validated",...approved
    }),false,String(action));
  }
});
test("disabled flags or unverified staging identity NEVER send automatic invites",()=>{
  for(const patch of [
    {autoAfterValidationEnabled:false},
    {isolatedStagingVerified:false},
    {autoAfterValidationEnabled:undefined},
    {isolatedStagingVerified:undefined}
  ]){
    assert.equal(shouldStartFictionalBulkAfterValidation({
      action:"validate",validationStatus:"already_validated",
      ...approved,...patch
    }),false);
  }
  assert.equal(shouldStartFictionalBulkAfterValidation({}),false);
});
test("after approved validation invite EVERY eligible same-barangay Volunteer, once",()=>{
  const plan=chooseAllEligibleWave(incident,roster,{
    knownBarangays:known,neighborsByBarangay:{},
    activeAssignments:[{volunteerId:"fictional_busy",status:"accepted"}]
  });
  assert.equal(plan.action,"offer_all");
  assert.equal(plan.wave,1);
  assert.deepEqual(plan.volunteers,["fictional_a","fictional_b"]);
  assert.equal(plan.volunteers.includes("fictional_blocked"),false);
  assert.equal(plan.volunteers.includes("fictional_reporter"),false);
  assert.equal(plan.volunteers.includes("fictional_busy"),false);
});
test("repeated roster entries NEVER generate duplicate invites",()=>{
  const plan=chooseAllEligibleWave(incident,[
    v("fictional_a"),v("fictional_a"),v("fictional_b")
  ],{knownBarangays:known,neighborsByBarangay:{}});
  assert.equal(plan.action,"offer_all");
  assert.deepEqual(plan.volunteers,["fictional_a","fictional_b"]);
});
test("later wave does not re-invite attempted Volunteers",()=>{
  const plan=chooseAllEligibleWave(incident,roster,{
    knownBarangays:known,neighborsByBarangay:{},
    attemptedVolunteerIds:["fictional_a","fictional_b"],
    completedWaves:[1],activeAssignments:[
      {volunteerId:"fictional_busy",status:"accepted"}
    ]
  });
  assert.equal(plan.action,"offer_all");
  assert.equal(plan.wave,3);
  assert.deepEqual(plan.volunteers,["fictional_c"]);
});
test("invalid/unapproved incident never invites Volunteers",()=>{
  for(const state of [
    {verificationStatus:"pending_verification"},
    {status:"reported"},
    {dispatchBlocked:true},
    {incidentBarangay:"Somewhere Else"}
  ]){
    const next=chooseAllEligibleWave({...incident,...state},roster,{
      knownBarangays:known,neighborsByBarangay:{}
    });
    assert.notEqual(next.action,"offer_all");
  }
});
