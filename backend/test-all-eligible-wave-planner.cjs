"use strict";
const assert=require("node:assert/strict");
const test=require("node:test");
const {chooseAllEligibleWave}=require("../functions/emergencyAllEligibleWavePlanner");
const barrios=["Bagong Buhay I","Bagong Buhay II","San Manuel","Gaya-gaya"];
const incident={id:"STAGING_E2E_002",status:"validated",
  verificationStatus:"validated",reporterUid:"reporter",
  incidentBarangay:"Bagong Buhay I",requiredSkills:["First Aid"]};
const volunteer=(uid,barangay="Bagong Buhay I",more={})=>({
  uid,application:{uid,status:"approved",skills:["First Aid"]},
  user:{role:"volunteer",status:"approved",volunteerAccess:true,
    volunteerStatus:"approved",identityVerified:true,barangay,...more}
});
const opts={knownBarangays:barrios,neighborsByBarangay:{"Bagong Buhay I":["Bagong Buhay II"]}};
test("all 3 eligible same-barangay Volunteers are included, not only the first",()=>{
 const roster=[volunteer("v3"),volunteer("v1"),volunteer("v2"),volunteer("far","San Manuel")];
 const p=chooseAllEligibleWave(incident,roster,opts);
 assert.equal(p.action,"offer_all");
 assert.equal(p.wave,1);
 assert.deepEqual(p.volunteers,["v1","v2","v3"]);
 assert.equal(p.counts.eligible,4);
});
test("busy, unapproved, wrong skill and reporter excluded",()=>{
 const roster=[volunteer("free"),volunteer("busy"),volunteer("disabled","Bagong Buhay I",{status:"blocked"}),
 volunteer("reporter"),{...volunteer("wrong"),application:{uid:"wrong",status:"approved",skills:["Cooking"]},
 user:{...volunteer("wrong").user,skills:[]}}];
 const p=chooseAllEligibleWave(incident,roster,{...opts,
  activeAssignments:[{volunteerId:"busy",status:"offered"}]});
 assert.deepEqual(p.volunteers,["free"]);
});
test("retry skips previously offered and already-active case tasks",()=>{
 const roster=[volunteer("v1"),volunteer("v2")];
 assert.deepEqual(chooseAllEligibleWave(incident,roster,{
 ...opts,attemptedVolunteerIds:["v1"]}).volunteers,["v2"]);
 const p=chooseAllEligibleWave(incident,roster,{...opts,
 existingAssignments:[{caseId:incident.id,status:"accepted",volunteerId:"v1"}]});
 assert.equal(p.action,"existing_active_offers");
 assert.deepEqual(p.volunteers,[]);
});
test("no fake Wave 2 when proximity not verified, fall back to citywide",()=>{
 const p=chooseAllEligibleWave(incident,[volunteer("remote","San Manuel")],{
   knownBarangays:barrios,neighborsByBarangay:{}});
 assert.equal(p.action,"offer_all");assert.equal(p.wave,3);
 assert.deepEqual(p.volunteers,["remote"]);
});
test("never offer unvalidated, blocked or completed reports",()=>{
 for(const changed of [
  {status:"reported"},{verificationStatus:"pending_verification"},
  {dispatchBlocked:true},{status:"closed"}
 ]){
 const p=chooseAllEligibleWave({...incident,...changed},[volunteer("v1")],opts);
 assert.equal(p.action,"stop");assert.deepEqual(p.volunteers,[]);
 }
});
test("duplicate roster IDs do not get duplicate offers",()=>{
 const p=chooseAllEligibleWave(incident,[volunteer("v1"),volunteer("v1"),volunteer("v2")],opts);
 assert.deepEqual(p.volunteers,["v1","v2"]);
});
