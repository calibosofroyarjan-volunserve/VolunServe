"use strict";
/**
 * Ultra-simple DEFENSE ONLY mode: all authorized, available test Volunteers
 * can independently Accept/Decline regardless of barangay or required skill.
 * Operates ONLY on the named, fixed fictional STAGING_E2E_002 case.
 * Never mutates profile/address/skills, never imports into production.
 */
const {validateVolunteer}=require("../functions/emergencyVolunteerWavePlanner");
const {E2E_CASE_ID,recognizedStagingCase}=require("./stagingVolunteerTask");

const uidOK=x=>typeof x==="string"&&/^[A-Za-z0-9_-]{1,160}$/.test(x);
const FAKE_AREA="Bagong Buhay I";

function validateDefenseVolunteer(incident,volunteer,{activeAssignments=[]}={}){
  if(incident?.id!==E2E_CASE_ID||
     !recognizedStagingCase(incident,E2E_CASE_ID))
    return {eligible:false,code:"only_fixed_fictional_staging_case",wave:0};
  const uid=String(volunteer?.uid||"");
  if(!uidOK(uid)||volunteer?.application?.uid!==uid)
    return {eligible:false,code:"invalid_application_owner",wave:0};
  // A transient, in-memory normalization bypasses location and skill
  // matching ONLY. Reuse the exact production-approved account, auth,
  // identity, reporter-exclusion and busy-task eligibility checks.
  const check=validateVolunteer(
    {...incident,incidentBarangay:FAKE_AREA,emergencyBarangay:FAKE_AREA,
      barangay:FAKE_AREA,requiredSkills:[]},
    {...volunteer,user:{...(volunteer.user||{}),
      barangay:FAKE_AREA,addressBarangay:FAKE_AREA}},
    {knownBarangays:[FAKE_AREA],activeAssignments}
  );
  return check.eligible?
    {eligible:true,code:"fictional_approved_available_any_barangay",wave:1}:
    check;
}
function chooseDefenseAllVolunteers(incident,roster,{activeAssignments=[]}={}){
  if(incident?.id!==E2E_CASE_ID||
     !recognizedStagingCase(incident,E2E_CASE_ID))
    return {action:"stop",wave:0,volunteers:[],reason:"only_fixed_fictional_case"};
  const seen=new Set(),volunteers=[];
  for(const person of roster||[]){
    const uid=person?.uid;
    if(!uidOK(uid)||seen.has(uid))continue;
    seen.add(uid);
    if(validateDefenseVolunteer(incident,person,{activeAssignments}).eligible)
      volunteers.push(uid);
  }
  volunteers.sort();
  return volunteers.length?
    {action:"offer_all",wave:1,volunteers,scope:"all_verified_available_test_volunteers_no_barangay"}:
    {action:"no_more_eligible",wave:0,volunteers:[],
      reason:"no_authorized_available_test_volunteers"};
}
module.exports={chooseDefenseAllVolunteers,validateDefenseVolunteer};
