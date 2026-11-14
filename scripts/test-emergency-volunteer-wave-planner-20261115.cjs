"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { normalizeBarangay, validateVolunteer, planVolunteerWaves, recommendNextWave } =
  require("../backend/emergencyVolunteerWavePlanner");

const knownBarangays = [
  "Bagong Buhay I", "Bagong Buhay II", "Bagong Buhay III",
  "Francisco Homes-Narra", "Kaypian", "Muzon East"
];
const neighborsByBarangay = {
  "Bagong Buhay I": ["Bagong Buhay II", "Bagong Buhay III"],
};
const incident = {
  id:"case-1", reporterUid:"resident-1",
  verificationStatus:"validated", status:"validated", dispatchBlocked:false,
  incidentBarangay:"Brgy. Bagong Buhay I", requiredSkills:["First Aid"],
  severity:"critical"
};
function volunteer(uid,barangay,skills=["First Aid"],overrides={}){
  return {uid,application:{status:"approved",fullName:uid,skills},user:{
    role:"volunteer",fullName:uid,barangay,skills,volunteerStatus:"approved",status:"approved",
    ...overrides,
  }};
}
const people=[
 volunteer("first","Bagong Buhay I"),
 volunteer("near","Bagong Buhay II"),
 volunteer("far","Francisco Homes-Narra"),
 volunteer("unskilled","Bagong Buhay I",["IT"]),
 volunteer("resident-1","Bagong Buhay I"),
 volunteer("inactive","Bagong Buhay I",["First Aid"],{status:"suspended"}),
 volunteer("outside","Outside SJDM")
];
const options={knownBarangays,neighborsByBarangay,activeAssignments:[]};
assert.equal(normalizeBarangay("Brgy. Bagong-Buhay I"),"bagong buhay i");
const plan=planVolunteerWaves(incident,people,options);
assert.equal(plan.caseReady,true);
assert.equal(plan.requiresOfficialEscalation,true);
assert.deepEqual(plan.waves[1].map(v=>v.uid),["first"]);
assert.deepEqual(plan.waves[2].map(v=>v.uid),["near"]);
assert.deepEqual(plan.waves[3].map(v=>v.uid),["far"]);
assert.equal(plan.counts.excluded,4);
assert.equal(validateVolunteer(incident,people[3],options).code,"skill_mismatch");
assert.equal(validateVolunteer(incident,people[4],options).code,"own_report");
assert.equal(validateVolunteer(incident,people[5],options).code,"blocked_account");
assert.equal(validateVolunteer(incident,people[6],options).code,"invalid_volunteer_barangay");

const step1=recommendNextWave(plan,{attemptedVolunteerIds:[]});
assert.deepEqual(step1,{action:"offer",wave:1,volunteerId:"first"});
assert.deepEqual(recommendNextWave(plan,{pendingOffer:true}),{action:"wait",reason:"await_volunteer_acceptance"});
assert.deepEqual(recommendNextWave(plan,{activeResponse:true}),{action:"stop",reason:"already_accepted"});
assert.equal(recommendNextWave(plan,{expiredOfferNotReleased:true}).action,"stop");
assert.deepEqual(recommendNextWave(plan,{attemptedVolunteerIds:["first"]}),{action:"offer",wave:2,volunteerId:"near"});
assert.deepEqual(recommendNextWave(plan,{attemptedVolunteerIds:["first","near"]}),
  {action:"offer",wave:3,volunteerId:"far"});
assert.equal(recommendNextWave(plan,{attemptedVolunteerIds:["first","near","far"]}).reason,"no_eligible_volunteer_accepted");

const unconfigured=planVolunteerWaves(incident,people,{knownBarangays,activeAssignments:[]});
assert.equal(unconfigured.wave2Configured,false);
assert.equal(recommendNextWave(unconfigured,{attemptedVolunteerIds:["first"]}).reason,
  "verified_nearby_barangays_not_configured");
assert.equal(validateVolunteer({...incident,verificationStatus:"pending_verification"},people[0],options).code,"case_locked");
assert.equal(validateVolunteer(incident,people[0],{...options,knownBarangays:[]}).code,
  "invalid_incident_barangay");
assert.equal(validateVolunteer(incident,people[0],{...options,
 activeAssignments:[{volunteerId:"first",status:"accepted",caseId:"another"}]}).code,"busy");

const panel=fs.readFileSync("components/admin/VolunteerEligibilityValidation.tsx","utf8");
const admin=fs.readFileSync("app/(admin)/admin-cases.tsx","utf8");
assert(panel.includes("Volunteer Eligibility Validation"));
assert(panel.includes("reason") && panel.includes("Other barangays"));
assert(panel.includes("could not be loaded") && panel.includes("Checking approved"));
assert(admin.includes("VolunteerEligibilityValidation") &&
       admin.includes("volunteerEligibilityForCase(incident, volunteer)") &&
       admin.includes('setVolunteerDirectoryState("error")'));
console.log("PASS: guarded Wave 1/2/3 planner, accurate eligibility reasons, no guessed neighbors, and Admin validation UI.");