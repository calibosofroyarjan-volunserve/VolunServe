#!/usr/bin/env node
"use strict";
/** Isolated deterministic preview / preservation check, no Firebase secrets. */
const assert=require("node:assert/strict");
const {execFileSync}=require("node:child_process");
const {simulateVolunteerRecommendation,isEnabledForIsolatedStaging}=require("../backend/additiveEmergencyMatching/preview.cjs");
const {normalizeBarangay,validateVolunteer}=require("../backend/additiveEmergencyMatching/planner.cjs");
const BASE="f6139fdae5bce940356a62efc28f8e50935978d6";

let checks=0;
const check=(condition,message)=>{assert.ok(condition,message);checks++};
const authorized=[
  {uid:"devin-test",application:{status:"approved",skills:["First Aid"]},
   user:{role:"volunteer",status:"approved",volunteerStatus:"approved",
     volunteerAccess:true,identityVerified:true,barangay:"Bagong Buhay I"}}
];
const incident={id:"STAGING_TEST_001",title:"TEST ONLY - Dummy Emergency",
  status:"validated",verificationStatus:"validated",
  incidentBarangay:"Bagong Buhay I",reporterUid:"test-resident",
  severity:"low",requiredSkills:["First Aid"]};
const barangays=["Bagong Buhay I","Bagong Buhay II"];
const input={incident,volunteers:authorized,knownBarangays:barangays};
const before=JSON.stringify(input);
const outcome=simulateVolunteerRecommendation(input);
check(outcome.status==="offer","matching preview should find eligible Volunteer");
check(outcome.wave===1 && outcome.volunteerId==="devin-test","must match local Wave 1");
check(outcome.offerSent===false,"preview may never send an offer");
check(JSON.stringify(input)===before,"planner must not mutate original records");

check(isEnabledForIsolatedStaging({})===false,"feature must be disabled by default");
check(isEnabledForIsolatedStaging({VOLUNSERVE_AUTOMATCH_ADDONLY_STAGING_ENABLED:"true",
  FIREBASE_PROJECT_ID:"volunserve-3aa5b"})===false,"production must stay disabled");
check(isEnabledForIsolatedStaging({VOLUNSERVE_AUTOMATCH_ADDONLY_STAGING_ENABLED:"true",
  FIREBASE_PROJECT_ID:"volunserve-volunteer-staging"})===true,
  "isolated staging may explicitly enable gated preview");
check(normalizeBarangay(" Brgy. Bagong Buhay I ")===normalizeBarangay("Bagong Buhay I"),
  "barangay normalization must be consistent");

for(const [description,change] of [
  ["rejected account",{user:{...authorized[0].user,status:"rejected"}}],
  ["unapproved volunteer application",{application:{...authorized[0].application,status:"pending"}}],
  ["unverified identity",{user:{...authorized[0].user,identityVerified:false}}],
  ["unauthorized Admin role",{user:{...authorized[0].user,role:"admin"}}],
  ["self report",{uid:incident.reporterUid}],
  ["outside SJDM",{user:{...authorized[0].user,barangay:"Outside City"}}],
  ["mismatched skills",{application:{...authorized[0].application,skills:["Cooking"]}}]
]){
 const row={...authorized[0],...change};
 const next=simulateVolunteerRecommendation({...input,volunteers:[row]});
 check(next.status!=="offer" && next.offerSent===false,
   "must not offer to "+description);
}
check(simulateVolunteerRecommendation({...input,
  incident:{...incident,status:"unverified"}}).status!=="offer",
  "unvalidated case must not be offered");
check(simulateVolunteerRecommendation({...input,
  activeAssignments:[{volunteerId:"devin-test",status:"accepted"}]}).status!=="offer",
  "active responder must not get another assignment");
const severe=simulateVolunteerRecommendation({...input,
  incident:{...incident,severity:"critical"}});
check(severe.requiresOfficialEscalation===true && severe.offerSent===false,
  "critical reports must still indicate official emergency escalation");
check(validateVolunteer(incident,authorized[0],{knownBarangays:barangays}).eligible===true,
  "eligibility planner should accept the approved fictitious Volunteer");

// Compare existing live-source blobs. All paths in this candidate must be ADDITIONS.
const out=execFileSync("git",["diff","--name-status","--no-renames",BASE,"HEAD"],{encoding:"utf8"});
const rows=out.trim().split("\n").filter(Boolean).map(l=>l.split("\t"));
check(rows.length>=3,"review branch should contain additive feature package");
for(const [status,path] of rows){
  check(status==="A","no existing file may be changed or removed: "+path);
  check(/^(backend\/additiveEmergencyMatching\/|scripts\/(test-additive-auto-volunteer-20261117|test-live-compatibility-adapter-20261117)\.cjs$|docs\/AUTO_VOLUNTEER_ADD_ONLY_LIVE_REVIEW_20261117\.md$|\.github\/workflows\/validate-auto-volunteer-add-only-20261117\.yml$)/.test(path),
    "addition outside explicit whitelist blocked: "+path);
}
console.log("PASS: "+checks+" pure matching, fail-closed staging gates and add-only live-source preservation checks");
